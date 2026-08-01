import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUserWithCredits } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  return new Stripe(key, { apiVersion: "2024-12-18.acacia" });
}

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    verifyOrigin(req);

    const { plan, yearly } = await req.json();

    // The admin Plans editor writes SubscriptionPlan rows — those rows are
    // now the sole source of truth for which Stripe price a checkout
    // charges. An inactive plan or a plan missing the requested billing
    // period's price id must never fall through to a stale env-var price.
    const planRow = plan ? await prisma.subscriptionPlan.findUnique({ where: { slug: plan } }) : null;
    const priceId = planRow?.isActive ? (yearly ? planRow.stripePriceIdYearly : planRow.stripePriceId) : null;
    if (!planRow || !planRow.isActive || !priceId) {
      return NextResponse.json({ error: "Plan not configured" }, { status: 400 });
    }

    const stripe = getStripe();

    let subscription = await prisma.subscription.findFirst({
      where: { userId: user.id },
    });

    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, stripeCustomerId: customerId, plan, status: "pending" },
      update: { stripeCustomerId: customerId, plan, status: "pending" },
    });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/studio?upgrade=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?upgrade=cancelled`,
      metadata: { userId: user.id, plan, yearly: yearly ? "1" : "0" },
      subscription_data: { metadata: { userId: user.id, plan, yearly: yearly ? "1" : "0" } },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return authzResponse(e);
  }
}
