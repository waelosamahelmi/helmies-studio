// Helmies Studio — threshold alerting with webhook delivery and dedup
// (Phase 8 Task A2)
//
// Three layers, deliberately kept separate:
//   - evaluateAlerts(metrics) — a PURE function of Phase 7's collectMetrics()
//     return shape (src/lib/metrics.js). No I/O, no re-querying the
//     database — every rule reads a field collectMetrics already computed.
//   - filterDueAlerts(alerts, opts) — applies the dedup window, backed by
//     the EXISTING FeatureFlag table (key prefix "alert_state:") — no new
//     prisma model, no migration, same pattern src/lib/ops-flags.js already
//     established for maintenance mode / the provider kill switch.
//   - deliverAlerts(alerts) — posts a compact JSON payload to
//     ALERT_WEBHOOK_URL when set; a no-op that LOGS a warning when unset,
//     so the system is honest about being un-delivered rather than
//     silently pretending an alert reached anyone.
//
// GET /api/cron/alerts (src/app/api/cron/alerts/route.js) wires all three
// together; src/lib/automation.js's runAutomation() also runs them as a 6th
// leg, so alerting rides the ALREADY-installed automation timer even if the
// alerts-specific 5-minute timer (docs/runbook-ops.md) hasn't been set up
// yet on a given server — the shared FeatureFlag dedup state means running
// both never double-delivers within the same repeat window.
import prisma from "@/lib/prisma";
import { log } from "@/lib/log";

// ── Thresholds — also documented in docs/runbook-ops.md's alert-rules table ──
export const WORKER_LIVENESS_CRITICAL_SEC = 900; // 15 min — worker likely dead
export const QUEUE_BACKLOG_WARN_SEC = 300; // 5 min — the pre-existing "Queue backlog" threshold Phase 7's runbook already named
export const JOB_DEAD_LETTER_RATE_WARN = 0.2; // 20% of the tracked job pool
export const JOB_DEAD_LETTER_MIN_SAMPLE = 5; // below this, the rate is noise, not signal
export const GENERATION_SUCCESS_RATE_FLOOR = 80; // matches Phase 7's "Error-rate spike" threshold exactly
export const GENERATION_FAILURE_MIN_SAMPLE = 20; // same sample floor Phase 7's runbook already documented
export const PROVIDER_FAILURE_MIN_ATTEMPTS = 5; // below this, one bad attempt would look like a trend
export const ALERT_REPEAT_MINUTES_DEFAULT = 60;

const ALERT_STATE_PREFIX = "alert_state:";

