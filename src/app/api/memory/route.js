import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { getMemories, createMemory, deleteMemory } from "@/lib/memory";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    return NextResponse.json(await getMemories(user.id, type));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { type, name, data } = await req.json();
    if (!type || !name) return NextResponse.json({ error: "Type and name required" }, { status: 400 });

    const memory = await createMemory(user.id, type, name, data);
    return NextResponse.json({ success: true, memory });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Explicit allowlist — never `data: body`, which would let a caller
    // rewrite userId or id.
    const data = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.data !== undefined) data.data = body.data;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Scoped to the caller: updateMany no-ops on someone else's memory.
    const res = await prisma.projectMemory.updateMany({ where: { id, userId: user.id }, data });
    if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const memory = await prisma.projectMemory.findFirst({ where: { id, userId: user.id } });
    return NextResponse.json({ success: true, memory });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await req.json();
    await deleteMemory(id, user.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}