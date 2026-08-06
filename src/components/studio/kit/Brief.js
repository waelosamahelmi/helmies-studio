"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { SpendMeter } from "./Spend";
import { IcSpark, IcUpload, IcClose, IcBolt } from "./Icons";
import { shouldSubmitOnKeyDown, isEnterSendGesture } from "@/lib/brief-keydown";

/* ══════════════════════════════════════════════════════════════════════════
   BRIEF — the prompt dock
   ──────────────────────────────────────────────────────────────────────────
   Three things, in the order the user thinks about them:
     1. what to make       (the brief)
     2. what it will cost  (the meter)
     3. commit             (the action)
   The action never appears without the cost beside it.

   U1 — on a phone the composer is a two-state instrument: collapsed, it is
   a slim bar above the dock (prompt preview on the left, the primary action
   in right-thumb reach); tapped, it expands into a bottom sheet with the
   full brief, tools and the spend meter, using the kit Sheet's grabber /
   drag-dismiss / snap mechanics. One component tree — the desktop layout is
   untouched, and the phone collapse is a matchMedia switch, not a remount
   of a second tree.
   ══════════════════════════════════════════════════════════════════════════ */

/* Phone = the width at which the shell swaps its rail for the dock. SSR and
   the first client render agree on `false`, so hydration stays clean; the
   effect corrects it before paint on a real phone. */
