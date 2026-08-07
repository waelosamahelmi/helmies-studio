"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, Commit, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, RatioPicker, Dropzone, Specs,
  IcScissors, IcSwap,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   VIDEO EDIT — work on footage you already have
   ──────────────────────────────────────────────────────────────────────────
   Three jobs, one source clip: carry the shot further, change its pace, or
   change its look. The job you pick decides which controls are live and how
   the brief is written — it is never sent as an invented API field.

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
  retime: {
    label: "Retime",
    title: "Change the pace",
    idle: "Load a clip and choose a speed. The speed is written into the brief for you — describe what the retimed clip should feel like.",
    placeholder: "Describe the retimed clip: what slows down, what stays sharp.",
    examples: [
      "Keep the motion blur natural, no strobing on the fast pans",
      "Hold the audio-driven cuts on the beat",
      "Ease into the slow section rather than cutting to it",
    ],
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

const SPEEDS = [
  { value: "0.25", label: "0.25×", prompt: "extreme slow motion, quarter speed, smooth interpolation" },
  { value: "0.5", label: "0.5×", prompt: "slow motion, half speed, smooth interpolation" },
  { value: "1", label: "1×", prompt: "" },
  { value: "2", label: "2×", prompt: "double speed, brisk pacing" },
  { value: "4", label: "4×", prompt: "time-lapse, quadruple speed" },
];

const FALLBACK_RATIOS = ["16:9", "9:16", "1:1"];

export default function VideoEditStudio({ initialModel, templateConfig, onCreditsChanged, initialJob }) {
  const [job, setJob] = useState(initialJob && JOBS[initialJob] ? initialJob : "restyle");
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState(null);
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState("0.5");
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
  const available = useMemo(
    () => (models || []).filter((m) => (
      recasting
        ? matchesGroup(m, "recast")
        : matchesGroup(m, "v2v") || m.capability === "video-edit"
    )),
    [models, recasting],
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
    if (templateConfig.mode) setJob(templateConfig.mode);
  }, [templateConfig]);

  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;
  const durations = useMemo(
    () => (model?.durations || []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    [model],
  );

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);
  useEffect(() => {
    if (!durations.length) { if (duration) setDuration(0); return; }
    if (!durations.includes(Number(duration))) setDuration(durations[0]);
  }, [durations, duration]);

  /* Same tool string in the quote and the submission — a mismatch would
     quote one price and charge another. Recast prices as its own tool, the
     way the standalone RecastStudio always did. */
  const { cost, affordable, balance, shortfall } = useCreditCost(
    recasting ? "recast" : "v2v",
    model?.id || "",
    recasting
      ? { image_url: identity?.url, video_url: source?.url, aspect_ratio: ratio }
      : { duration: duration || undefined, aspect_ratio: ratio, video_url: source?.url },
  );


  const copy = JOBS[job];
  const missingSource = !source?.url;
  const paired = !!identity?.url && !!source?.url;
  const recastReady = paired && !!model && affordable && !generating;
  const speedNote = job === "retime" ? SPEEDS.find((s) => s.value === speed)?.prompt : "";

  const brief = useMemo(
    () => [speedNote, prompt.trim()].filter(Boolean).join(". "),
    [speedNote, prompt],
  );

  const generate = useCallback(() => {
    if (recasting) {
      if (!model || !paired) return;
      /* The two live recast families disagree on field shape, and sending
         the wrong one is a provider rejection after the credits are held:
         Kling's motion-control takes ARRAYS (`input_urls`/`video_urls`) and
         an enum `character_orientation` of "image"|"video"; Wan's animate
         pair takes singular `image_url`/`video_url` and no orientation. */
      const kling = /motion-control/.test(model.id);
      const params = kling
        ? {
          input_urls: [identity.url],
          video_urls: [source.url],
          ...(orientation ? { character_orientation: orientation } : {}),
        }
        : { image_url: identity.url, video_url: source.url };
      if (prompt.trim()) params.prompt = prompt.trim();
      submit("recast", model.id, params);
      return;
    }
    if (!model || missingSource) return;
    const params = {
      endpoint: model.endpoint || model.id,
      prompt: brief,
      video_url: source.url,
      aspect_ratio: ratio,
    };
    if (duration) params.duration = Number(duration);
    submit("v2v", model.id, params);
  }, [recasting, model, paired, identity, orientation, prompt, missingSource, submit, brief, source, ratio, duration]);

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

      {job === "retime" && (
        <Field label="Speed" hint="Written into the brief so the model retimes rather than resamples.">
          <Chips label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} scroll />
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

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
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
        emptyHint="No video-editing models in the catalog yet."
      />

      <Group label="This pass">
        <Specs
          rows={[
            { k: "Job", v: copy.label },
            { k: "Identity", v: recasting ? (identity ? "Loaded" : "Missing") : null },
            { k: "Clip", v: source ? "Loaded" : recasting ? "Missing" : "None" },
            { k: "Head", v: recasting ? ORIENTATIONS.find((o) => o.value === orientation)?.label : null },
            { k: "Ratio", v: ratio },
            { k: "Length", v: recasting ? null : duration ? `${duration}s` : "Model default" },
            { k: "Speed", v: job === "retime" ? `${speed}×` : null },
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
          settings={[copy.label, ratio, duration ? `${duration}s` : null].filter(Boolean).join(" · ")}
          onCancel={cancel}
          onRetry={generate}
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
          onNew={reset}
          idle={idle}
        />
      </div>

      {recasting ? recastDock : (
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
