"use client";

/* ══════════════════════════════════════════════════════════════════════════
   STUDIO PREFERENCES — the defaults you set once
   ──────────────────────────────────────────────────────────────────────────
   Settings has offered "Generation defaults" (control mode, quality, aspect
   ratio) for a while, complete with a Saved badge and the promise that it
   "applies to every studio". It never did: the values were written to
   localStorage and NO studio component read them back — the whole panel was
   inert. `MODE_KEYS` even wrote to keys named for tools that no longer
   exist (cinema, vibe-motion, recast).

   This is the read side that was missing. A preference is only honoured
   when the studio has nothing more specific to go on: an explicit choice,
   a template, or a handoff always wins — a default is a starting point,
   never an override of something the user or a template just asked for.
   ══════════════════════════════════════════════════════════════════════════ */

export const PREFS_KEY = "helmies.studio.defaults";

const canStore = () => typeof window !== "undefined";

export function readPrefs() {
  if (!canStore()) return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writePrefs(next) {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch { /* private mode or quota — the session still works */ }
}

/**
 * The preferred aspect ratio, but only when the model actually offers it.
 * Returns null when there is no usable preference, so a caller can keep
 * whatever it was going to use.
 */
export function preferredRatio(available) {
  const want = readPrefs().ratio;
  if (!want || !Array.isArray(available)) return null;
  return available.includes(want) ? want : null;
}
