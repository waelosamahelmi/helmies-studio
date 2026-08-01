import { NextResponse } from "next/server";
import { runAutomation } from "@/lib/automation";

export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  // CRON_SECRET only — this is an internal scheduler trigger, not the
  // inbound webhook endpoint, so it intentionally never accepts
  // WEBHOOK_SECRET (see src/app/api/webhooks/*). Keeping them distinct
  // credentials is the point of Task 10.
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runAutomation();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}