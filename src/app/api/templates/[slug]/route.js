import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";
import { hasTemplateAccess } from "@/lib/templates";

// GET /api/templates/[slug] — single template detail
export async function GET(req, { params }) {
  try {
    const { slug } = params;
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

    const { slug } = params;
    const body = await req.json();
    const template = await prisma.template.update({
      where: { slug },
      data: body,
    });

    return NextResponse.json(template);
  } catch (e) {
    if (e.message === "Forbidden: admin access required" || e.message === "Unauthorized") {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/templates/[slug] — admin soft-delete (unpublish)
export async function DELETE(req, { params }) {
  try {
    await requireAdmin(req);

    const { slug } = params;
    await prisma.template.update({
      where: { slug },
      data: { isPublished: false },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e.message === "Forbidden: admin access required" || e.message === "Unauthorized") {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
