"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — METRICS  (Phase 7 Task 4)
   ──────────────────────────────────────────────────────────────────────────
   One request: GET /api/admin/metrics (src/lib/metrics.js's collectMetrics).
   The worker-liveness signal (jobs.oldestQueuedAgeSec — Task 2's answer to
   the Phase 4A review's "how do we know the worker died" question) leads
   the page: it is the single number an operator should notice first, since
   a stuck value means every queued generation is stranded.
   ══════════════════════════════════════════════════════════════════════════ */

import LoadingSkeleton from "@/components/states/LoadingSkeleton";
import ErrorState from "@/components/states/ErrorState";
import { IcClock } from "@/components/studio/kit/Icons";
import { Panel, Reload, Fault, Empty, Stats, Table, useResource, asArray, num, eur } from "./AdminPanel";

// Purely a visual "worth a look" threshold on the worker-liveness signal —
// does not gate anything, does not page anyone (Task 5's alert-thresholds
// doc is explicit that no paging system is wired up yet). 5 minutes is
// comfortably past a normal claim/lease cycle (job-queue.js's default lease
// is 5 minutes too) without being so tight that ordinary backlog noise
// trips it.
const STALE_QUEUE_THRESHOLD_SEC = 300;

export default function MetricsPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/metrics");

  if (loading && !data) {
    return (
      <Panel title="Worker liveness" action={<Reload onClick={reload} />}>
        <LoadingSkeleton variant="panel" label="Loading metrics" />
      </Panel>
    );
  }

  if (error && !data) {
    return (
      <Panel title="Worker liveness" action={<Reload onClick={reload} />}>
        <ErrorState message={error} onRetry={reload} />
      </Panel>
    );
  }

  const g = data?.generations || {};
  const j = data?.jobs || {};
  const c = data?.credits || {};
  const r = data?.revenue || {};
  const rec = data?.reconciliation || {};
  const wh = data?.webhooks || {};
  const u = data?.users || {};
  const providers = asArray(data?.providers);

  const stale = j.oldestQueuedAgeSec != null && j.oldestQueuedAgeSec > STALE_QUEUE_THRESHOLD_SEC;

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Fault>{error}</Fault>

      <Panel title="Worker liveness" badge="oldestQueuedAgeSec" action={<Reload onClick={reload} />}>
        <p className="hs-hint">
          Oldest queued job age is the worker-liveness signal — if the worker process is down, this
          grows without bound instead of staying near zero.
        </p>
        <Stats
          items={[
            {
              label: "Oldest queued job age",
              value: j.oldestQueuedAgeSec == null ? "none queued" : `${num(j.oldestQueuedAgeSec)}s`,
              tone: stale ? "var(--fault)" : "var(--signal)",
              sub: stale ? "Worker may be down — check the worker process" : "Looks healthy",
            },
            { label: "Queued", value: num(j.queued) },
            { label: "Running", value: num(j.running) },
            { label: "Dead", value: num(j.dead), tone: j.dead ? "var(--caution)" : undefined },
          ]}
        />
      </Panel>

      <Panel title="Generations" badge="Last 24 hours">
        <Stats
          items={[
            { label: "Total", value: num(g.total) },
            { label: "Succeeded", value: num(g.succeeded), tone: "var(--signal)" },
            { label: "Failed", value: num(g.failed), tone: g.failed ? "var(--fault)" : undefined },
            { label: "Success rate", value: `${g.successRate ?? 0}%` },
          ]}
        />
      </Panel>

      <Panel title="Credits & revenue" badge="Last 24 hours">
        <Stats
          items={[
            { label: "Granted", value: num(c.granted) },
            { label: "Spent", value: num(c.spent) },
            { label: "Refunded", value: num(c.refunded) },
            { label: "Topup revenue", value: eur((r.topupCents || 0) / 100) },
            { label: "Subscription revenue", value: eur((r.subscriptionCents || 0) / 100) },
          ]}
        />
      </Panel>

      <Panel title="Providers" badge="Last 24 hours">
        {providers.length === 0 ? (
          <Empty icon={IcClock} title="No provider activity yet">
            Attempts and failures per provider appear here once jobs run.
          </Empty>
        ) : (
          <Table
            caption="Provider attempts and failures"
            head={["Provider", { key: "Attempts", num: true }, { key: "Failures", num: true }]}
          >
            {providers.map((p) => (
              <tr key={p.name}>
                <td style={{ color: "var(--tx)", fontWeight: 500 }}>{p.name}</td>
                <td className="hs-num">{num(p.attempts)}</td>
                <td className="hs-num" style={{ color: p.failures ? "var(--fault)" : undefined }}>
                  {num(p.failures)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="Reconciliation" badge="Live">
        <p className="hs-hint">Reuses src/lib/reconciliation.js&apos;s invariant check across every wallet.</p>
        <Stats
          items={[
            { label: "Wallets checked", value: num(rec.walletsChecked) },
            { label: "Drifted", value: num(rec.drifted), tone: rec.drifted ? "var(--fault)" : "var(--signal)" },
          ]}
        />
      </Panel>

      <Panel title="Webhooks & signups" badge="Last 24 hours">
        <Stats
          items={[
            { label: "Stripe events processed", value: num(wh.stripeEventsProcessed) },
            { label: "New signups", value: num(u.signups) },
          ]}
        />
      </Panel>
    </div>
  );
}
