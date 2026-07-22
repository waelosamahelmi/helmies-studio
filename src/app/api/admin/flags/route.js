import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
    return NextResponse.json(flags);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const { key, name, description, enabled, config } = await req.json();
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, name, description, enabled: enabled ?? false, config },
      update: { name, description, enabled, config },
    });
    await logAudit("admin_toggle_flag", "feature_flag", key, { enabled }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}