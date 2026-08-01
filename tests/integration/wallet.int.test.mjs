import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

describe("reserveCredits under concurrency", () => {
  it("never over-spends: two concurrent 60-credit reserves on a 100-credit wallet → exactly one succeeds", async () => {
    const { reserveCredits } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);

    const results = await Promise.allSettled([
      reserveCredits(user.id, 60, "job-a"),
      reserveCredits(user.id, 60, "job-b"),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(40);
    expect(wallet.reserved).toBe(60);
    expect(wallet.available).toBeGreaterThanOrEqual(0);
  });
});

describe("reserve → settle / release invariants", () => {
  it("settling at less than reserved returns the difference and books the cost row", async () => {
    const { reserveCredits, settleReservation } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    await reserveCredits(user.id, 50, "job-1");
    await settleReservation(user.id, "job-1", 30);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(70); // 100 - 50 + 20 released
    expect(wallet.reserved).toBe(0);

    const rows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "asc" } });
    const movementSum = rows.filter((r) => r.type !== "generation").reduce((s, r) => s + r.amount, 0);
    expect(movementSum).toBe(-30); // net spend relative to opening 100... wallet started with no opening ledger row
    expect(wallet.available).toBe(100 + movementSum);
  });

  it("release restores the full amount and settlement afterwards is a no-op error", async () => {
    const { reserveCredits, releaseReservation, settleReservation } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    await reserveCredits(user.id, 50, "job-2");
    await releaseReservation(user.id, "job-2");

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);
    expect(wallet.reserved).toBe(0);

    await expect(settleReservation(user.id, "job-2", 50)).rejects.toThrow(/No active reservation/);
  });
});

describe("DB CHECK constraints", () => {
  it("the database itself rejects a negative balance", async () => {
    const user = await createUserWithWallet(10);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "public"."CreditWallet" SET "available" = "available" - 50 WHERE "userId" = $1`, user.id
      )
    ).rejects.toThrow(/CreditWallet_available_nonnegative|check constraint/i);
  });
});
