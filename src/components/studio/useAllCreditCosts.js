"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/client-fetch";

/**
 * Preload credit costs for ALL models of a given tool type.
 * Returns a map of modelId -> { credits, affordable }
 * This avoids per-model API calls and shows costs instantly on all cards.
 */
export function useAllCreditCosts(tool, models = []) {
  const [costs, setCosts] = useState({});
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!tool || models.length === 0 || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/estimate/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, models: models.map((m) => ({ model: m.id })) }),
        });
        const data = await res.json();
        if (!cancelled && data.costs) {
          setCosts(data.costs);
          setBalance(data.balance);
        }
      } catch {
        // Fallback: use empty costs, cards will show no cost
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tool, JSON.stringify(models.map((m) => m.id))]);

  return { costs, balance, loading };
}