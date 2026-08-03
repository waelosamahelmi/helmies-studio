"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Segmented, RatioPicker, Chips, Dropzone, Specs,
  IcImage,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

const EXAMPLES = [
  "Portrait in late afternoon light, shallow depth of field, 85mm",
  "Product on a wet slate surface, single hard key from the left",
  "Interior, north-facing window, pale oak and linen, no people",
  "Weathered concrete facade at dusk, long exposure, cool cast",
];

const FALLBACK_RATIOS = ["1:1", "4:5", "3:2", "16:9", "9:16"];
const FALLBACK_RES = ["1K", "2K", "4K"];

export default function ImageStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [mode, setMode] = useState("tti");
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("2K");
  const [seed, setSeed] = useState("");
  const [reference, setReference] = useState(null);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  /* Filter on the catalog's `capability` field. The previous build tested
     `!model.durations`, but the catalog always emits an array — and `![]` is
     false — so this list rendered empty for every image model. */
  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, mode)),
    [models, mode],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  /* Keep the selection valid when the mode changes the candidate set */
  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) {
      setModelId(available[0].id);
    }
  }, [available, modelId]);

  /* A template arrives after mount — apply it once */
  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setPrompt(templateConfig.prompt);
    if (templateConfig.negative_prompt) setNegative(templateConfig.negative_prompt);
    if (templateConfig.aspect_ratio) setRatio(templateConfig.aspect_ratio);
    if (templateConfig.resolution) setResolution(templateConfig.resolution);
    if (templateConfig.model) setModelId(templateConfig.model);
    if (templateConfig.mode) setMode(templateConfig.mode);
  }, [templateConfig]);

  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;
  const resolutions = model?.resolutions?.length ? model.resolutions : FALLBACK_RES;

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);
  useEffect(() => {
    const has = resolutions.some((r) => String(r).toLowerCase() === String(resolution).toLowerCase());
    if (resolutions.length && !has) setResolution(resolutions[0]);
  }, [resolutions, resolution]);

  const { cost, affordable, balance, shortfall } = useCreditCost("image", model?.id || "", {
    aspect_ratio: ratio,
    resolution,
    image_url: reference?.url,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const needsReference = mode === "iti";
  const blocked = needsReference && !reference?.url;

  const generate = useCallback(() => {
    if (!model || blocked) return;
    submit("image", model.id, {
      endpoint: model.endpoint || model.id,
      prompt,
      negative_prompt: negative || undefined,
      aspect_ratio: ratio,
      resolution,
      image_url: reference?.url || undefined,
      seed: seed === "" ? undefined : Number(seed),
    });
  }, [model, blocked, submit, prompt, negative, ratio, resolution, reference, seed]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Source">
        <Segmented
          label="Generation mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "tti", label: "From text" },
            { value: "iti", label: "From image" },
          ]}
        />
      </Field>

      {needsReference && (
        <Field
          label="Reference image"
          hint={blocked ? "Required for image-to-image." : undefined}
          error={blocked && prompt.trim() ? "Add a reference image to continue." : undefined}
        >
          <Dropzone
            value={reference}
            onChange={setReference}
            accept="image/*"
            label="Drop an image or browse"
            hint="JPG, PNG or WebP"
          />
        </Field>
      )}

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
      </Field>

      {!model?.hasDimensions && resolutions.length > 1 && (
        <Field label="Resolution">
          <Chips
            label="Resolution"
            options={resolutions.map((r) => ({ value: r, label: String(r).toUpperCase() }))}
            value={resolution}
            onChange={setResolution}
            compare={(a, b) => String(a).toLowerCase() === String(b).toLowerCase()}
          />
        </Field>
      )}

      <Field label="Avoid" hint="Elements the render should exclude.">
        {(id) => (
          <textarea
            id={id}
            className="hs-input hs-textarea"
            style={{ minHeight: 64 }}
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            placeholder="text, watermark, extra fingers"
          />
        )}
      </Field>

      <Field label="Seed" hint="Reuse a seed to repeat a composition.">
        {(id) => (
          <input
            id={id}
            className="hs-input"
            type="number"
            inputMode="numeric"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Random"
          />
        )}
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
        emptyHint={
          mode === "iti"
            ? "No image-to-image models in the catalog yet."
            : "No text-to-image models in the catalog yet."
        }
      />

      <Group label="This render">
        <Specs
          rows={[
            { k: "Ratio", v: ratio },
            { k: "Res", v: String(resolution).toUpperCase() },
            { k: "Seed", v: seed === "" ? "Random" : seed },
            { k: "Ref", v: reference ? "Yes" : "None" },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Stage ────────────────────────────────────────────────────────────── */
  const idle = (
    <Idle
      icon={<IcImage />}
      title="Compose an image"
      description={
        needsReference
          ? "Add a reference, then describe the change you want. The model keeps what you don't mention."
          : "Describe the subject, the light, and the framing. Specifics beat adjectives."
      }
      examples={EXAMPLES}
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
          settings={`${String(resolution).toUpperCase()} · ${ratio}`}
          onCancel={cancel}
          onRetry={generate}
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
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
        disabled={!model || blocked}
        cost={cost || 0}
        balance={balance}
        affordable={affordable}
        shortfall={shortfall}
        placeholder={
          needsReference
            ? "Describe the change. What stays, what goes."
            : "Describe the subject, the light, and the framing."
        }
      />
    </Workspace>
  );
}
