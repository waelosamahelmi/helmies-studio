import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { planTask, planTaskStream } from "@/lib/agents";
import { checkRateLimit } from "@/lib/security";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });

    const body = await req.json();
    const message = body.message || body.prompt;
    const context = body.context || {};
    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const shouldStream = body.stream !== false;

    if (shouldStream) {
      const result = await planTaskStream(message, context);
      if (result.stream) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return NextResponse.json({ success: true, ...result.plan });
    }

    const plan = await planTask(message, context);
    return NextResponse.json({ success: true, ...plan });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
