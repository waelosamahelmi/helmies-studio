// Magic-byte (content) verification for uploads (Phase 3 Task 5).
//
// The upload route already restricts the declared Content-Type to a fixed
// ALLOWED_TYPES allowlist and derives the stored file extension from that
// declared MIME (never from the attacker-controlled filename). That closes
// "upload a script with a misleading filename" — it does NOT close "declare
// an allowed MIME (e.g. image/png) but upload bytes that are actually HTML
// or a script". sniffMatchesMime verifies the first bytes of the buffer
// match a signature for the declared type, independent of what the client
// claimed. Only the ten MIME types the upload route accepts are recognized;
// every other declared MIME returns false (fail closed).
const ASCII = (buf, start, end) => buf.toString("ascii", start, end);

const SNIFFERS = {
  "image/jpeg": (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,

  "image/png": (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,

  "image/webp": (buf) => buf.length >= 12 && ASCII(buf, 0, 4) === "RIFF" && ASCII(buf, 8, 12) === "WEBP",

  "image/gif": (buf) => buf.length >= 6 && (ASCII(buf, 0, 6) === "GIF87a" || ASCII(buf, 0, 6) === "GIF89a"),

  "video/mp4": (buf) => buf.length >= 8 && ASCII(buf, 4, 8) === "ftyp",

  "video/webm": (buf) =>
    buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3,

  "audio/mpeg": (buf) => isMp3(buf),
  "audio/mp3": (buf) => isMp3(buf),

  "audio/wav": (buf) => isWav(buf),
  "audio/x-wav": (buf) => isWav(buf),
};

function isMp3(buf) {
  if (buf.length >= 3 && ASCII(buf, 0, 3) === "ID3") return true;
  // MPEG frame sync: 11 set bits (0xFF followed by top 3 bits of the next
  // byte set — 0xE0..0xFF), i.e. "FF Ex"/"FF Fx".
  return buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

function isWav(buf) {
  return buf.length >= 12 && ASCII(buf, 0, 4) === "RIFF" && ASCII(buf, 8, 12) === "WAVE";
}

// sniffMatchesMime(buffer, mimeType) -> boolean
export function sniffMatchesMime(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false;
  const sniff = SNIFFERS[(mimeType || "").toLowerCase()];
  if (!sniff) return false;
  try {
    return sniff(buffer);
  } catch {
    return false;
  }
}
