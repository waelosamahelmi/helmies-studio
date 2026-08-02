"use client";

/* ══════════════════════════════════════════════════════════════════════════
   TEMPLATE RUN PANEL — the executable-workflow detail-page action column
   ──────────────────────────────────────────────────────────────────────────
   Phase 6: an executable template (one with a published TemplateVersion)
   has no purchase/access gate at all — running it costs credits at a
   server-computed price, exactly like every other studio tool. This panel:
     1. Quotes the template (POST .../quote) — the credits shown here always
        come from the server (quoteCatalogModel/ModelPricing), never a
        client guess.
     2. "Use template" starts a run (POST .../run) and polls
        GET /api/templates/runs/[runId] until it reaches a terminal status,
        rendering each step's own status as it updates.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiJson } from "@/lib/client-fetch";
import { IcBolt, IcLock, IcAlert, IcCheck, IcRefresh, IcExternal } from "@/components/studio/kit/Icons";

const POLL_MS = 2000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const STEP_LABEL = { pending: "Waiting", running: "Running", completed: "Done", failed: "Failed" };

function StepRow({ stepId, state }) {
  const status = state?.status || "pending";
  const badgeClass =
    status === "completed" ? "hs-badge--accent" : status === "failed" ? "hs-badge--fault" : "";
  return (
    <div className="hs-row hs-row--between" style={{ padding: "var(--s-2) 0" }}>
      <span className="hs-mono" style={{ fontSize: "var(--t-sm)" }}>{stepId}</span>
      <span className="hs-row" style={{ gap: "var(--s-3)" }}>
        {status === "completed" && state.outputUrl && (
          <a
            href={state.outputUrl}
            target="_blank"
            rel="noreferrer"
            className="hs-hint hs-row"
            style={{ gap: "var(--s-1)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            View <IcExternal className="hs-icon-sm" />
          </a>
        )}
        <span className={`hs-badge ${badgeClass}`}>
          {status === "running" && <span className="hs-spin" style={{ marginRight: 4 }} />}
          {STEP_LABEL[status] || status}
        </span>
      </span>
    </div>
  );
}

export default function TemplateRunPanel({ slug }) {
  const { status: authStatus } = useSession();
  const authed = authStatus === "authenticated";

  const [quote, setQuote] = useState(null);
  const [quoteFault, setQuoteFault] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const [run, setRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const [runFault, setRunFault] = useState(null);

  const pollRef = useRef(null);

  const loadQuote = useCallback(async () => {
    setLoadingQuote(true);
    setQuoteFault(null);
    try {
      const data = await apiJson(`/api/templates/${encodeURIComponent(slug)}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        retries: 0,
      });
      setQuote(data);
    } catch (err) {
      setQuoteFault(err?.message || "The quote could not be loaded.");
    } finally {
      setLoadingQuote(false);
    }
  }, [slug]);

  useEffect(() => {
    if (authStatus === "loading" || !authed) return;
    loadQuote();
  }, [authStatus, authed, loadQuote]);

  const pollRun = useCallback(async (runId) => {
    try {
      const data = await apiJson(`/api/templates/runs/${encodeURIComponent(runId)}`, { retries: 0 });
      setRun(data);
      if (TERMINAL_STATUSES.has(data.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      // A transient poll hiccup shouldn't kill the panel — the next tick retries.
    }
  }, []);

  // Stop polling on unmount — a run in progress keeps running server-side
  // (the durable queue owns it), this only stops this page's own polling.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function start() {
    setRunFault(null);
    setStarting(true);
    try {
      const data = await apiJson(`/api/templates/${encodeURIComponent(slug)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        retries: 0,
      });
      setRun({ id: data.runId, status: "running", stepState: {}, totalCredits: data.totalCredits });
      pollRun(data.runId);
      pollRef.current = setInterval(() => pollRun(data.runId), POLL_MS);
    } catch (err) {
      if (err?.status === 402) {
        setRunFault(`Not enough credits for this run — it needs ${quote?.totalCredits ?? "more"} credits.`);
      } else {
        setRunFault(err?.message || "The run could not be started.");
      }
    } finally {
      setStarting(false);
    }
  }

  if (authStatus === "loading") return null;

  if (!authed) {
    return (
      <div className="hs-stack">
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/templates/${slug}`)}`}
          className="hs-btn hs-btn--primary hs-btn--lg hs-btn--block"
        >
          <IcLock className="hs-icon-sm" />
          Sign in to use this template
        </Link>
        <p className="hs-hint">
          Sign in to see the price and run it — each step spends credits at the normal rate for the
          model it uses.
        </p>
      </div>
    );
  }

  return (
    <div className="hs-stack">
      {loadingQuote && (
        <button type="button" className="hs-btn hs-btn--lg hs-btn--block" disabled>
          <span className="hs-spin" />
          Pricing this template
        </button>
      )}

      {quoteFault && !loadingQuote && (
        <>
          <div className="hs-notice hs-notice--fault" role="alert">
            <IcAlert className="hs-icon" />
            <span>{quoteFault}</span>
          </div>
          <button type="button" className="hs-btn hs-btn--outline" onClick={loadQuote}>
            <IcRefresh className="hs-icon-sm" /> Try again
          </button>
        </>
      )}

      {quote && !loadingQuote && !run && (
        <>
          {quote.valid ? (
            <>
              <div className="hs-row hs-row--between">
                <span className="hs-hint">
                  {quote.steps.length} step{quote.steps.length === 1 ? "" : "s"}
                </span>
                <span className="hs-mono" style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: "var(--signal)" }}>
                  {quote.totalCredits} credits
                </span>
              </div>
              <button
                type="button"
                className="hs-btn hs-btn--primary hs-btn--lg hs-btn--block"
                disabled={starting}
                onClick={start}
              >
                {starting ? <span className="hs-spin" /> : <IcBolt className="hs-icon-sm" />}
                {starting ? "Starting" : "Use template"}
              </button>
              <p className="hs-hint">
                Every step runs on the studio&apos;s durable queue — this page updates as each one
                finishes.
              </p>
            </>
          ) : (
            <div className="hs-notice hs-notice--caution" role="alert">
              <IcAlert className="hs-icon" />
              <span>This template can&apos;t run right now: {(quote.errors || []).join("; ") || "invalid configuration"}.</span>
            </div>
          )}
        </>
      )}

      {runFault && (
        <div className="hs-notice hs-notice--fault" role="alert">
          <IcAlert className="hs-icon" />
          <span>{runFault}</span>
        </div>
      )}

      {run && (
        <div className="hs-card hs-stack" aria-live="polite" data-testid="template-run-status">
          <div className="hs-row hs-row--between">
            <span className="hs-label">Run status</span>
            <span
              className={`hs-badge ${run.status === "completed" ? "hs-badge--accent" : run.status === "failed" ? "hs-badge--fault" : ""}`}
              data-testid="template-run-overall-status"
            >
              {run.status === "running" && <span className="hs-spin" style={{ marginRight: 4 }} />}
              {run.status === "completed" && <IcCheck className="hs-icon-sm" />}
              {run.status}
            </span>
          </div>
          <div className="hs-stack" style={{ gap: 0 }}>
            {Object.entries(run.stepState || {}).map(([stepId, state]) => (
              <StepRow key={stepId} stepId={stepId} state={state} />
            ))}
          </div>
          {run.status === "failed" && <p className="hs-hint">Credits for this run were fully returned to your wallet.</p>}
        </div>
      )}
    </div>
  );
}
