"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, RatioPicker, Specs,
  IcFilm,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   MOTION — designed movement: loops, backgrounds, title beds
   ──────────────────────────────────────────────────────────────────────────
   Fixed in this rebuild:
   · The quote asked the server to price tool "vibe-motion" while the job was
     submitted as tool "motion". `getFallbackCost` in lib/pricing-engine.js
     has a `motion` key and no `vibe-motion` key, so the meter quoted the
     generic default (2) and the job charged the motion rate (8). Both
     strings are "motion" now.
   · The generate callback closed over `motionModelId` but left it out of its
     dependency array, so the first render's model id was submitted forever —
     including the empty string before the catalog loaded.
   · `error` was rendered only as a tiny line in the inspector, below the
     fold. It goes to <Stage>.
   · The model was picked silently by name match with a blind fallback to
     whatever was first. The choice is visible and changeable now.
   ══════════════════════════════════════════════════════════════════════════ */

const EXAMPLES = [
  "Slow iridescent liquid folding over itself, dark field, seamless loop",
  "Thin geometric lines drifting apart and re-forming, single accent colour",
  "Soft gradient bloom pulsing at a slow tempo, grain over the top",
  "Paper-cut shapes sliding in from the edges, flat colour, no gradients",
];

const FALLBACK_RATIOS = ["16:9", "9:16", "1:1", "4:5", "21:9"];
const FALLBACK_DURATIONS = [3, 6, 10, 15];

const MODES = {
  compose: {
    label: "Compose",
    placeholder: "Describe the movement: what forms, how it travels, what tempo.",
    idle: "Describe the movement, not just the picture. Tempo, direction and what repeats are what make a loop work.",
    submit: "Generate",
  },
  restyle: {
    label: "Restyle a take",
    placeholder: "Describe the change to apply to that take.",
    idle: "Paste the request id from a take you already rendered, then describe the change. The composition is kept; the treatment is redone.",
    submit: "Restyle",
  },
};

export default function MotionStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [mode, setMode] = useState("compose");
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(6);
  const [requestId, setRequestId] = useState("");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Motion is a text-to-video job. Prefer models that name themselves for it,
     but never hide the rest — a silent fallback to "whatever was first" is
     how the old build charged people for the wrong model. */
  const available = useMemo(() => {
    const video = (models || []).filter((m) => matchesGroup(m, "ttv"));
    const named = video.filter((m) => /motion|graphic|animate|loop/i.test(`${m.displayName || ""} ${m.id || ""}`));
    return named.length ? [...named, ...video.filter((m) => !named.includes(m))] : video;
  }, [models]);

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) {
      setModelId(available[0].id);
    }
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setPrompt(templateConfig.prompt);
    if (templateConfig.aspect_ratio) setRatio(templateConfig.aspect_ratio);
    if (templateConfig.duration_seconds) setDuration(Number(templateConfig.duration_seconds));
    if (templateConfig.duration) setDuration(Number(templateConfig.duration));
    if (templateConfig.model) setModelId(templateConfig.model);
    if (templateConfig.mode) setMode(templateConfig.mode);
  }, [templateConfig]);

  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;
  const durations = useMemo(() => {
    const d = (model?.durations || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return d.length ? d : FALLBACK_DURATIONS;
  }, [model]);

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);
  useEffect(() => {
    if (durations.length && !durations.includes(Number(duration))) setDuration(durations[0]);
  }, [durations, duration]);

  /* Same tool string as submit() — see the note at the top of this file */
  const { cost, affordable, balance, shortfall } = useCreditCost("motion", model?.id || "", {
    duration_seconds: duration,
    aspect_ratio: ratio,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const restyling = mode === "restyle";
  const missingTake = restyling && !requestId.trim();

  const generate = useCallback(() => {
    if (!model || missingTake) return;
    const params = {
      endpoint: model.endpoint || model.id,
      aspect_ratio: ratio,
      duration_seconds: Number(duration),
    };
    if (restyling) {
      params.request_id = requestId.trim();
      params.edit_prompt = prompt;
    } else {
      params.prompt = prompt;
    }
    submit("motion", model.id, params);
  }, [model, missingTake, restyling, submit, prompt, ratio, duration, requestId]);

  const copy = MODES[mode];

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Job">
        <Segmented
          label="Motion mode"
          value={mode}
          onChange={setMode}
          options={Object.entries(MODES).map(([value, m]) => ({ value, label: m.label }))}
        />
      </Field>

      {restyling && (
        <Field
          label="Take to restyle"
          hint="The request id shown on a motion take you already rendered."
          error={missingTake && prompt.trim() ? "Paste a request id to say which take to restyle." : undefined}
        >
          {(id) => (
            <input
              id={id}
              className="hs-input hs-mono"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              placeholder="req_…"
              spellCheck={false}
            />
          )}
        </Field>
      )}

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
      </Field>

      <Field label="Duration" hint="Longer loops cost more.">
        <Chips
          label="Duration"
          options={durations.map((d) => ({ value: d, label: `${d}s` }))}
          value={duration}
          onChange={(v) => setDuration(Number(v))}
          compare={(a, b) => Number(a) === Number(b)}
          scroll
        />
      </Field>
    </div>
  );

  /* ── Inspector ────────────────────────────────────────────────────────── */
  const inspector = (
    <div className="hs-stack" style={{ gap: "var(--s-5)", minHeight: 0 }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        emptyHint="No motion-capable models in the catalog yet."
      />

      <Group label="This take">
        <Specs
          rows={[
            { k: "Job", v: copy.label },
            { k: "Ratio", v: ratio },
            { k: "Length", v: `${duration}s` },
            { k: "Take", v: restyling ? (requestId.trim() || "None") : "New" },
          ]}
        />
      </Group>
    </div>
  );

  const idle = (
    <Idle
      icon={<IcFilm />}
      title={restyling ? "Restyle a take" : "Compose a loop"}
      description={copy.idle}
      examples={restyling ? [] : EXAMPLES}
      onExample={(e) => setPrompt((p) => (p ? `${p}. ${e}` : e))}
    />
  );

  return (
    <Workspace controls={controls} inspector={inspector} inspectorLabel="Model">
      <div className="st-work__stage">
        <Stage
          generating={generating}
          result={result}
          error={error}
          stage={stage}
          elapsed={elapsed}
          ratio={ratio}
          model={model?.displayName || model?.name}
          settings={`${ratio} · ${duration}s`}
          onCancel={cancel}
          onRetry={generate}
          onNew={reset}
          idle={idle}
        />
      </div>

      <Brief
        value={prompt}
        onChange={setPrompt}
        onSubmit={generate}
        onCancel={cancel}
        generating={generating}
        stage={stage}
        disabled={!model || missingTake}
        cost={cost || 0}
        balance={balance}
        affordable={affordable}
        shortfall={shortfall}
        placeholder={copy.placeholder}
        submitLabel={copy.submit}
      />
    </Workspace>
  );
}
