import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createUserWithWallet } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

async function makeGeneration(userId, { status = "processing", creditsUsed = 0 } = {}) {
  return prisma.generation.create({
    data: {
      userId,
      tool: "image",
      model: "test-model",
      prompt: "a job-lifecycle timeout-sweep test prompt",
      status,
      creditsUsed,
    },
  });
}

// Unlike setup.mjs's createUserWithWallet (which writes CreditWallet.available
// directly with no matching CreditLedger row — fine for tests that never call
// reconcileWallet), reconcileWallet's `ok` requires the ledger to fully
// account for the wallet's history. Seed the opening balance through the
// real grantCredits call instead, mirroring
// tests/integration/reconciliation.int.test.mjs's buildWalletViaRealWalletCalls
// — grantCredits both creates the wallet (upsert) and books the matching
// "signup" ledger row, so reconcileWallet has a complete, correct history to
// check the sweep's own ledger writes against.
async function makeFundedUser(amount) {
  const { grantCredits } = await import("@/lib/wallet");
  const user = await prisma.user.create({ data: { email: `t-joblifecycle-${randomUUID()}@test.local` } });
  await grantCredits(user.id, amount, "signup", "Test opening balance");
  return user;
}

describe("sweepTimedOutJobs — the end-to-end proof the stranding risk is closed", () => {
  it("a job past timeoutAt with an ACTIVE reservation: wallet fully restored, one ledger row, generation failed, job dead, reconcile clean", async () => {
    const { enqueueJob } = await import("@/lib/job-queue");
    const { sweepTimedOutJobs } = await import("@/lib/job-runner");
    const { reserveCredits } = await import("@/lib/wallet");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(100);
    const generation = await makeGeneration(user.id, { creditsUsed: 30 });
    await reserveCredits(user.id, 30, generation.id);

    const job = await enqueueJob({
      generationId: generation.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: { prompt: "x" },
      providerName: "kie",
      endpoint: "/v1/generate",
      timeoutMs: -1000, // already in the past
    });

    const result = await sweepTimedOutJobs();
    expect(result).toEqual({ timedOut: 1, refunded: 1 });

    // Wallet fully restored — the reservation's full 30 credits are back in
    // `available`, and `reserved` drops back to zero. This is the assertion
    // that proves the stranding risk (credits held forever behind a
    // generation nothing will ever finish) is closed.
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);
    expect(wallet.reserved).toBe(0);

    // Exactly one release/refund ledger row — no double-crediting, no
    // missing credit either.
    const ledgerRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: { in: ["reservation_release", "refund"] } },
    });
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({ type: "reservation_release", amount: 30 });

    const reservation = await prisma.creditReservation.findFirst({ where: { generationId: generation.id } });
    expect(reservation.status).toBe("released");

    const generationAfter = await prisma.generation.findUnique({ where: { id: generation.id } });
    expect(generationAfter.status).toBe("failed");
    expect(generationAfter.error).toBe("Timed out waiting for the provider");

    const jobAfter = await prisma.generationJob.findUnique({ where: { id: job.id } });
    expect(jobAfter.status).toBe("dead");
    expect(jobAfter.lastError).toBe("Timed out waiting for the provider");
    expect(jobAfter.leaseUntil).toBeNull();
    expect(jobAfter.lockedBy).toBeNull();

    // reconcileWallet proves the two money invariants hold exactly after the
    // sweep — no drift left behind by the release.
    const report = await reconcileWallet(user.id);
    expect(report.ok).toBe(true);
    expect(report.driftAvailable).toBe(0);
    expect(report.driftReserved).toBe(0);
  });

  it("a job past timeoutAt whose reservation was already settled: falls back to refundCredits exactly once, reconcile clean", async () => {
    const { enqueueJob } = await import("@/lib/job-queue");
    const { sweepTimedOutJobs } = await import("@/lib/job-runner");
    const { reserveCredits, settleReservation } = await import("@/lib/wallet");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(100);
    const generation = await makeGeneration(user.id, { creditsUsed: 20 });
    await reserveCredits(user.id, 20, generation.id);
    // Simulate the webhook having already settled this reservation (e.g. the
    // provider actually finished, but the job row's own terminal update
    // never landed) — nothing "active" left for the sweep to release.
    await settleReservation(user.id, generation.id, 20);

    const job = await enqueueJob({
      generationId: generation.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: { prompt: "x" },
      timeoutMs: -1000,
    });

    const result = await sweepTimedOutJobs();
    expect(result).toEqual({ timedOut: 1, refunded: 1 });

    // settleReservation already released the 30->0 reserved delta at settle
    // time; the sweep's fallback refund then adds another 20 on top of the
    // 80 left after settling — proving refund (not release) fired exactly
    // once, never both.
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100); // 80 after settle + 20 refunded back
    expect(wallet.reserved).toBe(0);

    const refundRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "refund" },
    });
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0].amount).toBe(20);

    const jobAfter = await prisma.generationJob.findUnique({ where: { id: job.id } });
    expect(jobAfter.status).toBe("dead");

    const report = await reconcileWallet(user.id);
    expect(report.ok).toBe(true);
  });

  it("a job NOT past timeoutAt is left completely untouched", async () => {
    const { enqueueJob } = await import("@/lib/job-queue");
    const { sweepTimedOutJobs } = await import("@/lib/job-runner");
    const { reserveCredits } = await import("@/lib/wallet");

    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, { creditsUsed: 10 });
    await reserveCredits(user.id, 10, generation.id);

    const job = await enqueueJob({
      generationId: generation.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      timeoutMs: 60 * 60 * 1000, // an hour out — nowhere near due
    });

    const result = await sweepTimedOutJobs();
    expect(result).toEqual({ timedOut: 0, refunded: 0 });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(90);
    expect(wallet.reserved).toBe(10);

    const jobAfter = await prisma.generationJob.findUnique({ where: { id: job.id } });
    expect(jobAfter.status).toBe("queued");
    expect(job.status).toBe("queued");

    const generationAfter = await prisma.generation.findUnique({ where: { id: generation.id } });
    expect(generationAfter.status).toBe("processing");
  });
});

describe("runAutomation — jobs leg against a real database (Task 7)", () => {
  it("sweeps a real timed-out job end-to-end through the cron entrypoint", async () => {
    const { enqueueJob } = await import("@/lib/job-queue");
    const { runAutomation } = await import("@/lib/automation");
    const { reserveCredits } = await import("@/lib/wallet");

    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, { creditsUsed: 15 });
    await reserveCredits(user.id, 15, generation.id);
    await enqueueJob({
      generationId: generation.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      timeoutMs: -1000,
    });

    const result = await runAutomation();

    expect(result.jobs).toEqual({ timedOut: 1, refunded: 1 });
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("reservations");
    expect(result).toHaveProperty("timestamp");

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);
    expect(wallet.reserved).toBe(0);
  });
});
