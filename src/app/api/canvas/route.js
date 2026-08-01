import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await prisma.canvasDocument.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 50 }));
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);
    const body = await req.json();
    const data = body.data ?? body.content ?? {};
    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.canvasDocument.create({
        data: { userId: user.id, name: body.name || "Untitled", data },
      });
      await tx.canvasVersion.create({ data: { documentId: created.id, data } });
      return created;
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) { return authzResponse(e); }
}

export async function PATCH(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);
    const body = await req.json();
    const doc = await prisma.canvasDocument.findFirst({ where: { id: body.id, userId: user.id } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = body.data ?? body.content ?? doc.data;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.canvasDocument.update({
        where: { id: body.id },
        data: { name: body.name ?? doc.name, data },
      });
      await tx.canvasVersion.create({ data: { documentId: doc.id, data } });
      return u;
    });
    return NextResponse.json(updated);
  } catch (e) { return authzResponse(e); }
}

export async function DELETE(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const doc = await prisma.canvasDocument.findFirst({ where: { id, userId: user.id } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.canvasDocument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return authzResponse(e); }
}
