"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/client-fetch";

export function useCreditCost(tool, model, params = {}) {
  const [cost, setCost] = useState(null);
  const [affordable, setAffordable] = useState(true);
  const [remaining, setRemaining] = useState(null);
  const [shortfall, setShortfall] = useState(0);
  const [topUpPacks, setTopUpPacks] = useState([]);

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, model, params }),
        });
        const data = await res.json();
        if (!cancelled) {
          setCost(data.credits);
          setAffordable(data.affordable);
          setRemaining(data.remaining);
          setShortfall(data.shortfall || 0);
          setTopUpPacks(data.topUpPacks || []);
        }
      } catch {}
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tool, model, JSON.stringify(params)]);

  return { cost, affordable, remaining, shortfall, topUpPacks };
}