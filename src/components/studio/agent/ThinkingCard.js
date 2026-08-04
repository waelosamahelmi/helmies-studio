"use client";

import { useEffect, useState } from "react";
import { clock } from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   THINKING CARD — the agent's working state (EDITSv1 E3.3)
   ──────────────────────────────────────────────────────────────────────────
   Replaces the bare "Thinking…" line: an animated filament-glow border, a
   real elapsed clock (same pattern as Stage.js's useElapsed), a stage label
   ("Thinking" / "Planning" / "Working out costs"), and an expandable
   "What the agent is considering" — stage words and step names only, never
   chain-of-thought.
   ══════════════════════════════════════════════════════════════════════════ */

const STAGE_LABEL = {
  thinking: "Thinking",
  planning: "Planning",
  costing: "Working out costs",
  running: "Working",
};

function useElapsed(active) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) { setS(0); return; }
    setS(0);
    const t0 = Date.now();
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return s;
}

export default function ThinkingCard({ stage = "thinking", considerations = [] }) {
  const elapsed = useElapsed(true);
  const label = STAGE_LABEL[stage] || STAGE_LABEL.thinking;
  const items = (considerations || []).filter(Boolean);

  return (
    <section className="st-thinking hs-glow" role="status" aria-live="polite" aria-label={`${label}, ${clock(elapsed)} elapsed`}>
      <div className="st-thinking__head">
        <span className="hs-spin" style={{ width: 13, height: 13 }} aria-hidden="true" />
        <span className="st-thinking__stage">{label}</span>
        <span className="st-thinking__clock hs-mono">{clock(elapsed)}</span>
      </div>

      {items.length > 0 && (
        <details className="st-thinking__more">
          <summary>What the agent is considering</summary>
          <ul>
            {items.map((item, i) => (
              <li key={`${item}-${i}`}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
