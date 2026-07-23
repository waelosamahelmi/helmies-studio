import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = path.extname(file.name) || ".bin";
    const name = `${crypto.randomUUID()}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buffer);

    const url = `/api/media/local/${name}`;
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
