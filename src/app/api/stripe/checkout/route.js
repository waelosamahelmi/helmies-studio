import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUserWithCredits } from "@/lib/session";
import prisma from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const PRICE_MAP = {
  starter: process.env.STRIPE_PRICE_STARTER,
  studio: process.env.STRIPE_PRICE_STUDIO,
  pro: process.env.STRIPE_PRICE_PRO,
};

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan } = await req.json();
    const priceId = PRICE_MAP[plan];
    if (!priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
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

      await prisma.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, stripeCustomerId: customerId, plan, status: "pending" },
        update: { stripeCustomerId: customerId, plan, status: "pending" },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/studio?upgrade=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?upgrade=cancelled`,
      metadata: { userId: user.id, plan },
      subscription_data: { metadata: { userId: user.id, plan } },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}