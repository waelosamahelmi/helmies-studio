"use client";

import { IcAlert, IcRefresh } from "@/components/studio/kit/Icons";

/* ══════════════════════════════════════════════════════════════════════════
   ERROR STATE
   ──────────────────────────────────────────────────────────────────────────
   For when a page's PRIMARY data failed to load — the fault-tinted
   `.hs-empty` mark + "Try again" button is byte-for-byte the same visual
   language as src/components/studio/kit/Stage.js's <Fault> (the studio's
   own "generation failed" state), just generalized beyond one tool. This is
   deliberately heavier than the small inline `.hs-notice--fault` banners
   used elsewhere (GalleryClient's queue-poll hiccup, AssetLibraryStudio's
   mutation errors) — those stay as they are, alongside content that DID
   load; this REPLACES content that didn't.
   ══════════════════════════════════════════════════════════════════════════ */
export default function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div className="hs-empty" role="alert">
      <span
        className="hs-empty__mark"
        style={{ color: "var(--fault)", borderColor: "rgba(255,90,90,.3)" }}
      >
        <IcAlert />
      </span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {onRetry && (
        <button
          type="button"
          className="hs-btn hs-btn--outline"
          onClick={onRetry}
          style={{ marginTop: "var(--s-2)" }}
        >
          <IcRefresh className="hs-icon-sm" /> Try again
        </button>
      )}
    </div>
  );
}
