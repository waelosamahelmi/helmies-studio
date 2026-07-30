"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/client-fetch";

/* ══════════════════════════════════════════════════════════════════════════
   useAsyncGeneration
   ──────────────────────────────────────────────────────────────────────────
   Submits a job, then polls until it settles.

   Fixed here:
   · Polling had no attempt cap and swallowed every fetch error into another
     poll, so a 401 or a deleted job looped forever and the spinner never
     stopped. Failures now count toward a cap and surface a real message.
   · Nothing cleaned up on unmount, so switching tools left both the poll
     chain and the elapsed-time interval running for the rest of the session.
   · `stopTimer` cleared the poll with `clearInterval` while it was scheduled
     with `setTimeout`.
   · The `if (!res.ok)` branch was dead — `apiFetch` throws on any non-2xx —
     so the API's own error message was replaced by a generic one.

   Returns the previous shape plus `stage`, `cancel` and `reset`.
   ══════════════════════════════════════════════════════════════════════════ */

const POLL_MS = 2000;
const MAX_MINUTES = 20;
const MAX_POLLS = (MAX_MINUTES * 60 * 1000) / POLL_MS;
const MAX_CONSECUTIVE_ERRORS = 5;

export function useAsyncGeneration() {
  const { notifyGeneration } = useToast();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState(null);

  const timer = useRef(null);
  const poll = useRef(null);
  const alive = useRef(true);
  const runId = useRef(0);

  const clearAll = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (poll.current) { clearTimeout(poll.current); poll.current = null; }
  }, []);

  /* Stop everything when the tool unmounts */
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearAll(); };
  }, [clearAll]);

  const finish = useCallback(() => {
    clearAll();
    if (alive.current) { setLoading(false); setStage(null); }
  }, [clearAll]);

  const reset = useCallback(() => {
    runId.current += 1;
    clearAll();
    setLoading(false);
    setResult(null);
    setError("");
    setElapsed(0);
    setStage(null);
  }, [clearAll]);

  /** Stop watching this job. The provider keeps working; the row stays in
      history. We only detach the UI. */
  const cancel = useCallback(() => {
    runId.current += 1;
    finish();
  }, [finish]);

  const submit = useCallback(async (tool, model, params = {}) => {
    const run = ++runId.current;
    const mine = () => alive.current && runId.current === run;

    clearAll();
    setLoading(true);
    setError("");
    setResult(null);
    setElapsed(0);
    setStage("submitting");

    timer.current = setInterval(() => {
      if (mine()) setElapsed((e) => e + 1);
    }, 1000);

    try {
      const res = await apiFetch("/api/generate/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, model, ...params }),
        retries: 0,
      });
      const data = await res.json();
      if (!mine()) return;

      /* Some providers return synchronously */
      if (data.status === "completed" && (data.outputUrl || data.url)) {
        const url = data.outputUrl || data.url;
        setResult({ ...data, url, creditsUsed: data.creditsUsed });
        notifyGeneration?.(tool, url);
        finish();
        return;
      }

      const pollUrl = data.pollUrl || (data.generationId ? `/api/generations/status?id=${data.generationId}` : null);
      if (!pollUrl) {
        setError("The server did not return a job to track.");
        finish();
        return;
      }

      setStage("queued");

      let attempts = 0;
      let errors = 0;

      const tick = async () => {
        if (!mine()) return;

        if (++attempts > MAX_POLLS) {
          setError(`Still running after ${MAX_MINUTES} minutes. Check Generations for the result.`);
          finish();
          return;
        }

        try {
          const r = await apiFetch(pollUrl, { retries: 0 });
          const s = await r.json();
          if (!mine()) return;
          errors = 0;

          if (s.status === "completed") {
            const url = s.outputUrl || s.url;
            setResult({ ...s, url, creditsUsed: s.creditsUsed ?? data.creditsUsed, elapsed: s.elapsed });
            notifyGeneration?.(tool, url);
            finish();
            return;
          }

          if (s.status === "failed") {
            setError(s.error || "The provider could not complete this generation.");
            finish();
            return;
          }

          setStage(s.status || "rendering");
          poll.current = setTimeout(tick, POLL_MS);
        } catch (e) {
          if (!mine()) return;

          /* A signed-out session will never recover by polling harder */
          if (e?.status === 401) {
            setError("Your session expired. Sign in to see this generation.");
            finish();
            return;
          }

          if (++errors >= MAX_CONSECUTIVE_ERRORS) {
            setError(e?.message || "Lost contact with the server while rendering.");
            finish();
            return;
          }

          /* Back off a little while the network settles */
          poll.current = setTimeout(tick, POLL_MS * (1 + errors));
        }
      };

      poll.current = setTimeout(tick, POLL_MS);
    } catch (e) {
      if (!mine()) return;
      setError(e?.message || "Could not start the generation.");
      finish();
    }
  }, [clearAll, finish, notifyGeneration]);

  return { loading, result, error, elapsed, stage, submit, cancel, reset };
}

export default useAsyncGeneration;
