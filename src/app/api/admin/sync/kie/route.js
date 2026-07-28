import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { syncKieModels } from "@/lib/kie-sync";

export async function POST(req) {
  try {
    await requireAdmin(req);
    const result = await syncKieModels();
    await logAudit("admin_sync_kie", "model_pricing", "all", result, req);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}