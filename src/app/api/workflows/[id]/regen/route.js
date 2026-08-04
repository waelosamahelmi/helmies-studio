import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { regenerateStep } from "@/lib/workflows";

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/workflow/regen");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    // `await` works whether params is a promise (Next 15+) or a plain object.
    // Reading `params.id` off the promise gave undefined, and Prisma drops an
    // undefined filter — so this rerun charged the user for a step of
    // whichever workflow they had touched most recently, not the one they
    // clicked. Same fix as the sibling publish route already carries.
    const { id } = await params;
    if (!id) return apiError({ code: "bad_request", message: "id required" });

    const { stepIndex, newParams } = await req.json();
    const result = await regenerateStep(id, user.id, stepIndex, newParams || {});
    return NextResponse.json(result);
  } catch (e) {
    // Business errors (e.g. insufficient credits) thrown from regenerateStep
    // must reach the UI as a clean 402, not be swallowed by authzResponse's
    // blanket 500 "Internal error" — mirrors the shape /api/generate/async
    // already returns for the same condition.
    if (/Insufficient credits/.test(e.message)) {
      return apiError({ code: "insufficient_credits", message: e.message });
    }
    return authzResponse(e);
  }
}