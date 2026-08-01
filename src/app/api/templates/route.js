import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { listTemplates } from "@/lib/templates";

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

// GET /api/templates — list published templates (public)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const toolType = searchParams.get("toolType") || undefined;
    const featured = searchParams.get("featured");
    const limit = Math.min(parseInt(searchParams.get("limit") || "24"), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

    const result = await listTemplates({
      category,
      toolType,
      featured: featured === "true" ? true : featured === "false" ? false : undefined,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/templates — admin create
export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);

    const body = await req.json();
    const template = await prisma.template.create({ data: pick(body, TEMPLATE_FIELDS) });

    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    return authzResponse(e);
  }
}
