"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage, Brief, ModelPicker, Sheet,
  Field, Group, Chips, RatioPicker, Dropzone, Specs,
  clock,
  IcPersona, IcLink, IcSettings, IcClose, IcImage, IcMic, IcMusic,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";
import { placeholderPeaks, useWaveform, useTransport, Waveform, Transport } from "@/components/studio/kit/Waveform";

/* ══════════════════════════════════════════════════════════════════════════
   AVATAR — a portrait and a voice, on the .st-wave / .st-pair archetype
   ──────────────────────────────────────────────────────────────────────────
   An avatar take is two sources joined: the face that performs and the voice
   it performs. The layout puts them side by side with the join between them,
   and the voice track's waveform runs full width beneath, because the length
   of the voice is what decides the length of the take.

   Fixed in this rebuild:
   · `error` from useAsyncGeneration was computed and never rendered — a
     failed job stopped silently with the stage still showing the idle copy.
     It is passed to <Stage> now.
   · `elapsed` was unused; <Stage> shows the real clock while a job runs.
   · `affordable` was unused: PromptDock had no idea about the balance, so a
     job the wallet could not cover was one click away and came back a 402.
     <Brief> takes `affordable` and `shortfall` and blocks the action.
   · The tool string was already `"v2v"` on both sides — `useCreditCost("v2v",…)`
     and `submit("v2v",…)` — and it is left that way deliberately: `"v2v"` is a
     registered tool in the async route's ENDPOINT_MAP and in the pricing
     engine's fallback table, whereas `"avatar"` is in neither and would fall
     through to the generic 2-credit default. Verified, and kept in step.
   · Duration and aspect ratio were hardcoded lists. They come from the model's
     own `durations` / `aspectRatios` when the catalog supplies them.
   ══════════════════════════════════════════════════════════════════════════ */


/* ── One source of the pair ────────────────────────────────────────────── */
function Source({ kind, title, hint, value, onChange, accept, preview, icon }) {
  return (
    <div className="st-source">
      <span className="hs-label" style={{ margin: 0 }}>{title}</span>

      <div className="st-source__frame">
        {preview || <span style={{ color: "var(--tx-ghost)" }}>{icon}</span>}
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
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => onChange(null)}>
            <IcClose className="hs-icon-sm" /> Remove
          </button>
        </div>
      ) : (
        <Dropzone value={null} onChange={onChange} accept={accept} label={`Drop the ${kind} or browse`} hint={hint} />
      )}
    </div>
  );
}

/* The only capability signal the live catalog carries is the model's own input
   schema — `serializeCatalogModel` emits `schema`, never a `has*` flag. No
   schema means "unknown", and unknown is not a reason to hide a source. */
function offers(model, field) {
  const declared = model?.schema?.fields;
  if (!declared) return true;
  return !!declared[field];
}

const FALLBACK_DURATIONS = [5, 10];
const FALLBACK_RATIOS = ["16:9", "9:16", "1:1"];

const EXAMPLES = [
  "Speaks straight to camera, small nods on the stresses, still shoulders",
  "Warm and unhurried, half smile between sentences, soft key from the left",
  "Explains with light hand gestures, brief glance away, returns to camera",
  "Steady news read, minimal movement, neutral expression throughout",
];

