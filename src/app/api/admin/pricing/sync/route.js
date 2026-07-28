import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { syncPricingFromWaveSpeed } from "@/lib/pricing-engine";

export async function POST(req) {
  try {
    await requireAdmin(req);
    const synced = await syncPricingFromWaveSpeed();
    await logAudit("admin_sync_pricing", "model_pricing", "all", { synced }, req);
    return NextResponse.json({ success: true, synced });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}