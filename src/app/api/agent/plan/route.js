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
        planSource: plan.planSource,
        degraded: plan.degraded,
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
    const context = body.context && typeof body.context === "object" ? { ...body.context } : {};

    const session = await resolveOwnedSession(user.id, body.sessionId);
    const sessionId = session?.id || null;

    // A9 — the conversation IS the brief source. The client sends its chat
    // history so the planner plans from EVERYTHING agreed there, not just
    // whatever happens to sit in the composer ("ok" must be enough).
    const conversation = Array.isArray(body.messages)
      ? body.messages
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
          .slice(-40)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      : [];
    if (conversation.length) context.conversation = conversation;

    // A9 task 5 — the session's stored preferences (E3 settings) reach the
    // planner as defaults. Client-sent context can not override them: the
    // session row is the source of truth.
    if (session?.settings && typeof session.settings === "object") {
      context.settings = session.settings;
    }

    const lastUserTurn = [...conversation].reverse().find((m) => m.role === "user")?.content;
    const message = body.message || body.prompt ||
      (conversation.length ? lastUserTurn || "Plan the complete production discussed in the conversation." : null);
    if (!message) return apiError({ code: "bad_request", message: "Message required" });

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
