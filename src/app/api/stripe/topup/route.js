import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUserWithCredits } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import {
  assertChargeAboveStripeMinimum,
  assertPackDiscountAboveMarginFloor,
  discountFor,
  redeemPromo,
  stripeCouponFor,
} from "@/lib/promos";

let stripe;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe not configured");
    stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" });
  }
  return stripe;
}

// The admin Credit Packs editor writes CreditPack rows — those rows are now
// the sole source of truth for what's purchasable and at what price.
// `price` is stored in euro cents.
export async function GET() {
  const packs = await prisma.creditPack.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({
    packs: packs.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      priceEur: p.price / 100,
      perCredit: (p.price / 100 / p.credits).toFixed(4),
    })),
  });
}

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    verifyOrigin(req);

    const { packId, promoCode } = await req.json();
    let pack = packId ? await prisma.creditPack.findUnique({ where: { id: packId } }) : null;
    if (!pack) {
      // A tab left open across a deploy still sends the old static ids
      // ("500"/"1000"/"2500"/"5000"), not a real CreditPack row id —
      // findUnique(id) always misses those. They happen to equal the
      // pack's credit count, so a purely-numeric miss falls back to
      // resolving by credits (active only — this is a compatibility shim
      // for a stale client, not a way to buy a deactivated pack).
      const legacy = /^\d+$/.test(packId)
        ? await prisma.creditPack.findFirst({ where: { credits: parseInt(packId, 10), isActive: true } })
        : null;
      pack = legacy;
    }
    if (!pack || !pack.isActive) {
      return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    }

    let customerId;

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id },
    });

    if (subscription?.stripeCustomerId) {
      customerId = subscription.stripeCustomerId;
    } else {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      // This row exists only to remember the Stripe customer id. It must NOT
      // grant any entitlement before payment — an "active" plan here handed out
      // every subscription-tier template for free. The webhook activates it.
      await prisma.subscription.create({
        data: { userId: user.id, stripeCustomerId: customerId, plan: "free", status: "pending" },
      });
    }

    // ── Promo code (EDITSv1 E8.4) ──────────────────────────────────────
    // The price is recomputed here from the CreditPack row; nothing the
    // client sends can change what it is billed. If a code is supplied it
    // is re-validated server-side (the preview from /api/promos/redeem is
    // advisory only) and claimed, so maxUses and maxUsesPerUser are
    // enforced at the moment the customer commits to paying.
    //
    // TRADE-OFF, deliberate: claiming at session creation means an
    // abandoned Stripe Checkout consumes a single-use code. The alternative
    // — recording the redemption only when the webhook confirms payment —
    // leaves a window in which one customer can open several sessions and
    // pay through more than one of them with a code capped at one use. A
    // burned code the owner can re-issue is the cheaper failure of the two.
    let discountCoupon = null;
    let promoCodeId = null;

    if (typeof promoCode === "string" && promoCode.trim()) {
      const claim = await redeemPromo(promoCode, user.id);
      if (!claim.valid) {
        return NextResponse.json({ error: claim.message, reason: claim.reason }, { status: 422 });
      }

      // A credit-grant code has already landed in the wallet through the
      // ledger — there is nothing to discount, so checkout proceeds at the
      // pack's full price.
      if (claim.promo.type !== "credits") {
        const { chargeCents } = discountFor(pack.price, claim.promo);

        // Both money guards, before Stripe is told anything. A charge under
        // Stripe's minimum is a checkout that fails at the till, and a pack
        // sold for less than the euros its credits are redeemable for is a
        // guaranteed loss on every redemption.
        try {
          assertChargeAboveStripeMinimum(chargeCents);
          assertPackDiscountAboveMarginFloor(pack, chargeCents);
        } catch {
          return NextResponse.json(
            { error: "That code can't be applied to this pack.", reason: "not_applicable" },
            { status: 422 },
          );
        }

        discountCoupon = await stripeCouponFor(claim.promo, getStripe());
      }
      promoCodeId = claim.promo.id;
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: pack.name, description: `Helmies Studio credit pack` },
            unit_amount: pack.price,
          },
          quantity: 1,
        },
      ],
      ...(discountCoupon ? { discounts: [{ coupon: discountCoupon }] } : {}),
      success_url: `${process.env.NEXTAUTH_URL}/studio?topup=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?topup=cancelled`,
      metadata: {
        userId: user.id,
        credits: pack.credits,
        type: "credit_topup",
        ...(promoCodeId ? { promoCodeId } : {}),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return authzResponse(e);
  }
}
