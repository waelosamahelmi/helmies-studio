import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    creditWallet: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    creditLedger: { create: vi.fn() },
    creditReservation: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    generation: { findUnique: vi.fn() },
    // Phase 6: sweepExpiredReservations checks TemplateRun first (a
    // template run's reservation is keyed by the run's own id, not a
    // Generation id — see wallet.js's CRITICAL-2 fix comment). Every
    // existing test here is about a plain Generation-keyed reservation, so
    // this resolves null by default, falling through to the generation
    // lookup unchanged — tests/integration/reservation-expiry.int.test.mjs
    // covers the TemplateRun branch itself against the real DB.
    templateRun: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import { reserveCredits, settleReservation, releaseReservation, debitWallet, adjustWalletTo, grantCredits, sweepExpiredReservations } from "@/lib/wallet";

beforeEach(() => vi.clearAllMocks());

describe("reserveCredits — atomic conditional update", () => {
  it("guards the decrement with available >= amount in the WHERE clause", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 40, reserved: 60 });
    prisma.creditReservation.create.mockResolvedValue({ id: "r1" });
    prisma.creditLedger.create.mockResolvedValue({});

    await reserveCredits("u1", 60, "gen1");

    const arg = prisma.creditWallet.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1", available: { gte: 60 } });
    expect(arg.data).toEqual({ available: { decrement: 60 }, reserved: { increment: 60 } });
  });

  it("throws Insufficient when the conditional update matches no row", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 0 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", available: 10, reserved: 0 });
    await expect(reserveCredits("u1", 60, "gen1")).rejects.toThrow(/Insufficient credits/);
    expect(prisma.creditReservation.create).not.toHaveBeenCalled();
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });

  it("writes expiresAt from the (previously ignored) expiresInMinutes parameter", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 40, reserved: 60 });
    prisma.creditReservation.create.mockResolvedValue({ id: "r1" });
    prisma.creditLedger.create.mockResolvedValue({});

    const before = Date.now();
    await reserveCredits("u1", 60, "gen1", 45);
    const after = Date.now();

    const data = prisma.creditReservation.create.mock.calls[0][0].data;
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 45 * 60000);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(after + 45 * 60000);
  });

  it("defaults to a 30-minute expiry when expiresInMinutes is omitted", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 40, reserved: 60 });
    prisma.creditReservation.create.mockResolvedValue({ id: "r1" });
    prisma.creditLedger.create.mockResolvedValue({});

    const before = Date.now();
    await reserveCredits("u1", 60, "gen1");
    const after = Date.now();

    const data = prisma.creditReservation.create.mock.calls[0][0].data;
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60000);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(after + 30 * 60000);
  });
});

describe("sweepExpiredReservations", () => {
  it("releases an expired reservation whose generation failed", async () => {
    prisma.creditReservation.findMany.mockResolvedValue([
      { id: "res1", walletId: "w1", generationId: "gen1", amount: 20, status: "active", wallet: { userId: "u1" } },
    ]);
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "failed", creditsUsed: 0 });
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "res1", amount: 20, walletId: "w1" });
    prisma.creditWallet.update.mockResolvedValue({ id: "w1", userId: "u1", available: 120, reserved: 0 });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditLedger.create.mockResolvedValue({});

    const result = await sweepExpiredReservations();

    expect(result).toEqual({ released: 1, settled: 0, skipped: 0 });
    expect(prisma.creditWallet.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { reserved: { decrement: 20 }, available: { increment: 20 } },
    });
    expect(prisma.creditReservation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "res1", status: "active" },
      data: { status: "released" },
    });
  });

  it("settles an expired reservation whose generation completed", async () => {
    prisma.creditReservation.findMany.mockResolvedValue([
      { id: "res2", walletId: "w1", generationId: "gen2", amount: 20, status: "active", wallet: { userId: "u1" } },
    ]);
    prisma.generation.findUnique.mockResolvedValue({ id: "gen2", status: "completed", creditsUsed: 15 });
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "res2", amount: 20, walletId: "w1" });
    prisma.creditWallet.update.mockResolvedValue({ id: "w1", userId: "u1", available: 105, reserved: 0 });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditLedger.create.mockResolvedValue({});

    const result = await sweepExpiredReservations();

    expect(result).toEqual({ released: 0, settled: 1, skipped: 0 });
    expect(prisma.creditWallet.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { reserved: { decrement: 20 }, available: { increment: 5 } },
    });
    expect(prisma.creditReservation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "res2", status: "active" },
      data: { status: "settled" },
    });
  });

  it("skips an expired reservation whose generation is still in flight", async () => {
    prisma.creditReservation.findMany.mockResolvedValue([
      { id: "res3", walletId: "w1", generationId: "gen3", amount: 20, status: "active", wallet: { userId: "u1" } },
    ]);
    prisma.generation.findUnique.mockResolvedValue({ id: "gen3", status: "processing", creditsUsed: 0 });

    const result = await sweepExpiredReservations();

    expect(result).toEqual({ released: 0, settled: 0, skipped: 1 });
    expect(prisma.creditWallet.update).not.toHaveBeenCalled();
    expect(prisma.creditReservation.updateMany).not.toHaveBeenCalled();
  });

  it("releases when the reservation's generation no longer exists", async () => {
    prisma.creditReservation.findMany.mockResolvedValue([
      { id: "res4", walletId: "w1", generationId: null, amount: 20, status: "active", wallet: { userId: "u1" } },
    ]);
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "res4", amount: 20, walletId: "w1" });
    prisma.creditWallet.update.mockResolvedValue({ id: "w1", userId: "u1", available: 120, reserved: 0 });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditLedger.create.mockResolvedValue({});

    const result = await sweepExpiredReservations();

    expect(result).toEqual({ released: 1, settled: 0, skipped: 0 });
    expect(prisma.generation.findUnique).not.toHaveBeenCalled();
  });

  it("keeps processing remaining rows when one row throws, counting it as skipped", async () => {
    prisma.creditReservation.findMany.mockResolvedValue([
      { id: "resBad", walletId: "w1", generationId: "genBad", amount: 20, status: "active", wallet: { userId: "u1" } },
      { id: "resGood", walletId: "w2", generationId: "genGood", amount: 10, status: "active", wallet: { userId: "u2" } },
    ]);
    prisma.generation.findUnique
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValueOnce({ id: "genGood", status: "failed", creditsUsed: 0 });
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "resGood", amount: 10, walletId: "w2" });
    prisma.creditWallet.update.mockResolvedValue({ id: "w2", userId: "u2", available: 60, reserved: 0 });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditLedger.create.mockResolvedValue({});

    const result = await sweepExpiredReservations();

    expect(result).toEqual({ released: 1, settled: 0, skipped: 1 });
  });

  it("returns all-zero counts and touches nothing when no reservations are expired", async () => {
    prisma.creditReservation.findMany.mockResolvedValue([]);
    const result = await sweepExpiredReservations();
    expect(result).toEqual({ released: 0, settled: 0, skipped: 0 });
    expect(prisma.creditWallet.update).not.toHaveBeenCalled();
  });
});

