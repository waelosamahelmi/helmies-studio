"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle, SpendMeter,
  Field, Group, Chips, RatioPicker, Dropzone, Specs,
  IcImage, IcCamera, IcPersona, IcBolt, IcClose,
} from "@/components/studio/kit";
import { CINEMA_CAMERAS, CINEMA_LENS, CINEMA_FOCAL, CINEMA_APERTURE, INFLUENCER_TABS } from "@/lib/models";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useStudioMode } from "./useStudioMode";
import ModeBar from "./ModeBar";
import CanvasStudio from "./CanvasStudio";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   IMAGE — one studio, four modes (S1 consolidation)
   ──────────────────────────────────────────────────────────────────────────
   · Create   — text-to-image, with preset chips that carry the retired
                Cinema and Influencer tools' prompt scaffolding: Cinematic
                brings the camera-kit controls whose choices compile into
                the brief; Influencer brings the persona traits that hold
                one character steady across shots.
   · Edit     — image-to-image: load a reference, describe the change.
   · Upscale  — the `image-upscale` capability pool only; no brief needed.
   · Canvas   — the compositing editor, mounted whole (CanvasStudio).

   The active mode (and Create's preset) lives in the URL — see
   useStudioMode — so /studio/cinema and /studio/canvas bookmarks redirect
   here and land on the exact surface they always meant. Each mode body is
   keyed by its mode: state is isolated per mode, the same contract
   StudioClient's ErrorBoundary applies per tool.
   ══════════════════════════════════════════════════════════════════════════ */

const MODES = ["create", "edit", "upscale", "canvas"];
const MODE_OPTIONS = [
  { value: "create", label: "Create" },
  { value: "edit", label: "Edit" },
  { value: "upscale", label: "Upscale" },
  { value: "canvas", label: "Canvas" },
];
const PRESETS = ["cinematic", "influencer"];

const CREATE_EXAMPLES = [
  "Portrait in late afternoon light, shallow depth of field, 85mm",
  "Product on a wet slate surface, single hard key from the left",
  "Interior, north-facing window, pale oak and linen, no people",
  "Weathered concrete facade at dusk, long exposure, cool cast",
];

const CINEMATIC_EXAMPLES = [
  "A lone figure crossing wet asphalt, sodium streetlight, rain in the beam",
  "Close on an eye, catchlight from a window, everything else falls away",
  "Desert highway at dusk, heat shimmer flattening the distance",
  "Interrogation room, one overhead practical, hard shadow under the brow",
];

const INFLUENCER_EXAMPLES = [
  "In a sunlit gym, mid-set, breathing hard, no phone in frame",
  "On a Paris street in autumn, walking, caught mid-stride",
  "In a quiet cafe by the window, laptop closed, morning light",
  "On a beach at golden hour, wind in the hair, looking off-frame",
];

/* Framing and light — ported from the retired CinemaStudio. Prompt
   fragments only: they change the sentence, never the price. */
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

const FALLBACK_RATIOS = ["1:1", "4:5", "3:2", "16:9", "9:16"];
const FALLBACK_RES = ["1K", "2K", "4K"];

const byId = (list, id) => list.find((x) => x.id === id);

const DEFAULT_TRAITS = INFLUENCER_TABS.reduce((acc, tab) => {
  tab.categories.forEach((cat) => { acc[cat.id] = cat.options[0]?.id; });
  return acc;
}, {});

/* ── Create / Edit — parameters → one still ───────────────────────────── */
function ImageGenMode({ mode, preset, onPreset, initialModel, templateConfig, onCreditsChanged }) {
  const editing = mode === "edit";

  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("2K");
  const [seed, setSeed] = useState("");
  const [reference, setReference] = useState(null);

  /* Cinematic preset — the retired CinemaStudio's camera department */
  const [camera, setCamera] = useState(CINEMA_CAMERAS[0]?.id || "");
  const [lens, setLens] = useState(CINEMA_LENS[0]?.id || "");
  const [focal, setFocal] = useState(CINEMA_FOCAL[3]?.id || "");
  const [aperture, setAperture] = useState(CINEMA_APERTURE[0]?.id || "");
  const [framing, setFraming] = useState("");
  const [light, setLight] = useState("");

  /* Influencer preset — the retired InfluencerStudio's held-steady persona */
  const [personaName, setPersonaName] = useState("");
  const [traits, setTraits] = useState(DEFAULT_TRAITS);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  /* Create pools the t2i group; Edit pools i2i-style capabilities minus
     upscalers, which have their own mode now. */
  const available = useMemo(
    () => (models || []).filter((m) =>
      editing
        ? matchesGroup(m, "iti") && m.capability !== "image-upscale"
        : matchesGroup(m, "tti"),
    ),
    [models, editing],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;

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
    if (templateConfig.persona_name) setPersonaName(templateConfig.persona_name);
    if (templateConfig.traits) setTraits((t) => ({ ...t, ...templateConfig.traits }));
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
    image_url: reference?.url,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const cinematic = !editing && preset === "cinematic";
  const influencer = !editing && preset === "influencer";

  /* The preset scaffolding compiles into the sentence the model reads —
     visible in the inspector, never hidden. */
  const presetParts = useMemo(() => {
    if (cinematic) {
      return [
        { k: "Framing", v: byId(FRAMING, framing)?.prompt },
        { k: "Camera", v: byId(CINEMA_CAMERAS, camera)?.prompt },
        { k: "Lens", v: byId(CINEMA_LENS, lens)?.prompt },
        { k: "Focal", v: byId(CINEMA_FOCAL, focal)?.prompt },
        { k: "Aperture", v: byId(CINEMA_APERTURE, aperture)?.prompt },
        { k: "Light", v: byId(LIGHT, light)?.prompt },
      ].filter((p) => p.v);
    }
    if (influencer) {
      const out = [];
      INFLUENCER_TABS.forEach((tab) => {
        tab.categories.forEach((cat) => {
          const opt = cat.options.find((o) => o.id === traits[cat.id]);
          if (opt?.promptVal) out.push({ k: cat.label, v: opt.promptVal });
        });
      });
      if (personaName.trim()) out.push({ k: "Name", v: personaName.trim() });
      return out;
    }
    return [];
  }, [cinematic, influencer, framing, camera, lens, focal, aperture, light, traits, personaName]);

  const compiled = useMemo(() => {
    const scaffold = presetParts.map((p) => p.v);
    if (influencer) {
      return [...scaffold, prompt.trim(), "professional photograph, sharp detail"]
        .filter(Boolean).join(", ");
    }
    if (cinematic) {
      return [prompt.trim(), ...scaffold].filter(Boolean).join(", ");
    }
    return prompt.trim();
  }, [presetParts, prompt, cinematic, influencer]);

  const needsReference = editing;
  const blocked = needsReference && !reference?.url;

  const generate = useCallback(() => {
    if (!model || blocked || !compiled) return;
    submit("image", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: compiled,
      negative_prompt: negative || undefined,
      aspect_ratio: ratio,
      resolution,
      image_url: reference?.url || undefined,
      seed: seed === "" ? undefined : Number(seed),
    });
  }, [model, blocked, compiled, submit, negative, ratio, resolution, reference, seed]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      {!editing && (
        <Field label="Preset" hint="Cinematic brings the camera kit; Influencer holds one persona steady.">
          <Chips
            label="Create preset"
            options={[
              { value: "", label: "None" },
              { value: "cinematic", label: "Cinematic" },
              { value: "influencer", label: "Influencer" },
            ]}
            value={preset || ""}
            onChange={(v) => onPreset?.(v || null)}
          />
        </Field>
      )}

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

      {cinematic && (
        <>
          <Field label="Camera body" hint="Sets the grain, latitude and colour the model reaches for.">
            <Chips label="Camera body" options={CINEMA_CAMERAS.map((c) => ({ value: c.id, label: c.name }))} value={camera} onChange={setCamera} scroll />
          </Field>
          <Field label="Lens" hint="Character before sharpness — flare, bokeh and falloff.">
            <Chips label="Lens" options={CINEMA_LENS.map((l) => ({ value: l.id, label: l.name }))} value={lens} onChange={setLens} scroll />
          </Field>
          <Field label="Focal length" hint="Wide bends space outward; long compresses it.">
            <Chips label="Focal length" options={CINEMA_FOCAL.map((f) => ({ value: f.id, label: f.name }))} value={focal} onChange={setFocal} scroll />
          </Field>
          <Field label="Aperture" hint="How much of the frame stays in focus.">
            <Chips label="Aperture" options={CINEMA_APERTURE.map((a) => ({ value: a.id, label: a.name }))} value={aperture} onChange={setAperture} />
          </Field>
          <Field label="Framing" hint="Where the camera stands relative to the subject.">
            <Chips label="Framing" options={FRAMING.map((f) => ({ value: f.id, label: f.name }))} value={framing} onChange={setFraming} scroll />
          </Field>
          <Field label="Light" hint="The single biggest lever on how the frame feels.">
            <Chips label="Light" options={LIGHT.map((l) => ({ value: l.id, label: l.name }))} value={light} onChange={setLight} scroll />
          </Field>
        </>
      )}

      {influencer && (
        <>
          <Field label="Persona name" hint="Reusing the same name across shots helps the model stay consistent.">
            {(id) => (
              <input
                id={id}
                className="hs-input"
                value={personaName}
                maxLength={24}
                onChange={(e) => setPersonaName(e.target.value)}
                placeholder="Alex, Sophia, Mina"
              />
            )}
          </Field>
          {INFLUENCER_TABS.map((tab) =>
            tab.categories.map((cat) => (
              <Field key={cat.id} label={cat.label}>
                <Chips
                  label={cat.label}
                  options={cat.options.map((o) => ({ value: o.id, label: o.label }))}
                  value={traits[cat.id]}
                  onChange={(v) => setTraits((t) => ({ ...t, [cat.id]: v }))}
                  scroll
                />
              </Field>
            )),
          )}
        </>
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
          editing
            ? "No image-editing models in the catalog yet."
            : "No text-to-image models in the catalog yet."
        }
      />

      <Group label="This render">
        <Specs
          rows={[
            { k: "Preset", v: cinematic ? "Cinematic" : influencer ? "Influencer" : null },
            { k: "Ratio", v: ratio },
            { k: "Res", v: String(resolution).toUpperCase() },
            { k: "Seed", v: seed === "" ? "Random" : seed },
            { k: "Ref", v: reference ? "Yes" : editing ? "Missing" : "None" },
          ]}
        />
      </Group>

      {(cinematic || influencer) && (
        <Group label="Compiled brief">
          <div className="hs-panel-quiet" style={{ padding: "var(--s-4)" }}>
            {presetParts.length ? (
              <p style={{ margin: 0, fontSize: "var(--t-sm)", lineHeight: 1.6 }}>
                {presetParts.map((p, i) => (
                  <span key={p.k}>
                    <span className="hs-mute" style={{ fontSize: 10 }}>{p.k}: </span>
                    <span>{p.v}</span>
                    {i < presetParts.length - 1 && <span className="hs-dim">, </span>}
                  </span>
                ))}
              </p>
            ) : (
              <p className="hs-hint" style={{ margin: 0 }}>
                Pick the preset&apos;s options in the settings pane — the sentence builds here.
              </p>
            )}
          </div>
        </Group>
      )}
    </div>
  );

  /* ── Stage ────────────────────────────────────────────────────────────── */
  const idle = (
    <Idle
      icon={cinematic ? <IcCamera /> : influencer ? <IcPersona /> : <IcImage />}
      title={
        editing ? "Change an image"
        : cinematic ? "Set up the shot"
        : influencer ? "Build a persona, then place them"
        : "Compose an image"
      }
      description={
        editing
          ? "Add a reference, then describe the change you want. The model keeps what you don't mention."
          : cinematic
            ? "Choose the body, glass and stop first, then write the subject. The controls compile into one brief you can read before you spend."
            : influencer
              ? "Set the traits once. From then on you only write the scene, and the same person shows up in it."
              : "Describe the subject, the light, and the framing. Specifics beat adjectives."
      }
      examples={editing ? [] : cinematic ? CINEMATIC_EXAMPLES : influencer ? INFLUENCER_EXAMPLES : CREATE_EXAMPLES}
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
          editing ? "Describe the change. What stays, what goes."
          : cinematic ? "Write the subject. The camera kit is already in the brief."
          : influencer ? "Describe the scene: where they are, what they are doing, the light."
          : "Describe the subject, the light, and the framing."
        }
      />
    </Workspace>
  );
}

/* ── Upscale — one image in, a larger one out; no brief required ────────── */
function ImageUpscaleMode({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [source, setSource] = useState(null);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  const available = useMemo(
    () => (models || []).filter((m) => m.capability === "image-upscale"),
    [models],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) {
      setModelId(available[0].id);
    }
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig?.model) return;
    setModelId(templateConfig.model);
  }, [templateConfig]);

  const { cost, affordable, balance, shortfall } = useCreditCost("image", model?.id || "", {
    image_url: source?.url,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const ready = !!source?.url && !!model && affordable && !generating;

  const generate = useCallback(() => {
    if (!model || !source?.url) return;
    submit("image", model.id, {
      endpoint: model.endpoint || model.id,
      image_url: source.url,
    });
  }, [model, source, submit]);

  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Source image" hint="The image to enlarge. Detail is added, not invented wholesale.">
        <Dropzone
          value={source}
          onChange={setSource}
          accept="image/*"
          label="Drop an image or browse"
          hint="JPG, PNG or WebP"
        />
      </Field>

      <Group label="This pass">
        <Specs
          rows={[
            { k: "Model", v: model?.displayName || model?.name },
            { k: "Source", v: source ? "Loaded" : "Missing" },
          ]}
        />
      </Group>
    </div>
  );

  const inspector = (
    <div className="hs-stack" style={{ gap: "var(--s-5)", minHeight: 0 }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        label="Upscaler"
        emptyHint="No upscaling models in the catalog yet."
      />
    </div>
  );

  const idle = (
    <Idle
      icon={<IcImage />}
      title="Enlarge an image"
      description="Load the image to upscale, pick an upscaler on the right, and run. No brief needed."
    />
  );

  /* No required brief — the action gates on the source, same shape the old
     RecastStudio dock used. Same meter, same button, different condition. */
  const dock = (
    <div className="st-dock-prompt">
      <div className="st-spend">
        <SpendMeter
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          label="Cost"
        />

        {generating ? (
          <button type="button" className="hs-btn hs-btn--outline hs-btn--lg" onClick={cancel}>
            <span className="hs-spin" />
            {stage ? String(stage).replace(/_/g, " ") : "Working"}
            <IcClose className="hs-icon-sm" />
          </button>
        ) : (
          <button
            type="button"
            className="hs-btn hs-btn--primary hs-btn--lg"
            onClick={generate}
            disabled={!ready}
            title={
              !model ? "No upscaling model available"
                : !source ? "Load the source image first"
                  : !affordable ? "Not enough credits"
                    : "Upscale"
            }
          >
            <IcBolt className="hs-icon-sm" />
            Upscale
            {cost > 0 && <span className="hs-btn__cost">{cost}</span>}
          </button>
        )}
      </div>
    </div>
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
          ratio="1:1"
          model={model?.displayName || model?.name}
          settings="Upscale"
          onCancel={cancel}
          onRetry={generate}
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
          onNew={reset}
          idle={idle}
        />
      </div>

      {dock}
    </Workspace>
  );
}

/* ── The studio: mode strip + the active mode's body ────────────────────── */
export default function ImageStudio(props) {
  const { mode, preset, setMode, setPreset } = useStudioMode({
    modes: MODES,
    fallback: "create",
    presets: PRESETS,
  });

  return (
    <div className="st-moded">
      <ModeBar label="Image mode" value={mode} onChange={setMode} options={MODE_OPTIONS} />
      <div className="st-moded__body" key={mode}>
        {mode === "canvas" ? (
          <CanvasStudio {...props} />
        ) : mode === "upscale" ? (
          <ImageUpscaleMode {...props} />
        ) : (
          <ImageGenMode {...props} mode={mode} preset={preset} onPreset={setPreset} />
        )}
      </div>
    </div>
  );
}
