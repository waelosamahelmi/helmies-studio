"use client";

import { SpendMeter } from "./Spend";
import { IcBolt, IcClose } from "./Icons";
import { clock } from "./Stage";

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
  /** Icon for the primary action. Workflows runs rather than generates. */
  icon = null,
  /** Seconds elapsed, shown inside the working button where a surface has
      no stage readout of its own. */
  elapsed = null,
  /** A failure to show above the meter, for surfaces with no Stage. */
  error = "",
  /** Sidebar layout: full-width buttons stacked in a control rail rather
      than the 2-column dock grid. */
  block = false,
  /** A line under the dock explaining why the action is blocked. */
  hint = "",
  children = null,
}) {
  const ready = !generating && !disabled && !blocked && affordable;
  const Icon = icon || IcBolt;

  const body = (
    <>
      {error && <p className="hs-notice hs-notice--fault" role="alert">{error}</p>}

      <div className={block ? "" : "st-spend"}>
        {!block && (
          <SpendMeter
            cost={cost}
            balance={balance}
            affordable={affordable}
            shortfall={shortfall}
            label={meterLabel}
          />
        )}

        {generating && onCancel ? (
          <button
            type="button"
            className={`hs-btn hs-btn--outline ${block ? "hs-btn--block" : "hs-btn--lg"}`}
            onClick={onCancel}
          >
            <span className="hs-spin" />
            {stage ? String(stage).replace(/_/g, " ") : "Working"}
            {elapsed != null && <span className="hs-mono" style={{ marginLeft: "auto" }}>{clock(elapsed)}</span>}
            {onCancel && <IcClose className="hs-icon-sm" />}
          </button>
        ) : (
          <button
            type="button"
            className={`hs-btn hs-btn--primary ${block ? "hs-btn--block" : "hs-btn--lg"}`}
            onClick={onSubmit}
            disabled={!ready}
            title={blocked || (!affordable ? "Not enough credits" : submitLabel)}
          >
            {generating ? <span className="hs-spin" /> : <Icon className="hs-icon-sm" />}
            {submitLabel}
            {cost > 0 && !generating && <span className="hs-btn__cost">{cost}</span>}
          </button>
        )}
      </div>

      {hint && <p className="hs-hint" style={{ marginTop: "var(--s-2)" }}>{hint}</p>}
    </>
  );

  /* A sidebar dock is already inside a laid-out rail; wrapping it in
     .st-dock-prompt would give it the bottom-dock chrome it must not have. */
  if (block) {
    return (
      <div style={{ marginTop: "auto", paddingTop: "var(--s-5)", display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
        <SpendMeter cost={cost} balance={balance} affordable={affordable} shortfall={shortfall} label={meterLabel} />
        {body}
      </div>
    );
  }

  return (
    <div className="st-dock-prompt">
      {children}
      {body}
    </div>
  );
}
