"use client";

import { SpendMeter } from "./Spend";
import { IcBolt, IcClose } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   COMMIT — the action dock for work that has no brief to write
   ──────────────────────────────────────────────────────────────────────────
   <Brief> owns the bottom dock for every studio where the user types a
   prompt. But five surfaces commit work WITHOUT a prompt — upscaling a
   still, recasting footage, cutting clips, running a workflow, shooting a
   board — and each had hand-rolled the same meter-plus-button row.

   They drifted, as copies do. The costliest drift was positional: Clipping
   put its primary action at the bottom of the left control rail as a
   full-width block button, so switching Video → Clips moved the "go" button
   across the screen. This renders in the same place, at the same size, with
   the same cost badge and the same working/cancel behaviour as every
   prompted studio.

   The dock chrome is shared; what sits ABOVE it is not. `children` is for
   the controls a surface needs inline (a job picker, a clip count), which
   is why this is a dock rather than a button.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Commit({
  onSubmit,
  onCancel,

  cost = 0,
  balance = null,
  affordable = true,
  shortfall = 0,
  meterLabel = "Cost",

  generating = false,
  stage,
  /** Why the action cannot run yet — shown as the button's title, so the
      user is told what is missing instead of meeting a dead control. */
  blocked = "",
  disabled = false,

  submitLabel = "Generate",
  children = null,
}) {
  const ready = !generating && !disabled && !blocked && affordable;

  return (
    <div className="st-dock-prompt">
      {children}

      <div className="st-spend">
        <SpendMeter
          cost={cost}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          label={meterLabel}
        />

        {generating ? (
          <button type="button" className="hs-btn hs-btn--outline hs-btn--lg" onClick={onCancel} disabled={!onCancel}>
            <span className="hs-spin" />
            {stage ? String(stage).replace(/_/g, " ") : "Working"}
            {onCancel && <IcClose className="hs-icon-sm" />}
          </button>
        ) : (
          <button
            type="button"
            className="hs-btn hs-btn--primary hs-btn--lg"
            onClick={onSubmit}
            disabled={!ready}
            title={blocked || (!affordable ? "Not enough credits" : submitLabel)}
          >
            <IcBolt className="hs-icon-sm" />
            {submitLabel}
            {cost > 0 && <span className="hs-btn__cost">{cost}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