// evaluateAlerts(metrics) -> [{ key, severity, title, detail, value, threshold }]
//
// `metrics` is exactly collectMetrics()'s return shape (src/lib/metrics.js)
// — this function never touches prisma itself, so it's testable with a
// plain synthetic object, no mocking required.
export function evaluateAlerts(metrics) {
  const alerts = [];
  const jobs = metrics?.jobs || {};
  const generations = metrics?.generations || {};
  const reconciliation = metrics?.reconciliation || {};
  const providers = metrics?.providers || [];
  const webhooks = metrics?.webhooks || {};

  // 1. Worker liveness — the oldest claimable queued job has been waiting
  // far too long; the worker has likely stopped claiming entirely.
  if (jobs.oldestQueuedAgeSec != null && jobs.oldestQueuedAgeSec > WORKER_LIVENESS_CRITICAL_SEC) {
    alerts.push({
      key: "worker_liveness",
      severity: "critical",
      title: "Worker may be down",
      detail: `Oldest claimable queued job has waited ${jobs.oldestQueuedAgeSec}s (over ${WORKER_LIVENESS_CRITICAL_SEC}s) — the worker may have stopped claiming jobs.`,
      value: jobs.oldestQueuedAgeSec,
      threshold: WORKER_LIVENESS_CRITICAL_SEC,
    });
  }

  // 2. Queue backlog — an earlier, lower-severity warning on the SAME
  // signal as worker liveness (both alerts can fire together; they have
  // distinct keys so dedup tracks them independently).
  if (jobs.oldestQueuedAgeSec != null && jobs.oldestQueuedAgeSec > QUEUE_BACKLOG_WARN_SEC) {
    alerts.push({
      key: "queue_backlog",
      severity: "warn",
      title: "Queue backlog building up",
      detail: `Oldest claimable queued job has waited ${jobs.oldestQueuedAgeSec}s (over ${QUEUE_BACKLOG_WARN_SEC}s).`,
      value: jobs.oldestQueuedAgeSec,
      threshold: QUEUE_BACKLOG_WARN_SEC,
    });
  }

  // 3. Job dead-letter rate — the proportion of the tracked job pool
  // (queued + running + dead) that has ended up dead. A minimum sample
  // floor avoids alerting on noise from a nearly-empty queue (e.g. 1 dead
  // job out of 1 total would otherwise read as a 100% dead-letter rate).
  const dead = jobs.dead ?? 0;
  const jobPool = (jobs.queued ?? 0) + (jobs.running ?? 0) + dead;
  if (jobPool >= JOB_DEAD_LETTER_MIN_SAMPLE) {
    const deadRate = dead / jobPool;
    if (deadRate > JOB_DEAD_LETTER_RATE_WARN) {
      alerts.push({
        key: "job_dead_letter_rate",
        severity: "warn",
        title: "Elevated job dead-letter rate",
        detail: `${dead} of ${jobPool} tracked jobs (${Math.round(deadRate * 1000) / 10}%) are dead — over the ${JOB_DEAD_LETTER_RATE_WARN * 100}% threshold.`,
        value: Math.round(deadRate * 1000) / 1000,
        threshold: JOB_DEAD_LETTER_RATE_WARN,
      });
    }
  }

  // 4. Generation failure rate — same threshold/sample-floor Phase 7's
  // runbook already documented as the "Error-rate spike" alert.
  if ((generations.total ?? 0) >= GENERATION_FAILURE_MIN_SAMPLE && generations.successRate < GENERATION_SUCCESS_RATE_FLOOR) {
    alerts.push({
      key: "generation_failure_rate",
      severity: "warn",
      title: "Generation success rate below floor",
      detail: `Success rate is ${generations.successRate}% over the last window (${generations.total} generations) — below the ${GENERATION_SUCCESS_RATE_FLOOR}% floor.`,
      value: generations.successRate,
      threshold: GENERATION_SUCCESS_RATE_FLOOR,
    });
  }

  // 5. Wallet reconciliation drift — any drift at all is critical; the
  // wallet invariant is exact, not a tolerance band (matches Phase 7's
  // "Settlement mismatch" threshold exactly).
  if ((reconciliation.drifted ?? 0) > 0) {
    alerts.push({
      key: "wallet_reconciliation_drift",
      severity: "critical",
      title: "Wallet reconciliation drift detected",
      detail: `${reconciliation.drifted} of ${reconciliation.walletsChecked ?? 0} wallets checked are drifted from their ledger.`,
      value: reconciliation.drifted,
      threshold: 0,
    });
  }

  // 6. Stripe webhook failures. HONESTY NOTE: collectMetrics() does not
  // populate `webhooks.stripeEventsFailed` today — a failed webhook is only
  // ever logged (src/app/api/stripe/webhook/route.js's
  // "stripe_webhook_processing_failed" line), never persisted, because the
  // StripeEvent claim row is created INSIDE the same transaction that fails
  // and rolls back — there is structurally no database row to count. This
  // rule is real and tested (it fires whenever the field is present and
  // above threshold — see tests/unit/alerts.test.mjs), but it will not fire
  // against production today until a future change adds real failure
  // persistence. Same "documented only" honesty as docs/runbook-ops.md's
  // existing "Payment webhook failures" row — this does not silently
  // upgrade that to "implemented".
  const stripeFailed = webhooks.stripeEventsFailed ?? 0;
  if (stripeFailed > 0) {
    alerts.push({
      key: "stripe_webhook_failures",
      severity: "critical",
      title: "Stripe webhook processing failures",
      detail: `${stripeFailed} Stripe webhook event(s) failed to process in the window.`,
      value: stripeFailed,
      threshold: 0,
    });
  }

  // 7. A provider whose failure count exceeds its (attempts - failures)
  // success count — the fallback chain absorbs a single misbehaving
  // provider, so this is a warn, not a critical.
  for (const p of providers) {
    const attempts = p.attempts ?? 0;
    const failures = p.failures ?? 0;
    const successes = Math.max(attempts - failures, 0);
    if (attempts >= PROVIDER_FAILURE_MIN_ATTEMPTS && failures > successes) {
      alerts.push({
        key: `provider_failure_rate:${p.name}`,
        severity: "warn",
        title: `Provider ${p.name} failing more than succeeding`,
        detail: `${p.name}: ${failures} failures vs ${successes} successes out of ${attempts} attempts.`,
        value: failures,
        threshold: successes,
      });
    }
  }

  return alerts;
}

