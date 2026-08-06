// ── Last-frame chaining for multi-clip productions (2026-08-06) ─────────────
// Owner defect: in a multi-scene ad/film every clip looked different —
// characters, products and environments drifted between scenes. Fix: each
// clip after the first uses the PREVIOUS clip's LAST FRAME as its first-frame
// reference, so the cut carries the character, the product and the room
// forward instead of regenerating them from a prompt alone.
//
// The chain is a consistency ENHANCEMENT, never a run-blocker: every failure
// path (ffmpeg missing, a provider URL that can't be fetched, a frame that
// won't encode) degrades to "run the step as planned". Plain-node safe
// (imported from agents.js, which runs under both Next and scripts/worker.mjs
// contexts via the same relative-import rule as the rest of src/lib).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDriver } from "./storage/index.js";

const execFileAsync = promisify(execFile);

const isVideoUrl = (u) => typeof u === "string" && (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes("/video/"));

// Extract the LAST frame of a video URL as a stored PNG; returns the stored
// URL, or null on ANY failure (chaining is best-effort by contract).
export async function extractLastFrame(videoUrl) {
  if (!isVideoUrl(videoUrl)) return null;
  let dir = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "hs-frame-"));
    const out = join(dir, "last.png");
    // -sseof seeks from the END of the stream; -0.1s lands past the final
    // keyframe at the last decodable frame, which is what continuity needs.
    await execFileAsync("ffmpeg", ["-sseof", "-0.1", "-i", videoUrl, "-vframes", "1", "-y", out], {
      timeout: 90000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const buffer = await readFile(out);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const key = `${sha256.slice(0, 16)}-${randomUUID().slice(0, 8)}.png`;
    const driver = getDriver();
    const { url } = await driver.putObject(key, buffer, "image/png");
    return url;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// A step that already carries its own visual reference keeps it (the first
// clip's scene still, an explicit user choice) — the chain only fills the
// gap where the step has NO reference of its own.
export function stepHasOwnReference(step) {
  const p = step?.params || {};
  return !!(p.image_url || p.images_list?.length || p.videos_list?.length
    || p.first_frame_url || p.first_frame_image_url || p.input_urls?.length || p.video_urls?.length);
}

// Wire the chain into a video step: when the step has no reference of its
// own and a previous clip's last frame exists, that frame becomes the step's
// first-frame reference (image_url → the family's i2v/first-frame path).
export function applyChainFrame(step, chainFrame) {
  if (!chainFrame || !step || stepHasOwnReference(step)) return step;
  return { ...step, params: { ...(step.params || {}), image_url: chainFrame } };
}

// Shared by the run loop and the per-step review path: find the NEWEST
// previous video output, extract its last frame (best-effort), and apply it
// to the step. Returns the step unchanged when there is nothing to chain.
export async function chainStepIfNeeded(step, previousOutputs) {
  const kind = String(step?.agent || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (kind !== "video" && kind !== "i2v") return step;
  if (stepHasOwnReference(step)) return step;
  const lastVideo = [...(Array.isArray(previousOutputs) ? previousOutputs : [])]
    .reverse().find((o) => isVideoUrl(o));
  if (!lastVideo) return step;
  const frame = await extractLastFrame(lastVideo);
  if (!frame) return step;
  return applyChainFrame(step, frame);
}
