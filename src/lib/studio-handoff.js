"use client";

/* ══════════════════════════════════════════════════════════════════════════
   STUDIO HANDOFF — send a result into another tool
   ──────────────────────────────────────────────────────────────────────────
   Before this, finishing an image and wanting to animate it meant:
   download the file, switch tools, re-upload it. The studio had a designed
   hook for the missing half — Stage's `actions` prop — that no tool ever
   passed, so every result was a dead end.

   Why sessionStorage and not the URL: the payload is a media URL plus the
   originating prompt, which is far past what belongs in a query string, and
   a stale link should not resurrect a handoff days later. The URL still
   carries the SIGNAL (`?from=handoff`) so the target tool knows to look,
   which keeps the deep-link semantics the rest of the studio already uses
   (see useStudioMode).

   One slot, not a queue: a handoff is a hand-to-hand pass, and the target
   consumes it on arrival. Leaving it behind would re-apply the same asset
   every time the user returned to that tool.
   ══════════════════════════════════════════════════════════════════════════ */

export const HANDOFF_KEY = "helmies.studio.handoff";
export const HANDOFF_PARAM = "from";
export const HANDOFF_VALUE = "handoff";

/** Which studio can accept which kind of media, and what it does with it. */
export const HANDOFF_TARGETS = {
  image: [
    { tool: "video", mode: "i2v", label: "Animate", hint: "Turn this still into motion" },
    { tool: "perform", mode: "lipsync", label: "Make it talk", hint: "Add a voice and lip sync" },
    { tool: "video", mode: "cast", label: "Cast in a shot", hint: "Keep this likeness across new shots" },
    { tool: "image", mode: "edit", label: "Edit", hint: "Re-render with a change" },
    { tool: "image", mode: "upscale", label: "Upscale", hint: "Raise the resolution" },
  ],
  video: [
    { tool: "perform", mode: "lipsync", label: "Lip sync", hint: "Match a voice to this footage" },
    { tool: "video", mode: "edit", label: "Edit", hint: "Restyle or extend this clip" },
    { tool: "video", mode: "clips", label: "Cut clips", hint: "Pull the moments out" },
  ],
  audio: [
    { tool: "perform", mode: "lipsync", label: "Lip sync", hint: "Drive a performance with this audio" },
  ],
};

const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i;

/** Classify a result URL. Mirrors the same checks Stage uses to render it. */
export function mediaKind(url) {
  if (typeof url !== "string") return null;
  if (VIDEO_RE.test(url) || url.includes("/video/")) return "video";
  if (AUDIO_RE.test(url)) return "audio";
  return "image";
}

export function targetsFor(url) {
  return HANDOFF_TARGETS[mediaKind(url)] || [];
}

/** Build the href a handoff button navigates to. */
export function handoffHref({ tool, mode }) {
  const q = new URLSearchParams({ [HANDOFF_PARAM]: HANDOFF_VALUE });
  if (mode) q.set("mode", mode);
  return `/studio/${tool}?${q}`;
}

export function putHandoff(payload) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* private mode — the navigation still happens, the target just starts
       empty rather than pre-filled */
  }
}

/**
 * Read and CLEAR the pending handoff. Returns null when there is none, so a
 * tool can call this unconditionally on mount.
 */
export function takeHandoff() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(HANDOFF_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
