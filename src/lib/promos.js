import prisma from "@/lib/prisma";
import { grantCredits } from "@/lib/wallet";
import { assertMarkupAboveFloor } from "@/lib/pricing-engine";

/* ══════════════════════════════════════════════════════════════════════════
   PROMO CODES  (EDITSv1 Phase E8 Task E8.4)
   ──────────────────────────────────────────────────────────────────────────
   `PromoCode` shipped as a complete admin CRUD screen over a table that
   NOTHING READ. There was no redemption endpoint, no input field anywhere
   in the product, no Stripe wiring of any kind, and `currentUses` was never
   incremented by anything — so `maxUses` was decorative and
   `maxUsesPerUser` was unenforceable, there being no record of who had
   redeemed what. A customer handed a code had nowhere to type it.

   Three rules this module is built around:

   1. EVERY REJECTION IS DISTINGUISHABLE. "That code isn't valid" for a code
      that merely expired turns into a support ticket every single time.

   2. A CREDIT GRANT GOES THROUGH THE LEDGER. grantCredits() writes the
      wallet and its CreditLedger row in one transaction; a direct balance
      write would break the invariant `npm run reconcile` checks and there
      would be no record of where the credits came from. The redemption row
      and the currentUses increment ride in the SAME transaction, so a
      double-submitted form cannot grant twice.

   3. TWO MONEY GUARDS A DISCOUNT CANNOT GET PAST — a charge Stripe would
      reject as below its minimum, and a discount that would sell credits
      for less than the euros they are redeemable for.
   ══════════════════════════════════════════════════════════════════════════ */

export const PROMO_TYPES = ["percentage", "fixed", "credits"];
export const ELIGIBILITIES = ["all", "new", "existing"];

// Distinct, stable reason codes. The UI maps each to its own sentence.
export const REJECTION = {
  not_found: "not_found",
  inactive: "inactive",
  not_started: "not_started",
  expired: "expired",
  exhausted: "exhausted",
  already_redeemed: "already_redeemed",
  requires_new_customer: "requires_new_customer",
  requires_existing_customer: "requires_existing_customer",
};

export const REJECTION_MESSAGE = {
  [REJECTION.not_found]: "We don't recognise that code. Check it for typos.",
  [REJECTION.inactive]: "That code isn't active any more.",
  [REJECTION.not_started]: "That code isn't valid yet. Check the start date on your offer.",
  [REJECTION.expired]: "That code has expired.",
  [REJECTION.exhausted]: "That code has been fully claimed.",
  [REJECTION.already_redeemed]: "You've already used that code.",
  [REJECTION.requires_new_customer]: "That code is for first-time customers only.",
  [REJECTION.requires_existing_customer]: "That code is for returning customers only.",
};

// Stripe rejects any charge under 50 cents in EUR. A "discount" that lands
// below it is not a discount, it is a checkout that fails at the till.
export const STRIPE_MIN_CHARGE_CENTS = 50;

// Must match pricing-engine's CREDIT_TO_EUR. Not re-exported from there
// because it isn't public; kept as one named constant rather than a magic
// 0.01 sprinkled through the margin maths below.
const CREDIT_TO_EUR = 0.01;

// The ledger types the Stripe webhook writes after a payment actually
// settles. Signup bonuses, refunds and admin grants are deliberately NOT
// here — none of them means the person has ever paid us anything.
const PAID_LEDGER_TYPES = ["topup", "subscription_grant"];

function reject(reason) {
  return { valid: false, reason, message: REJECTION_MESSAGE[reason], promo: null };
}

/**
 * validatePromo(code, userId) -> { valid, reason?, message?, promo? }
 *
 * Read-only. Safe to call on every keystroke of a promo field; the
 * redemption path calls it again inside its transaction, so nothing here is
 * load-bearing for correctness under concurrency.
 */
