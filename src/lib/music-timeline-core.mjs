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
// range selector; `needsPrompt` shows the op's text field; `needsStyle`
// shows the style field for an op that REQUIRES style tags. Whole-track ops
// take the track's outputUrl as `audio_url` (translated to uploadUrl/
// audioUrl inside audio-payload-core, absolutized by the class-A fix).
export const TRACK_OPS = [
  { id: "upload-and-extend-audio", label: "Extend", needsRange: false, needsPrompt: true, hint: "Continues the track from the selected point (or its end)." },
  { id: "replace-section", label: "Replace section", needsRange: true, needsPrompt: true, hint: "Regenerates only the selected 6–60s window." },
  { id: "upload-and-cover-audio", label: "Cover", needsRange: false, needsPrompt: true, hint: "Reinterprets the whole track in a new style." },
  { id: "add-vocals", label: "Add vocals", needsRange: false, needsPrompt: true, needsStyle: true, hint: "Writes and performs a vocal over the whole track." },
  { id: "add-instrumental", label: "Add instrumental", needsRange: false, needsPrompt: false, needsStyle: true, hint: "Builds an instrumental around the whole track." },
  { id: "separate-vocals", label: "Separate vocals", needsRange: false, needsPrompt: false, needsStem: true, hint: "Splits the track into stems." },
];

/* How far separate-vocals splits. The three modes are three PRICES at the
   provider (10 / 20 / 50 KIE credits — kie-price-schedules.mjs), so the
   choice is the user's and it travels with the quote. Cheapest first; it is
   also the model's own default. */
export const STEM_TYPES = [
  { value: "separate_vocal", label: "Vocal + instrumental" },
  { value: "split_stem_advanced", label: "Main stems" },
  { value: "split_stem", label: "Every stem" },
];

/* add-vocals and add-instrumental REQUIRE title, style and negative_tags
   (schema-required, and the provider 422s a null negativeTags). Neither
   surface sent all three: production history is 0 of 5. A title and the
   tags to avoid have honest defaults — the track's own name, and the two
   things nobody wants. A STYLE does not: it is what the result sounds like,
   so it is taken from what the user wrote or what the source track was made
   with, and when there is neither the op says so (opIssue) instead of
   sending a style nobody chose. */
export const DEFAULT_NEGATIVE_TAGS = "low quality, distortion";

export function trackTitle(track) {
  const t = track?.params?.title;
  if (typeof t === "string" && t.trim()) return t.trim().slice(0, 100);
  const named = String(track?.name || "").replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  if (named) return named.slice(0, 100);
  const p = String(track?.prompt || "").trim();
  return p.length > 60 ? `${p.slice(0, 60)}…` : p || "Untitled track";
}

function styleFor(style, track, fallback = "") {
  const own = String(style || "").trim();
  if (own) return own;
  const inherited = track?.params?.style;
  if (typeof inherited === "string" && inherited.trim()) return inherited.trim();
  return String(fallback || "").trim();
}

/**
 * The exact params one op submits (and quotes — same object both sides).
 * ONE builder for both surfaces that offer these operations: the Music
 * timeline (a track from history) and Audio Tools (a file just attached,
 * passed as `{ outputUrl, name }`). They used to build two different shapes
 * for the same model. Field names are the schema's (snake_case) — a
 * camelCase spelling sails past validateModelInput undeclared, so a
 * required `infill_start_s` would read as missing.
 */
export function opParams(opId, { track, range, duration, prompt, style, title, stemType } = {}) {
  const base = { audio_url: track?.outputUrl || "" };
  const text = (prompt || "").trim();
  const named = (title || "").trim() || trackTitle(track);
  switch (opId) {
    case "upload-and-extend-audio": {
      const continueAt = continueAtFor(range, duration);
      return {
        ...base,
        // 0 means "no length known" (Audio Tools has no timeline): the op then
        // extends with the provider's defaults rather than from second zero.
        ...(continueAt > 0 ? { continue_at: continueAt } : {}),
        ...(text ? { prompt: text } : {}),
        ...(style ? { style } : {}),
        ...(title ? { title } : {}),
      };
    }
    case "replace-section": {
      const w = replaceWindow(range, duration);
      const tags = styleFor(style, track);
      return {
        ...base,
        infill_start_s: w.infillStartS,
        infill_end_s: w.infillEndS,
        ...(text ? { prompt: text, full_lyrics: text } : {}),
        ...(tags ? { style: tags } : {}),
        title: named,
      };
    }
    case "upload-and-cover-audio":
      return { ...base, ...(text ? { prompt: text } : {}), ...(style ? { style } : {}), ...(title ? { title } : {}) };
    case "add-vocals": {
      const tags = styleFor(style, track);
      return {
        ...base,
        ...(text ? { prompt: text } : {}),
        ...(tags ? { style: tags } : {}),
        title: named,
        negative_tags: DEFAULT_NEGATIVE_TAGS,
      };
    }
    case "add-instrumental": {
      // No separate brief on this op: what the user typed IS the style.
      const tags = styleFor(style, track, text);
      return { ...base, ...(tags ? { style: tags } : {}), title: named, negative_tags: DEFAULT_NEGATIVE_TAGS };
    }
    case "separate-vocals":
      return { ...base, type: STEM_TYPES.some((t) => t.value === stemType) ? stemType : STEM_TYPES[0].value };
    default:
      return base;
  }
}

/** Why this op cannot run yet, as a sentence — or null. Checked before the
    submit so a missing required field is a hint, not a 422 after a quote. */
export function opIssue(opId, params = {}) {
  if (!params.audio_url) return "Add the track first.";
  if ((opId === "add-vocals" || opId === "upload-and-cover-audio" || opId === "replace-section") && !params.prompt) {
    return "Describe what to generate.";
  }
  if ((opId === "add-vocals" || opId === "add-instrumental") && !params.style) {
    return "Name the style — a few tags like “warm lo-fi, brushed drums”.";
  }
  return null;
}
