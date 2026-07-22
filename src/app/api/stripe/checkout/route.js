import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUserWithCredits } from "@/lib/session";
import prisma from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const PRICE_MAP = {
  starter: process.env.STRIPE_PRICE_STARTER,
  starter_yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
  studio: process.env.STRIPE_PRICE_STUDIO,
  studio_yearly: process.env.STRIPE_PRICE_STUDIO_YEARLY,
  pro: process.env.STRIPE_PRICE_PRO,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
};

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan, yearly } = await req.json();
    const priceKey = yearly ? `${plan}_yearly` : plan;
    const priceId = PRICE_MAP[priceKey];
    if (!priceId) {
      return NextResponse.json({ error: "Invalid plan or not configured" }, { status: 400 });
    }

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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
