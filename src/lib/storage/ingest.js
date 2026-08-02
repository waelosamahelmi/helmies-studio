// Unified media ingest (Phase 4B Task 1). One path — ingestFromUrl — for
// pulling a provider-hosted media URL onto our own storage: download, strip
// identifying metadata (EXIF/PNG), verify the download wasn't truncated,
// hash it, and hand the bytes to whichever driver is active
// (src/lib/storage/index.js#getDriver). Both legacy call shapes
// (src/lib/media-storage.js's storeMedia, src/lib/media-download.js's
// downloadAllMedia) become thin shims over this in Task 1, then the four
// real call sites (director-executor.js x3, generation-handler.js,
// generation-webhook.js, job-runner.js) switch to calling this directly in
// Task 4.
//
// Plain-node safe: reachable from scripts/worker.mjs via
// src/lib/job-runner.js -> here (Task 4) — no "@/" alias, no extensionless
// relative import.
import { randomUUID, createHash } from "node:crypto";
import { getDriver } from "./index.js";

// ── EXIF/PNG metadata strippers ──
// Moved VERBATIM from the pre-Phase-4B src/lib/media-storage.js (same byte
// logic, not rewritten) — see that file's git history for the original.

export function stripJpegExif(buffer) {
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return buffer;
  let pos = 2;
  while (pos < buffer.length - 1) {
    if (buffer[pos] !== 0xFF) break;
    const marker = buffer[pos + 1];
    if (marker === 0xDA) break;
    if (marker === 0xD9) break;
    if (marker === 0xE1) {
      const len = (buffer[pos + 2] << 8) | buffer[pos + 3];
      const before = buffer.slice(0, pos);
      const after = buffer.slice(pos + 2 + len);
      return Buffer.concat([before, after]);
    }
    const len = (buffer[pos + 2] << 8) | buffer[pos + 3];
    pos += 2 + len;
  }
  return buffer;
}

export function stripPngMetadata(buffer) {
  if (buffer[0] !== 0x89 || buffer.toString("ascii", 1, 4) !== "PNG") return buffer;
  const chunks = [];
  let pos = 8;
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.slice(pos + 8, pos + 8 + len);
    const crc = buffer.slice(pos + 8 + len, pos + 12 + len);
    const skipChunks = ["tEXt", "zTXt", "iTXt", "eXIf", "tIME"];
    if (!skipChunks.includes(type)) {
      chunks.push({ len, type, data, crc });
    }
    pos += 12 + len;
  }
  const header = buffer.slice(0, 8);
  const body = Buffer.concat(
    chunks.map((c) => {
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(c.len, 0);
      return Buffer.concat([lenBuf, Buffer.from(c.type, "ascii"), c.data, c.crc]);
    })
  );
  return Buffer.concat([header, body]);
}

// Single canonical extension map for newly-ingested media. Note this is
// deliberately MORE correct than the old media-storage.js's inline ternary,
// which mapped both "video/mp4" and "video/webm" content-types to a ".webm"
// extension — a pre-existing bug in that file (mp4 bytes stored under a
// .webm name). Files already written under the old scheme are UNCHANGED by
// this (their extension is already on disk and the serving route's
// extension->Content-Type map, Task 3, is untouched) — this only affects the
// extension chosen for media ingested from here on.
function extensionFor(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("quicktime")) return "mov";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  if (ct.includes("wav")) return "wav";
  if (ct.includes("ogg")) return "ogg";
  return "bin";
}

// Download providerUrl, strip identifying metadata for the types that carry
// it, verify the download matches the server's declared Content-Length (a
// truncated/interrupted download must never be silently stored), and hand
// the result to the active storage driver under a content-addressed key.
// Returns { url, key, bytes, sha256 }.
export async function ingestFromUrl(providerUrl, { contentType } = {}) {
  const res = await fetch(providerUrl, {
    signal: AbortSignal.timeout(60000),
    headers: { "User-Agent": "HelmiesStudio/1.0" },
  });

  if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);

  const declaredLength = res.headers.get("content-length");
  const arrayBuffer = await res.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  if (declaredLength !== null) {
    const expected = Number(declaredLength);
    if (Number.isFinite(expected) && buffer.length !== expected) {
      throw new Error(
        `Media download truncated: server declared Content-Length ${expected} bytes, received ${buffer.length}`
      );
    }
  }

  const ct = contentType || res.headers.get("content-type") || "application/octet-stream";

  if (ct.includes("jpeg") || ct.includes("jpg")) {
    buffer = stripJpegExif(buffer);
  } else if (ct.includes("png")) {
    buffer = stripPngMetadata(buffer);
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const ext = extensionFor(ct);
  const key = `${sha256.slice(0, 16)}-${randomUUID().slice(0, 8)}.${ext}`;

  const driver = getDriver();
  const { url } = await driver.putObject(key, buffer, ct);

  return { url, key, bytes: buffer.length, sha256 };
}
