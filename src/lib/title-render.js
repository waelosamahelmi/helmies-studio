// Helmies Studio — running the title cards (the impure half of title-cards.mjs).
//
// Two jobs, one filter chain:
//   renderTitleCard  — type on a solid background, as its own clip.
//   overlayTitles    — the same type burned over footage that already exists.
//
// Both can composite the REAL logo, which is the other thing a model must
// never be asked to draw: a generated logo is a different logo, wrong in
// every frame it appears in, and wrong in the frame the whole film ends on.
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { buildCardFilters } from "./title-cards.mjs";
import { validateOutboundUrl } from "./net-allowlist.js";

const execFileAsync = promisify(execFile);
const MEDIA_DIR = join(process.cwd(), "public", "media");
const UPLOADS_DIR = join(process.cwd(), "public", "uploads");
const FONT_DIR = join(process.cwd(), "assets", "fonts").replace(/\\/g, "/");

const ENCODE = ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];

const MAX_SECONDS = 60;
const MAX_LOGO_BYTES = 20 * 1024 * 1024;

const hash = (obj) => createHash("sha1").update(JSON.stringify(obj)).digest("hex").slice(0, 16);

/** A local upload read off disk; anything else fetched, once, with the SSRF guard. */
async function resolveToDisk(url, { maxBytes = MAX_LOGO_BYTES } = {}) {
  const local = /^(?:\/api\/media\/local\/|\/uploads\/)([\w.-]+)$/.exec(url || "");
  if (local && !local[1].startsWith(".")) {
    const path = join(UPLOADS_DIR, local[1]);
    if (existsSync(path)) return { path, temporary: false };
  }
  validateOutboundUrl(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("That file is too large to composite.");
  await mkdir(MEDIA_DIR, { recursive: true });
  const path = join(MEDIA_DIR, `fetch-${hash(url)}`);
  await writeFile(path, buf);
  return { path, temporary: true };
}

/* The logo, scaled to a share of the frame width and centred at `logoY`.
   Scaled by WIDTH rather than to a fixed pixel box: a wordmark and a square
   mark have wildly different aspect ratios, and forcing both into one box
   distorts one of them. */
function logoFilters({ logoWidth = 0.22, logoY = "(h-overlay_h)/2", fade = null }) {
  const w = Math.min(0.9, Math.max(0.02, Number(logoWidth) || 0.22));
  const alpha = fade ? `,format=rgba,colorchannelmixer=aa=${fade}` : "";
  return {
    prepare: `[1:v]scale=iw*${w}*main_w/iw:-1${alpha}[logo]`,
    overlay: `overlay=x=(main_w-overlay_w)/2:y=${logoY}`,
  };
}

/**
 * A title card as its own clip.
 *
 * `lines` is the card: text, weight, size, colour, tracking, and the timing
 * each line appears at (see title-cards.mjs). Deterministic — the same card
 * resolves to the same filename and is not re-rendered.
 */
export async function renderTitleCard({
  lines = [],
  duration = 2,
  width = 1920,
  height = 1080,
  background = "black",
  fps = 30,
  logoUrl = null,
  logoWidth = 0.22,
  logoY = null,
  audioUrl = null,
} = {}) {
  const seconds = Math.min(MAX_SECONDS, Math.max(0.2, Number(duration) || 2));
  const filters = buildCardFilters(lines, { fontDir: FONT_DIR });

  /* The FILTER goes in the cache key, not just the card that produced it.
     Keying on `lines` alone means a change to how lines are laid out — a
     baseline fix, a tracking fix — silently returns yesterday's render
     forever, and the bug looks like the fix not working. */
  const name = `title-${hash({ filters, seconds, width, height, background, fps, logoUrl, logoWidth, logoY })}.mp4`;
  const out = join(MEDIA_DIR, name);
  const url = `/media/${name}`;
  await mkdir(MEDIA_DIR, { recursive: true });
  if (existsSync(out)) return { url, path: out, cached: true };

  const args = ["-f", "lavfi", "-i", `color=c=${background}:s=${width}x${height}:r=${fps}:d=${seconds}`];
  let logo = null;
  if (logoUrl) {
    logo = await resolveToDisk(logoUrl);
    args.push("-i", logo.path);
  }
  if (audioUrl) {
    const audio = await resolveToDisk(audioUrl, { maxBytes: 100 * 1024 * 1024 });
    args.push("-i", audio.path);
    logo = logo || null;
  }

  try {
    let graph;
    if (logo) {
      const { prepare, overlay } = logoFilters({ logoWidth, logoY: logoY || "(main_h-overlay_h)/2 - main_h*0.08" });
      graph = `${prepare};[0:v]${filters || "null"}[txt];[txt][logo]${overlay}[v]`;
    } else {
      graph = `[0:v]${filters || "null"}[v]`;
    }

    args.push("-filter_complex", graph, "-map", "[v]");
    if (audioUrl) args.push("-map", `${logo ? 2 : 1}:a`, "-c:a", "aac", "-b:a", "192k", "-shortest");
    args.push("-t", String(seconds), ...ENCODE, "-y", out);

    await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
    return { url, path: out, cached: false };
  } finally {
    if (logo?.temporary) await unlink(logo.path).catch(() => {});
  }
}

/**
 * The same type, burned over footage that already exists.
 *
 * This is how a section title sits on a shot rather than interrupting it —
 * "SHORT FILMS" over the last beat of the superhero sequence instead of a
 * black card between them, which is the difference between one film and
 * three demos joined end to end.
 */
export async function overlayTitles(videoUrl, {
  lines = [],
  logoUrl = null,
  logoWidth = 0.22,
  logoY = null,
  logoFade = null,
} = {}) {
  if (!videoUrl) throw new Error("Nothing to overlay onto.");
  const source = await resolveToDisk(videoUrl, { maxBytes: 500 * 1024 * 1024 });
  const filters = buildCardFilters(lines, { fontDir: FONT_DIR });

  const name = `titled-${hash({ videoUrl, filters, logoUrl, logoWidth, logoY, logoFade })}.mp4`;
  const out = join(MEDIA_DIR, name);
  const url = `/media/${name}`;
  await mkdir(MEDIA_DIR, { recursive: true });
  if (existsSync(out)) {
    if (source.temporary) await unlink(source.path).catch(() => {});
    return { url, path: out, cached: true };
  }

  const args = ["-i", source.path];
  let logo = null;
  if (logoUrl) {
    logo = await resolveToDisk(logoUrl);
    args.push("-i", logo.path);
  }

  try {
    const graph = logo
      ? (() => {
        const { prepare, overlay } = logoFilters({ logoWidth, logoY: logoY || "(main_h-overlay_h)/2", fade: logoFade });
        return `${prepare};[0:v]${filters || "null"}[txt];[txt][logo]${overlay}[v]`;
      })()
      : `[0:v]${filters || "null"}[v]`;

    args.push("-filter_complex", graph, "-map", "[v]");
    // The source's audio is carried through untouched when it has any — a
    // title must never cost the shot its sound.
    args.push("-map", "0:a?", "-c:a", "copy", ...ENCODE, "-y", out);

    await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
    return { url, path: out, cached: false };
  } finally {
    if (source.temporary) await unlink(source.path).catch(() => {});
    if (logo?.temporary) await unlink(logo.path).catch(() => {});
  }
}
