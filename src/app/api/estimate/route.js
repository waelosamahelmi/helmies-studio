import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { estimateCredits } from "@/lib/pricing-engine";
import prisma from "@/lib/prisma";

export async function POST(req) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { tool, model, params } = await req.json();
    const credits = await estimateCredits(tool, model, params || {});
    const userRow = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } });
    const remaining = (userRow?.credits || 0);
    const affordable = remaining >= credits;
    const shortfall = affordable ? 0 : credits - remaining;

    return NextResponse.json({
      credits,
      affordable,
      remaining: remaining - credits,
      shortfall,
      topUpNeeded: !affordable,
      topUpPacks: !affordable ? [
        { id: "500", name: "500 Credits", price: "€9", credits: 500 },
        { id: "1000", name: "1000 Credits", price: "€16", credits: 1000 },
        { id: "2500", name: "2500 Credits", price: "€35", credits: 2500 },
        { id: "5000", name: "5000 Credits", price: "€60", credits: 5000 },
      ] : [],
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}