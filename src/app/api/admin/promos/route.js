import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try { await requireAdmin(req); return NextResponse.json(await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } })); }
  catch (e) { return authzResponse(e); }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.promoCode.create({ data: { code: body.code, type: body.type || "percentage", value: body.value, eligibility: body.eligibility || "all", maxUses: body.maxUses || null, maxUsesPerUser: body.maxUsesPerUser || 1, startsAt: body.startsAt ? new Date(body.startsAt) : null, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, description: body.description } }), { status: 201 });
  } catch (e) { return authzResponse(e); }
}

export async function PATCH(req) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.promoCode.update({ where: { id: body.id }, data: { isActive: body.isActive } }));
  } catch (e) { return authzResponse(e); }
}

export async function DELETE(req) {
  try {
    await requireAdmin(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.promoCode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return authzResponse(e); }
}
