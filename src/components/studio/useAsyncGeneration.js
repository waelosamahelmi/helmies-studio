"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/client-fetch";
import { recordPrompt } from "@/lib/studio-history";

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
  const [retryInfo, setRetryInfo] = useState(null); // { attempts, maxAttempts } while the job is on a retry lap

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

  /* A finished job changes the balance. The shell already listens for this
     to refresh credits — but it was only ever dispatched by the 10s job
     poller, so 14 tools each carried their own
     `useEffect(() => { if (result) onCreditsChanged?.() }, [result])`
     to cover the gap, and any tool that forgot it showed a stale balance.
     Firing it here covers every tool, including the ones (Canvas,
     Director) whose flows never used that effect. */
  const announceSettled = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("generation:settled"));
    }
  }, []);

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
    setRetryInfo(null);
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

    /* Recorded at submit, not on success: a brief that failed on a provider
       error is exactly the one the user most wants to recall and retry.
       Every tool routes through here, so none of them needs its own copy. */
    recordPrompt({ tool, prompt: params.prompt, model });

    clearAll();
    setLoading(true);
    setError("");
    setResult(null);
    setElapsed(0);
    setStage("submitting");
    setRetryInfo(null);

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
        announceSettled();
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
            announceSettled();
            finish();
            return;
          }

          if (s.status === "failed") {
            setError(s.error || "The provider could not complete this generation.");
            finish();
            return;
          }

          setStage(s.status || "rendering");
          /* The status API exposes the durable job's retry lap: a job that
             failed retryably goes back to "queued" with attempts > 0. Surface
             it so the user sees "retrying", not an undifferentiated spinner. */
          if (s.attempts > 0 && s.jobStatus === "queued") {
            setRetryInfo({ attempts: s.attempts, maxAttempts: 3 });
          } else {
            setRetryInfo(null);
          }
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
      /* Keep the full ApiError when we have one — it carries the uniform
         envelope (title, errorId, details) that ErrorPanel renders. Plain
         network errors stay strings. */
      setError(e && typeof e === "object" && e.status ? e : e?.message || "Could not start the generation.");
      finish();
    }
  }, [clearAll, finish, notifyGeneration, announceSettled]);

  return { loading, result, error, elapsed, stage, retryInfo, submit, cancel, reset };
}

export default useAsyncGeneration;
