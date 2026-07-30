import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

// Explicit allowlist of client-updatable BrandKit fields. `data: body` would
// let a caller rewrite userId (ownership transfer) or id.
const UPDATABLE_FIELDS = [
  "name", "description", "website",
  "primaryColors", "secondaryColors", "fonts", "slogans",
  "photographyStyle", "toneOfVoice", "avoid", "visualReferences",
  "fingerprint", "enforcement", "isActive",
];

function pickUpdatable(body) {
  const data = {};
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const brands = await prisma.brandKit.findMany({ where: { userId: user.id, isActive: true }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json(brands);
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const brand = await prisma.brandKit.create({ data: { userId: user.id, name: body.name.trim(), description: body.description || null } });
    return NextResponse.json(brand, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PATCH(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const brand = await prisma.brandKit.findFirst({ where: { id: body.id, userId: user.id } });
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.brandKit.update({ where: { id: body.id }, data: pickUpdatable(body) });
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
    // Scope by owner: updateMany silently no-ops on someone else's brand kit.
    const res = await prisma.brandKit.updateMany({ where: { id, userId: user.id }, data: { isActive: false } });
    if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
