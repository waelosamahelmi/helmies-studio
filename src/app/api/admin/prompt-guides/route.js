import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

// GET /api/admin/prompt-guides — list all prompt guides with their latest version
export async function GET(req) {
  try {
    await requireAdmin(req);
    const guides = await prisma.promptGuide.findMany({
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(guides);
  } catch (e) {
    return authzResponse(e);
  }
}

// POST /api/admin/prompt-guides — create or update a prompt guide (spec §34)
export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { modelId, category, content, isActive } = await req.json();
    if (!modelId || !content) return NextResponse.json({ error: "modelId and content required" }, { status: 400 });

    const guide = await prisma.promptGuide.upsert({
      where: { modelId_category: { modelId, category: category || "base" } },
      update: { isActive: isActive ?? true },
      create: { modelId, category: category || "base", isActive: isActive ?? true },
    });

    // Create a new version
    const latest = await prisma.promptGuideVersion.findFirst({
      where: { guideId: guide.id },
      orderBy: { version: "desc" },
    });
    const version = (latest?.version || 0) + 1;

    const v = await prisma.promptGuideVersion.create({
      data: { guideId: guide.id, version, content, createdBy: "admin" },
    });

    return NextResponse.json({ guide, version: v }, { status: 201 });
  } catch (e) {
    return authzResponse(e);
  }
}

// PATCH /api/admin/prompt-guides — activate/deactivate a guide
export async function PATCH(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { id, isActive } = await req.json();
    const guide = await prisma.promptGuide.update({ where: { id }, data: { isActive } });
    return NextResponse.json(guide);
  } catch (e) {
    return authzResponse(e);
  }
}