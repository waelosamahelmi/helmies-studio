import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { getProjectContents, updateProject, deleteProject } from "@/lib/projects";

// P1.1/P1.2 — one owned project and everything filed under it. A non-owner
// gets the same not_found a non-existent id gets.

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { id } = await params;
    const contents = await getProjectContents(user.id, id);
    if (!contents) return apiError({ code: "not_found", message: "Project not found" });
    return NextResponse.json(contents);
  } catch (e) {
    return authzResponse(e);
  }
}

export async function PATCH(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/projects");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const project = await updateProject(user.id, id, body);
    if (!project) return apiError({ code: "not_found", message: "Project not found" });
    return NextResponse.json({ project });
  } catch (e) {
    if (e?.code === "invalid_params") {
      return apiError({ code: "invalid_params", message: e.message, extra: { errors: e.errors } });
    }
    return authzResponse(e);
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { id } = await params;
    const removed = await deleteProject(user.id, id);
    if (!removed) return apiError({ code: "not_found", message: "Project not found" });
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
