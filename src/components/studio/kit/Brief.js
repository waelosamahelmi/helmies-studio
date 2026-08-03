"use client";

import { useCallback, useEffect, useRef } from "react";
import { SpendMeter } from "./Spend";
import { IcSpark, IcUpload, IcClose, IcBolt } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   BRIEF — the prompt dock
   ──────────────────────────────────────────────────────────────────────────
   Three things, in the order the user thinks about them:
     1. what to make       (the brief)
     2. what it will cost  (the meter)
     3. commit             (the action)
   The action never appears without the cost beside it.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Brief({
  value = "",
  onChange,
  onSubmit,
  onCancel,
  placeholder = "Describe what to make. Be specific about subject, light, and framing.",

  cost = 0,
  balance = null,
  affordable = true,
  shortfall = 0,

  generating = false,
  stage,
  disabled = false,

  /** Optional left-hand tools rendered in the footer */
  onUpload,
  onEnhance,
  enhancing = false,
  extras = null,

  maxChars = 2000,
  submitLabel = "Generate",
  meterLabel = "Cost",
  autoFocus = false,

  /** Chat-style input: plain Enter sends, Shift+Enter inserts a newline.
      Generation studios keep the Ctrl/Cmd+Enter-only default. */
  enterSends = false,

  /** Animated working-state border (agent surface, while busy). */
  glow = false,
}) {
  const ref = useRef(null);

  /* Grow with the content, up to the CSS max-height */
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => { resize(); }, [value, resize]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  const count = value.length;
  const near = count > maxChars * 0.85;
  const at = count >= maxChars;

  const ready = !!value.trim() && !generating && !disabled && affordable;

  const submit = () => { if (ready) onSubmit?.(); };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    // Plain Enter sends only when the surface opts in; Shift+Enter always
    // falls through to the textarea's default newline.
    if (enterSends && e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleChange = (e) => {
    const next = e.target.value;
    onChange?.(maxChars && next.length > maxChars ? next.slice(0, maxChars) : next);
  };

  return (
    <div className={`st-dock-prompt${glow ? " hs-glow" : ""}`}>
      <div className="st-brief">
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Creative brief"
          rows={2}
          disabled={disabled}
        />

        <div className="st-brief__foot">
          <div className="st-brief__tools">
            {onUpload && (
              <button
                type="button"
                className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                data-tip="Add reference"
                aria-label="Add reference"
                onClick={onUpload}
                disabled={generating}
              >
                <IcUpload className="hs-icon-sm" />
              </button>
            )}
            {onEnhance && (
              <button
                type="button"
                className="hs-btn hs-btn--ghost hs-btn--sm"
                onClick={onEnhance}
                disabled={generating || enhancing || !value.trim()}
              >
                {enhancing ? <span className="hs-spin" style={{ width: 12, height: 12 }} /> : <IcSpark className="hs-icon-sm" />}
                {enhancing ? "Expanding" : "Expand brief"}
              </button>
            )}
            {extras}
          </div>

          <span className={`st-brief__count${at ? " is-at" : near ? " is-near" : ""}`}>
            {count}/{maxChars}
          </span>
        </div>
      </div>

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
            onClick={submit}
            disabled={!ready}
            title={
              !value.trim() ? "Write a brief first"
              : !affordable ? "Not enough credits"
              : "Generate (Ctrl+Enter)"
            }
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
