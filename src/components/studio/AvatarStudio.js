"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage, Brief, ModelPicker, Sheet,
  Field, Group, Chips, RatioPicker, Dropzone, Specs,
  clock,
  IcPersona, IcLink, IcPlay, IcPause, IcSettings, IcClose, IcImage, IcMic, IcMusic,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

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

const BARS = 120;

/* Deterministic stand-in, seeded by the track's own duration. Uploaded voice
   tracks are same-origin and decode for real; anything cross-origin without an
   Access-Control-Allow-Origin header cannot be decoded in the browser, so this
   draws the same shape every time for the same track. Bar count still maps to
   time, so the scrubber stays truthful even when the peaks are not. */
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
