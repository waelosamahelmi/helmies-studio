import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeProductionPipeline } from "@/lib/director-executor";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json();
    if (!body.planId) return apiError({ code: "bad_request", message: "planId required" });

    const results = await executeProductionPipeline(body.planId, user.id, {
      autoAssemble: body.autoAssemble !== false,
    });

    return NextResponse.json({ success: true, results });
  } catch (e) {
    // Business errors (e.g. insufficient credits) thrown from
    // executeProductionPipeline must reach the UI as a clean 402, not be
    // swallowed by authzResponse's blanket 500 "Internal error" — mirrors
    // the shape /api/generate/async already returns for the same condition.
    if (/Insufficient credits/.test(e.message)) {
      return apiError({ code: "insufficient_credits", message: e.message });
    }
    // Already rendering is a state, not a fault — say so plainly rather
    // than returning the generic "something went wrong".
    if (e?.code === "already_running") {
      return apiError({ code: "invalid_params", message: e.message });
    }
    return authzResponse(e);
  }
}
