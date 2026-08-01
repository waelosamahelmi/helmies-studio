import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUserWithCredits } from "@/lib/session";
import prisma from "@/lib/prisma";

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

    const { packId } = await req.json();
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
      success_url: `${process.env.NEXTAUTH_URL}/studio?topup=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?topup=cancelled`,
      metadata: { userId: user.id, credits: pack.credits, type: "credit_topup" },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
