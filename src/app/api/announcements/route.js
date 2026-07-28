import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const announcements = await prisma.siteAnnouncement.findMany({
      where: { isActive: true, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] },
      orderBy: { createdAt: "desc" }, take: 10,
    });
    return NextResponse.json(announcements);
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