describe("settleReservation", () => {
  it("clamps the charge to the reservation amount and warns when actualCredits overshoots it", async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "r1", amount: 20, walletId: "w1" });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.update.mockResolvedValue({ id: "w1", userId: "u1", available: 100, reserved: 0 });
    prisma.creditLedger.create.mockResolvedValue({});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await settleReservation("u1", "job1", 35); // actualCredits (35) > reservation.amount (20)

    expect(warnSpy).toHaveBeenCalled();
    const walletArg = prisma.creditWallet.update.mock.calls[0][0];
    expect(walletArg).toEqual({
      where: { userId: "u1" },
      data: { reserved: { decrement: 20 }, available: { increment: 0 } }, // release = 20 - 20 = 0
    });
    const ledgerArg = prisma.creditLedger.create.mock.calls[0][0].data;
    expect(ledgerArg).toMatchObject({ amount: -20, type: "generation" }); // charge clamped to 20, not 35

    warnSpy.mockRestore();
  });

  it("does not warn and charges actualCredits as-is when it fits within the reservation", async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "r1", amount: 20, walletId: "w1" });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.update.mockResolvedValue({ id: "w1", userId: "u1", available: 100, reserved: 0 });
    prisma.creditLedger.create.mockResolvedValue({});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await settleReservation("u1", "job1", 15);

    expect(warnSpy).not.toHaveBeenCalled();
    const ledgerArg = prisma.creditLedger.create.mock.calls[0][0].data;
    expect(ledgerArg).toMatchObject({ amount: -15, type: "generation" });

    warnSpy.mockRestore();
  });

  it("throws 'No active reservation found' and touches no wallet/ledger when the conditional status flip matches zero rows", async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "r1", amount: 20, walletId: "w1" });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 0 }); // a concurrent settle already won

    await expect(settleReservation("u1", "job1", 15)).rejects.toThrow(/No active reservation found/);
    expect(prisma.creditWallet.update).not.toHaveBeenCalled();
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });

  it("passes { id, status: 'active' } as the updateMany guard so a second concurrent caller can't also win", async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "r1", amount: 20, walletId: "w1" });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.update.mockResolvedValue({ id: "w1", userId: "u1", available: 100, reserved: 0 });
    prisma.creditLedger.create.mockResolvedValue({});

    await settleReservation("u1", "job1", 15);

    expect(prisma.creditReservation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "r1", status: "active" },
      data: { status: "settled" },
    });
  });
});

