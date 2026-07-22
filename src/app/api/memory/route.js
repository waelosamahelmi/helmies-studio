import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
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