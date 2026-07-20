import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
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
    await requireAdmin();
    const { userId, credits, role } = await req.json();
    const data = {};
    if (credits !== undefined) data.credits = credits;
    if (role !== undefined) data.role = role;
    await prisma.user.update({ where: { id: userId }, data });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}