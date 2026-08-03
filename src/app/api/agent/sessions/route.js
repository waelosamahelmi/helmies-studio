import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/security";
import { createSession, listSessions } from "@/lib/agent-sessions";

// EDITSv1 E3.1 — GET lists the caller's active sessions (newest 50);
// POST creates one. Thin wrappers over src/lib/agent-sessions.js.

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const sessions = await listSessions(user.id);
    return NextResponse.json({ sessions });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json().catch(() => ({}));
    const session = await createSession(user.id, body.title);
    return NextResponse.json({ session });
  } catch (e) {
    return authzResponse(e);
  }
}
