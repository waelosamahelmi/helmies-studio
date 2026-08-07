"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Chips, RatioPicker, Dropzone, Specs,
  IcVideo, IcFilm,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useStudioMode } from "./useStudioMode";
import { useHandoff } from "./useHandoff";
import { preferredRatio } from "@/lib/studio-prefs";
import ModeBar from "./ModeBar";
import VideoEditStudio from "./VideoEditStudio";
import ClippingStudio from "./ClippingStudio";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   VIDEO — one studio, four modes (S1 consolidation)
   ──────────────────────────────────────────────────────────────────────────
   · Text to Video  — the t2v pool, with a Motion preset chip carrying the
                      retired MotionStudio's craft (loops, backgrounds,
                      title beds): motion-named models float to the top and
                      the copy talks about movement, not pictures.
   · Image to Video — the i2v pool; the still becomes the first frame.
   · Edit           — VideoEditStudio folded in as the mode body; its job
                      chips now include Recast (the retired RecastStudio's
                      identity-into-scene pairing).
   · Clips          — ClippingStudio mounted whole: timeline trim of an
                      uploaded or generated clip.

   Mode and preset live in the URL (useStudioMode), so the retired slugs
   (/studio/i2v, /studio/vibe-motion, /studio/video-edit, /studio/body-swap,
   /studio/clipping) redirect here and land on the right surface. Each mode
   body is keyed by mode — state is isolated per mode, the same contract
   StudioClient's ErrorBoundary applies per tool.
   ══════════════════════════════════════════════════════════════════════════ */

const MODES = ["ttv", "i2v", "cast", "edit", "clips"];
const MODE_OPTIONS = [
  { value: "ttv", label: "Text to Video" },
  { value: "i2v", label: "Image to Video" },
  { value: "cast", label: "Cast" },
  { value: "edit", label: "Edit" },
  { value: "clips", label: "Clips" },
];
const PRESETS = ["motion", "recast"];

const EXAMPLES = [
  "Drone push over a ridge at first light, mist sitting in the valley",
  "Product turns slowly on wet slate, one hard key from the left",
  "Handheld follow through a night market, neon spill across faces",
  "Locked-off wide of an empty diner, rain on the glass, no people",
];

const MOTION_EXAMPLES = [
  "Slow iridescent liquid folding over itself, dark field, seamless loop",
  "Thin geometric lines drifting apart and re-forming, single accent colour",
  "Soft gradient bloom pulsing at a slow tempo, grain over the top",
  "Paper-cut shapes sliding in from the edges, flat colour, no gradients",
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
    empty: "No text-to-video models in the catalog yet.",
    placeholder: "Describe the shot: subject, camera, light, and what moves.",
    idle: "Describe one shot. Say what moves and how the camera behaves — a list of nouns renders as a slideshow.",
  },
  i2v: {
    empty: "No image-to-video models in the catalog yet.",
    placeholder: "Describe what should move, and how the camera behaves.",
    idle: "Load the still you want to animate, then describe the motion. What stays still matters as much as what moves.",
  },
  cast: {
    empty: "No reference-to-video models in the catalog yet.",
    placeholder: "Describe the shot this character appears in — where they are, what they do, how the camera moves.",
    idle: "Give the same person or product a few reference photos, then describe any shot. The likeness carries across every take, so a series holds together.",
  },
};

const MOTION_COPY = {
  placeholder: "Describe the movement: what forms, how it travels, what tempo.",
  idle: "Describe the movement, not just the picture. Tempo, direction and what repeats are what make a loop work.",
};

