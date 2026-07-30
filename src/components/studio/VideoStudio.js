"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, RatioPicker, Dropzone, Specs,
  IcVideo,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   VIDEO — text, a still, or existing footage becomes motion
   ──────────────────────────────────────────────────────────────────────────
   Fixed in this rebuild:
   · The model list filtered on `!model.durations`. The catalog always emits
     an array and `![]` is false, so every mode rendered an empty picker.
     It now filters with matchesGroup(model, "ttv" | "i2v" | "v2v").
   · The start/end frame uploaders only rendered under
     `currentModel.hasStartEndFrame` — a flag that exists on the static
     fallback list and is never emitted by the live catalog, so the controls
     were permanently unreachable. They now show whenever a source is in play,
     which is a condition that is actually true.
   · `error` was computed and never rendered, so a failed render looked like
     nothing happened. It goes to <Stage> now.
   · Duration, resolution and ratio follow the selected model instead of
     keeping a value the model does not offer.
   ══════════════════════════════════════════════════════════════════════════ */

const EXAMPLES = [
  "Drone push over a ridge at first light, mist sitting in the valley",
  "Product turns slowly on wet slate, one hard key from the left",
  "Handheld follow through a night market, neon spill across faces",
  "Locked-off wide of an empty diner, rain on the glass, no people",
];

const MOVES = [
  { value: "static", label: "Static" },
  { value: "pan", label: "Pan" },
  { value: "zoom", label: "Push in" },
  { value: "tracking", label: "Tracking" },
];

const FALLBACK_RATIOS = ["16:9", "9:16", "1:1"];
/* Stable identity so the "settings follow the model" effects below do not
   re-fire on every render when a model publishes no resolutions. */
const NONE = [];

const MODE_COPY = {
  ttv: {
    label: "From text",
    empty: "No text-to-video models in the catalog yet.",
    placeholder: "Describe the shot: subject, camera, light, and what moves.",
    idle: "Describe one shot. Say what moves and how the camera behaves — a list of nouns renders as a slideshow.",
  },
  i2v: {
    label: "From image",
    empty: "No image-to-video models in the catalog yet.",
    placeholder: "Describe what should move, and how the camera behaves.",
    idle: "Load the still you want to animate, then describe the motion. What stays still matters as much as what moves.",
  },
  v2v: {
    label: "From video",
    empty: "No video-to-video models in the catalog yet.",
    placeholder: "Describe the treatment to apply to the footage.",
    idle: "Load the footage, then describe the treatment. The cut and timing stay; the look changes.",
  },
};

