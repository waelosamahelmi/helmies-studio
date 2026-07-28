import { NextResponse } from "next/server";
import { syncKieModels } from "@/lib/kie-sync";

// Cron endpoint — called daily by external cron or /api/cron/automation
// Protected by CRON_SECRET bearer token
export async function POST(req) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await syncKieModels();
    
    // Log result
    console.log(`[KIE Sync] Added: ${result.added}, Updated: ${result.updated}, Deactivated: ${result.deactivated}, Total: ${result.total}`);
    
    return NextResponse.json({ success: true, ...result, syncedAt: new Date().toISOString() });
  } catch (e) {
    console.error("[KIE Sync] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}