// Helmies Studio — the last mile, from clips to a film.
//
// assembleVideos joins clips end to end and stops there, which is the right
// division of labour and is also not a finished piece of work. A launch film
// is a fixed length because somebody bought twenty-five seconds; it has one
// piece of music running underneath rather than each clip's own room tone;
// and the music has to END with the picture instead of being cut off
// mid-phrase.
//
// This is that step. It takes an assembled cut and a track and produces the
// thing you would actually publish:
//
//   - stretched or trimmed to an EXACT runtime, by trimming the tail and
//     never by speeding anything up (a 4% speed change is inaudible in music
//     and immediately visible in a face)
//   - the music mixed under whatever audio the clips carry, ducked so
//     dialogue stays intelligible
//   - a clean fade at both ends, so nothing starts or stops with a click
//   - loudness-normalised, so it sits at broadcast level rather than
//     wherever the model happened to render it
//
// No provider, no credits — ffmpeg over media already paid for, which also
// means it is safe to redo until the cut is right.
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { validateOutboundUrl } from "./net-allowlist.js";
import { beatGrid, snapToBeat } from "./title-cards.mjs";

const execFileAsync = promisify(execFile);
const MEDIA_DIR = join(process.cwd(), "public", "media");
const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

const MAX_SECONDS = 900;
const MAX_BYTES = 500 * 1024 * 1024;

const hash = (o) => createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 16);

async function toDisk(url) {
  const local = /^(?:\/api\/media\/local\/|\/uploads\/)([\w.-]+)$/.exec(url || "");
  if (local && !local[1].startsWith(".")) {
    const path = join(UPLOADS_DIR, local[1]);
    if (existsSync(path)) return { path, temporary: false };
  }
  const media = /^\/media\/([\w.-]+)$/.exec(url || "");
  if (media && !media[1].startsWith(".")) {
    const path = join(MEDIA_DIR, media[1]);
    if (existsSync(path)) return { path, temporary: false };
  }
  const check = await validateOutboundUrl(url, { allowSelf: true });
  if (!check?.ok && check !== undefined && check.ok === false) throw new Error(`Refusing to fetch URL: ${check.error}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("That file is too large to mix.");
  await mkdir(MEDIA_DIR, { recursive: true });
  const path = join(MEDIA_DIR, `mix-${hash(url)}`);
  await writeFile(path, buf);
  return { path, temporary: true };
}

/** Seconds of media at `path`, or null. */
export async function mediaSeconds(path) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", path,
    ]);
    const n = Number(String(stdout).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Does this file carry an audio stream at all? */
export async function hasAudio(path) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
      "-of", "csv=p=0", path,
    ]);
    return Boolean(String(stdout).trim());
  } catch {
    return false;
  }
}

/**
 * The audio graph, as a pure string — unit-tested without ffmpeg.
 *
 * Two shapes, because a cut whose clips are silent must not have a silent
 * track mixed into it: amix with a missing input does not fail, it halves
 * the level of the one that is there, and the result is a film that is
 * quietly and inexplicably too soft.
 */
export function buildAudioGraph({ hasClipAudio, musicIndex, seconds, musicGain = 0.35, fadeOut = 1.2, duckDialogue = true }) {
  const end = Math.max(0.5, Number(seconds) || 0);
  const fo = Math.max(0, Math.min(Number(fadeOut) || 0, end / 2));
  const music = [
    `[${musicIndex}:a]atrim=0:${end.toFixed(3)},asetpts=N/SR/TB`,
    `afade=t=in:st=0:d=0.6`,
    `afade=t=out:st=${(end - fo).toFixed(3)}:d=${fo.toFixed(3)}`,
    `volume=${musicGain}`,
  ].join(",");

  if (!hasClipAudio) {
    // Music alone still gets loudness-normalised, so a scored montage and a
    // dialogue scene arrive at the same level.
    return `${music},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
  }

  /* sidechaincompress ducks the music under whatever the clips are saying.
     Without it the score and the dialogue fight, and the fix people reach
     for — turning the music down everywhere — makes the quiet passages
     limp. */
  const ducked = duckDialogue
    ? `[music][clipsplit1]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=380[ducked];[ducked][clipsplit2]amix=inputs=2:duration=first:dropout_transition=0`
    : `[music][clipsplit1]amix=inputs=2:duration=first:dropout_transition=0`;

  return [
    `${music}[music]`,
    `[0:a]asplit=2[clipsplit1][clipsplit2]`,
    ducked,
    `,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`,
  ].join(";").replace(";,", ",");
}

