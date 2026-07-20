import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const [totalUsers, totalGenerations, completedGen, failedGen, totalCreditsUsed, totalRevenue, totalProviderCost] = await Promise.all([
      prisma.user.count(),
      prisma.generation.count(),
      prisma.generation.count({ where: { status: "completed" } }),
      prisma.generation.count({ where: { status: "failed" } }),
      prisma.generation.aggregate({ _sum: { creditsUsed: true } }),
      prisma.creditTransaction.aggregate({ _sum: { amount: true }, where: { type: "subscription" } }),
      prisma.generation.aggregate({ _sum: { providerCost: true } }),
    ]);

    const creditsTx = totalCreditsUsed._sum.creditsUsed || 0;
    const revenue = totalRevenue._sum.amount || 0;
    const providerCost = totalProviderCost._sum.providerCost || 0;
    const profit = revenue - (providerCost * 0.01);

    const last30Days = await prisma.generation.groupBy({
      by: ["tool"],
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      _count: true,
      _sum: { creditsUsed: true },
    });

    return NextResponse.json({
      totals: {
        users: totalUsers,
        generations: totalGenerations,
        completed: completedGen,
        failed: failedGen,
        creditsUsed: creditsTx,
        revenue,
        providerCost,
        profit,
        successRate: totalGenerations ? (completedGen / totalGenerations * 100).toFixed(1) : 0,
      },
      byTool: last30Days,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}