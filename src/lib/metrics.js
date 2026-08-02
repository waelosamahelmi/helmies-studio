// Helmies Studio — Admin metrics aggregation (Phase 7 Task 2)
//
// collectMetrics({ sinceHours = 24 }) rolls up the business/health numbers
// the contract names into one payload for GET /api/admin/metrics. Two
// different notions of "window" are used deliberately:
//   - generations / credits / revenue / webhooks / users are ACTIVITY
//     counters — "how much happened in the last `sinceHours` hours"
//     (createdAt >= cutoff).
//   - jobs.queued / jobs.running / jobs.dead and oldestQueuedAgeSec are
//     QUEUE-DEPTH gauges — "what does the queue look like RIGHT NOW",
//     unwindowed by sinceHours. A worker outage doesn't announce itself on
//     a schedule, so the worker-liveness signal (oldestQueuedAgeSec) has to
//     reflect the live state of the queue, not a rolling window that could
//     hide a job that has been stuck since before the window even started.
//
// oldestQueuedAgeSec is measured from the oldest QUEUED job's `nextRunAt`
// that has already passed (i.e. a job the queue considers claimable right
// now), not from its `createdAt` — a job mid-retry-backoff (queued, but
// nextRunAt still in the future) hasn't been neglected yet and must not
// inflate this signal. null when there is no such job (nothing queued, or
// everything queued is still waiting out its backoff) — a live worker keeps
// this at null/near-zero; a dead one lets it climb without bound.
//
// Reconciliation numbers reuse src/lib/reconciliation.js's reconcileAll
// generator directly, per the Task 2 brief — this file never reimplements
// the wallet invariant it checks.
import prisma from "@/lib/prisma";
import { reconcileAll } from "@/lib/reconciliation";
import { CREDIT_TO_EUR } from "@/lib/pricing-engine";

// Ledger types that represent new money/credits entering a wallet from
// outside (as opposed to internal bookkeeping like reservation/
// reservation_release, or a correction like admin_adjustment — see
// src/lib/wallet.js's LEDGER_TYPES and header for the full type list).
const GRANT_LEDGER_TYPES = ["signup", "subscription_grant", "topup", "promo"];

function sumAmount(rows) {
  return rows.reduce((sum, r) => sum + (r.amount || 0), 0);
}

export async function collectMetrics({ sinceHours = 24 } = {}) {
  const cutoff = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const now = new Date();

  const [
    genTotal,
    genSucceeded,
    genFailed,
    jobsQueued,
    jobsRunning,
    jobsDead,
    oldestQueued,
    grantedRows,
    spentRows,
    refundedRows,
    topupRows,
    subscriptionRows,
    providerAttempts,
    providerFailures,
    stripeEventsProcessed,
    signups,
  ] = await Promise.all([
    prisma.generation.count({ where: { createdAt: { gte: cutoff } } }),
    prisma.generation.count({ where: { createdAt: { gte: cutoff }, status: "completed" } }),
    prisma.generation.count({ where: { createdAt: { gte: cutoff }, status: "failed" } }),
    prisma.generationJob.count({ where: { status: "queued" } }),
    prisma.generationJob.count({ where: { status: "running" } }),
    prisma.generationJob.count({ where: { status: "dead" } }),
    prisma.generationJob.findFirst({
      where: { status: "queued", nextRunAt: { lte: now } },
      orderBy: { nextRunAt: "asc" },
      select: { nextRunAt: true },
    }),
    prisma.creditLedger.findMany({
      where: { createdAt: { gte: cutoff }, type: { in: GRANT_LEDGER_TYPES } },
      select: { amount: true },
    }),
    prisma.creditLedger.findMany({
      where: { createdAt: { gte: cutoff }, type: "generation" },
      select: { amount: true },
    }),
    prisma.creditLedger.findMany({
      where: { createdAt: { gte: cutoff }, type: "refund" },
      select: { amount: true },
    }),
    prisma.creditLedger.findMany({
      where: { createdAt: { gte: cutoff }, type: "topup" },
      select: { amount: true },
    }),
    prisma.creditLedger.findMany({
      where: { createdAt: { gte: cutoff }, type: "subscription_grant" },
      select: { amount: true },
    }),
    prisma.generationJob.groupBy({
      by: ["providerName"],
      where: { createdAt: { gte: cutoff }, providerName: { not: null } },
      _sum: { attempts: true },
    }),
    prisma.generationJob.groupBy({
      by: ["providerName"],
      where: { createdAt: { gte: cutoff }, providerName: { not: null }, status: "dead" },
      _count: { _all: true },
    }),
    prisma.stripeEvent.count({ where: { createdAt: { gte: cutoff } } }),
    prisma.user.count({ where: { createdAt: { gte: cutoff } } }),
  ]);

  const oldestQueuedAgeSec = oldestQueued
    ? Math.max(0, Math.floor((now.getTime() - oldestQueued.nextRunAt.getTime()) / 1000))
    : null;

  const failuresByProvider = new Map(providerFailures.map((p) => [p.providerName, p._count._all]));
  const providers = providerAttempts.map((p) => ({
    name: p.providerName,
    attempts: p._sum.attempts || 0,
    failures: failuresByProvider.get(p.providerName) || 0,
  }));

  let walletsChecked = 0;
  let drifted = 0;
  for await (const report of reconcileAll()) {
    walletsChecked++;
    if (!report.ok) drifted++;
  }

  // "generation" ledger rows are booked as a NEGATIVE amount (the actual
  // cost of the job — see src/lib/wallet.js's settleReservation and its
  // file-header invariant notes). Math.abs so credits.spent reads as a
  // positive count of credits spent, not a negative one.
  const spentCredits = Math.abs(sumAmount(spentRows));

  return {
    generations: {
      total: genTotal,
      succeeded: genSucceeded,
      failed: genFailed,
      successRate: genTotal > 0 ? Math.round((genSucceeded / genTotal) * 1000) / 10 : 0,
    },
    jobs: {
      queued: jobsQueued,
      running: jobsRunning,
      dead: jobsDead,
      oldestQueuedAgeSec,
    },
    credits: {
      granted: sumAmount(grantedRows),
      spent: spentCredits,
      refunded: sumAmount(refundedRows),
    },
    revenue: {
      // No real Stripe checkout amount is persisted per CreditLedger row
      // today, so this mirrors the same credits*CREDIT_TO_EUR proxy
      // src/app/api/admin/analytics/route.js already uses as "revenue" —
      // CREDIT_TO_EUR (src/lib/pricing-engine.js) is EUR per credit; *100
      // converts to cents.
      topupCents: Math.round(sumAmount(topupRows) * CREDIT_TO_EUR * 100),
      subscriptionCents: Math.round(sumAmount(subscriptionRows) * CREDIT_TO_EUR * 100),
    },
    providers,
    reconciliation: { walletsChecked, drifted },
    webhooks: { stripeEventsProcessed },
    users: { signups },
  };
}
