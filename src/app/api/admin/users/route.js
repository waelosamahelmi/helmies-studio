import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { adjustWalletTo } from "@/lib/wallet";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, credits: true, role: true, createdAt: true, _count: { select: { generations: true, transactions: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(users);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message.includes("Forbidden") ? 403 : 401 });
  }
}

export async function PATCH(req) {
  try {
    const admin = await requireAdmin(req);
    const { userId, credits, role } = await req.json();
    if (credits !== undefined && (typeof credits !== "number" || credits < 0)) {
      return NextResponse.json({ error: "Credits must be a non-negative number" }, { status: 400 });
    }
    if (role !== undefined && !["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      if (role !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { role } });
      }
      if (credits !== undefined) {
        await adjustWalletTo(userId, credits, "Admin credit adjustment", admin.id, tx);
      }
    });
    await logAudit("admin_edit_user", "user", userId, { credits, role, adminId: admin.id }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}