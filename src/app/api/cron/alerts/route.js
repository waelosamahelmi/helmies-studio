import { NextResponse } from "next/server";
import { collectMetrics } from "@/lib/metrics";
import { evaluateAlerts, filterDueAlerts, deliverAlerts } from "@/lib/alerts";

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
    const due = await filterDueAlerts(alerts);
    const delivery = await deliverAlerts(due);
    return NextResponse.json({ evaluated: alerts.length, fired: due.length, delivery });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
