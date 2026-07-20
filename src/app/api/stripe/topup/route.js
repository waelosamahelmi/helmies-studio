import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUserWithCredits } from "@/lib/session";
import prisma from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const CREDIT_PACKS = {
  "500": { credits: 500, priceEur: 9.99, stripePriceId: process.env.STRIPE_PRICE_CREDITS_500 },
  "1000": { credits: 1000, priceEur: 17.99, stripePriceId: process.env.STRIPE_PRICE_CREDITS_1000 },
  "2500": { credits: 2500, priceEur: 39.99, stripePriceId: process.env.STRIPE_PRICE_CREDITS_2500 },
  "5000": { credits: 5000, priceEur: 69.99, stripePriceId: process.env.STRIPE_PRICE_CREDITS_5000 },
};

export async function GET() {
  return NextResponse.json({
    packs: Object.entries(CREDIT_PACKS).map(([id, pack]) => ({
      id,
      credits: pack.credits,
      priceEur: pack.priceEur,
      perCredit: (pack.priceEur / pack.credits).toFixed(4),
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
    const pack = CREDIT_PACKS[packId];
    if (!pack) {
      return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    }

    let customerId;

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id },
    });

    if (subscription?.stripeCustomerId) {
      customerId = subscription.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      await prisma.subscription.create({
        data: { userId: user.id, stripeCustomerId: customerId, plan: "payg", status: "active" },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `${pack.credits} Credits`, description: `Helmies Studio credit pack` },
            unit_amount: Math.round(pack.priceEur * 100),
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
