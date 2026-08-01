import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
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

// POST /api/templates/purchase — initiate template purchase
export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    verifyOrigin(req);
    const userId = session.user.id;

    const { templateSlug } = await req.json();
    if (!templateSlug) {
      return NextResponse.json({ error: "templateSlug is required" }, { status: 400 });
    }

    const template = await prisma.template.findUnique({
      where: { slug: templateSlug },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // ── Subscription-based templates ──
    if (template.pricingModel === "subscription") {
      // Require a genuinely paid, active subscription. "free" and "payg" rows
      // exist purely to hold a Stripe customer id and carry no entitlement.
      const sub = await prisma.subscription.findUnique({ where: { userId } });
      if (!sub || sub.status !== "active" || sub.plan === "free" || sub.plan === "payg") {
        return NextResponse.json({ error: "Active subscription required" }, { status: 402 });
      }

      await createTemplatePurchase(userId, template.id, "subscription_included");
      return NextResponse.json({ success: true, hasAccess: true });
    }

    // ── One-time purchase templates ──
    if (template.pricingModel === "onetime") {
      // Check if user already has an active purchase
      const existing = await prisma.templatePurchase.findUnique({
        where: { userId_templateId: { userId, templateId: template.id } },
      });
      if (existing) {
        const hasUsesLeft = existing.usageRemaining === null || existing.usageRemaining > 0;
        if (hasUsesLeft) {
          return NextResponse.json({ alreadyPurchased: true, hasAccess: true });
        }
      }

      if (!template.stripePriceId) {
        return NextResponse.json({ error: "Template has no Stripe price configured" }, { status: 500 });
      }

      const stripeSession = await getStripe().checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: template.stripePriceId, quantity: 1 }],
        metadata: {
          type: "template_purchase",
          templateId: template.id,
          userId,
        },
        success_url: `${process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "http://localhost:3010"}/templates/${template.slug}?purchase=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "http://localhost:3010"}/templates/${template.slug}?purchase=cancelled`,
      });

      return NextResponse.json({ url: stripeSession.url });
    }

    return NextResponse.json({ error: "Unknown pricing model" }, { status: 400 });
  } catch (e) {
    return authzResponse(e);
  }
}
