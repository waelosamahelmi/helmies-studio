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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiJson } from "@/lib/client-fetch";
import { IcBolt, IcLock, IcAlert, IcCheck, IcRefresh, IcExternal } from "@/components/studio/kit/Icons";
import StepInputsForm from "@/components/templates/StepInputsForm";

const POLL_MS = 2000;
const QUOTE_DEBOUNCE_MS = 350;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

// Seed local form state from each field's descriptor (built server-side by
// page.js's buildStepInputs): an upload-style field (image/array) always
// starts empty (see StepInputsForm's own header comment on why — never
// pre-filled with the graph's placeholder sample URL), everything else
// starts at the graph's own baked default so the FIRST quote matches what
// the page already showed before this form existed.
function initialValues(stepInputs) {
  const out = {};
  for (const step of stepInputs) {
    const stepValues = {};
    for (const field of step.fields) {
      if (field.type === "array") stepValues[field.name] = [];
      else if (field.format === "uri") stepValues[field.name] = null;
      else if (field.type === "boolean") stepValues[field.name] = !!field.default;
      else stepValues[field.name] = field.default ?? "";
    }
    out[step.stepId] = stepValues;
  }
  return out;
}

// Translate the form's own control-shaped state (Dropzone hands back
// {url,name,type,size} objects, or arrays of them) into the wire shape
// POST .../quote and .../run actually accept: inputs[stepId][field] ->
// a plain value. A field the caller never touched (still empty/blank) is
// simply OMITTED — src/lib/template-quote.js's stepParams merges caller
// overrides on top of the graph's own baked `inputs`, so leaving a field out
// here means the server falls back to the graph's own default for it,
// exactly as it did before this form existed.
function buildInputsPayload(stepInputs, values) {
  const payload = {};
  for (const step of stepInputs) {
    const stepValues = values?.[step.stepId] || {};
    const out = {};
    for (const field of step.fields) {
      const raw = stepValues[field.name];
      if (field.type === "array") {
        const urls = (Array.isArray(raw) ? raw : []).map((f) => f?.url).filter(Boolean);
        if (urls.length) out[field.name] = urls;
      } else if (field.format === "uri") {
        if (raw?.url) out[field.name] = raw.url;
      } else if (field.type === "boolean") {
        out[field.name] = !!raw;
      } else if (field.type === "number") {
        if (raw !== "" && raw != null && Number.isFinite(Number(raw))) out[field.name] = Number(raw);
      } else if (raw !== "" && raw != null) {
        out[field.name] = raw;
      }
    }
    if (Object.keys(out).length) payload[step.stepId] = out;
  }
  return payload;
}

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

export default function TemplateRunPanel({ slug, stepInputs = [] }) {
  const { status: authStatus } = useSession();
  const authed = authStatus === "authenticated";

  const [quote, setQuote] = useState(null);
  const [quoteFault, setQuoteFault] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const [run, setRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const [runFault, setRunFault] = useState(null);

  // Phase 8 Task B1 — per-step input state. `values` holds each editable
  // field's CONTROL-shaped value (a Dropzone's {url,name,...} object for an
  // upload field, a plain scalar for everything else); buildInputsPayload
  // translates that into the wire shape on every quote/run call, so this is
  // the one place either request body comes from.
  const [values, setValues] = useState(() => initialValues(stepInputs));
  const setFieldValue = useCallback((stepId, field, value) => {
    setValues((prev) => ({ ...prev, [stepId]: { ...prev[stepId], [field]: value } }));
  }, []);

  const inputsPayload = useMemo(() => buildInputsPayload(stepInputs, values), [stepInputs, values]);
  const inputsPayloadKey = useMemo(() => JSON.stringify(inputsPayload), [inputsPayload]);

  const pollRef = useRef(null);

  const loadQuote = useCallback(async () => {
    setLoadingQuote(true);
    setQuoteFault(null);
    try {
      const data = await apiJson(`/api/templates/${encodeURIComponent(slug)}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: inputsPayload }),
        retries: 0,
      });
      setQuote(data);
    } catch (err) {
      setQuoteFault(err?.message || "The quote could not be loaded.");
    } finally {
      setLoadingQuote(false);
    }
    // Deps deliberately narrower than the closure: `inputsPayload` is a new
    // object every render (buildInputsPayload isn't memoized on identity),
    // but `inputsPayloadKey` (its JSON string) is exactly its stable
    // identity for this purpose — react-hooks/exhaustive-deps is off
    // project-wide (eslint.config.mjs) so this is a deliberate choice, not
    // an oversight.
  }, [slug, inputsPayloadKey]);

  // Re-quotes on every input change, debounced — the displayed credits must
  // always match what a run would actually charge (the same reason the
  // per-step form exists at all), but a quote request per keystroke would
  // hammer the server for no benefit. Same 400ms-class debounce pattern as
  // src/components/studio/WorkflowStudio.js's own per-step quote effect.
  useEffect(() => {
    if (authStatus === "loading" || !authed) return;
    const timer = setTimeout(() => { loadQuote(); }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
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
        body: JSON.stringify({ inputs: inputsPayload }),
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
      {!run && <StepInputsForm stepInputs={stepInputs} values={values} onChange={setFieldValue} />}

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
