import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

// Strict MIME → extension allowlist. The stored extension is derived from the
// declared MIME type only — never from the attacker-controlled filename — so a
// ".svg"/".html"/".js" upload cannot be served back as active content.
const ALLOWED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
};

const MAX_BYTES = 100 * 1024 * 1024; // 100MB

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/upload");
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const mimeType = (file.type || "").toLowerCase().split(";")[0].trim();
    const ext = ALLOWED_TYPES[mimeType];
    if (!ext) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
    }

    // Reject on the declared size before buffering when the platform gives it.
    if (typeof file.size === "number" && file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 100MB)" }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 100MB)" }, { status: 413 });
    }

    const name = `${crypto.randomUUID()}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buffer);

    const url = `/api/media/local/${name}`;

    // Create an Asset record for the upload (spec §14, §37)
    const assetType = mimeType.startsWith("video/") ? "video"
      : mimeType.startsWith("audio/") ? "audio"
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
          mimeType,
          bytes: buffer.length,
        },
      });
    } catch {}

    return NextResponse.json({ url });
  } catch (e) {
    return authzResponse(e);
  }
}
