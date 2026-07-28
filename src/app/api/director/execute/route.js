import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeProductionPipeline } from "@/lib/director-executor";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    if (!body.planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

    const results = await executeProductionPipeline(body.planId, user.id, {
      autoAssemble: body.autoAssemble !== false,
    });

    return NextResponse.json({ success: true, results });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
