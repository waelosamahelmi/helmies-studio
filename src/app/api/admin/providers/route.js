import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

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