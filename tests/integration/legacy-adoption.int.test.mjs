import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

// Mirrors tests/integration/reconciliation.int.test.mjs's
// buildWalletViaRealWalletCalls — grantCredits both creates the wallet and
// books the matching "signup" ledger row, so reconcileWallet has a complete
// history to check the script's own ledger writes against (setup.mjs's
// createUserWithWallet writes CreditWallet.available directly with no
// ledger row, which is fine for tests that never call reconcileWallet, but
// would make `ok` legitimately false here for a reason that has nothing to
// do with this script).
async function makeFundedUser(amount) {
  const { grantCredits } = await import("@/lib/wallet");
  const user = await prisma.user.create({ data: { email: `t-legacy-adopt-${randomUUID()}@test.local` } });
  await grantCredits(user.id, amount, "signup", "Test opening balance");
  return user;
}

async function makePendingGeneration(userId, { requestId = null, creditsUsed = 0, status = "pending" } = {}) {
  return prisma.generation.create({
    data: {
      userId,
      tool: "image",
      model: "test-model",
      prompt: "a legacy adoption test prompt",
      status,
      creditsUsed,
      requestId,
    },
  });
}

describe("adoptLegacyGenerations — end-to-end against a real database", () => {
  it("adopts a requestId-bearing row into a running job with no credit movement, and fails+refunds a requestId-less row", async () => {
    const { adoptLegacyGenerations } = await import("../../scripts/adopt-legacy-generations.mjs");
    const { reserveCredits } = await import("@/lib/wallet");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const userWithRequest = await makeFundedUser(100);
    const genWithRequest = await makePendingGeneration(userWithRequest.id, { requestId: "req_legacy_123", creditsUsed: 20 });
    await reserveCredits(userWithRequest.id, 20, genWithRequest.id);

    const userNoRequest = await makeFundedUser(100);
    const genNoRequest = await makePendingGeneration(userNoRequest.id, { requestId: null, creditsUsed: 15, status: "processing" });
    await reserveCredits(userNoRequest.id, 15, genNoRequest.id);

    const result = await adoptLegacyGenerations({ apply: true });

    expect(result.applied).toBe(true);
    expect(result.adopted).toBe(1);
    expect(result.failed).toBe(1);

    // Adopted row: running job, providerRequestId carried over, lease
    // already expired (so the worker's normal crash-recovery path resumes
    // it), no credit movement — the reservation is left exactly as it was.
    const job = await prisma.generationJob.findUnique({ where: { generationId: genWithRequest.id } });
    expect(job).toMatchObject({ status: "running", providerRequestId: "req_legacy_123", lockedBy: null });
    expect(job.leaseUntil.getTime()).toBeLessThan(Date.now());
    expect(job.timeoutAt.getTime()).toBeGreaterThan(Date.now());

    const walletWithRequest = await prisma.creditWallet.findUnique({ where: { userId: userWithRequest.id } });
    expect(walletWithRequest.available).toBe(80); // 100 - 20 reserved, untouched
    expect(walletWithRequest.reserved).toBe(20);

    const genAfterAdopt = await prisma.generation.findUnique({ where: { id: genWithRequest.id } });
    expect(genAfterAdopt.status).toBe("pending"); // unchanged — the resumed job settles it later

    // No-requestId row: failed + refunded.
    const genAfterFail = await prisma.generation.findUnique({ where: { id: genNoRequest.id } });
    expect(genAfterFail.status).toBe("failed");
    expect(genAfterFail.error).toBe("Interrupted by a deployment");

    const noJob = await prisma.generationJob.findUnique({ where: { generationId: genNoRequest.id } });
    expect(noJob).toBeNull();

    const walletNoRequest = await prisma.creditWallet.findUnique({ where: { userId: userNoRequest.id } });
    expect(walletNoRequest.available).toBe(100); // fully restored
    expect(walletNoRequest.reserved).toBe(0);

    const reservation = await prisma.creditReservation.findFirst({ where: { generationId: genNoRequest.id } });
    expect(reservation.status).toBe("released");

    // Reconciliation clean on both wallets — the money invariants hold
    // exactly after the script runs.
    const reconWithRequest = await reconcileWallet(userWithRequest.id);
    expect(reconWithRequest.ok).toBe(true);
    const reconNoRequest = await reconcileWallet(userNoRequest.id);
    expect(reconNoRequest.ok).toBe(true);
  });

  it("dry run (the default) makes no writes and reports the same plan apply mode would act on", async () => {
    const { adoptLegacyGenerations } = await import("../../scripts/adopt-legacy-generations.mjs");
    const { reserveCredits } = await import("@/lib/wallet");

    const userWithRequest = await makeFundedUser(50);
    const genWithRequest = await makePendingGeneration(userWithRequest.id, { requestId: "req_dry_run", creditsUsed: 10 });
    await reserveCredits(userWithRequest.id, 10, genWithRequest.id);

    const userNoRequest = await makeFundedUser(50);
    const genNoRequest = await makePendingGeneration(userNoRequest.id, { creditsUsed: 5 });
    await reserveCredits(userNoRequest.id, 5, genNoRequest.id);

    const dryRun = await adoptLegacyGenerations(); // apply defaults to false

    expect(dryRun.applied).toBe(false);
    expect(dryRun.total).toBe(2);
    expect(dryRun.toAdopt).toBe(1);
    expect(dryRun.toFail).toBe(1);
    expect(dryRun.plan).toEqual(
      expect.arrayContaining([
        { generationId: genWithRequest.id, userId: userWithRequest.id, action: "adopt" },
        { generationId: genNoRequest.id, userId: userNoRequest.id, action: "fail" },
      ])
    );

    // No writes at all — both generations and both jobs (none created) are untouched.
    expect(await prisma.generationJob.count()).toBe(0);
    const gen1 = await prisma.generation.findUnique({ where: { id: genWithRequest.id } });
    const gen2 = await prisma.generation.findUnique({ where: { id: genNoRequest.id } });
    expect(gen1.status).toBe("pending");
    expect(gen2.status).toBe("pending");
    const wallet1 = await prisma.creditWallet.findUnique({ where: { userId: userWithRequest.id } });
    const wallet2 = await prisma.creditWallet.findUnique({ where: { userId: userNoRequest.id } });
    expect(wallet1.reserved).toBe(10);
    expect(wallet2.reserved).toBe(5);
  });

  it("is idempotent — running it a second time in apply mode finds nothing left to do", async () => {
    const { adoptLegacyGenerations } = await import("../../scripts/adopt-legacy-generations.mjs");
    const { reserveCredits } = await import("@/lib/wallet");

    const userWithRequest = await makeFundedUser(50);
    const genWithRequest = await makePendingGeneration(userWithRequest.id, { requestId: "req_rerun", creditsUsed: 10 });
    await reserveCredits(userWithRequest.id, 10, genWithRequest.id);

    const userNoRequest = await makeFundedUser(50);
    const genNoRequest = await makePendingGeneration(userNoRequest.id, { creditsUsed: 5 });
    await reserveCredits(userNoRequest.id, 5, genNoRequest.id);

    const first = await adoptLegacyGenerations({ apply: true });
    expect(first.adopted).toBe(1);
    expect(first.failed).toBe(1);

    const second = await adoptLegacyGenerations({ apply: true });
    expect(second.total).toBe(0);
    expect(second.adopted).toBe(0);
    expect(second.failed).toBe(0);

    // Second run touched nothing — exactly one job row, one release ledger
    // row (the reservation was still active, so the first run released it
    // rather than falling back to refundCredits).
    expect(await prisma.generationJob.count()).toBe(1);
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: userNoRequest.id } });
    expect(wallet.available).toBe(50);
    const releaseRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: { in: ["reservation_release", "refund"] } },
    });
    expect(releaseRows).toHaveLength(1);
  });

  it("leaves an already-adopted or already-failed generation alone (not in the candidate set)", async () => {
    const { adoptLegacyGenerations } = await import("../../scripts/adopt-legacy-generations.mjs");

    const user = await makeFundedUser(50);
    // A generation with a job already attached must never be re-touched.
    const genWithJob = await makePendingGeneration(user.id, { requestId: "req_has_job" });
    await prisma.generationJob.create({
      data: {
        generationId: genWithJob.id,
        userId: user.id,
        idempotencyKey: `idem-${randomUUID()}`,
        payload: {},
        timeoutAt: new Date(Date.now() + 60000),
      },
    });

    const result = await adoptLegacyGenerations({ apply: true });

    expect(result.total).toBe(0);
    const job = await prisma.generationJob.findUnique({ where: { generationId: genWithJob.id } });
    expect(job.status).toBe("queued"); // untouched — still whatever it started as
  });

  it("never picks up completed or failed generations, only pending/processing", async () => {
    const { adoptLegacyGenerations } = await import("../../scripts/adopt-legacy-generations.mjs");

    const user = await makeFundedUser(50);
    await makePendingGeneration(user.id, { status: "completed", requestId: "req_done" });
    await makePendingGeneration(user.id, { status: "failed", requestId: "req_dead" });

    const result = await adoptLegacyGenerations({ apply: true });

    expect(result.total).toBe(0);
  });
});
