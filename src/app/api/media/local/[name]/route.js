import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req, { params }) {
  try {
    const { name } = await params;
    const safeName = path.basename(name);
    const filePath = path.join(process.cwd(), "public", "uploads", safeName);

    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(safeName).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
      ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
      ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
      ".pdf": "application/pdf", ".json": "application/json",
    };

    return new Response(buffer, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
