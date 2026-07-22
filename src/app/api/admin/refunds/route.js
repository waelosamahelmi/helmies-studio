import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const refunds = await prisma.refund.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(refunds);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const { userId, generationId, amount, reason } = await req.json();

    const refund = await prisma.refund.create({
      data: { userId, generationId, amount, reason, status: "completed", processedAt: new Date() },
    });

    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
    await prisma.creditTransaction.create({
      data: { userId, amount, type: "admin_refund", description: reason || "Admin refund" },
    });
    await logAudit("admin_refund", "user", userId, { amount, reason }, req);

    return NextResponse.json({ success: true, refund });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}