export async function validatePromo(code, userId, db = prisma) {
  if (typeof userId !== "string" || !userId) {
    throw new Error("validatePromo: a signed-in user is required to assess eligibility");
  }
  if (typeof code !== "string" || !code.trim()) return reject(REJECTION.not_found);

  const normalized = code.trim().toUpperCase();

  // Case-insensitive: a customer retypes what was on the email, not what is
  // in the database.
  const promo = await db.promoCode.findFirst({
    where: { code: { equals: normalized, mode: "insensitive" } },
  });
  if (!promo) return reject(REJECTION.not_found);
  if (!promo.isActive) return reject(REJECTION.inactive);

  const now = Date.now();
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return reject(REJECTION.not_started);
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < now) return reject(REJECTION.expired);

  if (promo.maxUses != null && promo.currentUses >= promo.maxUses) return reject(REJECTION.exhausted);

  const mine = await db.promoRedemption.count({ where: { promoCodeId: promo.id, userId } });
  if (mine >= (promo.maxUsesPerUser || 1)) return reject(REJECTION.already_redeemed);

  if (promo.eligibility === "new" || promo.eligibility === "existing") {
    const paidBefore = await db.creditLedger.count({
      where: { wallet: { userId }, type: { in: PAID_LEDGER_TYPES } },
    });
    if (promo.eligibility === "new" && paidBefore > 0) return reject(REJECTION.requires_new_customer);
    if (promo.eligibility === "existing" && paidBefore === 0) {
      return reject(REJECTION.requires_existing_customer);
    }
  }

  return { valid: true, promo };
}

/**
 * What a promo does to a price, in cents. Pure — no database, no rounding
 * surprises: a partial cent always rounds in the customer's favour.
 */
export function discountFor(amountCents, promo) {
  const base = Math.max(0, Math.round(Number(amountCents) || 0));
  const value = Number(promo?.value) || 0;

  if (promo?.type === "credits") {
    // Credit grants change no price at all — they add credits to the wallet.
    return { discountCents: 0, chargeCents: base, credits: Math.max(0, Math.round(value)) };
  }

  let discountCents;
  if (promo?.type === "fixed") {
    discountCents = Math.max(0, Math.round(value));
  } else {
    // Clamped: a mistyped 150% must not invert the charge into a payout,
    // and a negative must not inflate it.
    const pct = Math.min(100, Math.max(0, value));
    discountCents = Math.floor((base * pct) / 100);
  }

  discountCents = Math.min(discountCents, base);
  return { discountCents, chargeCents: base - discountCents, credits: 0 };
}

export function assertChargeAboveStripeMinimum(chargeCents) {
  if (!(Number(chargeCents) >= STRIPE_MIN_CHARGE_CENTS)) {
    throw new Error(
      `A charge of ${chargeCents} cents is below the payment minimum of ${STRIPE_MIN_CHARGE_CENTS} cents — this discount cannot be applied to this purchase.`,
    );
  }
}

/**
 * The margin floor, for credit packs.
 *
 * A pack sells `credits` for `chargeCents`. Those credits are redeemable
 * against exactly credits * CREDIT_TO_EUR of generation, so the pack's
 * markup is charge / faceValue. Discounting reduces the numerator only —
 * push it under 1.0 and every redemption of that code is a guaranteed loss.
 * Reuses assertMarkupAboveFloor so this shares the ONE definition of
 * breakeven with provider pricing rather than inventing a second one.
 */
export function assertPackDiscountAboveMarginFloor(pack, chargeCents) {
  const credits = Number(pack?.credits) || 0;
  if (credits <= 0) return; // nothing to floor against
  const faceValueEur = credits * CREDIT_TO_EUR;
  const chargeEur = (Number(chargeCents) || 0) / 100;
  assertMarkupAboveFloor(chargeEur / faceValueEur);
}

/**
 * Redeem a code for a user.
 *
 * The PromoRedemption row, the currentUses increment and (for a credit
 * grant) the wallet + ledger write all happen inside ONE transaction. The
 * (promoCodeId, userId) unique is what makes a concurrent double-submit
 * safe: the second transaction hits a unique violation on that row and
 * rolls back, taking its would-be grant with it. The global cap uses a
 * conditional updateMany rather than a read-then-write, so a burst of
 * different users cannot all observe "one left" and all take it.
 */
