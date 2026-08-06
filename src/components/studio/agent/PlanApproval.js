"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";
import {
  ModelPicker, RatioPicker, Segmented, SpendMeter, Sheet,
  IcFlow, IcCheck,
} from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   PLAN APPROVAL — the one screen read before spending (EDITSv1 E3.4)
   ──────────────────────────────────────────────────────────────────────────
   Every media step is editable: model (picker filtered to the step's
   type), quality (the model's own resolution options), aspect (the model's
   own ratio list). Every change re-quotes the step live through
   POST /api/estimate (server prices only, debounced 400ms). Approve sends
   the EXACT displayed plan — steps as edited, estimate as re-quoted — so
   what you approved is what runs and what you pay (enforced server-side by
   E3.2's honored-approval contract).
   ══════════════════════════════════════════════════════════════════════════ */

const pad = (n) => String(n).padStart(2, "0");

const AGENT_NAMES = {
  orchestrator: "Orchestrator", creative_director: "Creative director",
  image_director: "Image director", video_director: "Video director",
  brand_guardian: "Brand guardian", prompt_engineer: "Prompt engineer",
  storyboard: "Storyboard", audio_agent: "Audio", vision_analyst: "Vision analyst",
  quality_control: "Quality control", cost_optimizer: "Cost optimizer",
  assembly: "Assembly", image: "Image", video: "Video", audio: "Audio",
  website: "Website", marketing: "Marketing", coding: "Code",
  i2v: "Animate", upscale: "Upscale", music: "Music", voiceover: "Voiceover",
  export: "Deliverable",
};
const agentName = (a) => AGENT_NAMES[a] || String(a || "Step").replace(/_/g, " ");

const normalizeKind = (agent) => String(agent || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/* Which steps offer model editing, and which catalog models fit them.
   Filters go through capability groups (the catalog's real vocabulary) with
   a modelType fallback for rows whose capability is missing. */
const EDITABLE_KINDS = new Set(["image", "video", "audio", "i2v", "upscale", "music", "voiceover"]);

// Exported for the review surface (E3.5): the Edit sheet's model-override
// pool uses the same per-step filtering as the plan card. A9: every step
// kind the planner now emits gets a pool from the RIGHT capability group —
// music steps offer only genuine composers (audioKind "music"), voiceover
// steps only speech readers (audioKind "tts"/"dialogue"), the same honest
// sub-classification the Music/Audio studios already gate on.
export function modelsForStep(step, models) {
  const kind = normalizeKind(step.agent);
  if (kind === "image") {
    return models.filter((m) => matchesGroup(m, "tti") || matchesGroup(m, "iti") || m.modelType === "image");
  }
  if (kind === "upscale") {
    return models.filter((m) => matchesGroup(m, "iti") || m.modelType === "image");
  }
  if (kind === "video") {
    const wantsI2V = !!step.params?.image_url;
    return models.filter((m) =>
      wantsI2V
        ? matchesGroup(m, "i2v") || m.modelType === "video"
        : matchesGroup(m, "ttv") || matchesGroup(m, "i2v") || m.modelType === "video",
    );
  }
  if (kind === "i2v") {
    return models.filter((m) => matchesGroup(m, "i2v") || m.modelType === "video");
  }
  if (kind === "music") {
    return models.filter((m) => audioKind(m) === "music");
  }
  if (kind === "voiceover") {
    return models.filter((m) => {
      const sub = audioKind(m);
      return sub === "tts" || sub === "dialogue";
    });
  }
  if (kind === "audio") {
    return models.filter((m) => matchesGroup(m, "audio") || m.modelType === "audio" || m.modelType === "music");
  }
  return [];
}

const findModel = (models, id) =>
  models.find((m) => m.id === id || m.modelId === id || m.endpoint === id) || null;

export const EXECUTION_MODES = [
  { value: "review", label: "Review each asset" },
  { value: "auto", label: "Auto-complete" },
];

export default function PlanApproval({
  message,
  balance,
  busy,
  models = [],
  modelsLoading = false,
  mode = "review",
  onModeChange,
  onApprove,
  onAdjust,
}) {
  const plan = message.plan;
  const approved = message.decision === "approved";

  /* Editable copy of the steps — the source of truth for what Approve sends */
  const [steps, setSteps] = useState(() => (plan?.steps || []).map((s) => ({ ...s, params: { ...(s.params || {}) } })));
  const [pickerFor, setPickerFor] = useState(null); // step index with the model sheet open
  const [adjusting, setAdjusting] = useState(false);
  const [revision, setRevision] = useState("");

  /* Live per-step quotes — seeded from the plan's own server estimate, then
     re-quoted (server prices only) whenever a step changes. */
  const [quote, setQuote] = useState(() => ({
    perStep: (plan?.steps || []).map((s, i) => plan?.estimate?.breakdown?.[i]?.credits ?? null),
    total: typeof plan?.estimate?.total === "number" ? plan.estimate.total : null,
    quoting: false,
  }));

  const quoteKey = useMemo(
    () => JSON.stringify(steps.map((s) => [s.agent, s.params?.model, s.params?.resolution, s.params?.aspect_ratio, s.params?.duration])),
    [steps],
  );

  useEffect(() => {
    if (!steps.length || approved) return undefined;
    let dead = false;
    setQuote((q) => ({ ...q, quoting: true }));

    const timer = setTimeout(async () => {
      try {
        const quoted = await Promise.all(
          steps.map(async (step) => {
            const res = await apiFetch("/api/estimate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tool: step.agent,
                model: step.params?.model || step.agent,
                params: step.params || {},
              }),
              retries: 0,
            });
            const data = await res.json();
            return typeof data?.credits === "number" ? data.credits : null;
          }),
        );
        if (dead) return;
        const total = quoted.length && quoted.every((c) => typeof c === "number")
          ? quoted.reduce((a, b) => a + b, 0)
          : null;
        setQuote({ perStep: quoted, total, quoting: false });
      } catch {
        if (!dead) setQuote((q) => ({ ...q, quoting: false }));
      }
    }, 400);

    return () => { dead = true; clearTimeout(timer); };
  }, [quoteKey, steps, approved]);

  const changeStep = (index, paramsChange) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, params: { ...s.params, ...paramsChange } } : s)));
  };

  /* ModelPicker's onSelect hands back the model's ID (a string), not the
     model object — resolve the row to carry its endpoint along. */
  const selectModel = (index, modelId) => {
    const picked = findModel(models, modelId);
    changeStep(index, {
      model: modelId,
      endpoint: picked?.endpoint || modelId,
    });
    setPickerFor(null);
  };

  const total = quote.total;
  const affordable = balance == null || total == null || balance >= total;
  const shortfall = affordable || total == null || balance == null ? 0 : total - balance;
  const quotesReady = !quote.quoting && total != null && quote.perStep.every((c) => typeof c === "number");

  const approve = () => {
    if (!quotesReady || approved) return;
    /* The EXACT displayed plan: edited steps + the live server re-quote. */
    onApprove?.({
      steps,
      summary: plan.summary,
      estimate: {
        total,
        breakdown: steps.map((s, i) => ({
          step: s.task || s.agent,
          tool: s.agent,
          model: s.params?.model || s.agent,
          credits: quote.perStep[i],
        })),
      },
    }, mode);
  };

  const submitRevision = () => {
    const text = revision.trim();
    if (!text) return;
    setAdjusting(false);
    setRevision("");
    onAdjust?.(text);
  };

  return (
    <section className="st-plan" aria-label={`Proposed plan, ${steps.length} steps`}>
      <header className="st-plan__head">
        <IcFlow className="hs-icon-sm" />
        <span className="hs-label" style={{ margin: 0 }}>Proposed plan</span>
        <span className="hs-badge hs-mono" style={{ marginLeft: "auto" }}>
          {steps.length} {steps.length === 1 ? "step" : "steps"}
        </span>
      </header>

      {plan?.degraded && (
        <p className="hs-notice" style={{ margin: "var(--s-3) var(--s-4) 0" }} data-testid="plan-degraded-notice">
          Quick draft plan — the full planner was unavailable just now, so this is a simpler
          fallback. Review each step (or re-plan in a moment) before approving.
        </p>
      )}

      <div role="list">
        {steps.map((step, i) => {
          const kind = normalizeKind(step.agent);
          const editable = !approved && EDITABLE_KINDS.has(kind);
          const pool = editable ? modelsForStep(step, models) : [];
          const current = findModel(models, step.params?.model);
          const resolutions = current?.resolutions || [];
          const ratios = current?.aspectRatios || [];

          return (
            <div key={`${step.agent}-${i}`} role="listitem">
              <div className="st-plan__step">
                <span className="st-plan__n">{pad(i + 1)}</span>
                <div className="st-plan__task">
                  <span>{agentName(step.agent)}</span>
                  {step.task && <span className="hs-hint">{step.task}</span>}
                </div>
                <span className="st-plan__cost">
                  {quote.quoting ? "…" : quote.perStep[i] == null ? "—" : `${quote.perStep[i]} cr`}
                </span>
              </div>

              {editable && (
                <div className="st-planedit">
                  <div className="st-planedit__row">
                    <span className="hs-label">Model</span>
                    <button
                      type="button"
                      className="hs-btn hs-btn--ghost hs-btn--sm"
                      onClick={() => setPickerFor(i)}
                      disabled={!!busy}
                      aria-label={`Change model for step ${i + 1}`}
                    >
                      {current?.displayName || step.params?.model || "Choose model"}
                    </button>
                  </div>

                  {resolutions.length > 0 && (
                    <div className="st-planedit__row">
                      <span className="hs-label">Quality</span>
                      <Segmented
                        label={`Quality for step ${i + 1}`}
                        options={resolutions.slice(0, 4).map((r) => ({ value: r, label: String(r).toUpperCase() }))}
                        value={step.params?.resolution || resolutions[0]}
                        onChange={(v) => changeStep(i, { resolution: v })}
                      />
                    </div>
                  )}

                  {ratios.length > 0 && (
                    <div className="st-planedit__row">
                      <span className="hs-label">Aspect</span>
                      <RatioPicker
                        options={ratios.slice(0, 6)}
                        value={step.params?.aspect_ratio || ratios[0]}
                        onChange={(v) => changeStep(i, { aspect_ratio: v })}
                      />
                    </div>
                  )}

                  <Sheet
                    open={pickerFor === i}
                    onClose={() => setPickerFor(null)}
                    title={`Model — step ${pad(i + 1)}`}
                  >
                    <ModelPicker
                      models={pool}
                      value={step.params?.model}
                      onSelect={(m) => selectModel(i, m)}
                      loading={modelsLoading}
                      label="Model"
                      emptyHint="No models available for this step type."
                    />
                  </Sheet>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!approved && (
        <div className="st-plan__mode">
          <span className="hs-label" style={{ margin: 0 }}>Execution</span>
          <Segmented
            label="Execution mode"
            options={EXECUTION_MODES}
            value={mode}
            onChange={(v) => onModeChange?.(v)}
          />
        </div>
      )}

      <footer className="st-plan__foot">
        <SpendMeter
          cost={total ?? 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          label="Total"
        />

        {approved ? (
          <span className="st-plan__acts hs-mono" style={{ fontSize: 10, color: "var(--signal)" }}>
            <IcCheck className="hs-icon-sm" /> Approved
          </span>
        ) : (
          <span className="st-plan__acts">
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={() => setAdjusting((v) => !v)}
              disabled={!!busy}
            >
              Adjust
            </button>
            <button
              type="button"
              className="hs-btn hs-btn--primary hs-btn--sm"
              onClick={approve}
              disabled={!!busy || !affordable || !steps.length || !quotesReady}
              title={
                !affordable ? "Not enough credits for this plan"
                : !quotesReady ? "Waiting for the live quote"
                : `Approve and spend ${total} credits`
              }
            >
              <IcCheck className="hs-icon-sm" />
              Approve
              {total != null && <span className="hs-btn__cost hs-mono">{total}</span>}
            </button>
          </span>
        )}
      </footer>

      {adjusting && !approved && (
        <div className="st-question__custom" style={{ padding: "var(--s-3) var(--s-4)" }}>
          <input
            className="hs-input"
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitRevision(); } }}
            placeholder="What should change about this plan?"
            aria-label="Revision request"
          />
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm"
            onClick={submitRevision}
            disabled={!revision.trim()}
          >
            Re-plan
          </button>
        </div>
      )}
    </section>
  );
}
