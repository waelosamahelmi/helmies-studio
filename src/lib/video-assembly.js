import { execFile } from "child_process";
import { promisify } from "util";
import { createHash, randomBytes } from "crypto";
import { writeFile, mkdir, unlink, copyFile, rename } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
import { validateOutboundUrl } from "./net-allowlist.js";

const execFileAsync = promisify(execFile);
const MEDIA_DIR = join(process.cwd(), "public", "media");
const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

// Hard caps — this writes attacker-influenced bytes to local disk.
export const MAX_CLIPS = 40;
const MAX_BYTES_PER_CLIP = 500 * 1024 * 1024; // 500MB

// E4.4: the transitions assembly understands. Mirrors the plan-shape values
// (director-planner.js VALID_SHOT_TRANSITIONS).
export const VALID_ASSEMBLY_TRANSITIONS = ["cut", "fade", "dissolve"];

// Shared x264 output settings — one place, three uses (trim segments, cut
// concat, xfade render).
const ENCODE_VIDEO = ["-c:v", "libx264", "-preset", "fast", "-crf", "23"];
const ENCODE_AUDIO = ["-c:a", "aac", "-b:a", "128k"];
const OUTPUT_FLAGS = ["-movflags", "+faststart"];

async function ensureMediaDir() {
  if (!existsSync(MEDIA_DIR)) await mkdir(MEDIA_DIR, { recursive: true });
}

/* ══════════════════════════════════════════════════════════════════════════
   PURE ARG BUILDERS — unit-tested (tests/unit/video-assembly-args.test.mjs).
   Everything below returns an argv ARRAY consumed by execFile (never a shell
   string), and validates its numbers before ffmpeg is ever involved.
   ══════════════════════════════════════════════════════════════════════════ */

// One clip's -ss/-to re-encode. Output-side seeking: accurate, and -to keeps
// its absolute-timestamp meaning.
export function buildTrimArgs(inputPath, outputPath, { inSec = 0, outSec = null } = {}) {
  const start = Number(inSec ?? 0);
  if (!Number.isFinite(start) || start < 0) throw new Error("Invalid trim start");
  const end = outSec == null ? null : Number(outSec);
  if (end != null && (!Number.isFinite(end) || end <= start)) throw new Error("Invalid trim end");

  const args = ["-i", inputPath, "-ss", String(start)];
  if (end != null) args.push("-to", String(end));
  args.push(...ENCODE_VIDEO, ...ENCODE_AUDIO, ...OUTPUT_FLAGS, "-y", outputPath);
  return args;
}

// The filter_complex chain joining N clips: xfade for fade/dissolve
// boundaries, a concat node for cuts. Offset math: an xfade at boundary i
// starts `fadeDuration` before the current running output ends, and the
// running duration then grows by (clip - fadeDuration). Every input is
// normalized to a common fps/timebase first — xfade refuses mismatched ones.
// A fade that doesn't fully fit inside both adjoining clips degrades to a
// hard cut rather than failing the render.
export function buildTransitionGraph(durations, transitions = [], fadeDuration = 0.5) {
  if (!Array.isArray(durations) || durations.length < 2) {
    throw new Error("Need at least two clips for a transition graph");
  }
  for (const d of durations) {
    if (!Number.isFinite(d) || d <= 0) throw new Error("Invalid clip duration");
  }
  const fade = Number(fadeDuration);
  if (!Number.isFinite(fade) || fade <= 0 || fade > 5) throw new Error("Invalid transition duration");

  const parts = durations.map((_, i) => `[${i}:v]fps=30,settb=AVTB[p${i}]`);
  let cur = "[p0]";
  let running = durations[0];

  for (let i = 1; i < durations.length; i++) {
    const t = transitions[i - 1] || "cut";
    if (!VALID_ASSEMBLY_TRANSITIONS.includes(t)) throw new Error(`Invalid transition: ${t}`);
    const out = i === durations.length - 1 ? "[vout]" : `[vx${i}]`;
    const fits = t !== "cut" && fade <= running - 0.1 && fade <= durations[i] - 0.1;

    if (!fits) {
      parts.push(`${cur}[p${i}]concat=n=2:v=1:a=0${out}`);
      running += durations[i];
    } else {
      const kind = t === "dissolve" ? "dissolve" : "fade";
      const offset = Math.round((running - fade) * 1000) / 1000;
      parts.push(`${cur}[p${i}]xfade=transition=${kind}:duration=${fade}:offset=${offset}${out}`);
      running += durations[i] - fade;
    }
    cur = out;
  }

  return {
    filter: parts.join(";"),
    outLabel: cur,
    totalDuration: Math.round(running * 1000) / 1000,
  };
}

