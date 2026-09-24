"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, Commit, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, RatioPicker, Slider, Dropzone, Specs,
  IcScissors, IcSwap,
} from "@/components/studio/kit";
import { useModelCatalog, videoEditPool } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   VIDEO EDIT — work on footage you already have
   ──────────────────────────────────────────────────────────────────────────
   Four jobs, one source clip: change its look, carry the shot further,
   sharpen it, or put a different face in it. The job you pick decides which
   MODELS are offered and which controls are live — it is never sent as an
   invented API field.

   There is no Retime job any more. It had a speed picker, and all the picker
   did was append "slow motion, half speed" to a Restyle prompt: no model in
   the catalog retimes footage, so it re-rendered the clip in a new style and
   charged for a restyle. Changing a clip's speed is a cut, not a generation —
   it belongs with Clips when it is built, not here pretending.

   Fixed in this rebuild:
   · `error` was computed and never rendered, so a rejected clip looked
     identical to a clip still uploading.
   · `elapsed` was unused; the render state now shows real elapsed time.
   · The inspector reported "Type: Extension" from `isExtend`, a flag that
     only exists on the static fallback list — always false against the live
     catalog. Replaced with the job the user actually chose.
   · Duration and ratio now follow the selected model.
   ══════════════════════════════════════════════════════════════════════════ */

const JOBS = {
  restyle: {
    label: "Restyle",
    title: "Restyle footage",
    idle: "Load a clip, then describe the treatment. The cut and the performance stay; grade, texture and world change.",
    placeholder: "Describe the look: grade, texture, weather, era.",
    examples: [
      "Cool night grade, sodium practicals, rain on every surface",
      "16mm texture, warm highlights, gentle halation on the speculars",
      "Overcast winter, desaturated, breath visible in the air",
    ],
  },
  extend: {
    label: "Extend",
    title: "Carry the shot on",
    idle: "Load a clip, choose how much longer it should run, then describe what happens next. The model continues from the final frame.",
    placeholder: "Describe what happens after the clip ends.",
    examples: [
      "The camera keeps pushing in as she turns toward the window",
      "The car clears frame right and the street settles back to empty",
      "The light drops another stop and the practicals take over",
    ],
  },
  /* The upscaler takes a clip and a factor and nothing else. Under Restyle it
     sat behind a brief that demanded a prompt it then ignored. */
  upscale: {
    label: "Upscale",
    title: "Sharpen what you have",
    idle: "Load a clip and choose how far to enlarge it. Nothing is re-imagined — the same frames come back at a higher resolution.",
    placeholder: "",
    examples: [],
  },
  /* S1: the retired RecastStudio folded in as a fourth job — one identity
     photo placed into one scene clip. The clip keeps its timing, blocking
     and performance; only the identity changes. */
  recast: {
    label: "Recast",
    title: "Pair an identity with a scene",
    idle: "Load one photo of the face you want and the clip it should appear in. The clip keeps its timing, blocking and performance — only the identity changes.",
    placeholder: "Optional. Anything the recast should hold on to.",
    examples: [],
  },
};

/* The provider enum is "image" | "video" — it chooses WHICH SOURCE dictates
   which way the character faces, not a left/right direction. The old
   "left"/"right" values were not in the schema at all and were rejected. */
const ORIENTATIONS = [
  { value: "", label: "Auto" },
  { value: "image", label: "Follow the photo" },
  { value: "video", label: "Follow the clip" },
];

/* Stable identity so the "settings follow the model" effects below do not
   re-fire on every render when a model publishes no ratios. */
const NONE = [];

