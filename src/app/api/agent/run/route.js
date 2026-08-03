import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeAgentRun, executeAgentRunStream, planTask } from "@/lib/agents";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";

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
    const context = body.context || (body.plan ? { precomputedPlan: body.plan } : {});

    if (!message && !body.plan) {
      return apiError({ code: "bad_request", message: "Message or plan required" });
    }

    if (shouldStream) {
      const result = await executeAgentRunStream(user.id, message, context);
      if (result.stream) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      if (result.error) {
        return apiError({
          code: "insufficient_credits",
          message: result.error,
          extra: { creditsNeeded: result.creditsNeeded, creditsAvailable: result.creditsAvailable },
        });
      }
      return NextResponse.json(result);
    }

    const result = await executeAgentRun(user.id, message, context);
    if (result.error) {
      return apiError({
        code: "insufficient_credits",
        message: result.error,
        extra: { creditsNeeded: result.creditsNeeded, creditsAvailable: result.creditsAvailable },
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    return authzResponse(e);
  }
}
