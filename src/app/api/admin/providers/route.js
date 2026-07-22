import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const providers = await prisma.providerConfig.findMany();
    return NextResponse.json(providers);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const { name, type, apiKey, baseUrl, markup, isActive } = await req.json();
    await prisma.providerConfig.upsert({
      where: { name },
      create: { name, type, apiKey, baseUrl, markup: markup || 2.5, isActive: isActive ?? true },
      update: { type, apiKey, baseUrl, markup, isActive },
    });
    await logAudit("admin_set_provider", "provider", name, { markup, isActive }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}