import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try { await requireAdmin(req); return NextResponse.json(await prisma.siteAnnouncement.findMany({ orderBy: { createdAt: "desc" } })); }
  catch (e) { return authzResponse(e); }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.siteAnnouncement.create({ data: { message: body.message, style: body.style || "info", link: body.link, startDate: body.startDate ? new Date(body.startDate) : new Date(), endDate: body.endDate ? new Date(body.endDate) : null, audience: body.audience || "all" } }), { status: 201 });
  } catch (e) { return authzResponse(e); }
}

export async function PATCH(req) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.siteAnnouncement.update({ where: { id: body.id }, data: { message: body.message, style: body.style, link: body.link, isActive: body.isActive, endDate: body.endDate ? new Date(body.endDate) : undefined } }));
  } catch (e) { return authzResponse(e); }
}

export async function DELETE(req) {
  try {
    await requireAdmin(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.siteAnnouncement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return authzResponse(e); }
}
