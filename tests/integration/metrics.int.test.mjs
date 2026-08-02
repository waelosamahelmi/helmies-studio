import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createUserWithWallet } from "./setup.mjs";

let prisma;
beforeEach(async () => {
  prisma = await resetDb();
});

async function makeGeneration(userId, overrides = {}) {
  return prisma.generation.create({
    data: {
      userId,
      tool: "image",
      model: "test-model",
      prompt: "a metrics integration test prompt",
      status: "pending",
      creditsUsed: 0,
      ...overrides,
    },
  });
}

describe("collectMetrics — generations aggregate against real Postgres", () => {
  it("counts total/succeeded/failed within the window and computes successRate", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const user = await createUserWithWallet(100);
    await makeGeneration(user.id, { status: "completed" });
    await makeGeneration(user.id, { status: "completed" });
    await makeGeneration(user.id, { status: "failed" });
    await makeGeneration(user.id, { status: "pending" });

    const metrics = await collectMetrics({ sinceHours: 24 });
    expect(metrics.generations).toEqual({ total: 4, succeeded: 2, failed: 1, successRate: 50 });
  });

  it("excludes generations older than the window", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const user = await createUserWithWallet(100);
    await makeGeneration(user.id, { status: "completed" });
    const outOfWindow = await makeGeneration(user.id, { status: "completed" });
    await prisma.$executeRawUnsafe(
      `UPDATE "public"."Generation" SET "createdAt" = $1 WHERE "id" = $2`,
      new Date(Date.now() - 48 * 3600 * 1000),
      outOfWindow.id
    );

    const metrics = await collectMetrics({ sinceHours: 24 });
    expect(metrics.generations.total).toBe(1);
    expect(metrics.generations.succeeded).toBe(1);
  });

  it("reports successRate 0 (not NaN/Infinity) when there are zero generations", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const metrics = await collectMetrics({ sinceHours: 24 });
    expect(metrics.generations).toEqual({ total: 0, succeeded: 0, failed: 0, successRate: 0 });
  });
});

describe("collectMetrics — jobs aggregate and oldestQueuedAgeSec (worker-liveness signal)", () => {
  it("counts queued/running/dead and reports null oldestQueuedAgeSec when nothing is queued", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const { enqueueJob, claimNextJob, failJob } = await import("@/lib/job-queue");
    const user = await createUserWithWallet(100);
    const gen = await makeGeneration(user.id);
    const job = await enqueueJob({
      generationId: gen.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      providerName: "kie",
    });
    const claimed = await claimNextJob("worker-1");
    expect(claimed.id).toBe(job.id);
    await failJob(claimed.id, "boom", { retryable: false }); // -> dead, nothing left queued

    const metrics = await collectMetrics({});
    expect(metrics.jobs).toEqual({ queued: 0, running: 0, dead: 1, oldestQueuedAgeSec: null });
  });

  it("oldestQueuedAgeSec grows with a stale queued job whose nextRunAt has already passed", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const { enqueueJob } = await import("@/lib/job-queue");
    const user = await createUserWithWallet(100);
    const gen = await makeGeneration(user.id);
    const job = await enqueueJob({
      generationId: gen.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      providerName: "kie",
    });
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { nextRunAt: new Date(Date.now() - 120_000) }, // 2 minutes overdue — worker never claimed it
    });

    const metrics = await collectMetrics({});
    expect(metrics.jobs.queued).toBe(1);
    expect(metrics.jobs.oldestQueuedAgeSec).toBeGreaterThanOrEqual(119);
  });

  it("a queued job still in retry backoff (nextRunAt in the future) does not count toward oldestQueuedAgeSec", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const { enqueueJob } = await import("@/lib/job-queue");
    const user = await createUserWithWallet(100);
    const gen = await makeGeneration(user.id);
    await enqueueJob({
      generationId: gen.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      providerName: "kie",
    });
    // enqueueJob defaults nextRunAt to now() — that alone should already be
    // claimable, so push it out to simulate "waiting out a retry backoff".
    await prisma.generationJob.updateMany({ data: { nextRunAt: new Date(Date.now() + 60_000) } });

    const metrics = await collectMetrics({});
    expect(metrics.jobs.queued).toBe(1); // still counted as queue depth
    expect(metrics.jobs.oldestQueuedAgeSec).toBeNull(); // but not "stale" yet
  });
});

