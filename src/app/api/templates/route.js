import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { listTemplates } from "@/lib/templates";

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
    const template = await prisma.template.create({ data: body });

    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    return authzResponse(e);
  }
}
