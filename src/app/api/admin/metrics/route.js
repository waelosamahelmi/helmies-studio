import { NextResponse } from "next/server";
import { requireAdminUser, authzResponse } from "@/lib/authz";
import { collectMetrics } from "@/lib/metrics";

// Read-only aggregation endpoint — no state-changing side effect, so this
// stays unchecked for origin (matches every other GET-only admin route in
// security/route-manifest.json, e.g. /api/admin/jobs, /api/admin/audit).
export async function GET(req) {
  try {
    await requireAdminUser(req);
    const { searchParams } = new URL(req.url);
    const rawSinceHours = searchParams.get("sinceHours");
    const sinceHours = rawSinceHours ? Number(rawSinceHours) : undefined;
    const metrics = await collectMetrics(
      Number.isFinite(sinceHours) && sinceHours > 0 ? { sinceHours } : {}
    );
    return NextResponse.json(metrics);
  } catch (e) {
    return authzResponse(e);
  }
}
