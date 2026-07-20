import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { getAllPricing, setModelPricing } from "@/lib/pricing-engine";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getAllPricing());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req) {
  try {
    await requireAdmin();
    const { modelId, modelType, providerName, providerCost, creditsCost } = await req.json();
    await setModelPricing(modelId, modelType, providerName, providerCost, creditsCost);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}