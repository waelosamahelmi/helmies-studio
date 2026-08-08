import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { listProjects, createProject, PROJECT_KINDS } from "@/lib/projects";

// P1.1 — the caller's projects. A project owns its type, its scenario and the
// format every shot inside it inherits. Spends no credits.

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const projects = await listProjects(user.id, {
      status: searchParams.get("status") || null,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    // The kinds travel with the list so the client never hardcodes them.
    return NextResponse.json({ projects, kinds: PROJECT_KINDS });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/projects");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json().catch(() => ({}));
    const project = await createProject(user.id, body);
    return NextResponse.json({ project });
  } catch (e) {
    if (e?.code === "invalid_params") {
      return apiError({ code: "invalid_params", message: e.message, extra: { errors: e.errors } });
    }
    return authzResponse(e);
  }
}