describe("releaseReservation", () => {
  it("returns null (not a throw) when there was never an active reservation to begin with", async () => {
    prisma.creditReservation.findFirst.mockResolvedValue(null);

    const result = await releaseReservation("u1", "job1");

    expect(result).toBeNull();
    expect(prisma.creditReservation.updateMany).not.toHaveBeenCalled();
  });

  it("throws 'No active reservation found' when the conditional status flip matches zero rows", async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "r1", amount: 20, walletId: "w1" });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 0 }); // a concurrent settle/release already won

    await expect(releaseReservation("u1", "job1")).rejects.toThrow(/No active reservation found/);
    expect(prisma.creditWallet.update).not.toHaveBeenCalled();
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });

  it("passes { id, status: 'active' } as the updateMany guard on the happy path", async () => {
    prisma.creditReservation.findFirst.mockResolvedValue({ id: "r1", amount: 20, walletId: "w1" });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.update.mockResolvedValue({ id: "w1", userId: "u1", available: 120, reserved: 0 });
    prisma.creditLedger.create.mockResolvedValue({});

    await releaseReservation("u1", "job1");

    expect(prisma.creditReservation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "r1", status: "active" },
      data: { status: "released" },
    });
  });
});

describe("grantCredits — ledger type validation", () => {
  it("throws on an unknown ledger type before writing anything", async () => {
    await expect(grantCredits("u1", 10, "not_a_real_type")).rejects.toThrow(/Invalid ledger type/);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });

  it("accepts a known ledger type and proceeds normally", async () => {
    prisma.creditWallet.upsert.mockResolvedValue({ id: "w1", available: 40 });
    prisma.creditLedger.create.mockResolvedValue({});

    await grantCredits("u1", 10, "topup");

    expect(prisma.creditWallet.upsert).toHaveBeenCalled();
    expect(prisma.creditLedger.create.mock.calls[0][0].data).toMatchObject({ type: "topup" });
  });
});

describe("debitWallet", () => {
  it("conditionally decrements and writes a 'debit' ledger row", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 15, reserved: 0 });
    prisma.creditLedger.create.mockResolvedValue({});

    await debitWallet("u1", 25, "Agent run: launch ad", "agent:run1");

    expect(prisma.creditWallet.updateMany.mock.calls[0][0].where)
      .toEqual({ userId: "u1", available: { gte: 25 } });
    const ledger = prisma.creditLedger.create.mock.calls[0][0].data;
    expect(ledger).toMatchObject({ amount: -25, type: "debit", referenceId: "agent:run1", balanceAfter: 15 });
  });

  it("throws and writes nothing when balance is short", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(debitWallet("u1", 25, "x", "y")).rejects.toThrow(/Insufficient credits/);
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });
});

describe("adjustWalletTo", () => {
  it("books the delta as admin_adjustment and mirrors User.credits", async () => {
    prisma.creditWallet.upsert.mockResolvedValue({ id: "w1", userId: "u1", available: 500, reserved: 0 });
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique
      .mockResolvedValueOnce({ id: "w1", userId: "u1", available: 500, reserved: 0 }) // before
      .mockResolvedValueOnce({ id: "w1", userId: "u1", available: 200, reserved: 0 }); // after
    prisma.creditLedger.create.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});

    const { delta } = await adjustWalletTo("u1", 200, "Abuse clamp", "admin1");

    expect(delta).toBe(-300);
    const casArg = prisma.creditWallet.updateMany.mock.calls[0][0];
    expect(casArg.where).toEqual({ userId: "u1", available: 500 });
    expect(casArg.data).toMatchObject({ available: 200 });
    const ledger = prisma.creditLedger.create.mock.calls[0][0].data;
    expect(ledger).toMatchObject({ amount: -300, type: "admin_adjustment", balanceAfter: 200 });
    expect(ledger.description).toContain("Abuse clamp");
    expect(prisma.user.update.mock.calls[0][0]).toEqual({ where: { id: "u1" }, data: { credits: 200 } });
  });

  it("is a no-op (no ledger row) when target equals current", async () => {
    prisma.creditWallet.upsert.mockResolvedValue({ id: "w1", userId: "u1", available: 200, reserved: 0 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 200, reserved: 0 });
    const { delta } = await adjustWalletTo("u1", 200, "noop", "admin1");
    expect(delta).toBe(0);
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });

  it("throws a concurrent-modification error and writes no ledger row when the CAS misses", async () => {
    prisma.creditWallet.upsert.mockResolvedValue({ id: "w1", userId: "u1", available: 500, reserved: 0 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 500, reserved: 0 });
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(adjustWalletTo("u1", 200, "Abuse clamp", "admin1")).rejects.toThrow(/Wallet changed concurrently/);

    const casArg = prisma.creditWallet.updateMany.mock.calls[0][0];
    expect(casArg.where).toEqual({ userId: "u1", available: 500 });
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("tx composability", () => {
  it("grantCredits uses the provided client without opening a new transaction", async () => {
    const tx = {
      creditWallet: { upsert: vi.fn().mockResolvedValue({ id: "w1", available: 130, reserved: 0 }) },
      creditLedger: { create: vi.fn().mockResolvedValue({}) },
    };
    await grantCredits("u1", 30, "topup", "top up", "evt_1", tx);
    expect(tx.creditWallet.upsert).toHaveBeenCalled();
    expect(tx.creditLedger.create).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
