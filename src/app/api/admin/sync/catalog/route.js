import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { syncKieModels } from "@/lib/kie-sync";
import { syncAlibabaModels } from "@/lib/model-catalog";

export async function POST(req) {
  try {
    await requireAdmin(req);
    const [kie, alibaba] = await Promise.all([syncKieModels(), syncAlibabaModels()]);
    const result = { providers: { KIE: kie, Alibaba: alibaba }, total: (kie.total || 0) + (alibaba.total || 0) };
    await logAudit("admin_sync_provider_catalog", "model_pricing", "all", result, req);
    return NextResponse.json({ success: true, ...result, syncedAt: new Date().toISOString() });
  } catch (error) {
    return authzResponse(error);
  }
}
