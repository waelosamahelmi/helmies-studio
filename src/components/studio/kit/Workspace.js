"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { IcSettings, IcInfo } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   WORKSPACE — the stage-first, three-pane archetype
   ──────────────────────────────────────────────────────────────────────────
   Used by the tools whose job is "set parameters → render one output":
   image, video, cinema, motion, video-edit, recast, marketing, influencer.

   Tools with a different craft (director, canvas, clipping, audio, library,
   agent, workflows) do NOT use this — they compose their own layout from
   the kit. That is deliberate: forcing every tool into three panes is what
   made the old build feel generic.

   One component tree at every width. Below 900px the two side panes become
   sheets; nothing re-mounts, so state and in-flight work survive a resize.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Workspace({
  controls,
  inspector,
  children,
  controlsLabel = "Settings",
  inspectorLabel = "Model",
}) {
  const [open, setOpen] = useState(null); // null | "controls" | "inspector"

  const hasInspector = !!inspector;

  return (
    <div className={`st-work${hasInspector ? "" : " st-work--no-inspector"}`}>
      {controls && (
        <aside className="st-work__controls" aria-label={controlsLabel}>
          {controls}
        </aside>
      )}

      <div className="st-work__center">
        {children}

        {/* Below 900px the panes are reachable from here */}
        {(controls || inspector) && (
          <div className="st-panel-tabs">
            {controls && (
              <button type="button" className="hs-btn hs-btn--sm" onClick={() => setOpen("controls")}>
                <IcSettings className="hs-icon-sm" /> {controlsLabel}
              </button>
            )}
            {inspector && (
              <button type="button" className="hs-btn hs-btn--sm" onClick={() => setOpen("inspector")}>
                <IcInfo className="hs-icon-sm" /> {inspectorLabel}
              </button>
            )}
          </div>
        )}
      </div>

      {hasInspector && (
        <aside className="st-work__inspector" aria-label={inspectorLabel}>
          {inspector}
        </aside>
      )}

      <Sheet open={open === "controls"} onClose={() => setOpen(null)} title={controlsLabel}>
        {controls}
      </Sheet>
      <Sheet open={open === "inspector"} onClose={() => setOpen(null)} title={inspectorLabel}>
        {inspector}
      </Sheet>
    </div>
  );
}
