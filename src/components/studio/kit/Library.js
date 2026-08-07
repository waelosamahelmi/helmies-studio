"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IcSearch } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   LIBRARY — the shared parts of the three collection browsers
   ──────────────────────────────────────────────────────────────────────────
   Assets, Brand kits and Projects are three implementations of the same
   `.st-lib` archetype, and the parts below were literally identical in all
   three — the roving-focus handler token for token, the search field's
   inline style object property for property, the card's nine-property
   button reset, the skeleton's DOM.

   What is NOT here, deliberately: fetching, pagination, sort options,
   filter chips, per-card actions, and the detail views. Those genuinely
   differ — one browser paginates by cursor, one edits in a modal, one
   swaps the whole surface for a sheet — and folding them together would
   trade real duplication for a component nobody can safely change.

   The card keeps its `.st-item` wrapper around both the button and the
   actions row: `.st-item__acts` is revealed by `:hover`/`:focus-within` on
   that ancestor, so flattening it would silently remove the actions for
   keyboard users in all three browsers at once.
   ══════════════════════════════════════════════════════════════════════════ */

/* Resolved `grid-template-columns` reads back as pixel values
   ("240px 240px 240px"), so counting tokens gives the live column count
   without hard-coding the breakpoints the CSS owns. */
function columnsOf(el) {
  if (!el || typeof window === "undefined") return 1;
  return Math.max(
    1,
    String(window.getComputedStyle(el).gridTemplateColumns).split(" ").filter(Boolean).length,
  );
}

/**
 * Arrow-key roving focus across a grid of cards.
 * Returns the ref to put on the grid and the handler to put on its onKeyDown.
 */
export function useGridRoving({ selector = "[data-card]" } = {}) {
  const gridRef = useRef(null);

  const onGridKey = useCallback((e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const nodes = Array.from(gridRef.current?.querySelectorAll(selector) || []);
    const i = nodes.indexOf(document.activeElement);
    if (i < 0) return;

    const cols = columnsOf(gridRef.current);
    let next = i;
    if (e.key === "ArrowRight") next = i + 1;
    else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "ArrowDown") next = i + cols;
    else if (e.key === "ArrowUp") next = i - cols;
    else if (e.key === "Home") next = 0;
    else next = nodes.length - 1;

    if (next < 0 || next >= nodes.length) return;
    e.preventDefault();
    nodes[next].focus();
  }, [selector]);

  return { gridRef, onGridKey };
}

/**
 * "Copied" feedback that resets itself, and never fires after unmount.
 * Callers keep their own clipboard payload and their own failure message —
 * only the timing is shared.
 */
export function useCopyFeedback({ ms = 1600 } = {}) {
  const [copied, setCopied] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback((id) => {
    setCopied(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), ms);
  }, [ms]);

  return { copied, flash };
}

/** The search field every library bar carries. */
export function LibrarySearch({ value, onChange, placeholder, label }) {
  return (
    <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160, maxWidth: 320 }}>
      <IcSearch
        className="hs-icon-sm"
        style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: "var(--tx-mute)", pointerEvents: "none",
        }}
      />
      <input
        type="search"
        className="hs-input"
        style={{ paddingLeft: 32 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </div>
  );
}

/* The card button is a real <button> so Enter, Space and focus order all
   work natively; this only strips the browser's button chrome. */
const CARD_RESET = {
  display: "block", width: "100%", padding: 0, border: 0,
  background: "transparent", color: "inherit", font: "inherit",
  textAlign: "left", cursor: "pointer",
};

/**
 * One card. `frame` is the only genuinely divergent part between the three
 * browsers (a thumbnail, a row of colour bands, an icon over a summary), so
 * it is a slot rather than a set of props.
 */
export function LibraryCard({ kindLabel, name, meta, ariaLabel, onOpen, frame, overlay, actions }) {
  return (
    <div className="st-item" role="listitem">
      <button type="button" data-card onClick={onOpen} aria-label={ariaLabel} style={CARD_RESET}>
        <div className="st-item__frame">
          {frame}
          {kindLabel && <span className="st-item__kind">{kindLabel}</span>}
          {overlay}
        </div>
        <div className="st-item__body">
          <span className="st-item__name">{name}</span>
          <span className="st-item__meta">{meta}</span>
        </div>
      </button>
      {actions && <div className="st-item__acts">{actions}</div>}
    </div>
  );
}

/** The loading grid. One shape for all three — the widths they each used
    were arbitrary and indistinguishable at card size. */
export function LibrarySkeleton({ count = 8, label = "Loading" }) {
  return (
    <div className="st-lib__grid" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="st-item">
          <div className="hs-skel" style={{ aspectRatio: "1", borderRadius: 0 }} />
          <div className="st-item__body">
            <div className="hs-skel" style={{ height: 10, width: "68%" }} />
            <div className="hs-skel" style={{ height: 8, width: "44%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
