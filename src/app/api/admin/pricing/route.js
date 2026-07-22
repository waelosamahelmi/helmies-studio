import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { getAllPricing, setModelPricing } from "@/lib/pricing-engine";

export async function GET(req) {
  try {
    await requireAdmin(req);
    return NextResponse.json(await getAllPricing());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const { modelId, modelType, providerName, providerCost, creditsCost } = await req.json();
    await setModelPricing(modelId, modelType, providerName, providerCost, creditsCost);
    await logAudit("admin_set_pricing", "model_pricing", modelId, { providerCost, creditsCost }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}