// S2 — Music timeline range math. Pure functions, dependency-light (only
// audio-payload-core, itself dependency-free) so the timeline's arithmetic
// is unit-testable without a DOM: the component translates pointer/keyboard
// events into calls here and renders whatever comes back.
import { audioProviderFamily, AUDIO_FAMILY } from "./audio-payload-core.mjs";

// The narrowest selectable range. Suno's replace-section has its own harder
// floor (6s, see replaceWindowIssue) — this is the timeline's, so a grip
// can never cross its partner.
export const MIN_RANGE_S = 1;

export function clampTime(t, duration) {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const v = Number.isFinite(t) ? t : 0;
  return Math.min(d, Math.max(0, v));
}

/** Ratio (0..1 along the bar) → seconds. */
export function timeAtRatio(ratio, duration) {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return clampTime(r * (duration || 0), duration);
}

/** A fresh whole-track selection for a newly loaded track. */
export function fullRange(duration) {
  return { start: 0, end: clampTime(duration, duration) };
}

/** Order + clamp + enforce the minimum span (end yields to start). */
export function normalizeRange(range, duration, min = MIN_RANGE_S) {
  let start = clampTime(Math.min(range?.start ?? 0, range?.end ?? 0), duration);
  let end = clampTime(Math.max(range?.start ?? 0, range?.end ?? 0), duration);
  if (end - start < min) {
    end = clampTime(start + min, duration);
    if (end - start < min) start = Math.max(0, end - min);
  }
  return { start, end };
}

/**
 * Move one grip. The only hard bound besides the track edges is the OTHER
 * grip minus the minimum span — same contract as ClippingStudio's setEdge.
 */
export function moveRangeEdge(range, edge, value, duration, min = MIN_RANGE_S) {
  const v = clampTime(value, duration);
  if (edge === "l") {
    const limit = Math.max(0, (range?.end ?? duration) - min);
    return { start: Math.min(v, limit), end: range?.end ?? duration };
  }
  const floor = Math.min(duration, (range?.start ?? 0) + min);
  return { start: range?.start ?? 0, end: Math.max(v, floor) };
}

/**
 * Where an Extend continues from: the selected point (the range's start)
 * when the user has narrowed the selection, or the track's end when the
 * selection still covers the whole track (i.e. nothing was chosen).
 */
export function continueAtFor(range, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const r = normalizeRange(range || fullRange(duration), duration);
  const whole = r.start <= 0.05 && r.end >= duration - 0.05;
  return Math.round((whole ? duration : r.start) * 10) / 10;
}

/** The selected range as replace-section's infill window (rounded 0.1s). */
export function replaceWindow(range, duration) {
  const r = normalizeRange(range || fullRange(duration), duration);
  return {
    infillStartS: Math.round(r.start * 10) / 10,
    infillEndS: Math.round(r.end * 10) / 10,
  };
}

/**
 * replace-section's documented window rules (audio-music.md): 6–60 seconds,
 * and at most 50% of the track. Returns a human sentence naming the first
 * violated rule, or null when the window is legal — the UI disables the
 * submit and shows the sentence rather than firing a guaranteed 422.
 */
export function replaceWindowIssue(range, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return "Load the track first.";
  const r = normalizeRange(range || fullRange(duration), duration);
  const span = r.end - r.start;
  if (span < 6) return "The section to replace must be at least 6 seconds.";
  if (span > 60) return "The section to replace can be at most 60 seconds.";
  if (span > duration / 2) return "The section to replace can cover at most half the track.";
  return null;
}

// The Suno families whose results are TRACKS (playable audio that belongs
// in the track list). Text producers (lyrics, style) and the voice-clone
// steps are deliberately excluded.
const TRACK_FAMILIES = new Set([
  AUDIO_FAMILY.SUNO_MUSIC,
  AUDIO_FAMILY.SUNO_SOUNDS,
  AUDIO_FAMILY.SUNO_UPLOAD_COVER,
  AUDIO_FAMILY.SUNO_UPLOAD_EXTEND,
  AUDIO_FAMILY.SUNO_ADD_INSTRUMENTAL,
  AUDIO_FAMILY.SUNO_ADD_VOCALS,
  AUDIO_FAMILY.SUNO_VOCAL_SEPARATION,
  AUDIO_FAMILY.SUNO_REPLACE_SECTION,
]);

/** Does this Generation.model belong in the Music track list? */
export function isMusicTrackModel(modelId) {
  return TRACK_FAMILIES.has(audioProviderFamily(modelId));
}

// The operations the timeline offers on a selected track. `id` is the REAL
// catalog model id each submit and quote uses; `needsRange` gates on the
// range selector; `needsPrompt` shows the op's text field. Whole-track ops
// take the track's outputUrl as `audio_url` (translated to uploadUrl/
// audioUrl inside audio-payload-core, absolutized by the class-A fix).
export const TRACK_OPS = [
  { id: "upload-and-extend-audio", label: "Extend", needsRange: false, needsPrompt: true, hint: "Continues the track from the selected point (or its end)." },
  { id: "replace-section", label: "Replace section", needsRange: true, needsPrompt: true, hint: "Regenerates only the selected 6–60s window." },
  { id: "upload-and-cover-audio", label: "Cover", needsRange: false, needsPrompt: true, hint: "Reinterprets the whole track in a new style." },
  { id: "add-vocals", label: "Add vocals", needsRange: false, needsPrompt: true, hint: "Writes and performs a vocal over the whole track." },
  { id: "add-instrumental", label: "Add instrumental", needsRange: false, needsPrompt: false, hint: "Builds an instrumental around the whole track." },
  { id: "separate-vocals", label: "Separate vocals", needsRange: false, needsPrompt: false, hint: "Splits the track into vocal and instrumental stems." },
];

/**
 * The exact params one op submits (and quotes — same object both sides).
 * Only what each op genuinely uses is included; audio-payload-core's
 * whitelists own the wire spellings.
 */
export function opParams(opId, { track, range, duration, prompt, style, title } = {}) {
  const base = { audio_url: track?.outputUrl || "" };
  const text = (prompt || "").trim();
  switch (opId) {
    case "upload-and-extend-audio":
      return {
        ...base,
        continueAt: continueAtFor(range, duration),
        ...(text ? { prompt: text } : {}),
        ...(style ? { style } : {}),
        ...(title ? { title } : {}),
      };
    case "replace-section":
      return {
        ...base,
        ...replaceWindow(range, duration),
        ...(text ? { prompt: text } : {}),
        ...(style ? { tags: style } : {}),
        ...(title ? { title } : {}),
      };
    case "upload-and-cover-audio":
      return { ...base, ...(text ? { prompt: text } : {}), ...(style ? { style } : {}), ...(title ? { title } : {}) };
    case "add-vocals":
      return { ...base, ...(text ? { prompt: text } : {}), ...(style ? { style } : {}), ...(title ? { title } : {}) };
    case "add-instrumental":
      return { ...base, ...(style ? { style } : {}), ...(title ? { title } : {}) };
    case "separate-vocals":
      return base;
    default:
      return base;
  }
}
