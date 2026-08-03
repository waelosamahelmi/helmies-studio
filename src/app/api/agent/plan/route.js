import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { planTask, planTaskStream } from "@/lib/agents";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json();
    const message = body.message || body.prompt;
    const context = body.context || {};
    if (!message) return apiError({ code: "bad_request", message: "Message required" });

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
    return apiError({ code: "internal", cause: e, context: { route: "agent/plan" } });
  }
}
