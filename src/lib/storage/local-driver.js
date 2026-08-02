// Local filesystem storage driver (Phase 4B Task 1) — today's default and
// production behavior. Writes new objects under public/media (mirrors the
// pre-Phase-4B src/lib/media-storage.js's storeMedia); reads check
// public/media THEN public/uploads (mirrors the pre-Phase-4B serving route,
// src/app/api/media/local/[name]/route.js, and keeps user uploads written by
// src/app/api/upload/route.js resolvable through the same driver contract).
//
// Plain-node safe: every import here is a Node builtin, no "@/" alias and no
// extensionless relative import — this module is reachable from
// scripts/worker.mjs via src/lib/job-runner.js -> storage/ingest.js -> here.
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, basename, extname } from "node:path";

const MEDIA_DIR = join(process.cwd(), "public", "media");
const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

// Same fixed extension -> Content-Type map the serving route uses today.
// ".svg" is deliberately absent — see route.js's comment (stored-XSS via
// image/svg+xml). Kept here too so getObject can return a sensible
// contentType for callers that want one; the serving route itself still
// derives Content-Type from its OWN copy of this map (Task 3), not from
// whatever a driver reports, so a driver can never influence what
// Content-Type header actually gets served.
const MIME_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".pdf": "application/pdf", ".json": "application/json",
};

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory already exists (or race with another writer creating it) —
    // writeFile below is the real success/failure signal.
  }
}

export async function putObject(key, buffer, _contentType) {
  const safeKey = basename(key);
  await ensureDir(MEDIA_DIR);
  await writeFile(join(MEDIA_DIR, safeKey), buffer);
  return { key: safeKey, url: `/api/media/local/${safeKey}` };
}

// Returns { buffer, contentType } or null when the key exists in neither
// public/media nor public/uploads.
export async function getObject(key) {
  const safeKey = basename(key);
  const contentType = MIME_TYPES[extname(safeKey).toLowerCase()] || "application/octet-stream";
  try {
    const buffer = await readFile(join(MEDIA_DIR, safeKey));
    return { buffer, contentType };
  } catch {
    try {
      const buffer = await readFile(join(UPLOADS_DIR, safeKey));
      return { buffer, contentType };
    } catch {
      return null;
    }
  }
}

export async function deleteObject(key) {
  const safeKey = basename(key);
  for (const dir of [MEDIA_DIR, UPLOADS_DIR]) {
    try {
      await unlink(join(dir, safeKey));
      return true;
    } catch {
      // Not in this directory (or already gone) — try the next one / give up.
    }
  }
  return false;
}

export async function exists(key) {
  return (await getObject(key)) !== null;
}

// Local driver has no concept of expiry — same plain URL every time,
// regardless of ttlSeconds. It's only meaningful for the S3 driver.
export function getSignedUrl(key, _ttlSeconds) {
  return `/api/media/local/${basename(key)}`;
}