// Full argv for the transition render. Video-only (-an): generated clips
// carry no meaningful audio track, and xfade graphs with per-boundary audio
// crossfades would fail outright on silent inputs.
export function buildXfadeArgs(files, graph, outputPath) {
  const args = [];
  for (const f of files) args.push("-i", f);
  args.push(
    "-filter_complex", graph.filter,
    "-map", graph.outLabel,
    "-an",
    ...ENCODE_VIDEO,
    "-pix_fmt", "yuv420p",
    ...OUTPUT_FLAGS,
    "-y",
    outputPath,
  );
  return args;
}

// Normalize BOTH call shapes into { clips, transitions, transitionDuration }:
//   assembleVideos([url, url, ...], { transition?, transitionDuration? })
//   assembleVideos({ clips: [{url, inSec?, outSec?}], transitions: [...] }, { transitionDuration? })
// The legacy urls[] signature keeps working; its `transition` option — read
// and silently ignored for its entire life before E4.4 — is now honored
// (hard cut remains the default).
export function normalizeAssemblySpec(input, options = {}) {
  let clips;
  let transitions;

  if (Array.isArray(input)) {
    clips = input.map((url) => ({ url }));
    const t = options.transition;
    if (t && t !== "cut") {
      if (!VALID_ASSEMBLY_TRANSITIONS.includes(t)) throw new Error(`Invalid transition: ${t}`);
      transitions = Array(Math.max(0, clips.length - 1)).fill(t);
    } else {
      transitions = [];
    }
  } else if (input && Array.isArray(input.clips)) {
    clips = input.clips.map((c) => {
      if (typeof c === "string") return { url: c };
      const clip = { url: c?.url };
      if (c?.inSec != null) clip.inSec = c.inSec;
      if (c?.outSec != null) clip.outSec = c.outSec;
      return clip;
    });
    transitions = Array.isArray(input.transitions)
      ? input.transitions.slice(0, Math.max(0, clips.length - 1))
      : [];
  } else {
    throw new Error("No videos to assemble");
  }

  if (clips.length === 0) throw new Error("No videos to assemble");
  if (clips.length > MAX_CLIPS) throw new Error(`Too many clips (max ${MAX_CLIPS})`);

  for (const clip of clips) {
    if (!clip.url || typeof clip.url !== "string") throw new Error("Every clip needs a url");
    const start = clip.inSec == null ? null : Number(clip.inSec);
    const end = clip.outSec == null ? null : Number(clip.outSec);
    if (start != null && (!Number.isFinite(start) || start < 0)) throw new Error("Invalid trim start");
    if (end != null && (!Number.isFinite(end) || end <= (start ?? 0))) throw new Error("Invalid trim end");
  }
  for (const t of transitions) {
    if (!VALID_ASSEMBLY_TRANSITIONS.includes(t)) throw new Error(`Invalid transition: ${t}`);
  }

  const rawFade = Number(options.transitionDuration ?? 0.5);
  const transitionDuration = Number.isFinite(rawFade) ? Math.min(Math.max(rawFade, 0.1), 2) : 0.5;

  return { clips, transitions, transitionDuration };
}

/* ══════════════════════════════════════════════════════════════════════════
   IO
   ══════════════════════════════════════════════════════════════════════════ */

