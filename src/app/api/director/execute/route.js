import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeProductionPipeline } from "@/lib/director-executor";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const body = await req.json();
    if (!body.planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

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
      return NextResponse.json({ error: e.message }, { status: 402 });
    }
    return authzResponse(e);
  }
}
