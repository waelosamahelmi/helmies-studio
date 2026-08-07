"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Dropzone, Specs,
  IcMusic,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   AUDIO TOOLS — work on audio you already have (EDITSv1 E1.4)
   ──────────────────────────────────────────────────────────────────────────
   The catalog's audio utilities — isolation, vocal separation, style
   boosting, format conversion, lyric/MIDI generation — used to masquerade
   as "composers" in the Music tool and "sound design" in Audio, because
   everything with the coarse "audio" capability landed in both pools. They
   are neither. This surface pools audioKind ∈ {enhancement, conversion,
   utility}: pick the utility, load a track when the job needs one, describe
   the job, run. Structure mirrors VideoEditStudio (Workspace + Brief +
   Stage), and errors go through Stage's error path so this tool inherits
   the ErrorPanel upgrade.

   The generic audio schemas carry no per-utility field metadata yet, so the
   source track is optional rather than hard-gated — a utility that needs
   audio and gets none fails honestly through Stage's Fault, with the hint
   below telling the user up front.
   ══════════════════════════════════════════════════════════════════════════ */

const KIND_LABEL = {
  enhancement: "Enhance",
  conversion: "Convert",
  utility: "Utility",
};

const EXAMPLES = [
  "Isolate the lead vocal, keep the reverb tail natural",
  "Strip the music bed, keep the dialogue clean",
  "Convert to WAV, no processing",
  "Push the whole mix warmer and denser without clipping",
];

export default function AudioToolsStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState(null);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  const available = useMemo(
    () => (models || []).filter(
      (m) => matchesGroup(m, "audio") && ["enhancement", "conversion", "utility"].includes(audioKind(m)),
    ),
    [models],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;
  const kind = audioKind(model);

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) {
      setModelId(available[0].id);
    }
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setPrompt(templateConfig.prompt);
    if (templateConfig.model) setModelId(templateConfig.model);
  }, [templateConfig]);

  const costParams = useMemo(() => ({
    prompt,
    ...(source?.url ? { audio_url: source.url } : {}),
  }), [prompt, source]);

  const { cost, affordable, balance, shortfall } = useCreditCost("audio", model?.id || "", costParams);

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const generate = useCallback(() => {
    if (!model || !prompt.trim()) return;
    submit("audio", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: prompt.trim(),
      ...(source?.url ? { audio_url: source.url } : {}),
    });
  }, [model, prompt, submit, source]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Source track" hint="Most utilities work on a track you attach. Generators (lyrics, MIDI) run from the brief alone.">
        <Dropzone
          value={source}
          onChange={setSource}
          accept="audio/*"
          label={source ? "Replace the source track" : "Drop an audio file or browse"}
          hint="MP3 or WAV"
        />
        {source && (
          <div className="hs-row hs-row--between" style={{ marginTop: "var(--s-2)" }}>
            <span className="hs-hint" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {source.name || "Source track"}
            </span>
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setSource(null)}>
              Remove
            </button>
          </div>
        )}
      </Field>

      <Group label="This pass">
        <Specs
          rows={[
            { k: "Tool", v: model?.displayName || model?.name },
            { k: "Kind", v: kind ? KIND_LABEL[kind] : null },
            { k: "Src", v: source ? "Attached" : "None" },
          ]}
        />
      </Group>
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
        label="Utility"
        emptyHint="No audio utilities in the catalog yet."
      />
    </div>
  );

  const idle = (
    <Idle
      icon={<IcMusic />}
      title="Rework a track"
      description="Pick a utility on the right, load the track it should work on, then describe the job below."
      examples={EXAMPLES}
      onExample={(e) => setPrompt((p) => (p ? `${p}. ${e}` : e))}
    />
  );

  return (
    <Workspace controls={controls} inspector={inspector} inspectorLabel="Utility">
      <div className="st-work__stage">
        <Stage
          generating={generating}
          result={result}
          error={error}
          stage={stage}
          elapsed={elapsed}
          ratio="16:9"
          model={model?.displayName || model?.name}
          settings={[kind ? KIND_LABEL[kind] : null, source ? "Source attached" : null].filter(Boolean).join(" · ")}
          onCancel={cancel}
          onRetry={generate}
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
          onNew={reset}
          idle={idle}
        />
      </div>

      <Brief
        tool="audio"
        value={prompt}
        onChange={setPrompt}
        onSubmit={generate}
        onCancel={cancel}
        generating={generating}
        stage={stage}
        disabled={!model}
        cost={cost || 0}
        balance={balance}
        affordable={affordable}
        shortfall={shortfall}
        maxChars={1000}
        submitLabel="Run"
        placeholder="Describe the job: what to keep, what to remove, what to change."
      />
    </Workspace>
  );
}
