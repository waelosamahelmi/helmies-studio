import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createHash, randomUUID } from "crypto";

const MEDIA_DIR = join(process.cwd(), "public", "media");

async function ensureDir() {
  try { await mkdir(MEDIA_DIR, { recursive: true }); } catch {}
}

function stripJpegExif(buffer) {
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

function stripPngMetadata(buffer) {
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

export async function storeMedia(providerUrl, contentType) {
  await ensureDir();

  const res = await fetch(providerUrl, {
    signal: AbortSignal.timeout(60000),
    headers: { "User-Agent": "HelmiesStudio/1.0" },
  });

  if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);
  const ct = contentType || res.headers.get("content-type") || "application/octet-stream";

  if (ct.includes("jpeg") || ct.includes("jpg")) {
    buffer = stripJpegExif(buffer);
  } else if (ct.includes("png")) {
    buffer = stripPngMetadata(buffer);
  }

  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const ext = ct.includes("mp4") || ct.includes("webm") ? "webm"
    : ct.includes("jpeg") || ct.includes("jpg") ? "jpg"
    : ct.includes("png") ? "png"
    : ct.includes("gif") ? "gif"
    : ct.includes("webp") ? "webp"
    : ct.includes("mp3") || ct.includes("mpeg") ? "mp3"
    : ct.includes("wav") ? "wav"
    : ct.includes("ogg") ? "ogg"
    : "bin";

  const filename = `${hash}-${randomUUID().slice(0, 8)}.${ext}`;
  const filepath = join(MEDIA_DIR, filename);
  await writeFile(filepath, buffer);

  return `/media/${filename}`;
}
