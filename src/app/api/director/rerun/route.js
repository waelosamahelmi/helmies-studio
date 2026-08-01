import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rerunShot, VALID_RERUN_TYPES } from "@/lib/director-executor";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const body = await req.json();
    if (!body.planId || !body.shotId) return NextResponse.json({ error: "planId and shotId required" }, { status: 400 });

    // Reject an unrecognized rerunType here (before rerunShot ever debits the
    // wallet) rather than letting it fall through to a mismatched cost —
    // rerunShot also validates the same VALID_RERUN_TYPES list defensively
    // since it's callable from outside this route too.
    const rerunType = body.rerunType || "full";
    if (!VALID_RERUN_TYPES.includes(rerunType)) {
      return NextResponse.json({ error: "Invalid rerunType" }, { status: 400 });
    }

    const result = await rerunShot(body.planId, user.id, body.shotId, rerunType);

    return NextResponse.json({ success: true, result });
  } catch (e) {
    return authzResponse(e);
  }
}
