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

    return NextResponse.json({
      credits,
      affordable: (userRow?.credits || 0) >= credits,
      remaining: (userRow?.credits || 0) - credits,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}