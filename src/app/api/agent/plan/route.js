import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { planTask } from "@/lib/agents";
import { checkRateLimit } from "@/lib/security";

export async function POST(req) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });

    const { message, context } = await req.json();
    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const plan = await planTask(message, context || {});
    return NextResponse.json({ success: true, ...plan });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}