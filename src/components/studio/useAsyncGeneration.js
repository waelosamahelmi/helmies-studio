"use client";

import { useState, useRef, useCallback } from "react";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/client-fetch";

export function useAsyncGeneration() {
  const { notifyGeneration } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(pollRef.current);
  }, []);

  const submit = useCallback(async (tool, model, params) => {
    setLoading(true);
    setError("");
    setResult(null);
    startTimer();

    try {
      const res = await apiFetch("/api/generate/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, model, ...params }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed");
        setLoading(false);
        stopTimer();
        return;
      }

      const pollUrl = data.pollUrl;
      const poll = async () => {
        try {
          const statusRes = await apiFetch(pollUrl);
          const statusData = await statusRes.json();

          if (statusData.status === "completed") {
            setResult({ url: statusData.outputUrl, creditsUsed: data.creditsUsed });
            setLoading(false);
            stopTimer();
            notifyGeneration(tool, statusData.outputUrl);
          } else if (statusData.status === "failed") {
            setError(statusData.error || "Generation failed");
            setLoading(false);
            stopTimer();
          } else {
            pollRef.current = setTimeout(poll, 2000);
          }
        } catch {
          pollRef.current = setTimeout(poll, 2000);
        }
      };
      poll();
    } catch (e) {
      setError(e.message);
      setLoading(false);
      stopTimer();
    }
  }, [startTimer, stopTimer, notifyGeneration]);

  return { loading, result, error, elapsed, submit };
}
