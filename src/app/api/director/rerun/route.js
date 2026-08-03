import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rerunShot, VALID_RERUN_TYPES } from "@/lib/director-executor";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json();
    if (!body.planId || !body.shotId) return apiError({ code: "bad_request", message: "planId and shotId required" });

    // Reject an unrecognized rerunType here (before rerunShot ever debits the
    // wallet) rather than letting it fall through to a mismatched cost —
    // rerunShot also validates the same VALID_RERUN_TYPES list defensively
    // since it's callable from outside this route too.
    const rerunType = body.rerunType || "full";
    if (!VALID_RERUN_TYPES.includes(rerunType)) {
      return apiError({ code: "bad_request", message: "Invalid rerunType" });
    }

    const result = await rerunShot(body.planId, user.id, body.shotId, rerunType);

    return NextResponse.json({ success: true, result });
  } catch (e) {
    // Business errors (e.g. insufficient credits) thrown from rerunShot must
    // reach the UI as a clean 402, not be swallowed by authzResponse's
    // blanket 500 "Internal error" — mirrors the shape /api/generate/async
    // already returns for the same condition.
    if (/Insufficient credits/.test(e.message)) {
      return apiError({ code: "insufficient_credits", message: e.message });
    }
    return authzResponse(e);
  }
}
