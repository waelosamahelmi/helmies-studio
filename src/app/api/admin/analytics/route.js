import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { CREDIT_TO_EUR } from "@/lib/pricing-engine";
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
      prisma.creditTransaction.aggregate({ _sum: { amount: true }, where: { type: { in: ["subscription", "topup"] } } }),
      prisma.generation.aggregate({ _sum: { providerCost: true } }),
    ]);

    const creditsUsed = totalCreditsUsed._sum.creditsUsed || 0;
    const creditsGranted = totalRevenue._sum.amount || 0;
    const revenueEur = creditsGranted * CREDIT_TO_EUR;
    const providerCost = totalProviderCost._sum.providerCost || 0;
    const retailValue = creditsUsed * CREDIT_TO_EUR;
    const profit = retailValue - providerCost;
    const marginPct = retailValue > 0 ? ((profit / retailValue) * 100).toFixed(1) : 0;

    const last30Days = await prisma.generation.groupBy({
      by: ["tool"],
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      _count: true,
      _sum: { creditsUsed: true, providerCost: true },
    });

    const marginByTool = last30Days.map((t) => {
      const rev = (t._sum.creditsUsed || 0) * CREDIT_TO_EUR;
      const cost = t._sum.providerCost || 0;
      return {
        tool: t.tool,
        generations: t._count,
        revenue: rev,
        cost,
        margin: rev - cost,
        marginPct: rev > 0 ? ((rev - cost) / rev * 100).toFixed(1) : 0,
      };
    });

    const marginByModel = await prisma.generation.groupBy({
      by: ["model"],
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, status: "completed" },
      _count: true,
      _sum: { creditsUsed: true, providerCost: true },
      orderBy: { _count: { model: "desc" } },
      take: 20,
    });

    const modelMargins = marginByModel.map((m) => {
      const rev = (m._sum.creditsUsed || 0) * CREDIT_TO_EUR;
      const cost = m._sum.providerCost || 0;
      return {
        model: m.model,
        generations: m._count,
        revenue: rev,
        cost,
        margin: rev - cost,
        marginPct: rev > 0 ? ((rev - cost) / rev * 100).toFixed(1) : 0,
      };
    });

    return NextResponse.json({
      totals: {
        users: totalUsers,
        generations: totalGenerations,
        completed: completedGen,
        failed: failedGen,
        creditsUsed,
        creditsGranted,
        revenueEur,
        retailValue,
        providerCost,
        profit,
        marginPct,
        successRate: totalGenerations ? (completedGen / totalGenerations * 100).toFixed(1) : 0,
      },
      byTool: last30Days,
      marginByTool,
      modelMargins,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}