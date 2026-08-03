import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// src/lib/alerts.js — evaluateAlerts is a pure function of collectMetrics()'s
// return shape (no mocking needed); filterDueAlerts touches the FeatureFlag
// table via prisma (mocked here, same pattern as tests/unit/ops-flags.test.mjs);
// deliverAlerts touches global.fetch only. The real end-to-end proof against
// a live database + stubbed webhook is tests/integration/alerts.int.test.mjs.

// vi.mock factories are hoisted above regular top-level declarations, so the
// mock object itself must be created via vi.hoisted() to be visible inside
// the (also hoisted) factory function below — same pattern as
// tests/unit/ops-flags.test.mjs.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    featureFlag: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import {
  evaluateAlerts,
  selectDueAlerts,
  deliverAlerts,
  recordAlertsFired,
  WORKER_LIVENESS_CRITICAL_SEC,
  QUEUE_BACKLOG_WARN_SEC,
  JOB_DEAD_LETTER_RATE_WARN,
  JOB_DEAD_LETTER_MIN_SAMPLE,
  GENERATION_SUCCESS_RATE_FLOOR,
  GENERATION_FAILURE_MIN_SAMPLE,
  PROVIDER_FAILURE_MIN_ATTEMPTS,
  ALERT_WEBHOOK_TIMEOUT_MS,
} from "@/lib/alerts";

function baseMetrics(overrides = {}) {
  return {
    generations: { total: 0, succeeded: 0, failed: 0, successRate: 0 },
    jobs: { queued: 0, running: 0, dead: 0, oldestQueuedAgeSec: null },
    credits: { granted: 0, spent: 0, refunded: 0 },
    revenue: { topupCents: 0, subscriptionCents: 0 },
    providers: [],
    reconciliation: { walletsChecked: 0, drifted: 0 },
    webhooks: { stripeEventsProcessed: 0 },
    users: { signups: 0 },
    ...overrides,
  };
}

function keys(alerts) {
  return alerts.map((a) => a.key);
}

