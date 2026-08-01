import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { rerunShot } from "@/lib/director-executor";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const body = await req.json();
    if (!body.planId || !body.shotId) return NextResponse.json({ error: "planId and shotId required" }, { status: 400 });

    const result = await rerunShot(body.planId, user.id, body.shotId, body.rerunType || "full");

    return NextResponse.json({ success: true, result });
  } catch (e) {
    return authzResponse(e);
  }
}
