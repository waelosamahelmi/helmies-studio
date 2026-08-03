import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import prisma from "@/lib/prisma";

// POST /api/workflows/[id]/publish — make a workflow publicly listed.
// The Publish button in WorkflowStudio targets this path.
export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    // `await` works whether params is a promise (Next 15+) or a plain object.
    const { id } = await params;
    if (!id) return apiError({ code: "bad_request", message: "id required" });

    // Ownership-scoped: updateMany no-ops on someone else's workflow.
    const res = await prisma.workflow.updateMany({
      where: { id, userId: user.id },
      data: { isPublic: true },
    });
    if (res.count === 0) return apiError({ code: "not_found", message: "Not found" });

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
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { id } = await params;
    if (!id) return apiError({ code: "bad_request", message: "id required" });

    const res = await prisma.workflow.updateMany({
      where: { id, userId: user.id },
      data: { isPublic: false },
    });
    if (res.count === 0) return apiError({ code: "not_found", message: "Not found" });

    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
