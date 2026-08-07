"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IcRefresh, IcClose } from "./Icons";
import { readHistory, subscribeHistory, removeEntry, clearHistory } from "@/lib/studio-history";
import { getTool } from "./tools";

/* ══════════════════════════════════════════════════════════════════════════
   HISTORY — recall a brief you have already written
   ──────────────────────────────────────────────────────────────────────────
   Mounted inside the Brief dock, so every tool gets the same affordance in
   the same place. Prompts from the CURRENT tool come first (that is what
   you usually want to iterate on), then everything else — because reusing
   an image brief for a video is the reason the studio is one product and
   not twelve.

   Recording lives in useAsyncGeneration; this component only reads.
   ══════════════════════════════════════════════════════════════════════════ */

const RELATIVE = [
  [60_000, "just now"],
  [3_600_000, (ms) => `${Math.floor(ms / 60_000)}m ago`],
  [86_400_000, (ms) => `${Math.floor(ms / 3_600_000)}h ago`],
];

function ago(at) {
  const ms = Date.now() - at;
  for (const [limit, label] of RELATIVE) {
    if (ms < limit) return typeof label === "function" ? label(ms) : label;
  }
  const days = Math.floor(ms / 86_400_000);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function History({ tool, onPick, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const wrapRef = useRef(null);

  /* Read on mount rather than during render: localStorage is unavailable
     during SSR, and reading it in a useState initialiser would desync the
     server and client markup. */
  useEffect(() => {
    setEntries(readHistory());
    return subscribeHistory(setEntries);
  }, []);

  /* Close on outside click and on Escape — the same dismissal contract as
     the kit's Sheet, so the studio behaves consistently. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ordered = useMemo(() => {
    const mine = entries.filter((e) => e.tool === tool);
    const others = entries.filter((e) => e.tool !== tool);
    return [...mine, ...others];
  }, [entries, tool]);

  const pick = useCallback((entry) => {
    onPick?.(entry.prompt);
    setOpen(false);
  }, [onPick]);

  if (!entries.length) return null;

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
        data-tip="Recent briefs"
        aria-label="Recent briefs"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <IcRefresh className="hs-icon-sm" />
      </button>

      {open && (
        <div className="st-history" role="dialog" aria-label="Recent briefs">
          <div className="st-history__head">
            <span className="hs-label">Recent briefs</span>
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={() => { clearHistory(); setOpen(false); }}
            >
              Clear all
            </button>
          </div>

          <ul className="st-history__list">
            {ordered.map((e) => (
              <li key={e.id ?? e.at} className="st-history__item">
                <button type="button" className="st-history__pick" onClick={() => pick(e)}>
                  <span className="st-history__text">{e.prompt}</span>
                  <span className="st-history__meta">
                    {e.tool !== tool && <b>{getTool(e.tool)?.label || e.tool}</b>}
                    {ago(e.at)}
                  </span>
                </button>
                <button
                  type="button"
                  className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
                  aria-label="Forget this brief"
                  onClick={() => removeEntry(e.id)}
                >
                  <IcClose className="hs-icon-sm" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
