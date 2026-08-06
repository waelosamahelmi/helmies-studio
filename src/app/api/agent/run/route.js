import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeAgentRun, executeAgentRunStream, executeAgentRunBackground } from "@/lib/agents";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { resolveOwnedSession } from "@/lib/agent-sessions";

// EDITSv1 E3.2 — honored approvals: when body.plan is present it IS the
// executed plan. It is passed to the executors as precomputedPlan — the
// planner is never re-run, the debit ceiling is the approved
// estimate.total (server-re-quoted; a changed quote rejects instead of
// silently charging something else). body.sessionId ties the run to an
// owned AgentSession and persists run/outputs history messages.

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function errorResponse(result) {
  if (result.errorCode === "quote_changed" || result.errorCode === "invalid_plan") {
    return apiError({ code: "invalid_params", message: result.error });
  }
  if (result.errorCode === "blocked") {
    return apiError({ code: "forbidden", message: result.error });
  }
  // insufficient_credits — and the legacy untagged shape, which only ever
  // meant insufficient credits.
  return apiError({
    code: "insufficient_credits",
    message: result.error,
    extra: { creditsNeeded: result.creditsNeeded, creditsAvailable: result.creditsAvailable },
  });
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json();

    const shouldStream = body.stream !== false;
    const message = body.message || body.plan?.summary || "";
    const context = body.context || {};

    if (!message && !body.plan) {
      return apiError({ code: "bad_request", message: "Message or plan required" });
    }

    const session = await resolveOwnedSession(user.id, body.sessionId);
    const options = { precomputedPlan: body.plan || null, sessionId: session?.id || null };

    // Background mode (2026-08-06): the run is detached from the request —
    // debited up front, executed server-side to completion regardless of
    // whether the browser stays open, its media steps landing in the gallery
    // and its outcome in the session feed. Returns { queued, runId }
    // immediately; the client polls GET /api/agent/run/:id for progress.
    if (body.background === true) {
      const result = await executeAgentRunBackground(user.id, message, context, options);
      if (result.error && !result.queued) return errorResponse(result);
      return NextResponse.json(result);
    }

    if (shouldStream) {
      const result = await executeAgentRunStream(user.id, message, context, options);
      if (result.stream) {
        return new Response(result.stream, { headers: SSE_HEADERS });
      }
      if (result.error) return errorResponse(result);
      return NextResponse.json(result);
    }

    const result = await executeAgentRun(user.id, message, context, options);
    if (result.error && !result.success) return errorResponse(result);
    return NextResponse.json(result);
  } catch (e) {
    return authzResponse(e);
  }
}
