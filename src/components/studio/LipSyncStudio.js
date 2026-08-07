"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage, ModelPicker, Sheet, SpendMeter,
  Field, Group, Segmented, Dropzone, Specs,
  clock,
  IcMic, IcLink, IcSettings, IcBolt, IcClose, IcImage, IcVideo, IcMusic,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";
import { useHandoff } from "./useHandoff";
import { mediaKind } from "@/lib/studio-handoff";
import { placeholderPeaks, useWaveform, useTransport, Waveform, Transport } from "@/components/studio/kit/Waveform";

/* ══════════════════════════════════════════════════════════════════════════
   LIP SYNC — two sources, on the .st-wave / .st-pair archetype
   ──────────────────────────────────────────────────────────────────────────
   This tool combines exactly two things: a face and a voice. The layout says
   so — the two sources sit side by side with the join between them, and the
   voice track's waveform runs full width underneath, because the sync is a
   timing decision and timing is what a waveform shows.

   Fixed in this rebuild:
   · `error` from useAsyncGeneration was computed and never rendered — a
     failed sync just stopped, with the stage still showing the empty state.
     It is passed to <Stage> now.
   · `elapsed` was unused; <Stage> shows the real clock while a job runs.
   · `affordable` was unused: the Generate button was enabled whenever the two
     files were present, so a user with 3 credits could fire an 80-credit job
     and get a 402 back from the server. The spend row now gates it, and says
     how short the balance is.
   · The model's input mode was read from a static `mode` field the live
     catalog never emits, so the image/video switch was decided by a value
     that was always undefined. It reads the model's input schema now.
   ══════════════════════════════════════════════════════════════════════════ */


/* ── One source of the pair ────────────────────────────────────────────── */
function Source({ kind, title, hint, value, onChange, accept, preview, icon }) {
  return (
    <div className="st-source">
      <span className="hs-label" style={{ margin: 0 }}>{title}</span>

      <div className="st-source__frame">
        {preview || (
          <span style={{ color: "var(--tx-ghost)", display: "grid", placeItems: "center", gap: 4 }}>
            {icon}
          </span>
        )}
      </div>

      {value ? (
        <div className="hs-row hs-row--between" style={{ gap: "var(--s-2)" }}>
          <span
            className="hs-hint"
            style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={value.name}
          >
            {value.name || `${kind} ready`}
          </span>
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm"
            onClick={() => onChange(null)}
          >
            <IcClose className="hs-icon-sm" /> Remove
          </button>
        </div>
      ) : (
        <Dropzone value={null} onChange={onChange} accept={accept} label={`Drop the ${kind} or browse`} hint={hint} />
      )}
    </div>
  );
}

/* The live catalog never emits the static list's `mode` field, so read the
   model's own input schema: a model that declares `video_url` is driven by a
   clip, one that declares `image_url` by a still. With no schema, fall back to
   the endpoint name, which is how the video-driven routes are actually named. */
function faceKind(model) {
  const fields = model?.schema?.fields;
  if (fields?.video_url && !fields?.image_url) return "video";
  if (fields?.image_url && !fields?.video_url) return "image";
  if (fields?.video_url && fields?.image_url) return "either";
  return /video[-_ ]?to[-_ ]?video|v2v|video-lip/i.test(`${model?.id || ""} ${model?.endpoint || ""}`)
    ? "video"
    : "image";
}

