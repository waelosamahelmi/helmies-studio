import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { grantCredits, getWallet } from "@/lib/wallet";
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
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const { userId, generationId, amount, reason } = await req.json();

    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const credits = Number(amount);
    if (!Number.isFinite(credits) || credits <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const refund = await prisma.refund.create({
      data: { userId, generationId, amount: credits, reason, status: "completed", processedAt: new Date() },
    });

    // Grant through the wallet — incrementing the legacy User.credits column
    // was a no-op, since the wallet sync overwrites it from `available`.
    await getWallet(userId); // ensures a wallet exists (migrates legacy balance)
    const wallet = await grantCredits(userId, credits, "refund", reason || "Admin refund", generationId || null);
    await prisma.user.update({ where: { id: userId }, data: { credits: wallet.available } }).catch(() => {});
    await logAudit("admin_refund", "user", userId, { amount: credits, reason }, req);

    return NextResponse.json({ success: true, refund });
  } catch (e) {
    return authzResponse(e);
  }
}