// Helmies Studio — keeping a voice sample inside what the provider accepts.
//
// Measured, not reasoned. Seedance refuses a reference audio outside 2-30
// seconds:
//
//     Each reference audio must be between 2 and 30 seconds
//
// and refuses the SET when the total runs over 30:
//
//     The total duration of reference audios cannot exceed 30 seconds
//
// A 51-second upload therefore fails every dialogue shot in a film, and the
// error names the reference audio without naming the length — which is how a
// whole afternoon went into concluding, wrongly, that the provider had
// stopped taking voice samples at all. Trimming at INTAKE means the file on
// record is one the provider will always take, and the shot path never has
// to know any of this.
//
// 25 rather than 30: the ceiling is the total across all references, so a
// sample sitting exactly at the limit leaves no room for a second voice in a
// two-hander. 25 keeps one comfortably legal and two survivable when a shot
// falls back to sending both.
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { validateOutboundUrl } from "./net-allowlist.js";

const execFileAsync = promisify(execFile);
const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

export const MAX_VOICE_SECONDS = 25;
export const MIN_VOICE_SECONDS = 2;
const MAX_BYTES = 50 * 1024 * 1024;

/** Seconds of audio at `path`, or null when ffprobe cannot tell us. */
export async function probeSeconds(path) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    const n = Number(String(stdout).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Where a reference url lives on this box, when it lives here at all.
 *
 * Local uploads are read straight off disk rather than fetched back through
 * our own HTTP layer — a server calling itself to read a file it just wrote
 * is a needless dependency on the server being up mid-request.
 */
function localPathFor(url) {
  const m = /^(?:\/api\/media\/local\/|\/uploads\/)([\w.-]+)$/.exec(url || "");
  if (!m) return null;
  const name = m[1];
  // No traversal: the pattern already forbids "/" and the segment is joined
  // to a fixed directory, but a leading dot would still reach a dotfile.
  if (name.startsWith(".")) return null;
  const path = join(UPLOADS_DIR, name);
  return existsSync(path) ? path : null;
}

async function fetchToDisk(url) {
  validateOutboundUrl(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read the voice sample (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("That voice sample is too large.");
  await mkdir(UPLOADS_DIR, { recursive: true });
  const path = join(UPLOADS_DIR, `voicesrc-${createHash("sha1").update(url).digest("hex").slice(0, 16)}`);
  await writeFile(path, buf);
  return path;
}

/**
 * trimVoiceSample(url) -> { url, seconds, trimmed }
 *
 * Returns the ORIGINAL url untouched when the sample is already legal, and a
 * new uploaded url when it had to be cut. A sample shorter than the floor is
 * returned as-is with `tooShort` set: padding two seconds of silence onto
 * somebody's voice would satisfy the validator and teach the model that the
 * voice contains silence.
 */
export async function trimVoiceSample(url, { maxSeconds = MAX_VOICE_SECONDS } = {}) {
  if (typeof url !== "string" || !url) throw new Error("No voice sample url.");

  let source = localPathFor(url);
  let temporary = false;
  if (!source) {
    source = await fetchToDisk(url);
    temporary = true;
  }

  try {
    const seconds = await probeSeconds(source);
    if (seconds == null) {
      // ffprobe could not read it. Passing it through unchanged is the honest
      // outcome: we do not know that it is too long, and re-encoding a file
      // we cannot measure risks destroying a sample that was fine.
      return { url, seconds: null, trimmed: false, measured: false };
    }
    if (seconds < MIN_VOICE_SECONDS) {
      return { url, seconds, trimmed: false, tooShort: true };
    }
    if (seconds <= maxSeconds) {
      return { url, seconds, trimmed: false };
    }

    const name = `voice-${createHash("sha1").update(`${url}:${maxSeconds}`).digest("hex").slice(0, 16)}.mp3`;
    const out = join(UPLOADS_DIR, name);
    await mkdir(UPLOADS_DIR, { recursive: true });
    if (!existsSync(out)) {
      // From the start, not the middle: the opening of a sample is normally
      // the person speaking plainly, which is what a voice reference wants.
      await execFileAsync("ffmpeg", [
        "-i", source,
        "-t", String(maxSeconds),
        "-vn",
        "-ac", "1",
        "-ar", "44100",
        "-b:a", "128k",
        "-y", out,
      ]);
    }
    return { url: `/api/media/local/${name}`, seconds: maxSeconds, trimmed: true, originalSeconds: seconds };
  } finally {
    if (temporary) await unlink(source).catch(() => {});
  }
}
