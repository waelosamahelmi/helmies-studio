"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Chips, RatioPicker, Specs,
  IcCamera,
} from "@/components/studio/kit";
import { CINEMA_CAMERAS, CINEMA_LENS, CINEMA_FOCAL, CINEMA_APERTURE } from "@/lib/models";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   CINEMA — a camera department, not a prompt box
   ──────────────────────────────────────────────────────────────────────────
   Every control here compiles into one sentence the model can read. The
   inspector shows that sentence so nothing about the render is hidden.

   Fixed in this rebuild:
   · `resolution` was submitted and priced but had no control and no setter,
     so every render in this tool was locked to 1K forever. It is a real
     control now and it follows the selected model.
   · The model list was filtered against the chosen aspect ratio, which made
     the picker empty whenever a ratio was rare. The picker now filters on
     capability and the ratio list follows the model instead.
   · `error` was never rendered — failures were silent. It goes to <Stage>.
   ══════════════════════════════════════════════════════════════════════════ */

const EXAMPLES = [
  "A lone figure crossing wet asphalt, sodium streetlight, rain in the beam",
  "Close on an eye, catchlight from a window, everything else falls away",
  "Desert highway at dusk, heat shimmer flattening the distance",
  "Interrogation room, one overhead practical, hard shadow under the brow",
];

/* Framing and light are prompt fragments, same as the camera libraries —
   they change the sentence, never the price. */
const FRAMING = [
  { id: "", name: "Not specified", prompt: "" },
  { id: "wide", name: "Wide", prompt: "wide establishing shot" },
  { id: "medium", name: "Medium", prompt: "medium shot" },
  { id: "close", name: "Close-up", prompt: "close-up" },
  { id: "extreme-close", name: "Extreme close", prompt: "extreme close-up" },
  { id: "ots", name: "Over the shoulder", prompt: "over-the-shoulder framing" },
  { id: "low", name: "Low angle", prompt: "low camera angle" },
  { id: "high", name: "High angle", prompt: "high camera angle" },
];

const LIGHT = [
  { id: "", name: "Not specified", prompt: "" },
  { id: "available", name: "Available", prompt: "available natural light" },
  { id: "golden", name: "Golden hour", prompt: "golden hour backlight" },
  { id: "hard-key", name: "Hard key", prompt: "single hard key light, deep shadow" },
  { id: "soft-key", name: "Soft key", prompt: "large soft key, gentle falloff" },
  { id: "practical", name: "Practicals", prompt: "practical lights in frame" },
  { id: "high-key", name: "High key", prompt: "high-key lighting, low contrast" },
  { id: "low-key", name: "Low key", prompt: "low-key lighting, deep blacks" },
];

const FALLBACK_RATIOS = ["21:9", "16:9", "2:3", "3:2", "4:3", "1:1", "9:16"];
const FALLBACK_RES = ["1K", "2K", "4K"];

const byId = (list, id) => list.find((x) => x.id === id);

