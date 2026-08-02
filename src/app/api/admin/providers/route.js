import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { assertMarkupAboveFloor } from "@/lib/pricing-engine";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const providers = await prisma.providerConfig.findMany();
    return NextResponse.json(providers);
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { name, type, apiKey, baseUrl, markup, isActive } = await req.json();
    // Provider keys are env-only (KIE_KEY / ALIBABA_KEY / OPENROUTER_KEY) —
    // this table never stores one. Reject rather than silently drop it, so a
    // caller that still thinks it can set a key finds out immediately.
    if (typeof apiKey === "string" && apiKey.trim().length > 0) {
      return NextResponse.json(
        { error: "Provider keys are configured via environment variables" },
        { status: 400 },
      );
    }
    // Margin floor (code review follow-up): this route upserts
    // ProviderConfig.markup directly (not through
    // src/lib/pricing-engine.js's setProviderMarkup), so it needs the same
    // guard explicitly — a markup below breakeven here would silently
    // under-price every model resolved through this provider. Only checked
    // when the caller actually supplied a markup (an update omitting it
    // leaves the existing value untouched, per Prisma's undefined-means-
    // don't-update convention — nothing to floor there).
    if (markup != null) {
      try {
        assertMarkupAboveFloor(markup);
      } catch (validationError) {
        return NextResponse.json({ error: validationError.message }, { status: 400 });
      }
    }
    await prisma.providerConfig.upsert({
      where: { name },
      create: {
        name, type, baseUrl,
        markup: markup || 2.5,
        isActive: isActive ?? true,
      },
      update: { type, baseUrl, markup, isActive },
    });
    await logAudit("admin_set_provider", "provider", name, { markup, isActive }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}