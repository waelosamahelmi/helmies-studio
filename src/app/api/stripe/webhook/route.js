import { NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";
import { SUBSCRIPTION_CREDITS, PLAN_IDS } from "@/lib/credits";
import { grantCredits } from "@/lib/wallet";

let stripe;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe not configured");
    stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" });
  }
  return stripe;
}

export async function POST(req) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // ── Idempotency pre-check ────────────────────────────────────
  // Cheap early-return for the common case (an already-processed event
  // redelivered). This is NOT the guard against a concurrent duplicate —
  // that's the unique constraint on stripeEventId, claimed atomically with
  // every grant inside the transaction below.
  const stripeEventId = event.id;
  const existingEvent = await prisma.stripeEvent.findUnique({
    where: { stripeEventId },
  });
  if (existingEvent) {
    console.log(`[webhook] Duplicate event ${stripeEventId}, already processed — skipping`);
    return NextResponse.json({ received: true });
  }

  // ── Network prefetch (must happen OUTSIDE the transaction) ───
  // Interactive transactions have a default 5s timeout; the only network
  // call any handler needs (Stripe's subscriptions.retrieve for
  // invoice.paid) is fetched here so the transaction body below is pure DB
  // work with no external round-trip inside it.
  let prefetchedSubscription = null;
  if (event.type === "invoice.paid" && event.data.object.subscription) {
    prefetchedSubscription = await getStripe().subscriptions.retrieve(event.data.object.subscription);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // ── Claim the event id FIRST ───────────────────────────
      // Claiming before running any handler means a crash anywhere below
      // rolls back the claim along with every grant/write in this tx — a
      // Stripe retry sees no claim and reprocesses cleanly. A concurrent
      // duplicate hits this same unique constraint (P2002) and is caught
      // below without a second grant.
      await tx.stripeEvent.create({
        data: { stripeEventId, eventType: event.type },
      });

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.metadata?.userId;
          if (!userId) break;

          if (session.metadata?.type === "credit_topup") {
            const topupCredits = parseInt(session.metadata?.credits || "0");
            if (topupCredits > 0) {
              await grantCredits(
                userId,
                topupCredits,
                "topup",
                `Credit top-up: ${topupCredits} credits`,
                session.id,
                tx
              );
            }
          } else if (session.metadata?.type === "template_purchase") {
            const templateId = session.metadata?.templateId;
            const purchaseUserId = session.metadata?.userId;
            if (templateId && purchaseUserId) {
              await tx.templatePurchase.upsert({
                where: {
                  userId_templateId: { userId: purchaseUserId, templateId },
                },
                update: {}, // no-op on duplicate
                create: {
                  userId: purchaseUserId,
                  templateId,
                  purchaseType: "onetime",
                  usageRemaining: 1,
                  stripeSessionId: session.id,
                  stripePricePaid: session.amount_total,
                },
              });
            }
          } else {
            const plan = session.metadata?.plan || PLAN_IDS[session.metadata?.priceId];
            const credits = SUBSCRIPTION_CREDITS[plan] || 0;

            if (credits > 0) {
              await grantCredits(
                userId,
                credits,
                "subscription_grant",
                `${plan} plan subscription: ${credits} credits`,
                session.id,
                tx
              );
            }
          }
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;
          if (subscriptionId) {
            const subscription = prefetchedSubscription;
            const userId = subscription.metadata?.userId;
            const plan = subscription.metadata?.plan || PLAN_IDS[subscription.items?.data?.[0]?.price?.id];
            const credits = SUBSCRIPTION_CREDITS[plan] || 0;

            if (userId && credits > 0 && invoice.billing_reason === "subscription_cycle") {
              await grantCredits(
                userId,
                credits,
                "subscription_grant",
                `${plan} plan renewal: ${credits} credits`,
                invoice.id,
                tx
              );
            }

            if (userId) {
              await tx.subscription.updateMany({
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
            await tx.subscription.updateMany({
              where: { userId },
              data: { status: "cancelled", plan: "free" },
            });
          }
          break;
        }

        default:
          break;
      }
    });

    return NextResponse.json({ received: true });
  } catch (e) {
    // If the transaction fails because the stripeEvent claim hit a unique
    // constraint violation, a concurrent request already claimed and fully
    // processed this event (claim + grants committed together). Return 200
    // to acknowledge receipt — nothing here needs to run again.
    if (e?.code === "P2002" && e?.meta?.target?.includes?.("stripeEventId")) {
      console.warn(`[webhook] Concurrent duplicate event ${stripeEventId} — acknowledged`);
      return NextResponse.json({ received: true });
    }
    console.error(`[webhook] Error processing event ${stripeEventId}:`, e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}