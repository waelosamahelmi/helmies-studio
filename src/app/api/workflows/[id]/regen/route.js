import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { regenerateStep } from "@/lib/workflows";

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/workflow/regen");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });

    const { stepIndex, newParams } = await req.json();
    const result = await regenerateStep(params.id, user.id, stepIndex, newParams || {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}