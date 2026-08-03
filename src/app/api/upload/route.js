import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { sniffMatchesMime } from "@/lib/upload-sniff";
import { apiError } from "@/lib/api-error";

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
      return apiError({ code: "unauthorized" });
    }
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/upload");
    if (!rl.allowed) {
      return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return apiError({ code: "bad_request", message: "No file provided" });
    }

    const mimeType = (file.type || "").toLowerCase().split(";")[0].trim();
    const ext = ALLOWED_TYPES[mimeType];
    if (!ext) {
      return apiError({ status: 415, code: "unsupported_setting", message: "Unsupported file type" });
    }

    // Reject on the declared size before buffering when the platform gives it.
    if (typeof file.size === "number" && file.size > MAX_BYTES) {
      return apiError({ status: 413, code: "bad_request", message: "File too large (max 100MB)" });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (buffer.length > MAX_BYTES) {
      return apiError({ status: 413, code: "bad_request", message: "File too large (max 100MB)" });
    }

    // Byte-level verification: the declared MIME must match the actual
    // content, not just an attacker-supplied Content-Type. Sniffs the same
    // buffer already read above — no extra I/O.
    if (!sniffMatchesMime(buffer, mimeType)) {
      return apiError({
        code: "bad_request",
        message: "File content does not match its declared type",
      });
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
