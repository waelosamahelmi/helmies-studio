import { NextResponse } from "next/server";
import { handleGenerationWebhook } from "@/lib/generation-webhook";

export async function POST(req) {
  try {
    // Fail CLOSED: with no secret configured this endpoint would otherwise be
    // an unauthenticated way to mark generations failed and mint refunds.
    const secret = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { status, response } = await handleGenerationWebhook(body);
    return NextResponse.json(response, { status });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
