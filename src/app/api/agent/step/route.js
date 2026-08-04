import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { executeAgentStep } from "@/lib/agents";
import { brandForUser } from "@/lib/providers";
import { resolveOwnedSession } from "@/lib/agent-sessions";

// EDITSv1 E3.2 — POST /api/agent/step: execute exactly ONE plan step. This
// powers per-asset review (Accept advances client-side; Regenerate/Edit
// re-run one step, optionally with a model/prompt override that is
// RE-QUOTED SERVER-SIDE). Debits exactly the step's server-computed quote;
// a failed step refunds it in full. body:
//   { sessionId?, plan, stepIndex, regenerate?, paramOverrides?: {model?,
//     prompt?}, previousOutputs? }
// previousOutputs are the caller's raw outputs from earlier steps, used to
// resolve $STEP_N_OUTPUT references.

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

    const session = await resolveOwnedSession(user.id, body.sessionId);

    try {
      const result = await executeAgentStep(user.id, {
        plan: body.plan,
        stepIndex: body.stepIndex,
        regenerate: !!body.regenerate,
        paramOverrides: body.paramOverrides || null,
        previousOutputs: Array.isArray(body.previousOutputs)
          ? body.previousOutputs.filter((o) => typeof o === "string" || o === null)
          : [],
        sessionId: session?.id || null,
      });
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      if (err?.code === "insufficient_credits") {
        return apiError({
          code: "insufficient_credits",
          extra: { creditsNeeded: err.creditsNeeded, creditsAvailable: err.creditsAvailable, cost: err.creditsNeeded, credits: err.creditsAvailable },
        });
      }
      if (err?.code === "invalid_plan") {
        return apiError({ code: "bad_request", message: err.message });
      }
      if (err?.code === "blocked") {
        return apiError({ code: "forbidden", message: err.message });
      }
      // URGENT production fix: a step named a model with no runnable
      // replacement within its approved budget — thrown BEFORE any debit
      // (see executeAgentStep), so nothing needs refunding here. Pass the
      // actual message straight through instead of the generic `internal`
      // branch below, which would re-brand it via brandForUser and discard
      // the actionable "re-plan this step" detail (brandForUser's keyword
      // matching can even miscategorize it, since the message legitimately
      // contains the word "credits").
      if (err?.code === "model_unavailable") {
        return apiError({ code: "invalid_model", message: err.message, retryable: true });
      }
      // Execution failure: the step's quote was already refunded in full by
      // executeAgentStep; the client sees a branded, retryable message.
      return apiError({
        code: "internal",
        message: brandForUser(err.message),
        retryable: true,
        cause: err,
        context: { route: "agent/step" },
      });
    }
  } catch (e) {
    return authzResponse(e);
  }
}