/* ── Text→Video / Image→Video — the generation body ─────────────────────── */
function VideoGenMode({ mode, preset, onPreset, initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("");
  const [duration, setDuration] = useState(0);
  const [move, setMove] = useState("static");

  const [sourceImage, setSourceImage] = useState(null);
  const [refs, setRefs] = useState([]);
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  const motion = mode === "ttv" && preset === "motion";

  /* Capability groups, not truthiness of an array that is never falsy.
     Under the Motion preset the pool is the same t2v group, but models that
     name themselves for designed movement float to the top — the retired
     MotionStudio's ordering, without its silent fallback. */
  const casting = mode === "cast";
  const available = useMemo(() => {
    const pool = (models || []).filter((m) => matchesGroup(m, casting ? "r2v" : mode));
    if (!motion) return pool;
    const named = pool.filter((m) => /motion|graphic|animate|loop/i.test(`${m.displayName || ""} ${m.id || ""}`));
    return named.length ? [...named, ...pool.filter((m) => !named.includes(m))] : pool;
  }, [models, mode, motion, casting]);

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
  }, [templateConfig]);

  /* A still sent from another studio ("Send to → Animate") lands as the
     source frame, carrying the brief that produced it. */
  const handoff = useHandoff();
  useEffect(() => {
    if (!handoff) return;
    /* In Cast the arriving still is a likeness to hold, not a first frame. */
    if (casting) setRefs((r) => (r.length ? r : [{ url: handoff.url }]));
    else setSourceImage({ url: handoff.url });
    if (handoff.prompt) setPrompt(handoff.prompt);
  }, [handoff, casting]);

  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;
  const resolutions = model?.resolutions?.length ? model.resolutions : NONE;
  const durations = useMemo(
    () => (model?.durations || []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    [model],
  );

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(preferredRatio(ratios) || ratios[0]);
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
  });


  const needsImage = mode === "i2v";
  const refUrls = useMemo(() => refs.map((r) => r?.url).filter(Boolean), [refs]);
  const missingSource = (needsImage && !sourceImage?.url) || (casting && refUrls.length === 0);

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
    /* Cast: the reference-to-video families name this field three different
       ways, and sending the wrong one is a provider rejection after the
       credits are held. pixverse takes `image_references`, minimax takes
       `reference_image_urls`, wan takes a singular `reference_image`. */
    if (casting && refUrls.length) {
      const id = model.id || "";
      if (/pixverse/.test(id)) params.image_references = refUrls;
      else if (/minimax/.test(id)) params.reference_image_urls = refUrls;
      else if (/wan/.test(id)) params.reference_image = refUrls[0];
      else params.image_references = refUrls;
    }
    if (startFrame?.url) params.first_frame_url = startFrame.url;
    if (endFrame?.url) params.last_frame_url = endFrame.url;
    submit("video", model.id, params);
  }, [
    model, missingSource, submit, prompt, ratio, resolution, duration, move,
    needsImage, sourceImage, startFrame, endFrame, casting, refUrls,
  ]);

  const copy = MODE_COPY[mode];

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      {mode === "ttv" && (
        <Field label="Preset" hint="Motion favours models built for loops, backgrounds and title beds.">
          <Chips
            label="Video preset"
            options={[
              { value: "", label: "None" },
              { value: "motion", label: "Motion" },
            ]}
            value={preset || ""}
            onChange={(v) => onPreset?.(v || null)}
          />
        </Field>
      )}

      {casting && (
        <Field
          label="Character references"
          hint="Up to four photos of the same subject. More angles hold the likeness steadier across the shot."
          error={missingSource && prompt.trim() ? "Add at least one reference photo before generating." : undefined}
        >
          <Dropzone
            value={refs}
            onChange={setRefs}
            accept="image/*"
            multiple
            max={4}
            label="Drop reference photos or browse"
            hint="JPG, PNG or WebP"
          />
        </Field>
      )}

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

      {needsImage && (
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
            { k: "Preset", v: motion ? "Motion" : null },
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
      icon={motion ? <IcFilm /> : <IcVideo />}
      title={motion ? "Compose a loop" : "Direct a shot"}
      description={motion ? MOTION_COPY.idle : copy.idle}
      examples={motion ? MOTION_EXAMPLES : EXAMPLES}
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
          prompt={prompt}
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
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
          onNew={reset}
          idle={idle}
        />
      </div>

      <Brief
        tool="video"
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
        placeholder={motion ? MOTION_COPY.placeholder : copy.placeholder}
      />
    </Workspace>
  );
}

/* ── The studio: mode strip + the active mode's body ────────────────────── */
export default function VideoStudio(props) {
  const { mode, preset, setMode, setPreset } = useStudioMode({
    modes: MODES,
    fallback: "ttv",
    presets: PRESETS,
  });

  return (
    <div className="st-moded">
      <ModeBar label="Video mode" value={mode} onChange={setMode} options={MODE_OPTIONS} />
      <div className="st-moded__body" key={mode}>
        {mode === "clips" ? (
          <ClippingStudio onCreditsChanged={props.onCreditsChanged} />
        ) : mode === "edit" ? (
          <VideoEditStudio {...props} initialJob={preset === "recast" ? "recast" : undefined} />
        ) : (
          <VideoGenMode {...props} mode={mode} preset={preset} onPreset={setPreset} />
        )}
      </div>
    </div>
  );
}
