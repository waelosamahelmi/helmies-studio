"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, RatioPicker, Dropzone, Specs,
  IcScissors,
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
};

const SPEEDS = [
  { value: "0.25", label: "0.25×", prompt: "extreme slow motion, quarter speed, smooth interpolation" },
  { value: "0.5", label: "0.5×", prompt: "slow motion, half speed, smooth interpolation" },
  { value: "1", label: "1×", prompt: "" },
  { value: "2", label: "2×", prompt: "double speed, brisk pacing" },
  { value: "4", label: "4×", prompt: "time-lapse, quadruple speed" },
];

const FALLBACK_RATIOS = ["16:9", "9:16", "1:1"];

export default function VideoEditStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [job, setJob] = useState("restyle");
  const [modelId, setModelId] = useState(initialModel || null);
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState(null);
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState("0.5");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

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

  const { cost, affordable, balance, shortfall } = useCreditCost("v2v", model?.id || "", {
    duration: duration || undefined,
    aspect_ratio: ratio,
    video_url: source?.url,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const copy = JOBS[job];
  const missingSource = !source?.url;
  const speedNote = job === "retime" ? SPEEDS.find((s) => s.value === speed)?.prompt : "";

  const brief = useMemo(
    () => [speedNote, prompt.trim()].filter(Boolean).join(". "),
    [speedNote, prompt],
  );

  const generate = useCallback(() => {
    if (!model || missingSource) return;
    const params = {
      endpoint: model.endpoint || model.id,
      prompt: brief,
      video_url: source.url,
      aspect_ratio: ratio,
    };
    if (duration) params.duration = Number(duration);
    submit("v2v", model.id, params);
  }, [model, missingSource, submit, brief, source, ratio, duration]);

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

      <Field
        label="Source clip"
        hint={missingSource ? "Everything here works on one clip." : source.name}
        error={missingSource && prompt.trim() ? "Load a clip before generating." : undefined}
      >
        <Dropzone
          value={source}
          onChange={setSource}
          accept="video/*"
          label="Drop a clip or browse"
          hint="MP4, MOV or WebM"
        />
      </Field>

      {job === "retime" && (
        <Field label="Speed" hint="Written into the brief so the model retimes rather than resamples.">
          <Chips label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} scroll />
        </Field>
      )}

      {durations.length > 1 && (
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
            { k: "Clip", v: source ? "Loaded" : "None" },
            { k: "Ratio", v: ratio },
            { k: "Length", v: duration ? `${duration}s` : "Model default" },
            { k: "Speed", v: job === "retime" ? `${speed}×` : null },
          ]}
        />
      </Group>
    </div>
  );

  const idle = (
    <Idle
      icon={<IcScissors />}
      title={copy.title}
      description={copy.idle}
      examples={copy.examples}
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
          settings={[copy.label, ratio, duration ? `${duration}s` : null].filter(Boolean).join(" · ")}
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
        submitLabel={copy.label}
      />
    </Workspace>
  );
}
