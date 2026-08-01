import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Content id required" }, { status: 400 });

    // Unpublish any existing published content with the same key
    if (body.key) {
      await prisma.cmsEntry.updateMany({
        where: { key: body.key, status: "published" },
        data: { status: "draft" },
      }).catch(() => {});
    }

    const updated = await prisma.cmsEntry.update({
      where: { id },
      data: { status: "published" },
    });

    // Create a revision snapshot
    await prisma.cmsRevision.create({
      data: {
        entryId: id,
        content: updated.content,
        status: "published",
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, publishedAt: updated.updatedAt, id });
  } catch (e) {
    return authzResponse(e);
  }
}
