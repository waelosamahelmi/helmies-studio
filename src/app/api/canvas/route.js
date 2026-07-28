import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
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
    const body = await req.json();
    const doc = await prisma.canvasDocument.create({ data: { userId: user.id, name: body.name || "Untitled", content: body.content || {} } });
    await prisma.canvasVersion.create({ data: { documentId: doc.id, content: body.content || {}, version: 1 } });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PATCH(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const doc = await prisma.canvasDocument.findFirst({ where: { id: body.id, userId: user.id } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const prev = await prisma.canvasVersion.findFirst({ where: { documentId: doc.id }, orderBy: { version: "desc" } });
    const updated = await prisma.canvasDocument.update({ where: { id: body.id }, data: { name: body.name, content: body.content } });
    await prisma.canvasVersion.create({ data: { documentId: doc.id, content: body.content || {}, version: (prev?.version || 0) + 1 } });
    return NextResponse.json(updated);
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const doc = await prisma.canvasDocument.findFirst({ where: { id, userId: user.id } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.canvasDocument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