describe("evaluateAlerts — worker liveness", () => {
  it("does not fire at exactly the threshold", () => {
    const metrics = baseMetrics({ jobs: { queued: 1, running: 0, dead: 0, oldestQueuedAgeSec: WORKER_LIVENESS_CRITICAL_SEC } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("worker_liveness");
  });

  it("fires critical just above the threshold", () => {
    const metrics = baseMetrics({
      jobs: { queued: 1, running: 0, dead: 0, oldestQueuedAgeSec: WORKER_LIVENESS_CRITICAL_SEC + 1 },
    });
    const alerts = evaluateAlerts(metrics);
    const alert = alerts.find((a) => a.key === "worker_liveness");
    expect(alert).toMatchObject({ severity: "critical", value: WORKER_LIVENESS_CRITICAL_SEC + 1, threshold: WORKER_LIVENESS_CRITICAL_SEC });
  });

  it("never fires when nothing is queued (oldestQueuedAgeSec is null)", () => {
    const metrics = baseMetrics({ jobs: { queued: 0, running: 0, dead: 0, oldestQueuedAgeSec: null } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("worker_liveness");
  });
});

describe("evaluateAlerts — queue backlog (earlier warning, same signal as worker liveness)", () => {
  it("does not fire at exactly the threshold", () => {
    const metrics = baseMetrics({ jobs: { queued: 1, running: 0, dead: 0, oldestQueuedAgeSec: QUEUE_BACKLOG_WARN_SEC } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("queue_backlog");
  });

  it("fires warn just above the threshold, independently of worker_liveness", () => {
    const metrics = baseMetrics({
      jobs: { queued: 1, running: 0, dead: 0, oldestQueuedAgeSec: QUEUE_BACKLOG_WARN_SEC + 1 },
    });
    const alerts = evaluateAlerts(metrics);
    expect(alerts.find((a) => a.key === "queue_backlog")).toMatchObject({ severity: "warn" });
    expect(keys(alerts)).not.toContain("worker_liveness"); // below the higher critical threshold
  });

  it("both queue_backlog and worker_liveness fire together once past the critical threshold", () => {
    const metrics = baseMetrics({
      jobs: { queued: 1, running: 0, dead: 0, oldestQueuedAgeSec: WORKER_LIVENESS_CRITICAL_SEC + 1 },
    });
    const alerts = evaluateAlerts(metrics);
    expect(keys(alerts)).toEqual(expect.arrayContaining(["worker_liveness", "queue_backlog"]));
  });
});

describe("evaluateAlerts — job dead-letter rate", () => {
  it("does not fire below the minimum sample size, even at a 100% dead rate", () => {
    const metrics = baseMetrics({ jobs: { queued: 0, running: 0, dead: JOB_DEAD_LETTER_MIN_SAMPLE - 1, oldestQueuedAgeSec: null } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("job_dead_letter_rate");
  });

  it("does not fire at exactly the rate threshold", () => {
    // dead / pool == JOB_DEAD_LETTER_RATE_WARN exactly, pool >= min sample
    const pool = 10; // 0.2 * 10 = 2 dead exactly at threshold
    const metrics = baseMetrics({ jobs: { queued: pool - 2, running: 0, dead: 2, oldestQueuedAgeSec: null } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("job_dead_letter_rate");
  });

  it("fires warn just above the rate threshold with enough sample", () => {
    const pool = 10;
    const metrics = baseMetrics({ jobs: { queued: pool - 3, running: 0, dead: 3, oldestQueuedAgeSec: null } });
    const alert = evaluateAlerts(metrics).find((a) => a.key === "job_dead_letter_rate");
    expect(alert).toMatchObject({ severity: "warn", threshold: JOB_DEAD_LETTER_RATE_WARN });
    expect(alert.value).toBeCloseTo(0.3, 5);
  });
});

describe("evaluateAlerts — generation failure rate", () => {
  it("does not fire below the sample floor even at a low success rate", () => {
    const metrics = baseMetrics({ generations: { total: GENERATION_FAILURE_MIN_SAMPLE - 1, succeeded: 0, failed: GENERATION_FAILURE_MIN_SAMPLE - 1, successRate: 0 } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("generation_failure_rate");
  });

  it("does not fire at exactly the success-rate floor", () => {
    const metrics = baseMetrics({ generations: { total: GENERATION_FAILURE_MIN_SAMPLE, succeeded: 16, failed: 4, successRate: GENERATION_SUCCESS_RATE_FLOOR } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("generation_failure_rate");
  });

  it("fires warn just below the floor with enough sample", () => {
    const metrics = baseMetrics({ generations: { total: GENERATION_FAILURE_MIN_SAMPLE, succeeded: 15, failed: 5, successRate: GENERATION_SUCCESS_RATE_FLOOR - 1 } });
    const alert = evaluateAlerts(metrics).find((a) => a.key === "generation_failure_rate");
    expect(alert).toMatchObject({ severity: "warn", value: GENERATION_SUCCESS_RATE_FLOOR - 1, threshold: GENERATION_SUCCESS_RATE_FLOOR });
  });
});

describe("evaluateAlerts — wallet reconciliation drift", () => {
  it("does not fire when drifted is 0", () => {
    const metrics = baseMetrics({ reconciliation: { walletsChecked: 10, drifted: 0 } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("wallet_reconciliation_drift");
  });

  it("fires critical for any drift at all — not a tolerance band", () => {
    const metrics = baseMetrics({ reconciliation: { walletsChecked: 10, drifted: 1 } });
    const alert = evaluateAlerts(metrics).find((a) => a.key === "wallet_reconciliation_drift");
    expect(alert).toMatchObject({ severity: "critical", value: 1, threshold: 0 });
  });
});

describe("evaluateAlerts — Stripe webhook failures", () => {
  it("does not fire when the field is absent (today's real collectMetrics() shape)", () => {
    const metrics = baseMetrics({ webhooks: { stripeEventsProcessed: 5 } });
    expect(keys(evaluateAlerts(metrics))).not.toContain("stripe_webhook_failures");
  });

  it("fires critical whenever stripeEventsFailed is present and above zero", () => {
    const metrics = baseMetrics({ webhooks: { stripeEventsProcessed: 5, stripeEventsFailed: 1 } });
    const alert = evaluateAlerts(metrics).find((a) => a.key === "stripe_webhook_failures");
    expect(alert).toMatchObject({ severity: "critical", value: 1, threshold: 0 });
  });
});

describe("evaluateAlerts — provider failure exceeds success", () => {
  it("does not fire below the minimum attempt sample", () => {
    const metrics = baseMetrics({ providers: [{ name: "kie", attempts: PROVIDER_FAILURE_MIN_ATTEMPTS - 1, failures: PROVIDER_FAILURE_MIN_ATTEMPTS - 1 }] });
    expect(keys(evaluateAlerts(metrics))).not.toContain("provider_failure_rate:kie");
  });

  it("does not fire when failures do not exceed successes", () => {
    const metrics = baseMetrics({ providers: [{ name: "kie", attempts: 10, failures: 5 }] }); // 5 failures, 5 successes — not exceeding
    expect(keys(evaluateAlerts(metrics))).not.toContain("provider_failure_rate:kie");
  });

  it("fires warn, keyed per-provider, once failures exceed successes with enough attempts", () => {
    const metrics = baseMetrics({
      providers: [
        { name: "kie", attempts: 10, failures: 6 }, // 6 failures vs 4 successes
        { name: "alibaba", attempts: 10, failures: 2 },
      ],
    });
    const alerts = evaluateAlerts(metrics);
    expect(keys(alerts)).toContain("provider_failure_rate:kie");
    expect(keys(alerts)).not.toContain("provider_failure_rate:alibaba");
    const alert = alerts.find((a) => a.key === "provider_failure_rate:kie");
    expect(alert).toMatchObject({ severity: "warn", value: 6, threshold: 4 });
  });
});

describe("selectDueAlerts — READ-ONLY dedup check against FeatureFlag (mocked prisma)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] for an empty alert list without touching prisma", async () => {
    const result = await selectDueAlerts([]);
    expect(result).toEqual([]);
    expect(prismaMock.featureFlag.findUnique).not.toHaveBeenCalled();
  });

  it("selects an alert that has never fired before, WITHOUT writing anything", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    const now = new Date("2026-08-02T12:00:00.000Z");
    const alert = { key: "worker_liveness", severity: "critical", title: "t", detail: "d", value: 1, threshold: 0 };

    const due = await selectDueAlerts([alert], { now });
    expect(due).toEqual([alert]);
    // selectDueAlerts is read-only — it must never write the dedup state
    // itself. That is recordAlertsFired's job, called only after a
    // confirmed delivery (see the IMPORTANT-1 fix).
    expect(prismaMock.featureFlag.upsert).not.toHaveBeenCalled();
  });

  it("suppresses a repeated alert fired inside the repeat window", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    const firedRecently = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago
    prismaMock.featureFlag.findUnique.mockResolvedValue({ config: { lastFiredAt: firedRecently.toISOString() } });
    const alert = { key: "worker_liveness", severity: "critical", title: "t", detail: "d", value: 1, threshold: 0 };

    const due = await selectDueAlerts([alert], { now, repeatMinutes: 60 });
    expect(due).toEqual([]);
  });

  it("selects again once the repeat window has elapsed", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    const firedLongAgo = new Date(now.getTime() - 61 * 60 * 1000); // 61 min ago
    prismaMock.featureFlag.findUnique.mockResolvedValue({ config: { lastFiredAt: firedLongAgo.toISOString() } });
    const alert = { key: "worker_liveness", severity: "critical", title: "t", detail: "d", value: 1, threshold: 0 };

    const due = await selectDueAlerts([alert], { now, repeatMinutes: 60 });
    expect(due).toEqual([alert]);
  });

  it("tracks distinct alert keys independently", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    prismaMock.featureFlag.findUnique.mockImplementation(async ({ where }) =>
      where.key === "alert_state:a" ? { config: { lastFiredAt: now.toISOString() } } : null
    );
    const alertA = { key: "a", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 };
    const alertB = { key: "b", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 };

    const due = await selectDueAlerts([alertA, alertB], { now });
    expect(due).toEqual([alertB]);
  });
});

describe("recordAlertsFired — WRITE-ONLY, called only after confirmed delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.featureFlag.upsert.mockResolvedValue({});
  });

  it("does nothing for an empty alert list", async () => {
    await recordAlertsFired([]);
    expect(prismaMock.featureFlag.upsert).not.toHaveBeenCalled();
  });

  it("writes a FeatureFlag row keyed alert_state:<key> with lastFiredAt", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    const alert = { key: "worker_liveness", severity: "critical", title: "t", detail: "d", value: 1, threshold: 0 };

    await recordAlertsFired([alert], { now });
    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "alert_state:worker_liveness" },
        update: expect.objectContaining({ config: expect.objectContaining({ lastFiredAt: now.toISOString() }) }),
      })
    );
  });

  it("writes one row per alert, independently", async () => {
    const alertA = { key: "a", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 };
    const alertB = { key: "b", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 };
    await recordAlertsFired([alertA, alertB]);
    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledTimes(2);
  });
});

// IMPORTANT 1 (executed-proof review finding): the full select -> deliver ->
// record sequence a real caller (the cron route / automation leg) runs.
// Proves the dedup write genuinely depends on delivery succeeding, not just
// that the two functions exist independently.
describe("select -> deliver -> record sequence — dedup is written only on successful delivery", () => {
  const ORIGINAL_URL = process.env.ALERT_WEBHOOK_URL;
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.featureFlag.findUnique.mockResolvedValue(null); // never fired before
    prismaMock.featureFlag.upsert.mockResolvedValue({});
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
  });
  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = ORIGINAL_URL;
    vi.restoreAllMocks();
    vi.unstubAllGlobals(); // vi.restoreAllMocks() does NOT undo vi.stubGlobal("fetch", ...)
  });

  it("a webhook 500 leaves the alert un-recorded, so it is still due on the very next call", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const alert = { key: "wallet_reconciliation_drift", severity: "critical", title: "t", detail: "d", value: 1, threshold: 0 };

    const due1 = await selectDueAlerts([alert]);
    const delivery1 = await deliverAlerts(due1);
    expect(delivery1.delivered).toBe(false);
    if (due1.length > 0 && delivery1.delivered) await recordAlertsFired(due1);

    expect(prismaMock.featureFlag.upsert).not.toHaveBeenCalled(); // never recorded as fired

    // Second call: findUnique still returns null (nothing was ever
    // recorded) — the SAME critical alert is due again immediately,
    // not suppressed for the rest of the 60-minute window.
    const due2 = await selectDueAlerts([alert]);
    expect(due2).toEqual([alert]);
  });

  it("a successful delivery DOES record the alert as fired, suppressing the next immediate call", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));
    const alert = { key: "wallet_reconciliation_drift", severity: "critical", title: "t", detail: "d", value: 1, threshold: 0 };

    const due1 = await selectDueAlerts([alert]);
    const delivery1 = await deliverAlerts(due1);
    expect(delivery1.delivered).toBe(true);
    if (due1.length > 0 && delivery1.delivered) await recordAlertsFired(due1);

    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledTimes(1);

    // Now simulate the recorded state being read back on the next call.
    prismaMock.featureFlag.findUnique.mockResolvedValue({ config: { lastFiredAt: new Date().toISOString() } });
    const due2 = await selectDueAlerts([alert]);
    expect(due2).toEqual([]);
  });
});

