import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { syncKieModels } from "@/lib/kie-sync";

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const result = await syncKieModels();
    await logAudit("admin_sync_kie", "model_pricing", "all", result, req);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return authzResponse(e);
  }
}