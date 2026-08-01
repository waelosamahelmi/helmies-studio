import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { adjustWalletTo } from "@/lib/wallet";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, credits: true, role: true, createdAt: true,
        wallet: { select: { available: true } },
        _count: { select: { generations: true, transactions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    // Report the wallet's `available` balance — the authoritative source —
    // not the legacy User.credits mirror, which can go stale between wallet
    // mutations and the mirror's next opportunistic sync (see wallet.js).
    // Only fall back to the mirror for a user who has no wallet row yet.
    return NextResponse.json(
      users.map(({ wallet, ...u }) => ({ ...u, credits: wallet?.available ?? u.credits }))
    );
  } catch (e) {
    return authzResponse(e);
  }
}

export async function PATCH(req) {
  try {
    const admin = await requireAdmin(req);
    verifyOrigin(req);
    const { userId, credits, role } = await req.json();
    if (credits !== undefined && (typeof credits !== "number" || credits < 0)) {
      return NextResponse.json({ error: "Credits must be a non-negative number" }, { status: 400 });
    }
    if (role !== undefined && !["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    try {
      await prisma.$transaction(async (tx) => {
        if (role !== undefined) {
          await tx.user.update({ where: { id: userId }, data: { role } });
        }
        if (credits !== undefined) {
          await adjustWalletTo(userId, credits, "Admin credit adjustment", admin.id, tx);
        }
      });
    } catch (txErr) {
      // adjustWalletTo's compare-and-set throws this when a concurrent
      // wallet mutation lands between its read and write — surface it as a
      // retryable conflict instead of falling through to a generic 500.
      if (/Wallet changed concurrently/.test(txErr.message)) {
        return NextResponse.json({ error: "Balance changed concurrently — reload and retry" }, { status: 409 });
      }
      throw txErr;
    }
    await logAudit("admin_edit_user", "user", userId, { credits, role, adminId: admin.id }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}