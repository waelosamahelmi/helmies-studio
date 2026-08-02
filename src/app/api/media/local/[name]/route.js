import { NextResponse } from "next/server";
import path from "path";
import { getDriver, localDriver } from "@/lib/storage";

export async function GET(req, { params }) {
  try {
    const { name } = await params;
    const safeName = path.basename(name);

    // Resolve bytes through the active storage driver (Phase 4B Task 3).
    // With STORAGE_DRIVER unset/"local" (today's production default) this is
    // exactly the pre-Task-3 behavior: local-driver.getObject already checks
    // public/media then public/uploads, same as this route used to do
    // directly. With STORAGE_DRIVER=s3, a miss on S3 falls back to the local
    // filesystem — old rows were written before the S3 driver existed and
    // point at files that were never uploaded there.
    let object = await getDriver().getObject(safeName);
    if (!object && process.env.STORAGE_DRIVER?.toLowerCase() === "s3") {
      object = await localDriver.getObject(safeName);
    }
    if (!object) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(safeName).toLowerCase();
    // NOTE: ".svg" is deliberately absent. SVG served as image/svg+xml on this
    // origin is a stored-XSS primitive; unknown extensions fall through to
    // application/octet-stream and are never rendered as active content.
    // Content-Type comes ONLY from this fixed map — never from whatever a
    // driver reports for the object — so a driver can never influence what
    // gets served as active content.
    const mimeTypes = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp",
      ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
      ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
      ".pdf": "application/pdf", ".json": "application/json",
    };

    return new Response(object.buffer, {
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