// filterDueAlerts(alerts, opts) -> alerts NOT suppressed by the dedup
// window, and records each returned alert as freshly fired.
//
// Persists last-fired state in the existing FeatureFlag table (key prefix
// "alert_state:") — no new model, same table src/lib/ops-flags.js already
// uses for maintenance mode. An alert with the same `key` does not re-fire
// more often than `repeatMinutes` (default ALERT_REPEAT_MINUTES env var, or
// ALERT_REPEAT_MINUTES_DEFAULT).
export async function filterDueAlerts(alerts, { now = new Date(), repeatMinutes } = {}) {
  if (!alerts || alerts.length === 0) return [];
  const windowMinutes = repeatMinutes ?? (Number(process.env.ALERT_REPEAT_MINUTES) || ALERT_REPEAT_MINUTES_DEFAULT);
  const windowMs = windowMinutes * 60 * 1000;

  const due = [];
  for (const alert of alerts) {
    const stateKey = `${ALERT_STATE_PREFIX}${alert.key}`;
    const existing = await prisma.featureFlag.findUnique({ where: { key: stateKey } });
    const lastFiredAt = existing?.config?.lastFiredAt ? new Date(existing.config.lastFiredAt) : null;
    const suppressed = lastFiredAt && now.getTime() - lastFiredAt.getTime() < windowMs;
    if (suppressed) continue;

    await prisma.featureFlag.upsert({
      where: { key: stateKey },
      create: {
        key: stateKey,
        name: `Alert state: ${alert.key}`,
        description: "Last-fired timestamp for alert deduplication (Phase 8 Task A2).",
        enabled: true,
        config: { lastFiredAt: now.toISOString(), severity: alert.severity },
      },
      update: { enabled: true, config: { lastFiredAt: now.toISOString(), severity: alert.severity } },
    });
    due.push(alert);
  }
  return due;
}

// deliverAlerts(alerts) -> posts a compact JSON payload to
// ALERT_WEBHOOK_URL when set; a no-op that LOGS a warning when unset. Never
// includes secrets or prompt text — the payload is exactly the alert
// shape's five public fields, nothing else.
export async function deliverAlerts(alerts) {
  if (!alerts || alerts.length === 0) return { delivered: false, count: 0 };

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    log.warn("alerts_webhook_not_configured", { count: alerts.length, keys: alerts.map((a) => a.key) });
    return { delivered: false, count: alerts.length };
  }

  const payload = {
    ts: new Date().toISOString(),
    count: alerts.length,
    alerts: alerts.map(({ key, severity, title, detail, value, threshold }) => ({
      key,
      severity,
      title,
      detail,
      value,
      threshold,
    })),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      log.error("alerts_webhook_delivery_failed", { status: res.status, count: alerts.length });
      return { delivered: false, count: alerts.length, status: res.status };
    }
    log.info("alerts_webhook_delivered", { count: alerts.length, keys: alerts.map((a) => a.key) });
    return { delivered: true, count: alerts.length };
  } catch (err) {
    log.error("alerts_webhook_delivery_failed", { count: alerts.length, err });
    return { delivered: false, count: alerts.length };
  }
}
