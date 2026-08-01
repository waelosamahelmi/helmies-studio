import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const incidents = await prisma.providerIncident.findMany({ where: { status: "open" }, orderBy: { startedAt: "desc" } });
    const providers = await prisma.providerPricing.findMany({ distinct: ["provider"], select: { provider: true } });
    return NextResponse.json({ healthy: incidents.length === 0, activeIncidents: incidents, providerCount: providers.length });
  } catch (e) { return authzResponse(e); }
}
