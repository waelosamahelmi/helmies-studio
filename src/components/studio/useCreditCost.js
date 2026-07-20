"use client";

import { useState, useEffect } from "react";

export function useCreditCost(tool, model, params = {}) {
  const [cost, setCost] = useState(null);
  const [affordable, setAffordable] = useState(true);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, model, params }),
        });
        const data = await res.json();
        if (!cancelled) {
          setCost(data.credits);
          setAffordable(data.affordable);
          setRemaining(data.remaining);
        }
      } catch {}
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tool, model, JSON.stringify(params)]);

  return { cost, affordable, remaining };
}