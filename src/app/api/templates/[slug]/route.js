import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { hasTemplateAccess } from "@/lib/templates";

// Mass-assignment allowlist (Phase 3 Task 6): every Template scalar/Json
// column except id/createdAt/updatedAt (server-controlled) — Template has
// no owner/creator id field. Unknown/extra body keys are silently dropped.
const TEMPLATE_FIELDS = [
  "slug",
  "name",
  "description",
  "thumbnailUrl",
  "category",
  "toolType",
  "pricingModel",
  "oneTimePrice",
  "stripePriceId",
  "config",
  "isPublished",
  "isFeatured",
  "usageLimit",
];

function pick(body, fields) {
  const out = {};
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

// GET /api/templates/[slug] — single template detail
export async function GET(req, { params }) {
  try {
    const { slug } = await params;
    const template = await prisma.template.findUnique({ where: { slug } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check access if user is authenticated
    let hasAccess = false;
    try {
      const session = await auth();
      if (session?.user?.id) {
        hasAccess = await hasTemplateAccess(session.user.id, slug);
      }
    } catch {
      // Not authenticated — hasAccess stays false
    }

    return NextResponse.json({ ...template, hasAccess });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/templates/[slug] — admin update
export async function PUT(req, { params }) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);

    const { slug } = await params;
    const body = await req.json();
    const template = await prisma.template.update({
      where: { slug },
      data: pick(body, TEMPLATE_FIELDS),
    });

    return NextResponse.json(template);
  } catch (e) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return authzResponse(e);
  }
}

// DELETE /api/templates/[slug] — admin soft-delete (unpublish)
export async function DELETE(req, { params }) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);

    const { slug } = await params;
    await prisma.template.update({
      where: { slug },
      data: { isPublished: false },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return authzResponse(e);
  }
}
