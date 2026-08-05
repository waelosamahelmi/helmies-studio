"use client";

import { Segmented } from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   S1 — the mode strip every consolidated studio wears
   ──────────────────────────────────────────────────────────────────────────
   One thin bar above the mode body: the kit's Segmented (so the 44px
   coarse-pointer floor in system.css applies to these buttons untouched),
   scrolling horizontally when the labels outgrow a phone rather than
   wrapping into the work area. The strip itself never owns state — the mode
   comes from the URL via useStudioMode.
   ══════════════════════════════════════════════════════════════════════════ */
export default function ModeBar({ label, value, onChange, options }) {
  return (
    <div className="st-modes">
      <Segmented label={label} value={value} onChange={onChange} options={options} />
    </div>
  );
}
