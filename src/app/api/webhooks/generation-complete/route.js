import { NextResponse } from "next/server";
import { handleGenerationWebhook } from "@/lib/generation-webhook";

export async function POST(req) {
  try {
    // Fail CLOSED: with no secret configured this endpoint would otherwise be
    // an unauthenticated way to mark generations failed and mint refunds.
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const cronSecret = process.env.CRON_SECRET;
    if (!webhookSecret && !cronSecret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    // WEBHOOK_SECRET is the dedicated credential for this endpoint. Once set,
    // it's authoritative — CRON_SECRET is accepted only as a deprecated
    // fallback while an environment hasn't set WEBHOOK_SECRET yet; webhook
    // and cron callers should not share a credential long-term.
    const authHeader = req.headers.get("authorization");
    const authorized = webhookSecret
      ? authHeader === `Bearer ${webhookSecret}`
      : authHeader === `Bearer ${cronSecret}`;
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!webhookSecret) {
      console.warn("[Webhook] Authenticated via CRON_SECRET — deprecated, set WEBHOOK_SECRET instead.");
    }

    const body = await req.json();
    const { status, response } = await handleGenerationWebhook(body);
    return NextResponse.json(response, { status });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
