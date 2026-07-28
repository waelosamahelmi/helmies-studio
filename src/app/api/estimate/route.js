import { NextResponse } from "next/server";
import { getCurrentUserWithCredits } from "@/lib/session";
import { estimateCredits } from "@/lib/pricing-engine";
import { CREDIT_PACKS } from "@/lib/credit-packs";

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { tool, model, params } = await req.json();
    const credits = await estimateCredits(tool, model, params || {});
    const remaining = user.credits || 0;
    const affordable = remaining >= credits;
    const shortfall = affordable ? 0 : credits - remaining;

    return NextResponse.json({
      credits,
      affordable,
      balance: remaining,
      remaining: remaining - credits,
      shortfall,
      topUpNeeded: !affordable,
      topUpPacks: !affordable ? CREDIT_PACKS : [],
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}