import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUserWithCredits } from "@/lib/session";
import prisma from "@/lib/prisma";
import { CREDIT_PACKS } from "@/lib/credit-packs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const PACKS_BY_ID = Object.fromEntries(CREDIT_PACKS.map((p) => {
  const priceEur = parseFloat(p.price.replace("€", ""));
  return [p.id, { credits: p.credits, priceEur }];
}));

export async function GET() {
  return NextResponse.json({
    packs: Object.entries(PACKS_BY_ID).map(([id, pack]) => ({
      id,
      credits: pack.credits,
      priceEur: pack.priceEur,
      perCredit: (pack.priceEur / pack.credits).toFixed(4),
    })),
  });
}

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { packId } = await req.json();
    const pack = PACKS_BY_ID[packId];
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
