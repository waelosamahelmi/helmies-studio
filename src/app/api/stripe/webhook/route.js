import { NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";
import { SUBSCRIPTION_CREDITS, PLAN_IDS } from "@/lib/credits";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;

        if (session.metadata?.type === "credit_topup") {
          const topupCredits = parseInt(session.metadata?.credits || "0");
          if (userId && topupCredits > 0) {
            await prisma.user.update({
              where: { id: userId },
              data: { credits: { increment: topupCredits } },
            });
            await prisma.creditTransaction.create({
              data: {
                userId,
                amount: topupCredits,
                type: "topup",
                description: `Credit top-up: ${topupCredits} credits`,
              },
            });
          }
        } else {
          const plan = session.metadata?.plan || PLAN_IDS[session.metadata?.priceId];
          const credits = SUBSCRIPTION_CREDITS[plan] || 0;

          if (userId && credits > 0) {
            await prisma.user.update({
              where: { id: userId },
              data: { credits: { increment: credits } },
            });
            await prisma.creditTransaction.create({
              data: {
                userId,
                amount: credits,
                type: "subscription",
                description: `${plan} plan subscription: ${credits} credits`,
              },
            });
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.userId;
          const plan = subscription.metadata?.plan || PLAN_IDS[subscription.items?.data?.[0]?.price?.id];
          const credits = SUBSCRIPTION_CREDITS[plan] || 0;

          if (userId && credits > 0 && invoice.billing_reason === "subscription_cycle") {
            await prisma.user.update({
              where: { id: userId },
              data: { credits: { increment: credits } },
            });
            await prisma.creditTransaction.create({
              data: {
                userId,
                amount: credits,
                type: "subscription_renewal",
                description: `${plan} plan renewal: ${credits} credits`,
              },
            });
          }

          if (userId) {
            await prisma.subscription.updateMany({
              where: { userId },
              data: {
                stripeSubscriptionId: subscriptionId,
                stripePriceId: subscription.items?.data?.[0]?.price?.id,
                stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
                plan: plan || "free",
                status: "active",
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        if (userId) {
          await prisma.subscription.updateMany({
            where: { userId },
            data: { status: "cancelled", plan: "free" },
          });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}