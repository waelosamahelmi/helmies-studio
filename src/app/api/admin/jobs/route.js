import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const jobs = await prisma.generation.findMany({ where: { status: { in: ["pending", "processing"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { email: true, name: true } } } });
    const stats = { total: await prisma.generation.count(), pending: await prisma.generation.count({ where: { status: "pending" } }), processing: await prisma.generation.count({ where: { status: "processing" } }), completed: await prisma.generation.count({ where: { status: "completed" } }), failed: await prisma.generation.count({ where: { status: "failed" } }) };
    return NextResponse.json({ jobs, stats });
  } catch (e) { return authzResponse(e); }
}