describe("collectMetrics — credits and revenue against real ledger rows", () => {
  it("sums granted/spent/refunded and converts topup/subscription credits to cents", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const { grantCredits, reserveCredits, settleReservation, refundCredits } = await import("@/lib/wallet");
    const user = await prisma.user.create({ data: { email: `metrics-${randomUUID()}@test.local` } });

    await grantCredits(user.id, 100, "topup", "test topup");
    await grantCredits(user.id, 50, "subscription_grant", "test subscription");
    await reserveCredits(user.id, 30, "job-x");
    await settleReservation(user.id, "job-x", 20); // books a -20 "generation" ledger row
    await refundCredits(user.id, 5, "job-x", "test refund");

    const metrics = await collectMetrics({});
    expect(metrics.credits.granted).toBe(150); // 100 topup + 50 subscription_grant
    expect(metrics.credits.spent).toBe(20); // abs(-20) generation-cost row
    expect(metrics.credits.refunded).toBe(5);
    // CREDIT_TO_EUR = 0.01 EUR/credit -> *100 = 1 cent per credit exactly.
    expect(metrics.revenue).toEqual({ topupCents: 100, subscriptionCents: 50 });
  });
});

describe("collectMetrics — providers merges attempts and failures per providerName", () => {
  it("reports attempts summed and dead-job failures counted per provider", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const { enqueueJob, claimNextJob, failJob } = await import("@/lib/job-queue");
    const user = await createUserWithWallet(100);

    const genA = await makeGeneration(user.id);
    const jobA = await enqueueJob({
      generationId: genA.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      providerName: "kie",
    });
    const claimedA = await claimNextJob("worker-a");
    expect(claimedA.id).toBe(jobA.id);
    await failJob(claimedA.id, "boom", { retryable: false }); // dead

    const genB = await makeGeneration(user.id);
    await enqueueJob({
      generationId: genB.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      providerName: "alibaba",
    });
    await claimNextJob("worker-b"); // stays running — no failure

    const metrics = await collectMetrics({});
    const byName = Object.fromEntries(metrics.providers.map((p) => [p.name, p]));
    expect(byName.kie).toEqual({ name: "kie", attempts: 1, failures: 1 });
    expect(byName.alibaba).toEqual({ name: "alibaba", attempts: 1, failures: 0 });
  });
});

describe("collectMetrics — reconciliation reuses src/lib/reconciliation.js's reconcileAll against real wallets", () => {
  it("counts walletsChecked and drifted", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const { grantCredits } = await import("@/lib/wallet");
    const userA = await prisma.user.create({ data: { email: `metrics-ok-${randomUUID()}@test.local` } });
    await grantCredits(userA.id, 100, "signup", "ok wallet");
    const userB = await prisma.user.create({ data: { email: `metrics-drift-${randomUUID()}@test.local` } });
    await grantCredits(userB.id, 100, "signup", "drifted wallet");
    // Simulate legacy drift exactly like tests/integration/reconciliation.int.test.mjs.
    await prisma.$executeRawUnsafe(
      `UPDATE "public"."CreditWallet" SET "available" = "available" + 15 WHERE "userId" = $1`,
      userB.id
    );

    const metrics = await collectMetrics({});
    expect(metrics.reconciliation).toEqual({ walletsChecked: 2, drifted: 1 });
  });
});

describe("collectMetrics — webhooks and users against real rows", () => {
  it("counts recent StripeEvent rows and recent signups within the window", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    await prisma.stripeEvent.create({
      data: { stripeEventId: `evt_${randomUUID()}`, eventType: "checkout.session.completed" },
    });
    await prisma.stripeEvent.create({
      data: { stripeEventId: `evt_${randomUUID()}`, eventType: "invoice.paid" },
    });
    await prisma.user.create({ data: { email: `signup-${randomUUID()}@test.local` } });

    const metrics = await collectMetrics({ sinceHours: 24 });
    expect(metrics.webhooks.stripeEventsProcessed).toBe(2);
    expect(metrics.users.signups).toBe(1);
  });
});
