"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle, SpendMeter,
  Field, Group, Segmented, Chips, RatioPicker, Dropzone, Specs,
  IcScissors, IcSwap, IcBolt, IcClose,
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

const ORIENTATIONS = [
  { value: "", label: "Auto" },
  { value: "left", label: "Faces left" },
  { value: "right", label: "Faces right" },
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

  /* v2v covers video-to-video and video-upscale; some rows carry an explicit
     "video-edit" capability that is not in any group yet. */
  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "v2v") || m.capability === "video-edit"),
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

  const recasting = job === "recast";

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

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

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
      const params = {
        endpoint: model.endpoint || model.id,
        image_url: identity.url,
        video_url: source.url,
        aspect_ratio: ratio,
      };
      if (orientation) params.character_orientation = orientation;
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

      {recasting && (
        <Field label="Head direction" hint="Auto leaves it to the model. Set it when the identity photo is a profile.">
          <Segmented
            label="Head direction"
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
     Recast has no required brief, so the action gates on the pairing
     rather than on text — the same dock the standalone RecastStudio had.
     Same meter, same button, different condition. */
  const recastDock = (
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
            disabled={!recastReady}
            title={
              !model ? "No recast model available"
                : !identity ? "Add the identity photo first"
                  : !source ? "Add the scene footage first"
                    : !affordable ? "Not enough credits"
                      : "Recast"
            }
          >
            <IcBolt className="hs-icon-sm" />
            Recast
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