export default function VideoEditStudio({ initialModel, templateConfig, onCreditsChanged, initialJob }) {
  const [job, setJob] = useState(initialJob && JOBS[initialJob] ? initialJob : "restyle");
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState(null);
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(0);
  const [resolution, setResolution] = useState("");
  const [factor, setFactor] = useState("");
  const [identity, setIdentity] = useState(null);
  const [orientation, setOrientation] = useState("");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  /* Recast is its own pool. It used to filter v2v like the other jobs, but
     no recast model has ever carried a v2v capability — they infer as
     "recast" (identity transfer), so the picker silently offered a plain
     video-to-video model that cannot accept an identity photo, and every
     run was rejected by the provider after reserving credits.

     v2v covers video-to-video and video-upscale; some rows carry an explicit
     "video-edit" capability that is not in any group yet. */
  const recasting = job === "recast";
  const upscaling = job === "upscale";
  const available = useMemo(
    () => (recasting
      ? (models || []).filter((m) => matchesGroup(m, "recast"))
      : videoEditPool(models, job)),
    [models, recasting, job],
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
    if (templateConfig.duration) setDuration(Number(templateConfig.duration));
    if (templateConfig.model) setModelId(templateConfig.model);
    // A saved template may still name the retired "retime" job.
    if (templateConfig.mode && JOBS[templateConfig.mode]) setJob(templateConfig.mode);
  }, [templateConfig]);

  /* No fallback ratios: a model with no aspect field ignored the choice. */
  const ratios = model?.aspectRatios?.length ? model.aspectRatios : NONE;
  const resolutions = model?.resolutions?.length ? model.resolutions : NONE;
  const durations = useMemo(
    () => (model?.durations || []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    [model],
  );
  /* A length RANGE is only a control when EXTENDING. On a restyle model the
     range's zero means "keep the source length" (wan 2.7 edit), which is what
     a restyle should do — so nothing is sent and the clip keeps its length. */
  const range = job === "extend" && !durations.length ? model?.durationRange || null : null;
  const factors = useMemo(
    () => (upscaling ? model?.schema?.fields?.upscale_factor?.enum || NONE : NONE),
    [upscaling, model],
  );

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);
  useEffect(() => {
    if (durations.length) {
      if (!durations.includes(Number(duration))) setDuration(durations[0]);
      return;
    }
    if (range) {
      const n = Number(duration);
      if (!(n >= range.min && n <= range.max)) setDuration(range.default);
      return;
    }
    if (duration) setDuration(0);
  }, [durations, range, duration]);
  useEffect(() => {
    if (!resolutions.length) { if (resolution) setResolution(""); return; }
    const has = resolutions.some((r) => String(r).toLowerCase() === String(resolution).toLowerCase());
    if (!has) setResolution(resolutions[0]);
  }, [resolutions, resolution]);
  useEffect(() => {
    if (!factors.length) { if (factor !== "") setFactor(""); return; }
    if (!factors.some((f) => String(f) === String(factor))) {
      const declared = model?.schema?.fields?.upscale_factor?.default;
      setFactor(factors.some((f) => String(f) === String(declared)) ? declared : factors[0]);
    }
  }, [factors, factor, model]);

  /* ONE payload for the quote and the submit. The recast quote used to send
     image_url/video_url while the Kling submit sent input_urls/video_urls —
     two descriptions of one run, and the meter priced the wrong one.

     The two live recast families disagree on field shape, and sending the
     wrong one is a provider rejection after the credits are held: Kling's
     motion-control takes ARRAYS (`input_urls`/`video_urls`) and an enum
     `character_orientation` of "image"|"video"; Wan's animate pair takes
     singular `image_url`/`video_url` and no orientation. */
  const recastParams = useMemo(() => {
    if (!recasting || !model || !identity?.url || !source?.url) return null;
    return /motion-control/.test(model.id)
      ? {
        input_urls: [identity.url],
        video_urls: [source.url],
        ...(orientation ? { character_orientation: orientation } : {}),
      }
      : { image_url: identity.url, video_url: source.url };
  }, [recasting, model, identity, source, orientation]);

  const editParams = useMemo(() => {
    const params = { video_url: source?.url };
    if (upscaling) {
      if (factor !== "") params.upscale_factor = factor;
      return params;
    }
    if (ratios.length) params.aspect_ratio = ratio;
    if (duration) params.duration = Number(duration);
    if (resolution) params.resolution = resolution;
    return params;
  }, [source, upscaling, factor, ratios, ratio, duration, resolution]);

  /* Same tool string AND the same params in the quote and the submission —
     a mismatch would quote one price and charge another. Recast prices as its
     own tool, the way the standalone RecastStudio always did. */
  const { cost, affordable, balance, shortfall } = useCreditCost(
    recasting ? "recast" : "v2v",
    model?.id || "",
    recasting ? recastParams || {} : editParams,
  );


  const copy = JOBS[job];
  const missingSource = !source?.url;
  const paired = !!identity?.url && !!source?.url;
  const recastReady = paired && !!model && affordable && !generating;
  const upscaleReady = !missingSource && !!model && affordable && !generating;

  const generate = useCallback(() => {
    if (recasting) {
      if (!recastParams) return;
      const params = { ...recastParams };
      if (prompt.trim()) params.prompt = prompt.trim();
      submit("recast", model.id, params);
      return;
    }
    if (!model || missingSource) return;
    const params = { endpoint: model.endpoint || model.id, ...editParams };
    // The upscaler has no prompt field; everything else is briefed.
    if (!upscaling) params.prompt = prompt.trim();
    submit("v2v", model.id, params);
  }, [recasting, recastParams, model, prompt, missingSource, submit, editParams, upscaling]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Job">
        <Segmented
          label="Edit job"
          value={job}
          onChange={setJob}
          options={Object.entries(JOBS).map(([value, j]) => ({ value, label: j.label }))}
        />
      </Field>

      {recasting && (
        <Field
          label="Identity"
          hint={identity ? "A clear, front-lit face reads best." : "One photo of the face to carry across."}
        >
          <Dropzone
            value={identity}
            onChange={setIdentity}
            accept="image/*"
            label="Drop the face or browse"
            hint="JPG, PNG or WebP"
          />
        </Field>
      )}

      <Field
        label={recasting ? "Scene" : "Source clip"}
        hint={
          recasting
            ? (source ? "Timing and framing come from this clip." : "The clip the identity is placed into.")
            : (missingSource ? "Everything here works on one clip." : source.name)
        }
        error={!recasting && missingSource && prompt.trim() ? "Load a clip before generating." : undefined}
      >
        <Dropzone
          value={source}
          onChange={setSource}
          accept="video/*"
          label={recasting ? "Drop the footage or browse" : "Drop a clip or browse"}
          hint="MP4, MOV or WebM"
        />
      </Field>

      {/* Only the Kling motion-control family accepts this; the Wan animate
          models have no such field, so showing it there would promise a
          control that silently does nothing. */}
      {recasting && /motion-control/.test(model?.id || "") && (
        <Field label="Facing" hint="Which source decides which way the character faces. Auto leaves it to the model.">
          <Segmented
            label="Facing"
            value={orientation}
            onChange={setOrientation}
            options={ORIENTATIONS}
          />
        </Field>
      )}

      {!recasting && durations.length > 1 && (
        <Field
          label={job === "extend" ? "Added length" : "Output length"}
          hint={job === "extend" ? "How much further the shot runs." : "Lengths this model renders."}
        >
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

      {range && (
        <Field hint="How much further the shot runs. Longer costs more.">
          <Slider
            label="Added length"
            min={range.min}
            max={range.max}
            step={1}
            value={duration || range.default}
            onChange={setDuration}
            format={(v) => `${v}s`}
          />
        </Field>
      )}

      {!recasting && !upscaling && resolutions.length > 1 && (
        <Field label="Resolution" hint="Higher resolutions cost more.">
          <Chips
            label="Resolution"
            options={resolutions.map((r) => ({ value: r, label: String(r).toUpperCase() }))}
            value={resolution}
            onChange={setResolution}
            compare={(a, b) => String(a).toLowerCase() === String(b).toLowerCase()}
          />
        </Field>
      )}

      {upscaling && factors.length > 1 && (
        <Field label="Enlarge by" hint="Priced per second of the clip; a larger factor costs more.">
          <Chips
            label="Upscale factor"
            options={factors.map((f) => ({ value: f, label: `${f}×` }))}
            value={factor}
            onChange={setFactor}
            compare={(a, b) => String(a) === String(b)}
          />
        </Field>
      )}

      {!recasting && !upscaling && ratios.length > 0 && (
        <Field label="Aspect ratio">
          <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
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
        emptyHint="No video-editing models in the catalog yet."
      />

      <Group label="This pass">
        <Specs
          rows={[
            { k: "Job", v: copy.label },
            { k: "Identity", v: recasting ? (identity ? "Loaded" : "Missing") : null },
            { k: "Clip", v: source ? "Loaded" : recasting ? "Missing" : "None" },
            { k: "Head", v: recasting ? ORIENTATIONS.find((o) => o.value === orientation)?.label : null },
            { k: "Ratio", v: recasting || upscaling ? null : ratios.length ? ratio : "From the clip" },
            { k: "Length", v: recasting || upscaling ? null : duration ? `${duration}s` : "From the clip" },
            { k: "Res", v: !recasting && !upscaling && resolution ? String(resolution).toUpperCase() : null },
            { k: "Enlarge", v: upscaling && factor !== "" ? `${factor}×` : null },
          ]}
        />
      </Group>
    </div>
  );

  const idle = (
    <Idle
      icon={recasting ? <IcSwap /> : <IcScissors />}
      title={copy.title}
      description={copy.idle}
      examples={copy.examples}
      onExample={(e) => setPrompt((p) => (p ? `${p}. ${e}` : e))}
    />
  );

  /* ── Recast dock ──────────────────────────────────────────────────────
     Recast has no REQUIRED brief — it gates on the identity/scene pairing —
     but it does accept an optional one, and the hand-rolled dock it used to
     render had no textarea at all, so JOBS.recast.placeholder was copy no
     user could ever act on. Commit is the shared dock for exactly this
     case: same meter, same button, same place as every prompted studio,
     with the optional brief kept above it. */
  const recastDock = (
    <Commit
      cost={cost || 0}
      balance={balance}
      affordable={affordable}
      shortfall={shortfall}
      generating={generating}
      stage={stage}
      onSubmit={generate}
      onCancel={cancel}
      submitLabel="Recast"
      disabled={!recastReady}
      blocked={
        !model ? "No recast model available"
          : !identity ? "Add the identity photo first"
            : !source ? "Add the scene footage first"
              : ""
      }
    >
      <div className="st-brief">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
          placeholder={copy.placeholder}
          aria-label="Optional recast note"
          rows={2}
          disabled={generating}
        />
      </div>
    </Commit>
  );

  /* ── Upscale dock ─────────────────────────────────────────────────────
     No brief at all: the upscaler has no prompt field, so asking for one was
     asking for words that were thrown away. */
  const upscaleDock = (
    <Commit
      cost={cost || 0}
      balance={balance}
      affordable={affordable}
      shortfall={shortfall}
      generating={generating}
      stage={stage}
      onSubmit={generate}
      onCancel={cancel}
      submitLabel="Upscale"
      disabled={!upscaleReady}
      blocked={!model ? "No upscaling model available" : !source ? "Load a clip first" : ""}
    />
  );

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
          settings={[
            copy.label,
            !recasting && !upscaling && ratios.length ? ratio : null,
            duration ? `${duration}s` : null,
            upscaling && factor !== "" ? `${factor}×` : null,
          ].filter(Boolean).join(" · ")}
          onCancel={cancel}
          onRetry={generate}
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
          onNew={reset}
          idle={idle}
        />
      </div>

      {recasting ? recastDock : upscaling ? upscaleDock : (
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
          placeholder={copy.placeholder}
          submitLabel={copy.label}
        />
      )}
    </Workspace>
  );
}
