import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import prisma from "@/lib/prisma";

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

    // Create an Asset record for the upload (spec §14, §37)
    const assetType = file.type?.startsWith("video/") ? "video"
      : file.type?.startsWith("audio/") ? "audio"
      : "image";
    try {
      await prisma.asset.create({
        data: {
          userId: user.id,
          type: assetType,
          source: "upload",
          url,
          storageKey: `uploads/${name}`,
          name: file.name,
          mimeType: file.type,
          bytes: buffer.length,
        },
      });
    } catch {}

    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
