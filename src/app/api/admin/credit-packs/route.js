import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try { await requireAdmin(req); return NextResponse.json(await prisma.creditPack.findMany({ orderBy: { credits: "asc" } })); }
  catch (e) { return authzResponse(e); }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const body = await req.json();
    return NextResponse.json(await prisma.creditPack.create({ data: body }), { status: 201 });
  } catch (e) { return authzResponse(e); }
}