export default function VideoStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [mode, setMode] = useState("ttv");
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("");
  const [duration, setDuration] = useState(0);
  const [move, setMove] = useState("static");

  const [sourceImage, setSourceImage] = useState(null);
  const [sourceVideo, setSourceVideo] = useState(null);
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Capability groups, not truthiness of an array that is never falsy */
  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, mode)),
    [models, mode],
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
    if (templateConfig.aspect_ratio) setRatio(templateConfig.aspect_ratio);
    if (templateConfig.resolution) setResolution(templateConfig.resolution);
    if (templateConfig.duration) setDuration(Number(templateConfig.duration));
    if (templateConfig.camera_motion) setMove(templateConfig.camera_motion);
    if (templateConfig.model) setModelId(templateConfig.model);
    if (templateConfig.mode) setMode(templateConfig.mode);
  }, [templateConfig]);

  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;
  const resolutions = model?.resolutions?.length ? model.resolutions : NONE;
  const durations = useMemo(
    () => (model?.durations || []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    [model],
  );

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);

  useEffect(() => {
    if (!resolutions.length) { if (resolution) setResolution(""); return; }
    const has = resolutions.some((r) => String(r).toLowerCase() === String(resolution).toLowerCase());
    if (!has) setResolution(resolutions[0]);
  }, [resolutions, resolution]);

  useEffect(() => {
    if (!durations.length) { if (duration) setDuration(0); return; }
    if (!durations.includes(Number(duration))) setDuration(durations[0]);
  }, [durations, duration]);

  const { cost, affordable, balance, shortfall } = useCreditCost("video", model?.id || "", {
    duration: duration || undefined,
    resolution: resolution || undefined,
    aspect_ratio: ratio,
    image_url: sourceImage?.url,
    video_url: sourceVideo?.url,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const needsImage = mode === "i2v";
  const needsVideo = mode === "v2v";
  const missingSource = (needsImage && !sourceImage?.url) || (needsVideo && !sourceVideo?.url);

  const generate = useCallback(() => {
    if (!model || missingSource) return;
    const params = {
      endpoint: model.endpoint || model.id,
      prompt,
      aspect_ratio: ratio,
    };
    if (resolution) params.resolution = resolution;
    if (duration) params.duration = Number(duration);
    if (move !== "static") params.camera_motion = move;
    if (needsImage && sourceImage?.url) params.image_url = sourceImage.url;
    if (needsVideo && sourceVideo?.url) params.video_url = sourceVideo.url;
    if (startFrame?.url) params.first_frame_url = startFrame.url;
    if (endFrame?.url) params.last_frame_url = endFrame.url;
    submit("video", model.id, params);
  }, [
    model, missingSource, submit, prompt, ratio, resolution, duration, move,
    needsImage, needsVideo, sourceImage, sourceVideo, startFrame, endFrame,
  ]);

  const copy = MODE_COPY[mode];

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Source">
        <Segmented
          label="Generation mode"
          value={mode}
          onChange={setMode}
          options={Object.entries(MODE_COPY).map(([value, m]) => ({ value, label: m.label }))}
        />
      </Field>

      {needsImage && (
        <Field
          label="Source image"
          hint="This becomes the first frame."
          error={missingSource && prompt.trim() ? "Load an image to animate before generating." : undefined}
        >
          <Dropzone
            value={sourceImage}
            onChange={setSourceImage}
            accept="image/*"
            label="Drop an image or browse"
            hint="JPG, PNG or WebP"
          />
        </Field>
      )}

      {needsVideo && (
        <Field
          label="Source footage"
          hint="The cut and timing are kept."
          error={missingSource && prompt.trim() ? "Load a clip to restyle before generating." : undefined}
        >
          <Dropzone
            value={sourceVideo}
            onChange={setSourceVideo}
            accept="video/*"
            label="Drop a clip or browse"
            hint="MP4, MOV or WebM"
          />
        </Field>
      )}

      {mode !== "ttv" && (
        <Group label="Frame anchors">
          <p className="hs-hint" style={{ margin: 0 }}>
            Optional. Pin the first or last frame to control where the shot starts and lands.
          </p>
          <Field label="First frame">
            <Dropzone
              value={startFrame}
              onChange={setStartFrame}
              accept="image/*"
              label="Pin a first frame"
              hint="Optional"
            />
          </Field>
          <Field label="Last frame">
            <Dropzone
              value={endFrame}
              onChange={setEndFrame}
              accept="image/*"
              label="Pin a last frame"
              hint="Optional"
            />
          </Field>
        </Group>
      )}

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
      </Field>

      {durations.length > 1 && (
        <Field label="Duration" hint="Longer takes cost more. This model's fixed lengths.">
          <Chips
            label="Duration"
            options={durations.map((d) => ({ value: d, label: `${d}s` }))}
            value={duration}
            onChange={(v) => setDuration(Number(v))}
            compare={(a, b) => Number(a) === Number(b)}
            scroll
          />
        </Field>
      )}

      {resolutions.length > 1 && (
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

      <Field label="Camera move" hint="Static leaves the camera out of the brief entirely.">
        <Chips options={MOVES} value={move} onChange={setMove} label="Camera move" scroll />
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
        emptyHint={copy.empty}
      />

      <Group label="This take">
        <Specs
          rows={[
            { k: "Ratio", v: ratio },
            { k: "Length", v: duration ? `${duration}s` : "Model default" },
            { k: "Res", v: resolution ? String(resolution).toUpperCase() : "Model default" },
            { k: "Move", v: MOVES.find((m) => m.value === move)?.label },
            { k: "Anchors", v: `${startFrame ? 1 : 0}${endFrame ? " + 1" : ""}` },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Stage ────────────────────────────────────────────────────────────── */
  const idle = (
    <Idle
      icon={<IcVideo />}
      title="Direct a shot"
      description={copy.idle}
      examples={EXAMPLES}
      onExample={(e) => setPrompt((p) => (p ? `${p}. ${e}` : e))}
    />
  );

  const settings = [
    ratio,
    duration ? `${duration}s` : null,
    resolution ? String(resolution).toUpperCase() : null,
  ].filter(Boolean).join(" · ");

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
          settings={settings}
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
        disabled={!model || missingSource}
        cost={cost || 0}
        balance={balance}
        affordable={affordable}
        shortfall={shortfall}
        placeholder={copy.placeholder}
      />
    </Workspace>
  );
}
