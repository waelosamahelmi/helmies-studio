// EDITSv1 Phase E8 Task E8.4 — promo codes that actually do something.
//
// Before this phase `PromoCode` was a complete admin CRUD screen over a
// table NOTHING READ: no redemption endpoint, no input field anywhere in
// the product, no Stripe wiring at all, and `currentUses` was never
// incremented by anything. A customer handed a code had nowhere to type it.
//
// These tests pin the rules, each rejection carrying its own distinct
// reason (a customer told "that code isn't valid" when it merely expired
// will ask support, every time), and the two money guards that a discount
// must never get past.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    promoCode: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    promoRedemption: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    creditLedger: { count: vi.fn() },
    creditWallet: { findUnique: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import {
  validatePromo,
  discountFor,
  assertChargeAboveStripeMinimum,
  assertPackDiscountAboveMarginFloor,
  STRIPE_MIN_CHARGE_CENTS,
  PROMO_TYPES,
  REJECTION,
} from "@/lib/promos";

const DAY = 24 * 60 * 60 * 1000;

function promo(over = {}) {
  return {
    id: "p1",
    code: "SAVE20",
    type: "percentage",
    value: 20,
    eligibility: "all",
    maxUses: null,
    maxUsesPerUser: 1,
    currentUses: 0,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.promoRedemption.count.mockResolvedValue(0);
  prisma.creditLedger.count.mockResolvedValue(0);
});

describe("vocabulary", () => {
  it("supports percentage, fixed and credit-grant codes", () => {
    expect(PROMO_TYPES).toEqual(["percentage", "fixed", "credits"]);
  });

  it("gives every rejection its own reason code", () => {
    const reasons = Object.values(REJECTION);
    expect(new Set(reasons).size).toBe(reasons.length);
    expect(reasons).toEqual(
      expect.arrayContaining([
        "not_found", "inactive", "not_started", "expired",
        "exhausted", "already_redeemed", "requires_new_customer", "requires_existing_customer",
      ]),
    );
  });
});

describe("validatePromo — each rejection is distinguishable", () => {
  it("rejects an unknown code", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(null);
    const r = await validatePromo("NOPE", "u1");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe(REJECTION.not_found);
  });

  it("rejects a switched-off code", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ isActive: false }));
    const r = await validatePromo("SAVE20", "u1");
    expect(r.reason).toBe(REJECTION.inactive);
  });

  it("rejects a code whose start date has not arrived", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ startsAt: new Date(Date.now() + DAY) }));
    const r = await validatePromo("SAVE20", "u1");
    expect(r.reason).toBe(REJECTION.not_started);
  });

  it("rejects an expired code", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ expiresAt: new Date(Date.now() - DAY) }));
    const r = await validatePromo("SAVE20", "u1");
    expect(r.reason).toBe(REJECTION.expired);
  });

  it("rejects a code that has hit its global cap", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ maxUses: 10, currentUses: 10 }));
    const r = await validatePromo("SAVE20", "u1");
    expect(r.reason).toBe(REJECTION.exhausted);
  });

  it("rejects a code this user has already redeemed", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo());
    prisma.promoRedemption.count.mockResolvedValue(1);
    const r = await validatePromo("SAVE20", "u1");
    expect(r.reason).toBe(REJECTION.already_redeemed);
  });

  it("honours maxUsesPerUser above 1", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ maxUsesPerUser: 3 }));
    prisma.promoRedemption.count.mockResolvedValue(2);
    expect((await validatePromo("SAVE20", "u1")).valid).toBe(true);

    prisma.promoRedemption.count.mockResolvedValue(3);
    expect((await validatePromo("SAVE20", "u1")).reason).toBe(REJECTION.already_redeemed);
  });

  it("matches the code case-insensitively — customers retype what they were sent", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo());
    await validatePromo("  save20 ", "u1");
    const where = prisma.promoCode.findFirst.mock.calls[0][0].where;
    expect(where.code).toEqual({ equals: "SAVE20", mode: "insensitive" });
  });
});

