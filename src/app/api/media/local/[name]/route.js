import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req, { params }) {
  try {
    const { name } = await params;
    const safeName = path.basename(name);

    // Check public/media first (generated outputs), then public/uploads (user uploads)
    const mediaPath = path.join(process.cwd(), "public", "media", safeName);
    const uploadsPath = path.join(process.cwd(), "public", "uploads", safeName);

    let buffer;
    try {
      buffer = await readFile(mediaPath);
    } catch {
      try {
        buffer = await readFile(uploadsPath);
      } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
    }

    const ext = path.extname(safeName).toLowerCase();
    // NOTE: ".svg" is deliberately absent. SVG served as image/svg+xml on this
    // origin is a stored-XSS primitive; unknown extensions fall through to
    // application/octet-stream and are never rendered as active content.
    const mimeTypes = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp",
      ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
      ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
      ".pdf": "application/pdf", ".json": "application/json",
    };

    return new Response(buffer, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