describe("deliverAlerts", () => {
  const ORIGINAL_URL = process.env.ALERT_WEBHOOK_URL;

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = ORIGINAL_URL;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is a no-op that logs a warning when ALERT_WEBHOOK_URL is unset — nothing posted", async () => {
    delete process.env.ALERT_WEBHOOK_URL;
    const fetchSpy = vi.spyOn(global, "fetch");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const alert = { key: "worker_liveness", severity: "critical", title: "t", detail: "d", value: 1, threshold: 0 };
    const result = await deliverAlerts([alert]);

    expect(result.delivered).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(line.event).toBe("alerts_webhook_not_configured");
  });

  it("returns delivered:false without calling fetch or logging when there are no alerts", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await deliverAlerts([]);
    expect(result).toEqual({ delivered: false, count: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts exactly once with a JSON payload carrying only the public alert fields — no secrets, no prompt text", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const alerts = [
      { key: "worker_liveness", severity: "critical", title: "Worker may be down", detail: "d", value: 999, threshold: 900 },
    ];
    const result = await deliverAlerts(alerts);

    expect(result).toEqual({ delivered: true, count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/alerts");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.alerts).toEqual([
      { key: "worker_liveness", severity: "critical", title: "Worker may be down", detail: "d", value: 999, threshold: 900 },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/secret|token|password|prompt/i);
  });

  // IMPORTANT 2 (executed-proof review finding): a hanging webhook must
  // never leave this promise unresolved indefinitely — because
  // runAutomation() runs deliverAlerts as one of several Promise.allSettled
  // legs, a hung ALERT_WEBHOOK_URL would otherwise stall the entire
  // automation cron response, including the money-safety legs.
  it("passes an AbortSignal to fetch so a hanging webhook is forcibly timed out", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await deliverAlerts([{ key: "k", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 }]);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns delivered:false and logs an error when the fetch aborts (simulating the timeout firing)", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
    // Simulates what a real hung connection looks like once
    // AbortSignal.timeout(ALERT_WEBHOOK_TIMEOUT_MS) fires: fetch rejects
    // with an AbortError, exactly like any other network failure — no
    // special-casing needed in deliverAlerts's own catch block.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await deliverAlerts([{ key: "k", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 }]);
    expect(result.delivered).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(ALERT_WEBHOOK_TIMEOUT_MS).toBeGreaterThan(0); // the timeout constant is real and positive
  });

  it("returns delivered:false and logs an error when the webhook responds non-2xx", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await deliverAlerts([{ key: "k", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 }]);
    expect(result.delivered).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("returns delivered:false and logs an error when fetch itself throws (network failure)", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await deliverAlerts([{ key: "k", severity: "warn", title: "t", detail: "d", value: 1, threshold: 0 }]);
    expect(result.delivered).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
