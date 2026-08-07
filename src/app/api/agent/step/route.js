import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { startAgentRun } from "@/lib/agent-runner";
import { resolveOwnedSession } from "@/lib/agent-sessions";

// EDITSv1 E3.2 / Phase A (A1.6.2) — POST /api/agent/step: execute exactly ONE
// plan step as a DURABLE single-step run. Powers per-asset review (Accept
// advances client-side; Regenerate/Edit re-run one step, optionally with a
// model/prompt override that is RE-QUOTED SERVER-SIDE inside startAgentRun).
// The step's quote is reserved (not debited) up front; a failed step never
// settles. body:
//   { sessionId?, plan, stepIndex, regenerate?, paramOverrides?: {model?,
//     prompt?}, previousOutputs? }
// previousOutputs become the run's boundOutputs — $STEP_N references inside
// the step resolve against them exactly like the legacy in-request path.
// Returns { queued, runId, stepId }; the client polls GET /api/agent/run/:id.

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.plan?.steps) || body.plan.steps.length === 0) {
      return apiError({ code: "bad_request", message: "A plan with steps is required." });
    }
    const stepIndex = Number.isInteger(body.stepIndex) ? body.stepIndex : -1;
    const step = body.plan.steps[stepIndex];
    if (!step) {
      return apiError({ code: "bad_request", message: "stepIndex does not match the plan." });
    }

    const session = await resolveOwnedSession(user.id, body.sessionId);

    // Merge overrides exactly like the legacy executor did: model + prompt
    // (and any other explicitly overridden param) win over the planned step.
    const overrides = body.paramOverrides && typeof body.paramOverrides === "object" ? body.paramOverrides : {};
    const mergedParams = { ...(step.params || {}), ...overrides };
    const singleStep = { agent: step.agent, task: step.task, params: mergedParams };
    const singlePlan = {
      steps: [singleStep],
      summary: step.task || body.plan.summary || "Single step",
      // No approvedTotal: the single step is re-quoted fresh server-side
      // (overrides can change the model), and that quote IS the ceiling.
    };

    const result = await startAgentRun({
      userId: user.id,
      plan: singlePlan,
      sessionId: session?.id || null,
      task: step.task || "Step run",
      mode: "review",
      boundOutputs: Array.isArray(body.previousOutputs)
        ? body.previousOutputs.filter((o) => typeof o === "string" || o === null)
        : [],
    });

    if (result?.error) {
      if (result.errorCode === "insufficient_credits") {
        return apiError({
          code: "insufficient_credits",
          message: result.error,
          extra: { creditsNeeded: result.creditsNeeded, creditsAvailable: result.creditsAvailable, cost: result.creditsNeeded, credits: result.creditsAvailable },
        });
      }
      if (result.errorCode === "invalid_plan" || result.errorCode === "quote_changed") {
        return apiError({ code: "bad_request", message: result.error });
      }
      if (result.errorCode === "model_unavailable") {
        return apiError({ code: "invalid_model", message: result.error, retryable: true });
      }
      if (result.errorCode === "blocked") {
        return apiError({ code: "forbidden", message: result.error });
      }
      return apiError({ code: "internal", message: result.error, retryable: true, context: { route: "agent/step" } });
    }

    return NextResponse.json({ success: true, queued: true, runId: result.runId, stepId: "step-1", estimate: result.estimate });
  } catch (e) {
    return authzResponse(e);
  }
}
