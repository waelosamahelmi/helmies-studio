"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

/* ══════════════════════════════════════════════════════════════════════════
   useCreditCost — the live quote behind the spend meter
   ──────────────────────────────────────────────────────────────────────────
   `tool` must be the same string you pass to `submit()`. A mismatch quotes
   one price and charges another.

   Fixed here: estimate errors were swallowed silently, leaving a stale price
   on screen from a previous model — the user could commit to a number that
   no longer applied. Failures now clear the quote and expose `error`.
   ══════════════════════════════════════════════════════════════════════════ */

export function useCreditCost(tool, model, params = {}) {
  const [cost, setCost] = useState(null);
  const [affordable, setAffordable] = useState(true);
  const [balance, setBalance] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [shortfall, setShortfall] = useState(0);
  const [topUpPacks, setTopUpPacks] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const key = JSON.stringify(params);
  const run = useRef(0);

  useEffect(() => {
    if (!tool || !model) {
      setCost(null);
      setPending(false);
      return;
    }

    const id = ++run.current;
    const mine = () => run.current === id;

    setPending(true);

    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, model, params: JSON.parse(key) }),
          retries: 0,
        });
        const data = await res.json();
        if (!mine()) return;

        setCost(data.credits ?? null);
        setAffordable(data.affordable !== false);
        setBalance(data.balance ?? null);
        setRemaining(data.remaining ?? null);
        setShortfall(data.shortfall || 0);
        setTopUpPacks(data.topUpPacks || []);
        setError(null);
      } catch (e) {
        if (!mine()) return;
        // Never leave a stale price on screen — it would be a quote for a
        // configuration the user has already changed.
        setCost(null);
        setError(e?.message || "Could not price this render");
      } finally {
        if (mine()) setPending(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [tool, model, key]);

  return { cost, affordable, balance, remaining, shortfall, topUpPacks, pending, error };
}

export default useCreditCost;
