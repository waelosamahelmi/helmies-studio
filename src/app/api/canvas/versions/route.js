import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const documentId = new URL(req.url).searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });
    const doc = await prisma.canvasDocument.findFirst({ where: { id: documentId, userId: user.id } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await prisma.canvasVersion.findMany({ where: { documentId }, orderBy: { createdAt: "desc" }, take: 50 }));
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
