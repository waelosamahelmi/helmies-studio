"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/* ══════════════════════════════════════════════════════════════════════════
   S1 — mode state lives in the URL
   ──────────────────────────────────────────────────────────────────────────
   The consolidated studios (Image, Video, Audio, Perform) each carry several
   modes. The active mode — and, where a mode has preset flavours, the active
   preset — is read from `?mode=` / `?preset=` so a link to a mode is a link
   anyone can open, and the legacy-slug redirects
   (`/studio/cinema` → `/studio/image?mode=create&preset=cinematic`) land on
   exactly the surface they name.

   `router.replace` on purpose: switching modes is a view change inside one
   tool, not a navigation the back button should retrace click by click.
   Every other query param (template, model) is preserved, so a template
   deep-link that also names a mode keeps both.

   Isolation contract (same one StudioClient's ErrorBoundary keys by tool):
   each studio keys its mode body by the mode, so one mode's state never
   bleeds into another. A generation submitted before the switch keeps
   running server-side — the shell's running-jobs counter and the gallery
   track it — but the in-page progress view belongs to the mode it started
   in, exactly as it already belongs to the tool it started in.
   ══════════════════════════════════════════════════════════════════════════ */
export function useStudioMode({ modes, fallback, presets = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const rawMode = params.get("mode");
  const mode = rawMode && modes.includes(rawMode) ? rawMode : fallback;

  const rawPreset = params.get("preset");
  const preset = rawPreset && (!presets || presets.includes(rawPreset)) ? rawPreset : null;

  const go = useCallback((nextMode, nextPreset = null) => {
    const q = new URLSearchParams(params.toString());
    q.set("mode", nextMode);
    if (nextPreset) q.set("preset", nextPreset);
    else q.delete("preset");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  /* Changing mode drops the preset — presets are per-mode flavours. */
  const setMode = useCallback((m) => go(m, null), [go]);
  const setPreset = useCallback((p) => go(mode, p), [go, mode]);

  return { mode, preset, setMode, setPreset };
}
