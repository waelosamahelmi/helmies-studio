"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ══════════════════════════════════════════════════════════════════════════
   SPEND METER — the signature element
   ──────────────────────────────────────────────────────────────────────────
   Every action in this product costs money. So cost is not a number tucked
   in a corner; it is a physical readout welded to the button that spends it.

   The track shows your balance as segments. The leading segments illuminate
   to the size of the pending charge. Change the model, the resolution, the
   duration — the lit region grows or shrinks. When the charge exceeds the
   balance the meter goes to caution and says, in words, what to do next.
   ══════════════════════════════════════════════════════════════════════════ */

const SEGMENTS = 28;

function useCounter(target, ms = 420) {
  const [n, setN] = useState(target ?? 0);
  const from = useRef(target ?? 0);
  const raf = useRef(null);

  useEffect(() => {
    const to = target ?? 0;
    const start = from.current;
    if (start === to) { setN(to); return; }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { from.current = to; setN(to); return; }

    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      // easeOutQuint — settles like a needle, no bounce
      const e = 1 - Math.pow(1 - p, 5);
      setN(Math.round(start + (to - start) * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = to;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, ms]);

  return n;
}

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

export function SpendMeter({
  cost = 0,
  balance = null,
  affordable = true,
  shortfall = 0,
  /** Hide the words under the track — used in tight docks */
  compact = false,
  label = "Cost",
}) {
  const shown = useCounter(cost);
  const known = balance != null;
  const after = known ? balance - cost : null;

  /* How much of the track the pending charge covers. With no balance yet we
     show a small fixed indication rather than a misleading full bar. */
  const lit = useMemo(() => {
    if (!cost || cost <= 0) return 0;
    if (!known || balance <= 0) return Math.min(SEGMENTS, 3);
    return Math.min(SEGMENTS, Math.max(1, Math.round((cost / balance) * SEGMENTS)));
  }, [cost, balance, known]);

  const held = known && balance > 0 ? SEGMENTS : 0;

  return (
    <div className={`hs-meter${!affordable ? " is-short" : ""}`}>
      <div
        className="hs-meter__track"
        role="meter"
        aria-valuenow={cost}
        aria-valuemin={0}
        aria-valuemax={known ? balance : undefined}
        aria-label={`Estimated cost ${cost} credits${known ? ` of ${balance} available` : ""}`}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={
              "hs-meter__seg" +
              (i < lit ? " is-spend" : i < held ? " is-held" : "")
            }
            style={{ transitionDelay: `${Math.min(i, 14) * 8}ms` }}
          />
        ))}
      </div>

      <div className="hs-meter__read">
        <span>
          <span className="hs-meter__k">{label}</span>{" "}
          <span className={`hs-meter__v${cost > 0 ? " hs-meter__v--accent" : ""}`}>
            {cost > 0 ? fmt(shown) : "—"}
          </span>
        </span>
        {known && (
          <span>
            <span className="hs-meter__k">Balance</span>{" "}
            <span className="hs-meter__v">{fmt(balance)}</span>
            {cost > 0 && (
              <>
                <span className="hs-meter__arrow">→</span>
                <span className={`hs-meter__v${after < 0 ? " hs-meter__v--caution" : ""}`}>
                  {fmt(after)}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {!compact && !affordable && cost > 0 && (
        <p className="hs-meter__note">
          {fmt(shortfall || Math.abs(after ?? 0))} more credits needed.{" "}
          <Link href="/settings?tab=billing">Top up</Link>
        </p>
      )}
    </div>
  );
}

/* ── Compact inline readout — for headers and cards ────────────────────── */
export function CostTag({ cost, className = "" }) {
  const shown = useCounter(cost ?? 0);
  if (cost == null) return null;
  return (
    <span className={`hs-badge hs-badge--accent ${className}`}>
      {fmt(shown)} cr
    </span>
  );
}

export default SpendMeter;
