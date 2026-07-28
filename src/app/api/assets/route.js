import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const where = { userId: user.id, isDeleted: false };
    if (type && type !== "all") where.type = type;
    const assets = await prisma.asset.findMany({ where, orderBy: { createdAt: "desc" }, take: limit + 1, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    const hasMore = assets.length > limit;
    if (hasMore) assets.pop();
    return NextResponse.json({ assets, hasMore, nextCursor: hasMore ? assets[assets.length - 1].id : null });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const asset = await prisma.asset.create({ data: { userId: user.id, type: body.type || "image", source: body.source || "upload", url: body.url, thumbnailUrl: body.thumbnailUrl, name: body.name, mimeType: body.mimeType, bytes: body.bytes || 0, width: body.width, height: body.height, duration: body.duration, model: body.model, generationId: body.generationId, parentAssetId: body.parentAssetId, metadata: body.metadata || {} } });
    return NextResponse.json(asset, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PATCH(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const asset = await prisma.asset.findFirst({ where: { id: body.id, userId: user.id } });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.asset.update({ where: { id: body.id }, data: { isFavorite: body.isFavorite } });
    return NextResponse.json(updated);
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.asset.update({ where: { id }, data: { isDeleted: true } });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
