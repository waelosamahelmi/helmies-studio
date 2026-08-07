"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IcSwap } from "./Icons";
import { targetsFor, handoffHref, putHandoff } from "@/lib/studio-handoff";

/* ══════════════════════════════════════════════════════════════════════════
   SEND TO — the other half of a finished result
   ──────────────────────────────────────────────────────────────────────────
   Rendered by Stage's Result, so every tool that shows an output gets this
   without passing anything. The offered targets depend on what was actually
   made: a still can be animated or made to talk, a clip can be lip-synced
   or cut, a voice track can drive a performance.

   Nothing here generates or spends. It carries the asset to the tool that
   does, with the brief that produced it, so the next step starts from
   context instead of an empty form.
   ══════════════════════════════════════════════════════════════════════════ */

export default function SendTo({ url, result, prompt }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const targets = targetsFor(url);

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

  const go = useCallback((target) => {
    putHandoff({
      url,
      prompt: typeof prompt === "string" ? prompt : "",
      model: result?.model || null,
      at: Date.now(),
    });
    setOpen(false);
    router.push(handoffHref(target));
  }, [url, prompt, result, router]);

  if (!targets.length) return null;

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="hs-btn hs-btn--ghost hs-btn--sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IcSwap className="hs-icon-sm" /> Send to
      </button>

      {open && (
        <div className="st-sendto" role="menu" aria-label="Send this result to another studio">
          {targets.map((t) => (
            <button
              key={`${t.tool}:${t.mode}`}
              type="button"
              role="menuitem"
              className="st-sendto__item"
              onClick={() => go(t)}
            >
              <span className="st-sendto__label">{t.label}</span>
              <span className="st-sendto__hint">{t.hint}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
