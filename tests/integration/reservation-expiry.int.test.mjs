import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

async function makeGeneration(userId, status, creditsUsed = 0) {
  return prisma.generation.create({
    data: {
      userId,
      tool: "image",
      model: "test-model",
      prompt: "a reservation-expiry test prompt",
      status,
      creditsUsed,
    },
  });
}

describe("sweepExpiredReservations — end-to-end against a real database", () => {
  it("releases an expired reservation whose generation failed, restoring available", async () => {
    const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, "failed");
    // Negative expiresInMinutes lands expiresAt safely in the past.
    await reserveCredits(user.id, 40, generation.id, -1);

    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 1, settled: 0, skipped: 0 });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);
    expect(wallet.reserved).toBe(0);

    const reservation = await prisma.creditReservation.findFirst({ where: { generationId: generation.id } });
    expect(reservation.status).toBe("released");
    expect(reservation.releasedAt).not.toBeNull();
  });

  it("settles an expired reservation whose generation completed, at the generation's actual cost", async () => {
    const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, "completed", 25);
    await reserveCredits(user.id, 40, generation.id, -1);

    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 0, settled: 1, skipped: 0 });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    // 100 - 40 reserved, then settled at 25 with the unused 15 released back.
    expect(wallet.available).toBe(75);
    expect(wallet.reserved).toBe(0);

    const reservation = await prisma.creditReservation.findFirst({ where: { generationId: generation.id } });
    expect(reservation.status).toBe("settled");
  });

  it("does not touch a reservation that has not expired yet", async () => {
    const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, "pending");
    await reserveCredits(user.id, 40, generation.id, 30);

    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 0, settled: 0, skipped: 0 });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(60);
    expect(wallet.reserved).toBe(40);
  });

  it("skips an expired reservation whose generation is still in flight, leaving the hold active", async () => {
    const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, "processing");
    await reserveCredits(user.id, 40, generation.id, -1);

    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 0, settled: 0, skipped: 1 });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(60);
    expect(wallet.reserved).toBe(40);

    const reservation = await prisma.creditReservation.findFirst({ where: { generationId: generation.id } });
    expect(reservation.status).toBe("active");
  });

  // Task 9 review fix: reservations created before expiresAt existed have it
  // NULL. `expiresAt: { lt: now }` alone never matches NULL (SQL UNKNOWN),
  // so a legacy reservation would be invisible to the sweep forever even
  // though a migration is meant to backfill it. The sweep now also matches
  // NULL-expiresAt rows directly against a 30-minute-from-createdAt cutoff,
  // so a legacy row is swept even on a database where the backfill migration
  // was somehow never run.
  it("sweeps a legacy reservation with NULL expiresAt once its createdAt is old enough", async () => {
    const { sweepExpiredReservations } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, "failed");
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });

    // Simulate the pre-migration state directly: available/reserved already
    // moved as reserveCredits would, but expiresAt is NULL and createdAt is
    // well past the 30-minute legacy cutoff.
    await prisma.creditWallet.update({
      where: { userId: user.id },
      data: { available: { decrement: 40 }, reserved: { increment: 40 } },
    });
    await prisma.creditReservation.create({
      data: {
        walletId: wallet.id,
        generationId: generation.id,
        amount: 40,
        status: "active",
        expiresAt: null,
        createdAt: new Date(Date.now() - 31 * 60000),
      },
    });

    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 1, settled: 0, skipped: 0 });

    const updatedWallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(updatedWallet.available).toBe(100);
    expect(updatedWallet.reserved).toBe(0);

    const reservation = await prisma.creditReservation.findFirst({ where: { generationId: generation.id } });
    expect(reservation.status).toBe("released");
  });

  it("does not sweep a NULL-expiresAt reservation whose createdAt is within the legacy cutoff", async () => {
    const { sweepExpiredReservations } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    const generation = await makeGeneration(user.id, "failed");
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });

    await prisma.creditWallet.update({
      where: { userId: user.id },
      data: { available: { decrement: 40 }, reserved: { increment: 40 } },
    });
    await prisma.creditReservation.create({
      data: {
        walletId: wallet.id,
        generationId: generation.id,
        amount: 40,
        status: "active",
        expiresAt: null,
        createdAt: new Date(), // just created — not old enough to count as expired
      },
    });

    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 0, settled: 0, skipped: 0 });

    const reservation = await prisma.creditReservation.findFirst({ where: { generationId: generation.id } });
    expect(reservation.status).toBe("active");
  });

  // CRITICAL-2 fix (found in review, proven against the real test DB): a
  // TemplateRun's reservation is keyed by the run's OWN id (Phase 6 —
  // src/lib/template-runner.js), which matches no Generation row at all.
  // Before this fix, the sweep's ONLY lookup was `prisma.generation.findUnique`
  // — that always returned null for a runId, so a template run's reservation
  // fell straight into the "generation missing -> release" branch the
  // instant its TTL lapsed, even while the run was still genuinely running.
  // Proof this used to mint credits: release the reservation mid-run, then
  // let the run's own step fail for real — releaseOrRefund finds nothing
  // active to release (the sweep already released it) and falls back to
  // refundCredits, crediting the SAME amount a second time.
  describe("a TemplateRun-keyed reservation (Phase 6)", () => {
    async function makeRunningTemplateRun(userId, amount) {
      return prisma.templateRun.create({
        data: {
          userId,
          templateId: "tpl-fixture",
          versionId: "ver-fixture",
          status: "running",
          stepState: { step1: { status: "running", generationId: null, outputUrl: null, error: null } },
          totalCredits: amount,
        },
      });
    }

    it("does NOT release a still-running template run's reservation, even once expiresAt has passed", async () => {
      const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
      const user = await createUserWithWallet(1000);
      const run = await makeRunningTemplateRun(user.id, 141);
      // Backdated expiresAt — simulates the TTL sizing being wrong (or just
      // a very slow run) without waiting for real time to pass.
      await reserveCredits(user.id, 141, run.id, -1);

      const result = await sweepExpiredReservations();
      expect(result).toEqual({ released: 0, settled: 0, skipped: 1 });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
      expect(wallet.available).toBe(1000 - 141);
      expect(wallet.reserved).toBe(141);

      const reservation = await prisma.creditReservation.findFirst({ where: { generationId: run.id } });
      expect(reservation.status).toBe("active");
    });

    it("never mints credits: a swept-but-still-running run whose step later fails settles via release-or-refund exactly once, not twice", async () => {
      const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
      const { releaseOrRefund } = await import("@/lib/job-runner");
      const user = await createUserWithWallet(1000);
      const run = await makeRunningTemplateRun(user.id, 141);
      await reserveCredits(user.id, 141, run.id, -1);

      // The sweep must skip it (this is the fix under test)...
      const sweepResult = await sweepExpiredReservations();
      expect(sweepResult).toEqual({ released: 0, settled: 0, skipped: 1 });

      // ...so when the run's own step genuinely fails later, its ONE
      // release-or-refund call is the only credit movement that ever
      // happens — the wallet ends up exactly back at the opening balance,
      // never higher.
      await releaseOrRefund({ userId: user.id, id: run.id, creditsUsed: 141 }, { payload: {} });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
      expect(wallet.available).toBe(1000); // exactly the opening balance — no credits minted
      expect(wallet.reserved).toBe(0);

      const refundRows = await prisma.creditLedger.findMany({
        where: { walletId: wallet.id, type: { in: ["reservation_release", "refund"] } },
      });
      expect(refundRows).toHaveLength(1); // exactly one movement, not two
    });

    it("settles a completed template run's reservation at the run's totalCredits (defensive path)", async () => {
      const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
      const user = await createUserWithWallet(1000);
      const run = await prisma.templateRun.create({
        data: {
          userId: user.id,
          templateId: "tpl-fixture",
          versionId: "ver-fixture",
          status: "completed",
          stepState: {},
          totalCredits: 50,
        },
      });
      await reserveCredits(user.id, 50, run.id, -1);

      const result = await sweepExpiredReservations();
      expect(result).toEqual({ released: 0, settled: 1, skipped: 0 });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
      expect(wallet.available).toBe(950); // settled at the full 50 (no unused-reservation release)
      expect(wallet.reserved).toBe(0);
    });

    it("releases a failed template run's reservation", async () => {
      const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
      const user = await createUserWithWallet(1000);
      const run = await prisma.templateRun.create({
        data: {
          userId: user.id,
          templateId: "tpl-fixture",
          versionId: "ver-fixture",
          status: "failed",
          stepState: {},
          totalCredits: 30,
        },
      });
      await reserveCredits(user.id, 30, run.id, -1);

      const result = await sweepExpiredReservations();
      expect(result).toEqual({ released: 1, settled: 0, skipped: 0 });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
      expect(wallet.available).toBe(1000);
      expect(wallet.reserved).toBe(0);
    });
  });

  it("sweeps multiple expired reservations across different users in one pass", async () => {
    const { reserveCredits, sweepExpiredReservations } = await import("@/lib/wallet");
    const userA = await createUserWithWallet(100);
    const userB = await createUserWithWallet(100);
    const genA = await makeGeneration(userA.id, "failed");
    const genB = await makeGeneration(userB.id, "completed", 10);

    await reserveCredits(userA.id, 20, genA.id, -1);
    await reserveCredits(userB.id, 20, genB.id, -1);

    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 1, settled: 1, skipped: 0 });

    const walletA = await prisma.creditWallet.findUnique({ where: { userId: userA.id } });
    const walletB = await prisma.creditWallet.findUnique({ where: { userId: userB.id } });
    expect(walletA.available).toBe(100);
    expect(walletB.available).toBe(90);
  });
});
