"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, Commit, ModelPicker, Stage, Idle,
  Field, Group, Chips, Dropzone, Specs,
  IcMusic, IcRefresh,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";
import { audioToolShape, decodeTextOutput } from "@/lib/audio-payload-core.mjs";
import { opParams, opIssue, STEM_TYPES, TRACK_OPS } from "@/lib/music-timeline-core.mjs";

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

   One form used to serve every utility — a track, a forced prompt, an audio
   player — whatever the utility was. It asked stem separation for a prompt
   it does not take, never sent add-vocals / add-instrumental the title, style
   and negative_tags they REQUIRE (0 of 5 in production), and played a lyric
   sheet as audio. The form now follows audioToolShape (audio-payload-core):
   what the utility takes in, and whether it gives back sound or text.

   Operations the Music timeline also offers are built by ITS opParams
   (music-timeline-core) with the attached file standing in for the track —
   one shape for one model, not two that drift. replace-section needs a time
   window only that timeline can select, and the voice-clone steps belong to
   their wizard, so neither is listed here.
   ══════════════════════════════════════════════════════════════════════════ */

const KIND_LABEL = {
  enhancement: "Enhance",
  conversion: "Convert",
  utility: "Utility",
  text: "Writes text",
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
  const [style, setStyle] = useState("");
  const [stemType, setStemType] = useState(STEM_TYPES[0].value);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  const available = useMemo(
    () => (models || []).filter(
      (m) => matchesGroup(m, "audio")
        && ["enhancement", "conversion", "utility"].includes(audioKind(m))
        && audioToolShape(m.id).listed,
    ),
    [models],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;
  const shape = audioToolShape(model?.id);
  const kind = shape.output === "text" ? "text" : audioKind(model);
  const op = shape.op ? TRACK_OPS.find((o) => o.id === model?.id) : null;
  /* add-vocals takes a lyric brief AND a style; add-instrumental's brief IS
     its style, so it gets no second field. */
  const wantsStyle = !!op?.needsStyle && !!op?.needsPrompt;

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

  /* Same object quotes and submits — a mismatch would quote one price and
     charge another. */
  const params = useMemo(() => {
    if (!model) return {};
    if (op) {
      return opParams(op.id, {
        track: source?.url ? { outputUrl: source.url, name: source.name } : null,
        prompt, style: style.trim() || undefined, stemType,
      });
    }
    return {
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      ...(source?.url ? { audio_url: source.url } : {}),
    };
  }, [model, op, source, prompt, style, stemType]);

  const { cost, affordable, balance, shortfall } = useCreditCost("audio", model?.id || "", params);

  const issue = !model ? "Pick a utility first"
    : op ? opIssue(op.id, params)
    : shape.needsTrack && !source?.url ? "Add the track first."
    : shape.prompt === "required" && !prompt.trim() ? "Describe the job."
    : null;

  const generate = useCallback(() => {
    if (!model || issue) return;
    submit("audio", model.id, { endpoint: model.endpoint || model.id, ...params });
  }, [model, issue, submit, params]);

  const text = shape.output === "text" ? decodeTextOutput(result?.url) : null;

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      {shape.needsTrack && (
      <Field label="Source track" hint="The track this utility works on.">
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
      )}

      {wantsStyle && (
        <Field label="Style" hint="Required. A few tags for how the vocal should sound.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="warm, close-mic, breathy alto"
              maxLength={1000}
            />
          )}
        </Field>
      )}

      {op?.needsStem && (
        <Field label="Split" hint="A finer split costs more — the price below follows the choice.">
          <Chips
            label="Split"
            value={stemType}
            onChange={setStemType}
            options={STEM_TYPES}
          />
        </Field>
      )}

      <Group label="This pass">
        <Specs
          rows={[
            { k: "Tool", v: model?.displayName || model?.name },
            { k: "Kind", v: kind ? KIND_LABEL[kind] : null },
            { k: "Src", v: shape.needsTrack ? (source ? "Attached" : "Missing") : "Not used" },
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
      description={
        shape.output === "text"
          ? "This one writes text. Describe what you need below — no track required."
          : shape.prompt === "none"
            ? "Load the track on the left, choose how far to split it, then run."
            : "Pick a utility on the right, load the track it should work on, then describe the job below."
      }
      examples={EXAMPLES}
      onExample={(e) => setPrompt((p) => (p ? `${p}. ${e}` : e))}
    />
  );

  return (
    <Workspace controls={controls} inspector={inspector} inspectorLabel="Utility">
      <div className="st-work__stage">
        {text ? (
          /* A lyric sheet is not a clip: Stage would hand a data: URI to a
             media player. Text results are shown as text. */
          <div className="hs-stack" style={{ gap: "var(--s-3)", padding: "var(--s-5)", overflow: "auto" }}>
            <span className="hs-eyebrow">{model?.displayName || model?.name}</span>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</p>
            <div className="hs-row" style={{ gap: "var(--s-2)" }}>
              <button
                type="button"
                className="hs-btn hs-btn--sm"
                onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
              >
                Copy
              </button>
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={reset}>
                <IcRefresh className="hs-icon-sm" /> Start over
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {/* Brief has no slot for "why not yet": say it here, or a typed brief
          with a missing track is a dead button and nothing else. */}
      {shape.prompt === "required" && issue && prompt.trim() && (
        <p className="hs-hint" role="status" style={{ textAlign: "center" }}>{issue}</p>
      )}

      {shape.prompt === "required" ? (
        <Brief
          tool="audio"
          value={prompt}
          onChange={setPrompt}
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          disabled={!model || (!!issue && !!prompt.trim())}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          maxChars={1000}
          submitLabel="Run"
          placeholder={
            op && !op.needsPrompt
              ? "The style to build: a few tags — warm jazz trio, brushed drums."
              : "Describe the job: what to keep, what to remove, what to change."
          }
        />
      ) : (
        /* <Brief> will not submit an empty brief, and these utilities have
           none to write (stem separation) or only an optional one (extend). */
        <Commit
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          elapsed={elapsed}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          blocked={issue || ""}
          hint={issue || ""}
          submitLabel="Run"
        >
          {shape.prompt === "optional" && (
            <input
              className="hs-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Optional: how the result should sound"
              aria-label="Optional direction"
              maxLength={1000}
            />
          )}
        </Commit>
      )}
    </Workspace>
  );
}