// "/api/media/local/<name>" is our own storage — resolve it straight to the
// file on disk (public/media, then public/uploads — the same two roots the
// serving route reads) instead of round-tripping through HTTP. Basename-
// sanitized: a crafted name can never escape those two directories.
export function resolveLocalMediaPath(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/^\/api\/media\/local\/([^/?#]+)/);
  if (!m) return null;
  const safeName = basename(decodeURIComponent(m[1]));
  for (const dir of [MEDIA_DIR, UPLOADS_DIR]) {
    const candidate = join(dir, safeName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function downloadToTemp(url) {
  // SSRF guard: only allowlisted provider hosts (plus our own origin).
  const check = await validateOutboundUrl(url, { allowSelf: true });
  if (!check.ok) throw new Error(`Refusing to fetch URL: ${check.error}`);

  const res = await fetch(check.parsed.toString(), { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);

  // Reject on the advertised length before buffering when the server gives it.
  const declared = parseInt(res.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_BYTES_PER_CLIP) {
    throw new Error("Clip too large");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES_PER_CLIP) throw new Error("Clip too large");

  const hash = createHash("sha256").update(url).digest("hex").slice(0, 8);
  const ext = check.parsed.pathname.match(/\.(mp4|webm|mov)$/i)?.[1]?.toLowerCase() || "mp4";
  const tmpPath = join(MEDIA_DIR, `_tmp_${hash}_${randomBytes(4).toString("hex")}.${ext}`);
  await writeFile(tmpPath, buffer);
  return tmpPath;
}

async function probeDurationSec(file) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { timeout: 60000 },
  );
  const d = parseFloat(String(stdout).trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error("Could not read clip duration");
  return d;
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════════════════ */

export async function assembleVideos(input, options = {}) {
  const spec = normalizeAssemblySpec(input, options);

  // Validate every remote URL up-front so nothing is written to disk if any
  // is bad; local media refs resolve to disk and never leave the machine.
  for (const clip of spec.clips) {
    if (resolveLocalMediaPath(clip.url)) continue;
    const check = await validateOutboundUrl(clip.url, { allowSelf: true });
    if (!check.ok) throw new Error(`Refusing to fetch URL: ${check.error}`);
  }

  await ensureMediaDir();

  const outputName = `assembled_${randomBytes(8).toString("hex")}.mp4`;
  const outputPath = join(MEDIA_DIR, outputName);

  // Files we created and must clean up. Local-media source files are NEVER
  // in this list — deleting a user's stored clip would destroy an original.
  const tempFiles = [];

  try {
    // 1. Materialize every clip on disk.
    const sources = []; // { path, owned }
    for (const clip of spec.clips) {
      const local = resolveLocalMediaPath(clip.url);
      if (local) {
        sources.push({ path: local, owned: false });
      } else {
        const tmp = await downloadToTemp(clip.url);
        tempFiles.push(tmp);
        sources.push({ path: tmp, owned: true });
      }
    }

    // 2. Per-clip trims → re-encoded segments.
    const segs = [];
    const durations = [];
    for (let i = 0; i < sources.length; i++) {
      const { inSec, outSec } = spec.clips[i];
      if (inSec != null || outSec != null) {
        const segPath = join(MEDIA_DIR, `_seg_${randomBytes(4).toString("hex")}.mp4`);
        const start = Number(inSec ?? 0);
        const end = outSec == null ? null : Number(outSec);
        await execFileAsync("ffmpeg", buildTrimArgs(sources[i].path, segPath, { inSec: start, outSec: end }), { timeout: 300000 });
        tempFiles.push(segPath);
        segs.push(segPath);
        durations.push(end != null ? end - start : null);
      } else {
        segs.push(sources[i].path);
        durations.push(null);
      }
    }

    // 3. Single clip: the "assembly" is that clip (post-trim) as a fresh output.
    if (segs.length === 1) {
      const only = segs[0];
      if (tempFiles.includes(only)) {
        await rename(only, outputPath);
        tempFiles.splice(tempFiles.indexOf(only), 1);
      } else {
        await copyFile(only, outputPath);
      }
      return `/api/media/local/${outputName}`;
    }

    const hasFade = spec.transitions.some((t) => t === "fade" || t === "dissolve");

    if (!hasFade) {
      // 4a. Hard cuts only — the concat demuxer path (audio preserved).
      const concatList = segs.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n");
      const listPath = join(MEDIA_DIR, `_concat_${randomBytes(4).toString("hex")}.txt`);
      await writeFile(listPath, concatList);
      tempFiles.push(listPath);

      const args = [
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        ...ENCODE_VIDEO,
        ...ENCODE_AUDIO,
        ...OUTPUT_FLAGS,
        "-y",
        outputPath,
      ];
      await execFileAsync("ffmpeg", args, { timeout: 300000 });
    } else {
      // 4b. Fades/dissolves — xfade filter graph over re-encoded segments.
      for (let i = 0; i < segs.length; i++) {
        if (durations[i] == null) durations[i] = await probeDurationSec(segs[i]);
      }
      const graph = buildTransitionGraph(durations, spec.transitions, spec.transitionDuration);
      await execFileAsync("ffmpeg", buildXfadeArgs(segs, graph, outputPath), { timeout: 600000 });
    }

    return `/api/media/local/${outputName}`;
  } finally {
    for (const f of tempFiles) {
      try { await unlink(f); } catch {}
    }
  }
}