/**
 * Where the cuts should fall so the film moves with the music.
 *
 * Given the clips' natural durations and a tempo, this returns the
 * cumulative cut points snapped to the nearest beat. It never reorders and
 * never drops a clip — it nudges each boundary by a fraction of a second,
 * which is the difference between a film that feels edited and one that
 * feels assembled.
 *
 * Pure, so the arithmetic can be checked without rendering anything.
 */
export function beatAlignedCuts(durations = [], { bpm = 0, offset = 0, maxNudge = 0.35 } = {}) {
  const list = (Array.isArray(durations) ? durations : []).map((d) => Math.max(0.1, Number(d) || 0));
  if (!list.length) return [];
  const total = list.reduce((a, b) => a + b, 0);
  if (!bpm || bpm <= 0) {
    // No tempo: the cuts are simply where the clips end.
    const plain = [];
    let t = 0;
    for (const d of list) { t += d; plain.push(Number(t.toFixed(3))); }
    return plain;
  }

  const grid = beatGrid({ bpm, offset, from: 0, to: total + 4 });
  const out = [];
  let running = 0;
  for (let i = 0; i < list.length; i++) {
    running += list[i];
    if (i === list.length - 1) { out.push(Number(running.toFixed(3))); break; }
    const snapped = snapToBeat(running, grid);
    // A cut is nudged, never dragged: a clip shortened by a second to reach
    // a beat has lost its ending, and that is worse than being slightly off.
    const use = Math.abs(snapped - running) <= maxNudge && snapped > (out[out.length - 1] ?? 0) + 0.4
      ? snapped
      : running;
    out.push(Number(use.toFixed(3)));
    running = use;
  }
  return out;
}

/**
 * Finish a cut: exact length, music under it, level set.
 *
 * `videoUrl` is an assembled cut (what the assembly step produced).
 * `musicUrl` is the score. `seconds` is the runtime the brief asked for —
 * omitted, the cut keeps its own length and simply gains the music.
 */
export async function renderFinalCut({
  videoUrl,
  musicUrl = null,
  seconds = null,
  musicGain = 0.35,
  fadeOut = 1.2,
  fadeFromBlack = 0.4,
  duckDialogue = true,
} = {}) {
  if (!videoUrl) throw new Error("There is no cut to finish.");

  const video = await toDisk(videoUrl);
  const music = musicUrl ? await toDisk(musicUrl) : null;

  try {
    const natural = await mediaSeconds(video.path);
    const target = Math.min(
      MAX_SECONDS,
      Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? Number(seconds) : (natural || 0),
    );
    if (!target) throw new Error("The cut's length could not be determined.");

    const name = `final-${hash({ videoUrl, musicUrl, target, musicGain, fadeOut, fadeFromBlack, duckDialogue })}.mp4`;
    const out = join(MEDIA_DIR, name);
    await mkdir(MEDIA_DIR, { recursive: true });
    if (existsSync(out)) return { url: `/media/${name}`, path: out, seconds: target, cached: true };

    const clipAudio = await hasAudio(video.path);
    const fi = Math.max(0, Math.min(Number(fadeFromBlack) || 0, target / 4));
    const fo = Math.max(0, Math.min(Number(fadeOut) || 0, target / 4));

    const videoChain = [
      `[0:v]trim=0:${target.toFixed(3)}`,
      "setpts=N/FRAME_RATE/TB",
      ...(fi > 0 ? [`fade=t=in:st=0:d=${fi.toFixed(3)}`] : []),
      ...(fo > 0 ? [`fade=t=out:st=${(target - fo).toFixed(3)}:d=${fo.toFixed(3)}`] : []),
      "[vout]",
    ].join(",").replace(",[vout]", "[vout]");

    const args = ["-i", video.path];
    if (music) args.push("-stream_loop", "-1", "-i", music.path);

    const graphs = [videoChain];
    let audioLabel = null;
    if (music) {
      graphs.push(buildAudioGraph({ hasClipAudio: clipAudio, musicIndex: 1, seconds: target, musicGain, fadeOut: fo, duckDialogue }));
      audioLabel = "[aout]";
    } else if (clipAudio) {
      graphs.push(`[0:a]atrim=0:${target.toFixed(3)},asetpts=N/SR/TB,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
      audioLabel = "[aout]";
    }

    args.push("-filter_complex", graphs.join(";"), "-map", "[vout]");
    if (audioLabel) args.push("-map", audioLabel, "-c:a", "aac", "-b:a", "192k");
    args.push(
      "-t", target.toFixed(3),
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-y", out,
    );

    await execFileAsync("ffmpeg", args, { maxBuffer: 32 * 1024 * 1024 });
    return { url: `/media/${name}`, path: out, seconds: target, cached: false };
  } finally {
    if (video.temporary) await unlink(video.path).catch(() => {});
    if (music?.temporary) await unlink(music.path).catch(() => {});
  }
}