export default function LipSyncStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [face, setFace] = useState(null);
  const [voice, setVoice] = useState(null);
  const [seed, setSeed] = useState("");
  const [pick, setPick] = useState("image"); // only used when a model takes either
  const [sheet, setSheet] = useState(false);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "lipsync")),
    [models],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.model) setModelId(templateConfig.model);
  }, [templateConfig]);

  /* An asset sent from another studio lands on the bench by what it IS:
     a voice track becomes the audio, a face or a clip becomes the source. */
  const handoff = useHandoff();
  useEffect(() => {
    if (!handoff) return;
    if (mediaKind(handoff.url) === "audio") setVoice({ url: handoff.url });
    else setFace({ url: handoff.url });
  }, [handoff]);

  const kind = faceKind(model);
  const usesVideo = kind === "video" || (kind === "either" && pick === "video");

  /* Changing model can invalidate the source already on the bench */
  useEffect(() => {
    if (!face) return;
    const isClip = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(face.url || "");
    if (usesVideo !== isClip) setFace(null);
  }, [usesVideo, face]);

  const faceUrl = face?.url || null;
  const voiceUrl = voice?.url || null;
  const ready = !!faceUrl && !!voiceUrl;

  /* Same tool string and same params as submit() below. A mismatch here quotes
     one price and charges another. */
  const costParams = useMemo(() => ({
    ...(usesVideo ? { video_url: faceUrl || undefined } : { image_url: faceUrl || undefined }),
    audio_url: voiceUrl || undefined,
  }), [usesVideo, faceUrl, voiceUrl]);

  const { cost, affordable, balance, shortfall } = useCreditCost("lipsync", model?.id || "", costParams);


  const { peaks, real } = useWaveform(voiceUrl);
  const { ref, playing, current, duration, toggle, seek } = useTransport(voiceUrl);
  const shownPeaks = peaks || (duration ? placeholderPeaks(duration) : null);
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  const generate = useCallback(() => {
    if (!model || !ready || !affordable) return;
    submit("lipsync", model.id, {
      endpoint: model.endpoint || model.id,
      ...(usesVideo ? { video_url: faceUrl } : { image_url: faceUrl }),
      audio_url: voiceUrl,
      ...(seed === "" ? {} : { seed: Number(seed) }),
    });
  }, [model, ready, affordable, submit, usesVideo, faceUrl, voiceUrl, seed]);

  const startOver = useCallback(() => {
    reset();
    setFace(null);
    setVoice(null);
    setSeed("");
  }, [reset]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        label="Sync model"
        emptyHint="No lip sync models in the catalog yet."
      />

      {kind === "either" && (
        <Field label="Face source" hint="This model accepts either.">
          <Segmented
            label="Face source"
            value={pick}
            onChange={setPick}
            options={[
              { value: "image", label: "Portrait" },
              { value: "video", label: "Clip" },
            ]}
          />
        </Field>
      )}

      <Field label="Seed" hint="Reuse a seed to repeat a take. Blank is random.">
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

      <Group label="This sync">
        <Specs
          rows={[
            { k: "Model", v: model?.displayName || model?.name },
            { k: "Face", v: face ? (usesVideo ? "Clip" : "Portrait") : "Missing" },
            { k: "Voice", v: voice ? (duration ? clock(duration) : "Loaded") : "Missing" },
            { k: "Seed", v: seed === "" ? "Random" : seed },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Body ─────────────────────────────────────────────────────────────── */
  const facePreview = faceUrl
    ? (usesVideo
        ? <video src={faceUrl} muted playsInline preload="metadata" />
        // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
        : <img src={faceUrl} alt={face?.name || "Face source"} />)
    : null;

  const body = (
    <div className="st-wave__body">
      <div className="st-pair">
        <Source
          kind={usesVideo ? "clip" : "portrait"}
          title={usesVideo ? "Face — clip" : "Face — portrait"}
          hint={usesVideo ? "MP4 or WebM, one face in frame" : "JPG, PNG or WebP, face square on"}
          accept={usesVideo ? "video/*" : "image/*"}
          value={face}
          onChange={setFace}
          preview={facePreview}
          icon={usesVideo ? <IcVideo /> : <IcImage />}
        />

        <span className="st-pair__link" aria-hidden="true"><IcLink className="hs-icon-sm" /></span>

        <Source
          kind="voice track"
          title="Voice — audio"
          hint="MP3 or WAV, speech only"
          accept="audio/*"
          value={voice}
          onChange={setVoice}
          preview={
            voiceUrl ? (
              <span style={{ display: "grid", placeItems: "center", gap: 6, color: "var(--filament-lit)" }}>
                <IcMusic />
                <span className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>
                  {duration > 0 ? clock(duration) : "--:--"}
                </span>
              </span>
            ) : null
          }
          icon={<IcMic />}
        />
      </div>

      <Waveform
        peaks={shownPeaks}
        progress={progress}
        onSeek={voiceUrl ? seek : undefined}
        muted={!voiceUrl}
        label={voiceUrl ? "Voice track waveform" : "No voice track yet"}
      />

      <Transport
        playing={playing}
        current={current}
        duration={duration}
        onToggle={toggle}
        onSeek={seek}
        disabled={!voiceUrl}
      />

      {voiceUrl && !real && (
        <span className="hs-hint" style={{ textAlign: "center" }}>
          The waveform is an estimate — this browser was not allowed to read the file to draw its
          peaks. Playback, the playhead and the timecode are exact.
        </span>
      )}

      {/* No `crossOrigin`: demanding CORS from a host that does not send it
          would block playback outright. The waveform degrades instead. */}
      <audio ref={ref} src={voiceUrl || undefined} preload="metadata" style={{ display: "none" }} />

      {!ready && !generating && !result && !error && (
        <p className="hs-hint" style={{ textAlign: "center" }}>
          {!faceUrl && !voiceUrl
            ? "Add a face and a voice track. The face is what moves; the voice sets the timing."
            : !faceUrl
              ? `Add the ${usesVideo ? "clip" : "portrait"} to sync.`
              : "Add the voice track that drives the mouth."}
        </p>
      )}

      {/* Errors, the real elapsed clock and the finished clip all come from
         <Stage>. It renders nothing when there is nothing to show, so the
         pairing above stays visible the whole time. */}
      {(generating || result || error) && (
        <div style={{ minHeight: 280 }}>
          <Stage
            generating={generating}
            result={result}
            error={error}
            stage={stage}
            elapsed={elapsed}
            model={model?.displayName || model?.name}
            settings={usesVideo ? "Clip driven" : "Portrait driven"}
            ratio="16:9"
            onCancel={cancel}
            onRetry={generate}
            onEditSettings={reset}
            note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
            onNew={startOver}
          />
        </div>
      )}
    </div>
  );

  /* ── Dock ─────────────────────────────────────────────────────────────────
     <Brief> is the prompt dock, and it will not submit an empty brief. Lip
     sync has no brief — it pairs two files — so the dock is the spend row on
     its own, built from the same primitives Brief uses. What matters is the
     part that was missing: `affordable` now gates the action, so a job the
     balance cannot cover can no longer be fired.
     ──────────────────────────────────────────────────────────────────────── */
  const dock = (
    <div className="st-dock-prompt">
      <div className="st-spend">
        <SpendMeter cost={cost || 0} balance={balance} affordable={affordable} shortfall={shortfall} />

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
            disabled={!model || !ready || !affordable}
            title={
              !model ? "Pick a sync model first"
                : !faceUrl ? `Add the ${usesVideo ? "clip" : "portrait"} first`
                : !voiceUrl ? "Add the voice track first"
                : !affordable ? `${shortfall} more credits needed`
                : "Sync the face to the voice"
            }
          >
            <IcBolt className="hs-icon-sm" />
            Sync
            {cost > 0 && <span className="hs-btn__cost">{cost}</span>}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="st-wave">
      <aside className="st-wave__controls" aria-label="Settings">{controls}</aside>

      <div className="st-wave__main">
        {body}

        <div className="st-panel-tabs">
          <button type="button" className="hs-btn hs-btn--sm" onClick={() => setSheet(true)}>
            <IcSettings className="hs-icon-sm" /> Settings
          </button>
        </div>

        {dock}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Settings">
        {controls}
      </Sheet>
    </div>
  );
}
