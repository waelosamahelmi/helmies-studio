import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    creditWallet: { findUnique: vi.fn(), findMany: vi.fn() },
    creditLedger: { findMany: vi.fn(), create: vi.fn() },
    creditReservation: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { default: models };
});

import prisma from "@/lib/prisma";
import { reconcileWallet, anchorWallet, reconcileAll } from "@/lib/reconciliation";

beforeEach(() => vi.clearAllMocks());

describe("reconcileWallet", () => {
  it("reports ok:true when ledger movement, active reservations, and the User.credits mirror all match the wallet", async () => {
    // Mirrors the reserve->settle scenario in wallet.int.test.mjs: signup 100,
    // reserve 50, settle at 30 (generation row informational, release +20).
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 70, reserved: 0 });
    prisma.creditLedger.findMany.mockResolvedValue([
      { amount: 100, type: "signup" },
      { amount: -50, type: "reservation" },
      { amount: -30, type: "generation" }, // informational — excluded from movement sum
      { amount: 20, type: "reservation_release" },
    ]);
    prisma.creditReservation.findMany.mockResolvedValue([]); // settled, none active
    prisma.user.findUnique.mockResolvedValue({ credits: 70 });

    const report = await reconcileWallet("u1");

    expect(report).toEqual({
      userId: "u1",
      available: 70,
      reserved: 0,
      ledgerMovementSum: 70,
      activeReservationSum: 0,
      mirrorCredits: 70,
      driftAvailable: 0,
      driftReserved: 0,
      driftMirror: 0,
      mirrorStale: false,
      ok: true,
    });
  });

  it("detects a legacy no-ledger credit: available 120 but ledger movement sums to 100", async () => {
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 120, reserved: 0 });
    prisma.creditLedger.findMany.mockResolvedValue([{ amount: 100, type: "signup" }]);
    prisma.creditReservation.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ credits: 120 });

    const report = await reconcileWallet("u1");

    expect(report.ledgerMovementSum).toBe(100);
    expect(report.driftAvailable).toBe(20);
    expect(report.ok).toBe(false);
  });

  it("detects a reserved mismatch via the active-reservation sum", async () => {
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 50, reserved: 60 });
    prisma.creditLedger.findMany.mockResolvedValue([{ amount: 50, type: "signup" }]);
    prisma.creditReservation.findMany.mockResolvedValue([{ amount: 50 }]); // only 50 actually active
    prisma.user.findUnique.mockResolvedValue({ credits: 50 });

    const report = await reconcileWallet("u1");

    expect(report.activeReservationSum).toBe(50);
    expect(report.driftReserved).toBe(10);
    expect(report.ok).toBe(false);
    expect(report.driftAvailable).toBe(0);
  });

  it("reports ok:true with mirrorStale:true when only the User.credits mirror disagrees — mirror staleness is not a money invariant", async () => {
    // available/ledger/reservations all agree; only the denormalized
    // User.credits mirror (synced opportunistically elsewhere, see
    // AGENTS.md) lags behind. This must NOT fail `ok` — it self-heals on
    // the user's next session read.
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 80, reserved: 0 });
    prisma.creditLedger.findMany.mockResolvedValue([{ amount: 80, type: "signup" }]);
    prisma.creditReservation.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ credits: 75 });

    const report = await reconcileWallet("u1");

    expect(report.mirrorCredits).toBe(75);
    expect(report.driftMirror).toBe(-5);
    expect(report.mirrorStale).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("only sums ledger rows with type != 'generation' into ledgerMovementSum", async () => {
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 40, reserved: 0 });
    prisma.creditLedger.findMany.mockResolvedValue([
      { amount: 100, type: "signup" },
      { amount: -60, type: "generation" }, // must be excluded, not just netted
      { amount: -60, type: "reservation" },
    ]);
    prisma.creditReservation.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ credits: 40 });

    const report = await reconcileWallet("u1");

    expect(report.ledgerMovementSum).toBe(40); // 100 - 60, the -60 generation row excluded
    expect(report.ok).toBe(true);
  });
});

describe("anchorWallet — the --fix anchor", () => {
  it("books exactly one admin_adjustment ledger row equal to driftAvailable, described as 'reconciliation anchor'", async () => {
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 120, reserved: 0 });
    prisma.creditLedger.findMany.mockResolvedValue([{ amount: 100, type: "signup" }]);
    prisma.creditReservation.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ credits: 120 });
    prisma.creditLedger.create.mockResolvedValue({});

    const result = await anchorWallet("u1");

    expect(prisma.creditLedger.create).toHaveBeenCalledTimes(1);
    const data = prisma.creditLedger.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      walletId: "w1",
      amount: 20,
      type: "admin_adjustment",
      description: "reconciliation anchor",
    });
    expect(result.anchored).toBe(true);
  });

  it("never changes wallet balances — it only writes a ledger row", async () => {
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 120, reserved: 0 });
    prisma.creditLedger.findMany.mockResolvedValue([{ amount: 100, type: "signup" }]);
    prisma.creditReservation.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ credits: 120 });
    prisma.creditLedger.create.mockResolvedValue({});

    await anchorWallet("u1");

    expect(prisma.creditWallet.update).toBeUndefined(); // never mocked/used — anchorWallet must not call it
  });

  it("is a no-op when driftAvailable is already 0, even if reserved or mirror drift exists", async () => {
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 50, reserved: 60 });
    prisma.creditLedger.findMany.mockResolvedValue([{ amount: 50, type: "signup" }]);
    prisma.creditReservation.findMany.mockResolvedValue([{ amount: 50 }]); // reserved drift, not available drift
    prisma.user.findUnique.mockResolvedValue({ credits: 50 });

    const result = await anchorWallet("u1");

    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
    expect(result.anchored).toBe(false);
  });
});

describe("reconcileAll — streams every wallet", () => {
  it("yields a reconcileWallet report for every wallet, in order", async () => {
    prisma.creditWallet.findMany.mockResolvedValueOnce([
      { id: "w1", userId: "u1" },
      { id: "w2", userId: "u2" },
    ]);
    prisma.creditWallet.findUnique.mockImplementation(({ where: { userId } }) =>
      Promise.resolve(userId === "u1" ? { id: "w1", userId: "u1", available: 10, reserved: 0 } : { id: "w2", userId: "u2", available: 20, reserved: 0 })
    );
    prisma.creditLedger.findMany.mockImplementation(({ where: { walletId } }) =>
      Promise.resolve(walletId === "w1" ? [{ amount: 10, type: "signup" }] : [{ amount: 20, type: "signup" }])
    );
    prisma.creditReservation.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockImplementation(({ where: { id } }) =>
      Promise.resolve({ credits: id === "u1" ? 10 : 20 })
    );

    const results = [];
    for await (const report of reconcileAll()) results.push(report);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.userId)).toEqual(["u1", "u2"]);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
