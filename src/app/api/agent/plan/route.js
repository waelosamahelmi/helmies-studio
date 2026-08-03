import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { planTask, planTaskStream } from "@/lib/agents";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { appendMessage, resolveOwnedSession } from "@/lib/agent-sessions";

// EDITSv1 E3.2 — planning stays a pure quote (nothing runs, nothing is
// charged), but when the client attaches a sessionId the brief and the
// resulting plan are persisted to the session feed (kinds text/plan) so a
// resumed session re-renders the plan card.

async function persistPlanTurn(sessionId, message, plan) {
  if (!sessionId) return;
  try {
    await appendMessage(sessionId, { role: "user", kind: "text", content: message });
    await appendMessage(sessionId, {
      role: "assistant",
      kind: "plan",
      content: JSON.stringify({
        steps: plan.steps,
        summary: plan.summary,
        estimate: plan.estimate,
        totalCredits: plan.totalCredits,
        maxCredits: plan.maxCredits,
      }),
    });
  } catch { /* history is best-effort — a failed append must never fail the quote */ }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json();
    const message = body.message || body.prompt;
    const context = body.context || {};
    if (!message) return apiError({ code: "bad_request", message: "Message required" });

    const session = await resolveOwnedSession(user.id, body.sessionId);
    const sessionId = session?.id || null;

    const shouldStream = body.stream !== false;

    if (shouldStream) {
      const result = await planTaskStream(message, context);
      if (result.stream) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      await persistPlanTurn(sessionId, message, result.plan);
      return NextResponse.json({ success: true, ...result.plan });
    }

    const plan = await planTask(message, context);
    await persistPlanTurn(sessionId, message, plan);
    return NextResponse.json({ success: true, ...plan });
  } catch (e) {
    return authzResponse(e);
  }
}
