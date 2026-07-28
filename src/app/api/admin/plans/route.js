import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try { await requireAdmin(req); return NextResponse.json(await prisma.subscriptionPlan.findMany({ orderBy: { price: "asc" } })); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.subscriptionPlan.create({ data: body }), { status: 201 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
}