describe("validatePromo — eligibility rests on whether they have ever paid", () => {
  it("a new-customer code is refused to someone who has already paid", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ eligibility: "new" }));
    prisma.creditLedger.count.mockResolvedValue(1); // a topup / subscription grant exists
    const r = await validatePromo("SAVE20", "u1");
    expect(r.reason).toBe(REJECTION.requires_new_customer);
  });

  it("a new-customer code is accepted for someone who never has", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ eligibility: "new" }));
    prisma.creditLedger.count.mockResolvedValue(0);
    expect((await validatePromo("SAVE20", "u1")).valid).toBe(true);
  });

  it("an existing-customer code is refused to someone who has never paid", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ eligibility: "existing" }));
    prisma.creditLedger.count.mockResolvedValue(0);
    const r = await validatePromo("SAVE20", "u1");
    expect(r.reason).toBe(REJECTION.requires_existing_customer);
  });

  // Only a webhook-confirmed payment counts. Signup bonuses, refunds and
  // admin grants are not purchases and must not make someone "existing".
  it("counts only webhook-confirmed payment ledger types", async () => {
    prisma.promoCode.findFirst.mockResolvedValue(promo({ eligibility: "existing" }));
    prisma.creditLedger.count.mockResolvedValue(1);
    await validatePromo("SAVE20", "u1");
    const where = prisma.creditLedger.count.mock.calls[0][0].where;
    expect(where.type).toEqual({ in: ["topup", "subscription_grant"] });
  });

  it("requires a user id — an anonymous caller cannot be assessed for eligibility", async () => {
    await expect(validatePromo("SAVE20", null)).rejects.toThrow();
    expect(prisma.promoCode.findFirst).not.toHaveBeenCalled();
  });
});

describe("discountFor — the arithmetic", () => {
  it("takes a percentage off, rounding in the customer's favour", () => {
    expect(discountFor(900, promo({ type: "percentage", value: 20 }))).toEqual({
      discountCents: 180, chargeCents: 720, credits: 0,
    });
  });

  it("takes a fixed amount off, in cents", () => {
    expect(discountFor(900, promo({ type: "fixed", value: 250 }))).toEqual({
      discountCents: 250, chargeCents: 650, credits: 0,
    });
  });

  it("never produces a negative charge, however large the fixed discount", () => {
    const d = discountFor(300, promo({ type: "fixed", value: 10000 }));
    expect(d.chargeCents).toBe(0);
    expect(d.discountCents).toBe(300);
  });

  it("a credit-grant code changes no price — it grants credits instead", () => {
    expect(discountFor(900, promo({ type: "credits", value: 250 }))).toEqual({
      discountCents: 0, chargeCents: 900, credits: 250,
    });
  });

  it("clamps a nonsense percentage rather than inverting the charge", () => {
    expect(discountFor(900, promo({ type: "percentage", value: 150 })).chargeCents).toBe(0);
    expect(discountFor(900, promo({ type: "percentage", value: -50 })).chargeCents).toBe(900);
  });
});

describe("money guard 1 — Stripe's minimum charge", () => {
  it("knows the EUR minimum", () => {
    expect(STRIPE_MIN_CHARGE_CENTS).toBe(50);
  });

  it("accepts a charge at or above the minimum", () => {
    expect(() => assertChargeAboveStripeMinimum(50)).not.toThrow();
    expect(() => assertChargeAboveStripeMinimum(720)).not.toThrow();
  });

  // A charge Stripe refuses is not a discount, it is a failed checkout.
  it("throws for a charge below the minimum, including a discounted-to-zero one", () => {
    expect(() => assertChargeAboveStripeMinimum(49)).toThrow(/minimum/i);
    expect(() => assertChargeAboveStripeMinimum(0)).toThrow(/minimum/i);
  });
});

describe("money guard 2 — the margin floor", () => {
  // A 500-credit pack sells for 900 cents. At CREDIT_TO_EUR = 0.01 those
  // credits are worth EUR 5.00 the moment they are spent, so the pack's
  // markup is 1.8 and there is 0.8 of room before breakeven.
  it("allows a discount that keeps the pack above breakeven", () => {
    expect(() => assertPackDiscountAboveMarginFloor({ credits: 500 }, 720)).not.toThrow();
  });

  it("allows a discount landing exactly on breakeven", () => {
    expect(() => assertPackDiscountAboveMarginFloor({ credits: 500 }, 500)).not.toThrow();
  });

  // 499 cents for credits redeemable against EUR 5.00 of generation is a
  // guaranteed loss on every single redemption.
  it("throws for a discount that would sell credits below their own face value", () => {
    expect(() => assertPackDiscountAboveMarginFloor({ credits: 500 }, 499)).toThrow(/markup/i);
    expect(() => assertPackDiscountAboveMarginFloor({ credits: 5000 }, 4800)).toThrow(/markup/i);
  });

  it("throws for a free pack — 100% off a credit pack is minting credits", () => {
    expect(() => assertPackDiscountAboveMarginFloor({ credits: 500 }, 0)).toThrow();
  });
});
