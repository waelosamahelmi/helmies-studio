import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try { await requireAdmin(req); return NextResponse.json(await prisma.cmsEntry.findMany({ orderBy: { updatedAt: "desc" } })); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.cmsEntry.create({ data: { key: body.key, section: body.section || "general", content: body.content } }), { status: 201 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
}

export async function PATCH(req) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.cmsEntry.update({ where: { id: body.id }, data: { content: body.content } }));
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
}
