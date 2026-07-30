"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brief, ModelPicker, Sheet,
  Field, Group, Segmented, Chips, Slider, Dropzone, Specs,
  clock, mediaUrl,
  IcMic, IcPlay, IcPause, IcSettings, IcDownload, IcExternal, IcRefresh,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   AUDIO — speech and sound design, on the .st-wave archetype
   ──────────────────────────────────────────────────────────────────────────
   Music lives in its own tool. This one covers the two jobs where the source
   of truth is a voice or an effect: read this text aloud, or make this sound.

   Fixed in this rebuild:
   · `hasVoice` / `hasStability` / `hasSimilarity` / `hasSpeed` gated the whole
     TTS panel, and the live catalog never emits them (see model-catalog.js
     `serializeCatalogModel` — it emits id, capability, credits, schema,
     constraints, pricing… and no `has*` flag at all). Every one of those
     controls was dead. They are now gated on the model's own input schema,
     which the catalog does emit, with "no schema" meaning "show it".
   · `error` from useAsyncGeneration was computed and never rendered, so a
     failed job just stopped with no explanation. It is rendered now.
   · `elapsed` was unused. The transport row shows it while a job runs.
   · The result was an <audio controls> with ten decorative bars beside it.
     The waveform is now the real signal.
   ══════════════════════════════════════════════════════════════════════════ */

const BARS = 120;

/* Deterministic stand-in, seeded by the track's own duration. Provider CDNs
   frequently answer without an Access-Control-Allow-Origin header, so the
   decode below throws and we cannot know the real peaks. Rather than draw a
   lie that changes on every render, we draw the same shape for the same
   track: bar count still maps to time, so scrubbing stays truthful. */
function placeholderPeaks(duration) {
  const seed = Math.max(1, Math.round((duration || 30) * 1000));
  return Array.from({ length: BARS }, (_, i) => {
    const n = Math.sin((i + 1) * 12.9898 + seed * 0.0001) * 43758.5453;
    const noise = n - Math.floor(n);
    const envelope = Math.sin((Math.PI * (i + 0.5)) / BARS);
    return 0.16 + 0.74 * noise * (0.4 + 0.6 * envelope);
  });
}

/* Real peaks: fetch the bytes, decode them, downsample to BARS buckets. */
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
        /* Cross-origin or unsupported codec — the caller falls back to
           placeholderPeaks(duration) once the <audio> reports a duration. */
        if (alive) { setPeaks(null); setReal(false); }
      } finally {
        ctx?.close?.();
      }
    })();

    return () => { alive = false; };
  }, [url]);

  return { peaks, real };
}

/* Playback. `currentTime` drives the playhead on the frame, not on the
   4-per-second `timeupdate` event, so the head does not stutter. */
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

/* ── Waveform display ──────────────────────────────────────────────────── */
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

/* ── Transport row ─────────────────────────────────────────────────────── */
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

/* ══════════════════════════════════════════════════════════════════════════
   Catalog capability reading
   ──────────────────────────────────────────────────────────────────────────
   `serializeCatalogModel` emits `schema` (the model's own input schema) and
   useModelCatalog derives `durations` / `resolutions` / `maxImages` from it.
   Those are the only capability signals that exist at runtime. A model with
   no schema tells us nothing, so we show the control rather than hide it —
   the provider ignores a field it does not take.
   ══════════════════════════════════════════════════════════════════════════ */
function offers(model, ...fields) {
  const declared = model?.schema?.fields;
  if (!declared) return true;
  return fields.some((f) => !!declared[f]);
}

const VOICES = [
  { id: "rachel", label: "Rachel", desc: "Warm, unhurried, mid-range" },
  { id: "domi", label: "Domi", desc: "Steady and even, low affect" },
  { id: "bella", label: "Bella", desc: "Bright, expressive, quick" },
  { id: "elli", label: "Elli", desc: "Young, light, conversational" },
  { id: "antoni", label: "Antoni", desc: "Deep, measured, assured" },
  { id: "josh", label: "Josh", desc: "Open, friendly, everyday" },
  { id: "arnold", label: "Arnold", desc: "Hard consonants, commanding" },
  { id: "sam", label: "Sam", desc: "Neutral, unaccented, clean" },
];

const SPEECH_EXAMPLES = [
  "Welcome back. Let's pick up where we left off.",
  "In 1911, the harbour froze for the first time in a century.",
  "Three things changed this quarter, and only one of them mattered.",
  "Press and hold to record. Release to send.",
];

const SOUND_EXAMPLES = [
  "Heavy wooden door closing in a stone corridor, long tail",
  "Rain on a car roof, distant traffic, no music",
  "Single metallic impact, tuned low, short decay",
  "Crowd murmur in a large hall, indistinct speech",
];

