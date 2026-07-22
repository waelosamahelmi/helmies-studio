import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const keys = await prisma.apiKey.findMany({
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(keys.map(k => ({ ...k, keyHash: undefined })));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}