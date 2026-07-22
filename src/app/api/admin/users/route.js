import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
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
    const data = {};
    if (credits !== undefined) {
      if (typeof credits !== "number" || credits < 0) {
        return NextResponse.json({ error: "Credits must be a non-negative number" }, { status: 400 });
      }
      data.credits = credits;
    }
    if (role !== undefined) {
      if (!["user", "admin"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      data.role = role;
    }
    await prisma.user.update({ where: { id: userId }, data });
    await logAudit("admin_edit_user", "user", userId, { credits, role, adminId: admin.id }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}