export default function AvatarStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [portrait, setPortrait] = useState(null);
  const [voice, setVoice] = useState(null);
  const [direction, setDirection] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [ratio, setRatio] = useState("16:9");
  const [sheet, setSheet] = useState(false);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  /* Avatar models carry the `avatar-video` capability, which lives in the
     lipsync group; a few video-to-video models are also avatar-capable. Both
     routes are filtered by the scalar `capability` field the catalog emits,
     then narrowed by name — never by a `has*` flag, which never arrives. */
  const available = useMemo(() => (models || []).filter((m) => {
    if (m.capability !== "avatar-video" && !matchesGroup(m, "v2v")) return false;
    const text = `${m.id || ""} ${m.displayName || m.name || ""}`.toLowerCase();
    return m.capability === "avatar-video" || text.includes("avatar");
  }), [models]);

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setDirection(templateConfig.prompt);
    if (templateConfig.aspect_ratio) setRatio(templateConfig.aspect_ratio);
    if (templateConfig.duration) setSeconds(Number(templateConfig.duration));
    if (templateConfig.model) setModelId(templateConfig.model);
  }, [templateConfig]);

  /* `durations` and `aspectRatios` are always arrays — [] when the model does
     not offer a choice. These are the fields the catalog genuinely emits. */
  const durations = model?.durations?.length
    ? model.durations.map(Number).filter(Number.isFinite)
    : FALLBACK_DURATIONS;
  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;

  useEffect(() => {
    if (durations.length && !durations.includes(seconds)) setSeconds(durations[0]);
  }, [durations, seconds]);
  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);

  const portraitUrl = portrait?.url || null;
  const voiceUrl = voice?.url || null;
  const needsVoice = offers(model, "audio_url");
  const ready = !!portraitUrl && (!needsVoice || !!voiceUrl);

  /* Same tool string and same params as submit() below — verified in step, so
     the quote and the charge cannot diverge. */
  const costParams = useMemo(() => ({
    duration: seconds,
    aspect_ratio: ratio,
    image_url: portraitUrl || undefined,
    ...(needsVoice && voiceUrl ? { audio_url: voiceUrl } : {}),
  }), [seconds, ratio, portraitUrl, needsVoice, voiceUrl]);

  const { cost, affordable, balance, shortfall } = useCreditCost("v2v", model?.id || "", costParams);


  const { peaks, real } = useWaveform(voiceUrl);
  const { ref, playing, current, duration: voiceLength, toggle, seek } = useTransport(voiceUrl);
  const shownPeaks = peaks || (voiceLength ? placeholderPeaks(voiceLength) : null);
  const progress = voiceLength > 0 ? Math.min(1, current / voiceLength) : 0;

  const generate = useCallback(() => {
    if (!model || !ready) return;
    submit("v2v", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: direction.trim(),
      image_url: portraitUrl,
      ...(needsVoice && voiceUrl ? { audio_url: voiceUrl } : {}),
      duration: seconds,
      aspect_ratio: ratio,
    });
  }, [model, ready, submit, direction, portraitUrl, needsVoice, voiceUrl, seconds, ratio]);

  const startOver = useCallback(() => {
    reset();
    setPortrait(null);
    setVoice(null);
    setDirection("");
  }, [reset]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        label="Avatar model"
        emptyHint="No avatar models in the catalog yet."
      />

      <Field label="Take length" hint={model?.durations?.length ? "Lengths this model offers." : undefined}>
        <Chips
          label="Take length"
          value={seconds}
          onChange={setSeconds}
          options={durations.map((d) => ({ value: d, label: `${d}s` }))}
        />
      </Field>

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
      </Field>

      <Group label="This take">
        <Specs
          rows={[
            { k: "Model", v: model?.displayName || model?.name },
            { k: "Face", v: portrait ? "Portrait" : "Missing" },
            { k: "Voice", v: needsVoice ? (voice ? (voiceLength ? clock(voiceLength) : "Loaded") : "Missing") : "Not used" },
            { k: "Len", v: `${seconds}s` },
            { k: "Ratio", v: ratio },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Body ─────────────────────────────────────────────────────────────── */
  const body = (
    <div className="st-wave__body">
      <div className="st-pair">
        <Source
          kind="portrait"
          title="Face — portrait"
          hint="JPG, PNG or WebP, face square on"
          accept="image/*"
          value={portrait}
          onChange={setPortrait}
          // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
          preview={portraitUrl ? <img src={portraitUrl} alt={portrait?.name || "Portrait"} /> : null}
          icon={<IcImage />}
        />

        <span className="st-pair__link" aria-hidden="true"><IcLink className="hs-icon-sm" /></span>

        <Source
          kind="voice track"
          title={needsVoice ? "Voice — audio" : "Voice — optional"}
          hint="MP3 or WAV, speech only"
          accept="audio/*"
          value={voice}
          onChange={setVoice}
          preview={
            voiceUrl ? (
              <span style={{ display: "grid", placeItems: "center", gap: 6, color: "var(--filament-lit)" }}>
                <IcMusic />
                <span className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>
                  {voiceLength > 0 ? clock(voiceLength) : "--:--"}
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
        duration={voiceLength}
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
        <div className="hs-empty">
          <span className="hs-empty__mark"><IcPersona /></span>
          <h3>Pair a face with a voice</h3>
          <p>
            {!portraitUrl
              ? "Start with a portrait: one face, eyes toward the lens, even light. Then add the voice track it should perform."
              : "Add the voice track. Its length sets the length of the take."}
          </p>
          <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                className="hs-chip"
                style={{ fontFamily: "var(--ff-ui)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                title={e}
                onClick={() => setDirection(e)}
              >
                {e.length > 44 ? `${e.slice(0, 44)}…` : e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Errors, the real elapsed clock and the finished take all come from
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
            ratio={ratio}
            model={model?.displayName || model?.name}
            settings={`${seconds}s · ${ratio}`}
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

        <Brief
          tool="perform"
          value={direction}
          onChange={setDirection}
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          disabled={!model || !ready}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          maxChars={2000}
          submitLabel="Perform"
          placeholder={
            !portraitUrl
              ? "Add a portrait first, then direct the performance."
              : needsVoice && !voiceUrl
                ? "Add the voice track, then direct the performance."
                : "Direct the performance: eyeline, gesture, energy."
          }
        />
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Settings">
        {controls}
      </Sheet>
    </div>
  );
}
