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
    //
    // The primary call is wrapped so a THROWN driver error (e.g. an S3
    // outage/5xx) is treated exactly like a null "not found" result, not
    // left to escape to this route's outer catch (which would 404 without
    // ever trying the fallback). Without this, every pre-S3 file goes dark
    // for the duration of an S3 incident even though it's sitting right
    // there on disk.
    let object;
    try {
      object = await getDriver().getObject(safeName);
    } catch {
      object = null;
    }
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

    const contentType = mimeTypes[ext] || "application/octet-stream";
    const common = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Advertised on EVERY response, not just ranged ones: a client
      // decides whether it can seek from this header before it asks.
      "Accept-Ranges": "bytes",
    };

    /* BYTE RANGES — why video did not play on an iPhone.

       iOS Safari will not play a video it cannot seek. It opens with
       `Range: bytes=0-1`, and a server that answers 200 with the whole
       file (which this route did) is treated as unseekable: the element
       simply never starts. Desktop Chrome is forgiving about it, which is
       why it looked fine everywhere it was tested.

       Range also means a phone no longer downloads an entire clip before
       showing the first frame. */
    const total = object.buffer.length;
    // Optional-chained: a caller without a Headers object (internal
    // fetches, tests) must fall through to the whole file, not throw into
    // the outer catch and 404 a file that is sitting right there.
    const rangeHeader = req?.headers?.get?.("range") || null;
    const match = rangeHeader && /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

    if (match) {
      const [, rawStart, rawEnd] = match;
      // "bytes=-500" means the LAST 500 bytes, not "from 0 to 500".
      let start = rawStart === "" ? total - Number(rawEnd) : Number(rawStart);
      let end = rawStart === "" || rawEnd === "" ? total - 1 : Number(rawEnd);
      start = Math.max(0, Math.min(start, total));
      end = Math.max(start, Math.min(end, total - 1));

      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= total) {
        // Unsatisfiable — say so with the real size rather than serving
        // the wrong bytes.
        return new Response(null, {
          status: 416,
          headers: { ...common, "Content-Range": `bytes */${total}` },
        });
      }

      return new Response(object.buffer.subarray(start, end + 1), {
        status: 206,
        headers: {
          ...common,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }

    return new Response(object.buffer, {
      headers: { ...common, "Content-Length": String(total) },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
