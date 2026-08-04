// EDITSv1 Phase E8 Task E8.4 — promo redemption against the real database.
//
// The unit suite pins the RULES. This pins the two things only Postgres can
// prove: that a concurrent double-submit redeems exactly once (the whole
// point of putting the PromoRedemption row and the currentUses increment in
// one transaction), and that a credit-grant promo lands in the CreditLedger
// rather than being written straight onto the wallet balance — the money
// invariant `npm run reconcile` exists to enforce.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";
import { redeemPromo, validatePromo, REJECTION } from "@/lib/promos";
import { reconcileWallet } from "@/lib/reconciliation";

let prisma;

const DAY = 24 * 60 * 60 * 1000;

async function makePromo(over = {}) {
  return prisma.promoCode.create({
    data: {
      code: `TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      type: "credits",
      value: 250,
      isActive: true,
      ...over,
    },
  });
}

beforeEach(async () => {
  prisma = await resetDb();
});

describe("redeemPromo — a credit grant goes through the ledger, never around it", () => {
  it("grants credits, writes a promo ledger row, and leaves reconciliation clean", async () => {
    const user = await createUserWithWallet(100);
    // createUserWithWallet writes the wallet but no opening ledger row, so
    // anchor the starting position the way the app's own signup does.
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    await prisma.creditLedger.create({
      data: { walletId: wallet.id, amount: 100, type: "signup", balanceAfter: 100 },
    });

    const promo = await makePromo({ type: "credits", value: 250 });
    const result = await redeemPromo(promo.code, user.id);

    expect(result.valid).toBe(true);
    expect(result.credits).toBe(250);

    const after = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(after.available).toBe(350);

    const ledger = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "promo" },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(250);
    expect(ledger[0].referenceId).toBe(promo.id);

    // THE invariant: wallet.available must equal the ledger's movement sum.
    const report = await reconcileWallet(user.id);
    expect(report.driftAvailable).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("records the redemption and increments currentUses in the same breath", async () => {
    const user = await createUserWithWallet(0);
    const promo = await makePromo();

    await redeemPromo(promo.code, user.id);

    const redemptions = await prisma.promoRedemption.findMany({ where: { promoCodeId: promo.id } });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].userId).toBe(user.id);

    const after = await prisma.promoCode.findUnique({ where: { id: promo.id } });
    expect(after.currentUses).toBe(1);
  });
});

describe("redeemPromo — a double submit cannot double-grant", () => {
  it("redeems exactly once under a concurrent triple submit, and grants once", async () => {
    const user = await createUserWithWallet(0);
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    await prisma.creditLedger.create({
      data: { walletId: wallet.id, amount: 0, type: "signup", balanceAfter: 0 },
    });

    const promo = await makePromo({ type: "credits", value: 500 });

    const results = await Promise.allSettled([
      redeemPromo(promo.code, user.id),
      redeemPromo(promo.code, user.id),
      redeemPromo(promo.code, user.id),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.valid);
    expect(succeeded).toHaveLength(1);

    const after = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(after.available).toBe(500);

    const ledger = await prisma.creditLedger.findMany({ where: { walletId: wallet.id, type: "promo" } });
    expect(ledger).toHaveLength(1);

    const redemptions = await prisma.promoRedemption.findMany({ where: { promoCodeId: promo.id } });
    expect(redemptions).toHaveLength(1);

    const code = await prisma.promoCode.findUnique({ where: { id: promo.id } });
    expect(code.currentUses).toBe(1);

    const report = await reconcileWallet(user.id);
    expect(report.ok).toBe(true);
  });

  it("never lets a global cap be exceeded by concurrent users", async () => {
    const promo = await makePromo({ type: "credits", value: 10, maxUses: 2 });
    const users = await Promise.all([
      createUserWithWallet(0), createUserWithWallet(0),
      createUserWithWallet(0), createUserWithWallet(0), createUserWithWallet(0),
    ]);

    const results = await Promise.allSettled(users.map((u) => redeemPromo(promo.code, u.id)));
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.valid);

    expect(succeeded).toHaveLength(2);

    const after = await prisma.promoCode.findUnique({ where: { id: promo.id } });
    expect(after.currentUses).toBe(2);
    const redemptions = await prisma.promoRedemption.findMany({ where: { promoCodeId: promo.id } });
    expect(redemptions).toHaveLength(2);
  });
});

describe("redeemPromo — refusals leave nothing behind", () => {
  it("an expired code grants nothing and records nothing", async () => {
    const user = await createUserWithWallet(0);
    const promo = await makePromo({ expiresAt: new Date(Date.now() - DAY) });

    const result = await redeemPromo(promo.code, user.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(REJECTION.expired);

    const after = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(after.available).toBe(0);
    expect(await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } })).toBe(0);
    expect((await prisma.promoCode.findUnique({ where: { id: promo.id } })).currentUses).toBe(0);
  });

  it("a second attempt by the same user is refused with already_redeemed", async () => {
    const user = await createUserWithWallet(0);
    const promo = await makePromo();

    expect((await redeemPromo(promo.code, user.id)).valid).toBe(true);
    const second = await redeemPromo(promo.code, user.id);
    expect(second.valid).toBe(false);
    expect(second.reason).toBe(REJECTION.already_redeemed);

    const after = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(after.available).toBe(250); // granted once, not twice
  });
});

describe("validatePromo — eligibility against real payment history", () => {
  it("treats a webhook-written topup as 'has paid before'", async () => {
    const user = await createUserWithWallet(0);
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    await prisma.creditLedger.create({
      data: { walletId: wallet.id, amount: 500, type: "topup", balanceAfter: 500 },
    });

    const newOnly = await makePromo({ eligibility: "new" });
    const existingOnly = await makePromo({ eligibility: "existing" });

    expect((await validatePromo(newOnly.code, user.id)).reason).toBe(REJECTION.requires_new_customer);
    expect((await validatePromo(existingOnly.code, user.id)).valid).toBe(true);
  });

  it("does not treat a signup bonus as a purchase", async () => {
    const user = await createUserWithWallet(100);
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    await prisma.creditLedger.create({
      data: { walletId: wallet.id, amount: 100, type: "signup", balanceAfter: 100 },
    });

    const newOnly = await makePromo({ eligibility: "new" });
    const existingOnly = await makePromo({ eligibility: "existing" });

    expect((await validatePromo(newOnly.code, user.id)).valid).toBe(true);
    expect((await validatePromo(existingOnly.code, user.id)).reason).toBe(
      REJECTION.requires_existing_customer,
    );
  });
});
