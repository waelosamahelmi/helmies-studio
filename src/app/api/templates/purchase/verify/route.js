import { NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";
import { createTemplatePurchase } from "@/lib/templates";

let stripe;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe not configured");
    stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" });
  }
  return stripe;
}

// GET /api/templates/purchase/verify?session_id=... — verify Stripe checkout
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const stripeSession = await getStripe().checkout.sessions.retrieve(sessionId);
    if (!stripeSession || stripeSession.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    const { templateId, userId } = stripeSession.metadata || {};
    if (!templateId || !userId) {
      return NextResponse.json({ error: "Invalid session metadata" }, { status: 400 });
    }

    // Idempotent purchase creation
    await createTemplatePurchase(userId, templateId, "onetime", {
      stripeSessionId: sessionId,
      stripePricePaid: stripeSession.amount_total,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
