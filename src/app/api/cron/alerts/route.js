import { NextResponse } from "next/server";
import { collectMetrics } from "@/lib/metrics";
import { evaluateAlerts, selectDueAlerts, deliverAlerts, recordAlertsFired } from "@/lib/alerts";

export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  // Bearer CRON_SECRET only — same pattern as /api/cron/automation
  // (src/app/api/cron/automation/route.js): an internal scheduler trigger,
  // never the inbound-webhook WEBHOOK_SECRET credential. Fails closed
  // (401) if CRON_SECRET is unset or mismatched.
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const metrics = await collectMetrics();
    const alerts = evaluateAlerts(metrics);
    const due = await selectDueAlerts(alerts);
    const delivery = await deliverAlerts(due);
    // Dedup state is recorded ONLY on confirmed delivery — see
    // recordAlertsFired's header in src/lib/alerts.js. An undelivered
    // alert stays due so the very next evaluation retries it immediately
    // instead of going silent for the whole repeat window.
    if (due.length > 0 && delivery.delivered) {
      await recordAlertsFired(due);
    }
    return NextResponse.json({ evaluated: alerts.length, fired: due.length, delivery });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
