import { NextResponse } from "next/server";
import { syncKieModels } from "@/lib/kie-sync";
import { syncAlibabaModels } from "@/lib/model-catalog";

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

    const [kie, alibaba] = await Promise.all([syncKieModels(), syncAlibabaModels()]);
    const result = { providers: { KIE: kie, Alibaba: alibaba }, total: (kie.total || 0) + (alibaba.total || 0) };
    
    // Log result
    console.log(`[Catalog Sync] KIE: ${kie.total}, Alibaba: ${alibaba.total}, Total: ${result.total}`);
    
    return NextResponse.json({ success: true, ...result, syncedAt: new Date().toISOString() });
  } catch (e) {
    console.error("[KIE Sync] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