function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return phone;
}

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
  const phone = usePhone();
  const [open, setOpen] = useState(false);

  /* Grow with the content, up to the CSS max-height */
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => { resize(); }, [value, resize, open]);
  useEffect(() => { if (autoFocus && !phone) ref.current?.focus(); }, [autoFocus, phone]);

  /* Expanding on a phone should land the cursor in the brief. */
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => ref.current?.focus(), 120);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const count = value.length;
  const near = count > maxChars * 0.85;
  const at = count >= maxChars;

  const isReady = useCallback(
    (v) => !!v.trim() && !generating && !disabled && affordable,
    [generating, disabled, affordable],
  );

  const ready = isReady(value);

  // Every submit path funnels through here with the EXACT text being
  // submitted, rather than letting the caller re-read `value` itself — see
  // the WebKit note below for why that distinction matters end to end, not
  // just for this component's own readiness check.
  const submitText = (text) => {
    if (isReady(text)) {
      setOpen(false);
      onSubmit?.(text);
    }
  };

  const submit = () => submitText(value);

  // WebKit note: Playwright's fill() (and, in principle, a very fast real
  // keystroke) can dispatch this keydown before React's controlled `value`
  // prop has re-rendered into this closure — proven empirically (a probe
  // dumping both showed `value` still "" while the textarea's actual DOM
  // value already held the typed text). Deciding readiness from the stale
  // closure silently swallowed the keystroke: preventDefault() had already
  // run, so not even a newline appeared. Reading the live DOM value off
  // e.currentTarget removes that race entirely instead of papering over it.
  // Passing that same live text to onSubmit (rather than calling it with no
  // arguments and trusting the caller's own state) matters just as much:
  // OrchestratorStudio's `send` closure over `input` is exactly as stale as
  // this component's `value` prop at that instant — they re-render
  // together — so a caller that fell back to its own state would silently
  // resend the previous (or empty) draft instead of what's on screen.
  //
  // The actual submit/no-submit DECISION (readiness, IME composition, the
  // Enter/Shift+Enter/Ctrl+Enter branches) lives in the pure, unit-tested
  // shouldSubmitOnKeyDown (@/lib/brief-keydown.js) rather than inline here —
  // it has no DOM/React dependency, so it's covered directly without
  // rendering this component. isEnterSendGesture (same module) answers the
  // narrower "is this Enter meant to send at all" question, independent of
  // readiness, which is what decides whether to swallow the default
  // newline — matching the pre-existing behavior where enterSends surfaces
  // never let plain Enter insert a newline, ready or not.
  const onKeyDown = (e) => {
    // IME composition confirms with Enter too (Safari/WebKit reports it via
    // the native event's isComposing, not React's synthetic KeyboardEvent
    // interface — keyCode 229 is the cross-browser fallback signal). Either
    // way, that Enter must never preventDefault (it would break the
    // composition) or submit.
    if (e.nativeEvent?.isComposing || e.keyCode === 229) return;

    if (!isEnterSendGesture({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, enterSends })) {
      return;
    }
    e.preventDefault();

    const liveValue = e.currentTarget.value;
    if (shouldSubmitOnKeyDown({
      key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
      isComposing: e.nativeEvent?.isComposing, keyCode: e.keyCode,
      value: liveValue, generating, disabled, affordable, enterSends,
    })) {
      setOpen(false);
      onSubmit?.(liveValue);
    }
  };

  const applyChange = useCallback((next) => {
    onChange?.(maxChars && next.length > maxChars ? next.slice(0, maxChars) : next);
  }, [onChange, maxChars]);

  const handleChange = (e) => applyChange(e.target.value);

  // WebKit note #2 (the deeper one): React's own onChange for a controlled
  // text field is gated behind an internal "value tracker" — it overrides
  // the textarea's `value` SETTER to keep a shadow copy in sync with every
  // assignment through that setter, then on the native "input" event
  // compares the DOM's current value against that shadow copy and only
  // calls onChange if they differ. Playwright's WebKit driver fills a
  // <textarea> by selecting its content and issuing a native insertText —
  // proven (via a throwaway probe with a raw, non-React addEventListener on
  // this exact node) to land as a fully trusted "input" event carrying the
  // right text. But on WebKit specifically that insertText appears to go
  // through the SAME overridden setter React patched, so the shadow copy is
  // already caught up by the time the "input" event fires — React's
  // comparison sees no difference and silently skips onChange. Chromium and
  // Firefox don't take this path (their insertText updates the control's
  // value without touching that JS setter), which is exactly why this only
  // reproduces on WebKit. A plain addEventListener isn't routed through
  // React's ChangeEventPlugin, so it isn't subject to that tracker
  // comparison — it always sees the real edit, closing the gap entirely
  // instead of guessing at timing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeInput = (e) => applyChange(e.target.value);
    el.addEventListener("input", onNativeInput);
    return () => el.removeEventListener("input", onNativeInput);
  }, [applyChange, phone, open]);

  /* The full composer — rendered inline on desktop, inside the sheet on a
     phone. One JSX tree either way. */
  const composer = (
    <>
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
    </>
  );

  if (!phone) {
    return <div className={`st-dock-prompt${glow ? " hs-glow" : ""}`}>{composer}</div>;
  }

  /* ── Phone: collapsed bar + expanding sheet ──────────────────────────── */
  const preview = value.trim();
  return (
    <>
      <div className={`st-dock-prompt st-dock-prompt--peek${glow ? " hs-glow" : ""}`}>
        <button
          type="button"
          className="st-peek"
          onClick={() => setOpen(true)}
          aria-label="Open the brief composer"
          aria-expanded={open}
        >
          <span className={`st-peek__text${preview ? "" : " is-empty"}`}>
            {preview || placeholder}
          </span>
        </button>

        {generating ? (
          <button
            type="button"
            className="hs-btn hs-btn--outline st-peek__go"
            onClick={onCancel}
            disabled={!onCancel}
            data-testid="brief-primary"
          >
            <span className="hs-spin" />
            {stage ? String(stage).replace(/_/g, " ") : "Working"}
          </button>
        ) : (
          <button
            type="button"
            className="hs-btn hs-btn--primary st-peek__go"
            onClick={ready ? submit : () => setOpen(true)}
            data-testid="brief-primary"
            title={
              !value.trim() ? "Write a brief first"
              : !affordable ? "Not enough credits"
              : submitLabel
            }
          >
            <IcBolt className="hs-icon-sm" />
            {submitLabel}
            {cost > 0 && <span className="hs-btn__cost">{cost}</span>}
          </button>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={enterSends ? "Message" : "Brief"}
        snap="half"
        avoidKeyboard
      >
        <div className="st-dock-prompt st-dock-prompt--sheet">{composer}</div>
      </Sheet>
    </>
  );
}
