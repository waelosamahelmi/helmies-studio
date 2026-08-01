"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage, ModelPicker, Sheet, SpendMeter,
  Field, Group, Segmented, Dropzone, Specs,
  clock,
  IcMic, IcLink, IcPlay, IcPause, IcSettings, IcBolt, IcClose, IcImage, IcVideo, IcMusic,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

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

const BARS = 120;

/* Deterministic stand-in, seeded by the track's own duration. Uploaded voice
   tracks are same-origin and decode for real; a URL pasted from elsewhere may
   answer without an Access-Control-Allow-Origin header, in which case the
   decode throws and this draws the same shape every time for the same track.
   Bar count still maps to time, so the scrubber stays truthful. */
function placeholderPeaks(duration) {
  const seed = Math.max(1, Math.round((duration || 30) * 1000));
  return Array.from({ length: BARS }, (_, i) => {
    const n = Math.sin((i + 1) * 12.9898 + seed * 0.0001) * 43758.5453;
    const noise = n - Math.floor(n);
    const envelope = Math.sin((Math.PI * (i + 0.5)) / BARS);
    return 0.16 + 0.74 * noise * (0.4 + 0.6 * envelope);
  });
}

function useWaveform(url) {
  const [peaks, setPeaks] = useState(null);
  const [real, setReal] = useState(false);

  useEffect(() => {
    if (!url) { setPeaks(null); setReal(false); return undefined; }
    let alive = true;
    setPeaks(null);
    setReal(false);

    (async () => {
      let ctx = null;
      try {
        const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
        if (!Ctx) throw new Error("No AudioContext");
        const res = await fetch(url, { mode: "cors" });
        const bytes = await res.arrayBuffer();
        ctx = new Ctx();
        const buffer = await ctx.decodeAudioData(bytes);
        const data = buffer.getChannelData(0);
        const block = Math.max(1, Math.floor(data.length / BARS));
        const out = new Array(BARS);
        let top = 0;
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          const start = i * block;
          for (let j = 0; j < block; j++) sum += Math.abs(data[start + j] || 0);
          out[i] = sum / block;
          if (out[i] > top) top = out[i];
        }
        if (!alive) return;
        setPeaks(top > 0 ? out.map((v) => v / top) : out);
        setReal(true);
      } catch {
        if (alive) { setPeaks(null); setReal(false); }
      } finally {
        ctx?.close?.();
      }
    })();

    return () => { alive = false; };
  }, [url]);

  return { peaks, real };
}

function useTransport(url) {
  const ref = useRef(null);
  const raf = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => { setPlaying(false); setCurrent(0); setDuration(0); }, [url]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const meta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    const onTime = () => setCurrent(el.currentTime || 0);
    el.addEventListener("loadedmetadata", meta);
    el.addEventListener("durationchange", meta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.removeEventListener("loadedmetadata", meta);
      el.removeEventListener("durationchange", meta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [url]);

  useEffect(() => {
    if (!playing) return undefined;
    const tick = () => {
      if (ref.current) setCurrent(ref.current.currentTime || 0);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  }, []);

  const seek = useCallback((ratio) => {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const t = Math.min(el.duration, Math.max(0, ratio * el.duration));
    el.currentTime = t;
    setCurrent(t);
  }, []);

  return { ref, playing, current, duration, toggle, seek };
}

function Waveform({ peaks, progress = 0, onSeek, muted = false, label = "Waveform" }) {
  const box = useRef(null);
  const [count, setCount] = useState(BARS);

  /* One bar per 6px of frame. The shared CSS caps a bar at 4px and sets a 2px
     gap, so at this density the strip is exactly as wide as the frame at every
     screen size. That matters: the playhead and the click-to-seek both
     measure the frame, so a strip that stopped short of it would put the
     playhead to the right of the sample it points at. */
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect?.width || 0;
      setCount(Math.max(24, Math.min(240, Math.floor(w / 6) || 24)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Resample the decoded peaks onto the bars that actually fit */
  const bars = useMemo(() => {
    const src = peaks && peaks.length ? peaks : null;
    if (!src) return new Array(count).fill(0.12);
    return Array.from({ length: count }, (_, i) => {
      const a = Math.floor((i * src.length) / count);
      const b = Math.min(src.length, Math.max(a + 1, Math.floor(((i + 1) * src.length) / count)));
      let sum = 0;
      for (let j = a; j < b; j++) sum += src[j];
      return sum / (b - a);
    });
  }, [peaks, count]);

  const seekAt = (clientX) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect?.width || !onSeek) return;
    onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
  };

  return (
    <div
      ref={box}
      className="st-wf"
      role={onSeek ? "slider" : "img"}
      aria-label={label}
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      tabIndex={onSeek ? 0 : -1}
      style={{ cursor: onSeek ? "pointer" : "default", opacity: muted ? 0.45 : 1 }}
      onClick={(e) => seekAt(e.clientX)}
      onKeyDown={(e) => {
        if (!onSeek) return;
        if (e.key === "ArrowRight") { e.preventDefault(); onSeek(Math.min(1, progress + 0.02)); }
        if (e.key === "ArrowLeft") { e.preventDefault(); onSeek(Math.max(0, progress - 0.02)); }
      }}
    >
      {bars.map((h, i) => (
        <i
          key={i}
          className={i / bars.length < progress ? "is-played" : ""}
          style={{ "--h": `${Math.round(6 + h * 86)}%` }}
        />
      ))}
      {progress > 0 && <span className="st-wf__head" style={{ left: `${progress * 100}%` }} />}
    </div>
  );
}

function Transport({ playing, current, duration, onToggle, onSeek, disabled }) {
  const bar = useRef(null);
  const p = duration > 0 ? Math.min(1, current / duration) : 0;

  return (
    <div className="st-transport">
      <button
        type="button"
        className="st-transport__play"
        onClick={onToggle}
        disabled={disabled}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <IcPause className="hs-icon-sm" /> : <IcPlay className="hs-icon-sm" />}
      </button>

      <span className="st-transport__time">{clock(current)}</span>

      <div
        ref={bar}
        className="st-transport__bar"
        role="progressbar"
        aria-label="Playback position"
        aria-valuenow={Math.round(p * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onClick={(e) => {
          const rect = bar.current?.getBoundingClientRect();
          if (!rect?.width || disabled) return;
          onSeek?.(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
        }}
      >
        <i style={{ width: `${p * 100}%` }} />
      </div>

      <span className="st-transport__time">{duration > 0 ? clock(duration) : "--:--"}</span>
    </div>
  );
}

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
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

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

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

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
