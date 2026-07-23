import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeAgentRun, executeAgentRunStream, planTask } from "@/lib/agents";
import { checkRateLimit } from "@/lib/security";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });

    const body = await req.json();

    const shouldStream = body.stream !== false;

    const message = body.message || body.plan?.summary || "";
    const context = body.context || (body.plan ? { precomputedPlan: body.plan } : {});

    if (!message && !body.plan) {
      return NextResponse.json({ error: "Message or plan required" }, { status: 400 });
    }

    if (shouldStream) {
      const result = await executeAgentRunStream(user.id, message, context);
      if (result.stream) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      if (result.error) {
        return NextResponse.json({ error: result.error, creditsNeeded: result.creditsNeeded, creditsAvailable: result.creditsAvailable }, { status: 402 });
      }
      return NextResponse.json(result);
    }

    const result = await executeAgentRun(user.id, message, context);
    if (result.error) {
      return NextResponse.json({ error: result.error, creditsNeeded: result.creditsNeeded, creditsAvailable: result.creditsAvailable }, { status: 402 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