export default function AudioStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [mode, setMode] = useState("speech");
  const [modelId, setModelId] = useState(initialModel || null);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(null);
  const [source, setSource] = useState(null);
  const [sheet, setSheet] = useState(false);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Capability filtering goes through the group map, then splits on the
     scalar `capability` the catalog genuinely populates. Suno is the music
     provider and has its own tool, so it is excluded here rather than shown
     twice under a name that does not describe what it does. */
  const available = useMemo(() => {
    const pool = (models || []).filter((m) => matchesGroup(m, "audio"));
    if (mode === "speech") return pool.filter((m) => m.capability === "text-to-speech");
    return pool.filter(
      (m) => m.capability === "audio" && !String(m.provider || "").toLowerCase().includes("suno"),
    );
  }, [models, mode]);

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setText(templateConfig.prompt);
    if (templateConfig.voice) setVoice(templateConfig.voice);
    if (templateConfig.model) setModelId(templateConfig.model);
    if (templateConfig.mode) setMode(templateConfig.mode);
  }, [templateConfig]);

  /* `durations` is always an array — [] when the model does not offer a
     choice. This is the real field the old `hasDuration`-style flags never
     were, so the control appears exactly when the model can honour it. */
  const durations = model?.durations?.length ? model.durations.map(Number).filter(Number.isFinite) : [];

  useEffect(() => {
    if (!durations.length) { setDuration(null); return; }
    if (!durations.includes(duration)) setDuration(durations[0]);
  }, [durations, duration]);

  const isSpeech = mode === "speech";
  const wantsVoice = isSpeech && offers(model, "voice", "voice_id");
  const wantsTone = isSpeech && offers(model, "stability", "similarity_boost", "speed");

  /* Same params, same tool string, as the submit below — a mismatch would
     quote one price and charge another. */
  const costParams = useMemo(() => ({
    prompt: text,
    ...(duration != null ? { duration } : {}),
    ...(source?.url ? { audio_url: source.url } : {}),
  }), [text, duration, source]);

  const { cost, affordable, balance, shortfall } = useCreditCost("audio", model?.id || "", costParams);

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const url = mediaUrl(result);
  const { peaks, real } = useWaveform(url);
  const { ref, playing, current, duration: playLength, toggle, seek } = useTransport(url);
  const shownPeaks = peaks || (playLength ? placeholderPeaks(playLength) : null);
  const progress = playLength > 0 ? Math.min(1, current / playLength) : 0;

  const generate = useCallback(() => {
    if (!model || !text.trim()) return;
    submit("audio", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: text.trim(),
      ...(wantsVoice && voice ? { voice } : {}),
      ...(wantsTone ? { stability, similarity_boost: similarity, speed } : {}),
      ...(duration != null ? { duration } : {}),
      ...(source?.url ? { audio_url: source.url } : {}),
    });
  }, [model, text, submit, wantsVoice, voice, wantsTone, stability, similarity, speed, duration, source]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Job">
        <Segmented
          label="Audio job"
          value={mode}
          onChange={setMode}
          options={[
            { value: "speech", label: "Speech" },
            { value: "sound", label: "Sound design" },
          ]}
        />
      </Field>

      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        label={isSpeech ? "Voice model" : "Sound model"}
        emptyHint={
          isSpeech
            ? "No text-to-speech models in the catalog yet."
            : "No sound models in the catalog yet."
        }
      />

      {wantsVoice && (
        <Field label="Voice" hint="Pick a timbre. Models that ship their own cast ignore this.">
          <Chips
            label="Voice"
            scroll
            value={voice}
            onChange={(v) => setVoice(v === voice ? "" : v)}
            options={VOICES.map((v) => ({ value: v.id, label: v.label, title: v.desc }))}
          />
        </Field>
      )}

      {wantsTone && (
        <Group label="Delivery">
          <Slider
            label="Stability"
            value={stability}
            onChange={setStability}
            min={0} max={1} step={0.05}
            format={(n) => n.toFixed(2)}
          />
          <Slider
            label="Similarity"
            value={similarity}
            onChange={setSimilarity}
            min={0} max={1} step={0.05}
            format={(n) => n.toFixed(2)}
          />
          <Slider
            label="Speed"
            value={speed}
            onChange={setSpeed}
            min={0.7} max={1.2} step={0.05}
            format={(n) => `${n.toFixed(2)}×`}
          />
          <span className="hs-hint">
            Low stability varies the read more. High similarity holds the voice closer to its
            reference.
          </span>
        </Group>
      )}

      {durations.length > 0 && (
        <Field label="Length" hint="Lengths this model offers.">
          <Chips
            label="Length"
            value={duration}
            onChange={setDuration}
            options={durations.map((d) => ({ value: d, label: `${d}s` }))}
          />
        </Field>
      )}

      {!isSpeech && (
        <Field label="Source track" hint="Optional. Attach a file to isolate, clean or re-shape.">
          <Dropzone
            value={null}
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

      <Group label="This render">
        <Specs
          rows={[
            { k: "Job", v: isSpeech ? "Speech" : "Sound" },
            { k: "Model", v: model?.displayName || model?.name },
            { k: "Voice", v: wantsVoice ? (VOICES.find((v) => v.id === voice)?.label || "Model default") : null },
            { k: "Len", v: duration != null ? `${duration}s` : null },
            { k: "Src", v: source ? "Attached" : null },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Body ─────────────────────────────────────────────────────────────── */
  const settings = [
    model?.displayName || model?.name,
    wantsVoice && voice ? VOICES.find((v) => v.id === voice)?.label : null,
    duration != null ? `${duration}s` : null,
  ].filter(Boolean).join(" · ");

  const body = (
    <div className="st-wave__body">
      {error && (
        <p className="hs-notice hs-notice--fault" role="alert">
          {error} Adjust the settings and run it again, or pick another model.
        </p>
      )}

      <div className="hs-row hs-row--between">
        <span className="hs-eyebrow">
          {generating ? "Rendering" : url ? "Generated" : isSpeech ? "Speech" : "Sound design"}
        </span>
        <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
          {generating
            ? `${String(stage || "working").replace(/_/g, " ")} · ${clock(elapsed)}`
            : settings || "No model selected"}
        </span>
      </div>

      <Waveform
        peaks={shownPeaks}
        progress={progress}
        onSeek={url ? seek : undefined}
        muted={!url}
        label={url ? "Generated audio waveform" : "Empty waveform"}
      />

      <Transport
        playing={playing}
        current={current}
        duration={playLength}
        onToggle={toggle}
        onSeek={seek}
        disabled={!url}
      />

      {url && !real && (
        <span className="hs-hint" style={{ textAlign: "center" }}>
          The waveform is an estimate — this browser was not allowed to read the file to draw its
          peaks. Playback, the playhead and the timecode are exact.
        </span>
      )}

      {/* The element the transport drives. No `crossOrigin` — asking for CORS
          on a host that does not send it would block playback outright. */}
      <audio ref={ref} src={url || undefined} preload="metadata" style={{ display: "none" }} />

      {url ? (
        <div className="hs-row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <a className="hs-btn hs-btn--sm" href={url} download target="_blank" rel="noopener noreferrer">
            <IcDownload className="hs-icon-sm" /> Download
          </a>
          <a className="hs-btn hs-btn--ghost hs-btn--sm" href={url} target="_blank" rel="noopener noreferrer">
            <IcExternal className="hs-icon-sm" /> Open
          </a>
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={reset}>
            <IcRefresh className="hs-icon-sm" /> Start over
          </button>
          <span className="hs-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx-mute)" }}>
            {result?.creditsUsed != null ? `${result.creditsUsed} cr` : ""}
            {result?.elapsed != null ? ` · ${result.elapsed}s` : ""}
          </span>
        </div>
      ) : (
        !generating && (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcMic /></span>
            <h3>{isSpeech ? "Write the line to be spoken" : "Describe the sound"}</h3>
            <p>
              {isSpeech
                ? "Punctuation is direction: commas breathe, full stops land. Pick a voice on the left, then write the script below."
                : "Name the object, the space and the tail. \"Door closing in a stone corridor\" beats \"nice door sound\"."}
            </p>
            <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
              {(isSpeech ? SPEECH_EXAMPLES : SOUND_EXAMPLES).map((e) => (
                <button
                  key={e}
                  type="button"
                  className="hs-chip"
                  style={{ fontFamily: "var(--ff-ui)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={e}
                  onClick={() => setText(e)}
                >
                  {e.length > 44 ? `${e.slice(0, 44)}…` : e}
                </button>
              ))}
            </div>
          </div>
        )
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
          value={text}
          onChange={setText}
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          disabled={!model}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          maxChars={isSpeech ? 5000 : 600}
          submitLabel={isSpeech ? "Speak" : "Render"}
          placeholder={
            isSpeech
              ? "Write the script exactly as it should be read."
              : "Describe the sound: the object, the space, the tail."
          }
        />
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Settings">
        {controls}
      </Sheet>
    </div>
  );
}
