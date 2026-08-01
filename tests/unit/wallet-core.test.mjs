import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    creditWallet: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    creditLedger: { create: vi.fn() },
    creditReservation: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import { reserveCredits, debitWallet, adjustWalletTo, grantCredits } from "@/lib/wallet";

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
