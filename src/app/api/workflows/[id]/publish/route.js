import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

// POST /api/workflows/[id]/publish — make a workflow publicly listed.
// The Publish button in WorkflowStudio targets this path.
export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    // `await` works whether params is a promise (Next 15+) or a plain object.
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Ownership-scoped: updateMany no-ops on someone else's workflow.
    const res = await prisma.workflow.updateMany({
      where: { id, userId: user.id },
      data: { isPublic: true },
    });
    if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const workflow = await prisma.workflow.findFirst({ where: { id, userId: user.id } });
    return NextResponse.json({ success: true, workflow });
  } catch (e) {
    return authzResponse(e);
  }
}

// DELETE /api/workflows/[id]/publish — unpublish.
export async function DELETE(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const res = await prisma.workflow.updateMany({
      where: { id, userId: user.id },
      data: { isPublic: false },
    });
    if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
