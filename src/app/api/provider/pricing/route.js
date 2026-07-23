import { NextResponse } from "next/server";
import { fetchWaveSpeedPricing } from "@/lib/providers";
import { calculateCredits } from "@/lib/pricing-engine";

export async function POST(req) {
  try {
    const { modelId, inputs } = await req.json();
    if (!modelId) return NextResponse.json({ error: "modelId required" }, { status: 400 });
    const pricing = await fetchWaveSpeedPricing(modelId, inputs || {});
    if (!pricing) return NextResponse.json({ error: "Pricing not available" }, { status: 404 });
    const creditsCost = calculateCredits(pricing.cost || pricing.total_cost || 0);
    return NextResponse.json({ ...pricing, creditsCost });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