export async function redeemPromo(code, userId, { db = prisma } = {}) {
  const check = await validatePromo(code, userId, db);
  if (!check.valid) return check;

  const promo = check.promo;

  try {
    return await db.$transaction(async (tx) => {
      // Claims one use atomically, and only if there is one left. count === 0
      // means somebody else took the last one between validate and here.
      const claimed = await tx.promoCode.updateMany({
        where: {
          id: promo.id,
          isActive: true,
          ...(promo.maxUses != null ? { currentUses: { lt: promo.maxUses } } : {}),
        },
        data: { currentUses: { increment: 1 } },
      });
      if (claimed.count === 0) throw new PromoConflict(REJECTION.exhausted);

      // Unique on (promoCodeId, userId): a concurrent duplicate throws here
      // and rolls the increment back with it.
      await tx.promoRedemption.create({ data: { promoCodeId: promo.id, userId } });

      let credits = 0;
      if (promo.type === "credits") {
        credits = Math.max(0, Math.round(Number(promo.value) || 0));
        if (credits > 0) {
          // Through the ledger, in this transaction. Never a balance write.
          await grantCredits(userId, credits, "promo", `Promo code ${promo.code}`, promo.id, tx);
        }
      }

      return { valid: true, promo, credits };
    });
  } catch (e) {
    if (e instanceof PromoConflict) return reject(e.reason);
    // P2002 — the unique violation above, i.e. this user already has a
    // redemption row. That is not an error worth showing as a 500.
    if (e?.code === "P2002") return reject(REJECTION.already_redeemed);
    throw e;
  }
}

class PromoConflict extends Error {
  constructor(reason) {
    super(`promo conflict: ${reason}`);
    this.reason = reason;
  }
}

/**
 * The Stripe coupon for a promo, created once and cached on the row.
 *
 * WHY `discounts: [{ coupon }]` AND NOT `allow_promotion_codes: true`
 * ──────────────────────────────────────────────────────────────────────
 * Both were on the table; they are mutually exclusive in Stripe.
 *
 * `allow_promotion_codes: true` hands the whole decision to Stripe: the
 * customer types the code into Stripe's own page and Stripe decides whether
 * it applies. That would mean every rule this module exists to enforce —
 * first-time-customer-only, returning-customer-only, one redemption per
 * user, a global cap counted in OUR database — is silently bypassed,
 * because Stripe knows nothing about any of them. It would also let a
 * customer we had just refused simply type the code again on the next page
 * and get it. And the codes do not exist in Stripe at all, so nothing would
 * apply until someone hand-mirrored every one of them.
 *
 * `discounts: [{ coupon }]` keeps the decision here. We validate against
 * our own rules first, then tell Stripe exactly what discount to apply.
 * Stripe becomes the thing that does the arithmetic on the invoice, which
 * is what it is good at, and the eligibility logic stays where the data is.
 *
 * The coupon is created on first use and its id cached on the PromoCode row,
 * so a promo means one coupon in Stripe rather than a fresh one per customer.
 */
export async function stripeCouponFor(promo, stripe, db = prisma) {
  if (promo.type === "credits") return null; // grants credits, discounts nothing
  if (promo.stripeCouponId) return promo.stripeCouponId;

  const params =
    promo.type === "fixed"
      ? { amount_off: Math.round(Number(promo.value) || 0), currency: "eur", duration: "once" }
      : { percent_off: Math.min(100, Math.max(0, Number(promo.value) || 0)), duration: "once" };

  const coupon = await stripe.coupons.create({
    ...params,
    name: promo.code,
    metadata: { promoCodeId: promo.id, code: promo.code },
  });

  await db.promoCode.update({ where: { id: promo.id }, data: { stripeCouponId: coupon.id } });
  return coupon.id;
}
