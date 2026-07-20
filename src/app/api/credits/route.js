import { NextResponse } from "next/server";
import { getCurrentUserWithCredits } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: "active" },
      orderBy: { createdAt: "desc" },
    });

    const recentTransactions = await prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      credits: user.credits,
      plan: subscription?.plan || "free",
      subscription,
      recentTransactions,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}