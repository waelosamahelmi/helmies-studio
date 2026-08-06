import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasTemplateAccess, recordTemplateUse } from "@/lib/templates";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

// GET /api/templates/[slug]/apply — apply template config to studio.
// This GET has a side effect (recordTemplateUse decrements the caller's
// purchase usage below) — it is deliberately origin-checked despite being a
// GET, per the manifest's own ANOMALY note on this route: a plain
// cookie-riding cross-site GET (e.g. an <img>/<link> tag) would otherwise
// burn the caller's template usage with no CSRF protection possible for a
// GET. Browsers still send Referer (if not Origin) on such cross-site GETs,
// so verifyOrigin's fallback still catches it.
export async function GET(req, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    verifyOrigin(req);
    const userId = session.user.id;
    const { slug } = await params;

    const template = await prisma.template.findUnique({ where: { slug } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check access
    const access = await hasTemplateAccess(userId, slug);
    if (!access) {
      return NextResponse.json(
        { error: "You don't have access to this template. Purchase it first." },
        { status: 402 }
      );
    }

    // Find the purchase to record usage
    const purchase = await prisma.templatePurchase.findUnique({
      where: {
        userId_templateId: { userId, templateId: template.id },
      },
    });

    if (purchase) {
      await recordTemplateUse(purchase.id, null);
    }

    return NextResponse.json({
      config: template.config,
      name: template.name,
      toolType: template.toolType,
      purchaseId: purchase?.id || null,
    });
  } catch (e) {
    return authzResponse(e);
  }
}