export default function CinemaStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");

  const [camera, setCamera] = useState(CINEMA_CAMERAS[0]?.id || "");
  const [lens, setLens] = useState(CINEMA_LENS[0]?.id || "");
  const [focal, setFocal] = useState(CINEMA_FOCAL[3]?.id || "");
  const [aperture, setAperture] = useState(CINEMA_APERTURE[0]?.id || "");
  const [framing, setFraming] = useState("");
  const [light, setLight] = useState("");

  const [ratio, setRatio] = useState("21:9");
  const [resolution, setResolution] = useState("2K");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "tti")),
    [models],
  );

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
    if (templateConfig.resolution) setResolution(templateConfig.resolution);
    if (templateConfig.model) setModelId(templateConfig.model);
    if (templateConfig.camera) setCamera(templateConfig.camera);
    if (templateConfig.lens) setLens(templateConfig.lens);
    if (templateConfig.focal) setFocal(templateConfig.focal);
    if (templateConfig.aperture) setAperture(templateConfig.aperture);
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
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  /* ── The compiled sentence ────────────────────────────────────────────── */
  const parts = useMemo(() => [
    { k: "Subject", v: prompt.trim() },
    { k: "Framing", v: byId(FRAMING, framing)?.prompt },
    { k: "Camera", v: byId(CINEMA_CAMERAS, camera)?.prompt },
    { k: "Lens", v: byId(CINEMA_LENS, lens)?.prompt },
    { k: "Focal", v: byId(CINEMA_FOCAL, focal)?.prompt },
    { k: "Aperture", v: byId(CINEMA_APERTURE, aperture)?.prompt },
    { k: "Light", v: byId(LIGHT, light)?.prompt },
  ].filter((p) => p.v), [prompt, framing, camera, lens, focal, aperture, light]);

  const compiled = parts.map((p) => p.v).join(", ");

  const generate = useCallback(() => {
    if (!model || !compiled) return;
    submit("image", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: compiled,
      aspect_ratio: ratio,
      resolution,
    });
  }, [model, compiled, submit, ratio, resolution]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Camera body" hint="Sets the grain, latitude and colour the model reaches for.">
        <Chips
          label="Camera body"
          options={CINEMA_CAMERAS.map((c) => ({ value: c.id, label: c.name }))}
          value={camera}
          onChange={setCamera}
          scroll
        />
      </Field>

      <Field label="Lens" hint="Character before sharpness — flare, bokeh and falloff.">
        <Chips
          label="Lens"
          options={CINEMA_LENS.map((l) => ({ value: l.id, label: l.name }))}
          value={lens}
          onChange={setLens}
          scroll
        />
      </Field>

      <Field label="Focal length" hint="Wide bends space outward; long compresses it.">
        <Chips
          label="Focal length"
          options={CINEMA_FOCAL.map((f) => ({ value: f.id, label: f.name }))}
          value={focal}
          onChange={setFocal}
          scroll
        />
      </Field>

      <Field label="Aperture" hint="How much of the frame stays in focus.">
        <Chips
          label="Aperture"
          options={CINEMA_APERTURE.map((a) => ({ value: a.id, label: a.name }))}
          value={aperture}
          onChange={setAperture}
        />
      </Field>

      <Field label="Framing" hint="Where the camera stands relative to the subject.">
        <Chips
          label="Framing"
          options={FRAMING.map((f) => ({ value: f.id, label: f.name }))}
          value={framing}
          onChange={setFraming}
          scroll
        />
      </Field>

      <Field label="Light" hint="The single biggest lever on how the frame feels.">
        <Chips
          label="Light"
          options={LIGHT.map((l) => ({ value: l.id, label: l.name }))}
          value={light}
          onChange={setLight}
          scroll
        />
      </Field>

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
      </Field>

      {!model?.hasDimensions && resolutions.length > 1 && (
        <Field label="Resolution" hint="Larger frames cost more.">
          <Chips
            label="Resolution"
            options={resolutions.map((r) => ({ value: r, label: String(r).toUpperCase() }))}
            value={resolution}
            onChange={setResolution}
            compare={(a, b) => String(a).toLowerCase() === String(b).toLowerCase()}
          />
        </Field>
      )}
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
        emptyHint="No image models in the catalog yet."
      />

      <Group label="Camera kit">
        <Specs
          rows={[
            { k: "Body", v: byId(CINEMA_CAMERAS, camera)?.name },
            { k: "Lens", v: byId(CINEMA_LENS, lens)?.name },
            { k: "Focal", v: byId(CINEMA_FOCAL, focal)?.name },
            { k: "Stop", v: byId(CINEMA_APERTURE, aperture)?.name },
            { k: "Ratio", v: ratio },
            { k: "Res", v: String(resolution).toUpperCase() },
          ]}
        />
      </Group>

      <Group label="Compiled brief">
        <div className="hs-panel-quiet" style={{ padding: "var(--s-4)" }}>
          {parts.length ? (
            <p style={{ margin: 0, fontSize: "var(--t-sm)", lineHeight: 1.6 }}>
              {parts.map((p, i) => (
                <span key={p.k}>
                  <span className="hs-mute" style={{ fontSize: 10 }}>{p.k}: </span>
                  <span>{p.v}</span>
                  {i < parts.length - 1 && <span className="hs-dim">, </span>}
                </span>
              ))}
            </p>
          ) : (
            <p className="hs-hint" style={{ margin: 0 }}>
              Pick a camera and lens, then write the subject. The sentence builds here.
            </p>
          )}
        </div>
      </Group>
    </div>
  );

  const idle = (
    <Idle
      icon={<IcCamera />}
      title="Set up the shot"
      description="Choose the body, glass and stop first, then write the subject. The controls compile into one brief you can read before you spend."
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
        disabled={!model}
        cost={cost || 0}
        balance={balance}
        affordable={affordable}
        shortfall={shortfall}
        placeholder="Write the subject. The camera kit is already in the brief."
      />
    </Workspace>
  );
}
