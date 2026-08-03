"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brief, ModelPicker, Sheet, Fault,
  Field, Group, Chips, Toggle, Segmented, Specs,
  clock, mediaUrl,
  IcMusic, IcPlay, IcPause, IcSettings, IcDownload, IcExternal, IcRefresh,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   MUSIC — composition, on the .st-wave archetype
   ──────────────────────────────────────────────────────────────────────────
   Fixed in this rebuild:
   · `hasInstrumental`, `hasVocalGender`, `hasStyle`, `hasTitle` and
     `hasNegativeTags` gated every optional field in the submit body. The live
     catalog never emits those flags — `serializeCatalogModel`'s public shape
     returns id, capability, credits, schema, constraints and nothing else
     (provider cost basis is server-only) — so the style, title, vocal
     gender, instrumental switch and negative tags the user set were silently
     dropped from every single request. They are now
     gated on the model's own input schema (a field the catalog does emit),
     defaulting to "send it" when a model declares no schema.
   · `error` from useAsyncGeneration was never rendered; failures were silent.
   · `elapsed` was unused; the transport line now shows it while a job runs.
   · The result was an <audio controls> with ten decorative bars beside it.
     The waveform is decoded from the returned track.
   ══════════════════════════════════════════════════════════════════════════ */

const BARS = 120;

/* Deterministic stand-in, seeded by the track's own duration. Provider CDNs
   frequently answer without an Access-Control-Allow-Origin header, so the
   decode below throws and the real peaks are unknowable from the browser.
   Rather than draw a shape that changes on every render, we draw the same one
   for the same track: bar count still maps to time, so scrubbing is honest. */
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
        if (alive) { setPeaks(null); setReal(false); }
      } finally {
        ctx?.close?.();
      }
    })();

    return () => { alive = false; };
  }, [url]);

  return { peaks, real };
}

/* Playback. The playhead follows `currentTime` on the frame rather than the
   4-per-second `timeupdate` event, so it does not stutter. */
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

/* The only capability signal the live catalog carries is the model's own
   input schema. No schema means "unknown", and unknown is not a reason to
   hide a field — the provider drops what it does not take. */
function offers(model, ...fields) {
  const declared = model?.schema?.fields;
  if (!declared) return true;
  return fields.some((f) => !!declared[f]);
}

/* 14 genres. The chips write the model's `style` string — the label says
   Genre because that is what these are; mood and tempo are appended to the
   same string below. */
const STYLES = [
  "cinematic", "orchestral", "ambient", "lo-fi", "synthwave", "electronic",
  "house", "trap", "hip-hop", "rock", "jazz", "classical", "folk", "pop",
];

const FALLBACK_LENGTHS = [30, 60, 90, 120, 180, 240];

const EXAMPLES = [
  "Slow build, muted piano over sub bass, no drums until the second half",
  "Driving four-on-the-floor, analogue synths, bright but not cheerful",
  "Solo cello, room tone, one long phrase repeated with variation",
  "Late-night radio soul, tape hiss, brushed drums, warm bass",
];

export default function MusicStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState([]);
  const [mood, setMood] = useState("");
  const [tempo, setTempo] = useState("");
  const [title, setTitle] = useState("");
  const [negativeTags, setNegativeTags] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState("f");
  const [duration, setDuration] = useState(60);
  const [sheet, setSheet] = useState(false);

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Composition models ONLY (EDITSv1 E1.4): audioKind === "music". The old
     filter took the whole coarse-"audio" capability, so converters,
     isolators and lyric generators all showed up as "composers" — those
     live in Audio Tools now. */
  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "audio") && audioKind(m) === "music"),
    [models],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setBrief(templateConfig.prompt);
    if (templateConfig.title) setTitle(templateConfig.title);
    if (templateConfig.style) setStyle(String(templateConfig.style).split(",").map((s) => s.trim()).filter(Boolean));
    if (templateConfig.model) setModelId(templateConfig.model);
    if (typeof templateConfig.instrumental === "boolean") setInstrumental(templateConfig.instrumental);
  }, [templateConfig]);

  /* `durations` is always an array — [] when the model offers no choice. This
     is a field the catalog genuinely emits, unlike the `has*` flags. */
  const lengths = model?.durations?.length
    ? model.durations.map(Number).filter(Number.isFinite)
    : FALLBACK_LENGTHS;
  const modelSetsLength = !!model?.durations?.length;

  useEffect(() => {
    if (lengths.length && !lengths.includes(duration)) setDuration(lengths[0]);
  }, [lengths, duration]);

  const wantsStyle = offers(model, "style", "tags");
  const wantsTitle = offers(model, "title");
  const wantsVocals = offers(model, "instrumental", "vocal_gender");
  const wantsNegative = offers(model, "negative_tags");

  /* Genre chips + free-text mood + tempo all feed the model's ONE `style`
     string — Suno takes descriptive prompt text, not a tempo parameter, so
     the tempo control is honestly a prompt hint ("at N BPM"), never an
     invented API field. */
  const styleText = useMemo(() => {
    const parts = [...style];
    if (mood.trim()) parts.push(mood.trim());
    if (tempo.trim()) parts.push(`at ${tempo.trim().replace(/\s*bpm$/i, "")} BPM`);
    return parts.join(", ");
  }, [style, mood, tempo]);

  /* Identical tool string and params on both sides of the quote. */
  const costParams = useMemo(
    () => ({ duration, prompt: brief, ...(wantsStyle && styleText ? { style: styleText } : {}) }),
    [duration, brief, wantsStyle, styleText],
  );

  const { cost, affordable, balance, shortfall } = useCreditCost("audio", model?.id || "", costParams);

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const url = mediaUrl(result);
  const { peaks, real } = useWaveform(url);
  const { ref, playing, current, duration: playLength, toggle, seek } = useTransport(url);
  const shownPeaks = peaks || (playLength ? placeholderPeaks(playLength) : null);
  const progress = playLength > 0 ? Math.min(1, current / playLength) : 0;

  const vocalWord = vocalGender === "m" ? "male" : "female";

  const suggestedTitle = useMemo(() => {
    if (title.trim()) return title.trim();
    const head = style.slice(0, 2).join(" ");
    const tail = instrumental ? "instrumental" : `${vocalWord} vocal`;
    return head ? `${head} — ${tail}` : "";
  }, [title, style, instrumental, vocalWord]);

  const toggleStyle = useCallback((tag) => {
    setStyle((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  const generate = useCallback(() => {
    if (!model || !brief.trim()) return;
    submit("audio", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: brief.trim(),
      duration,
      ...(wantsStyle && styleText ? { style: styleText } : {}),
      ...(wantsTitle && suggestedTitle ? { title: suggestedTitle } : {}),
      ...(wantsVocals ? { instrumental, ...(instrumental ? {} : { vocal_gender: vocalGender }) } : {}),
      ...(wantsNegative && negativeTags.trim() ? { negative_tags: negativeTags.trim() } : {}),
    });
  }, [
    model, brief, submit, duration, wantsStyle, styleText, wantsTitle, suggestedTitle,
    wantsVocals, instrumental, vocalGender, wantsNegative, negativeTags,
  ]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        label="Composer"
        emptyHint="No music models in the catalog yet."
      />

      {wantsStyle && (
        <Field label="Genre" hint="Stack a few. Order does not matter.">
          <Chips
            label="Genre"
            scroll
            options={STYLES.map((s) => ({ value: s, label: s }))}
            value={style}
            onChange={toggleStyle}
            compare={(selected, tag) => Array.isArray(selected) && selected.includes(tag)}
          />
        </Field>
      )}

      {wantsStyle && (
        <Field label="Mood" hint="Free text, added to the style brief.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="melancholic, triumphant, late-night…"
            />
          )}
        </Field>
      )}

      {wantsStyle && (
        <Field label="Tempo" hint="A prompt hint — written into the style text as “at N BPM”, not a hard parameter.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              inputMode="numeric"
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              placeholder="e.g. 96"
            />
          )}
        </Field>
      )}

      {wantsVocals && (
        <Group label="Voice">
          <Toggle
            checked={instrumental}
            onChange={setInstrumental}
            label="Instrumental only"
            hint="No lead vocal, no lyrics."
          />
          {!instrumental && (
            <Segmented
              label="Vocal register"
              value={vocalGender}
              onChange={setVocalGender}
              options={[
                { value: "f", label: "Female" },
                { value: "m", label: "Male" },
              ]}
            />
          )}
        </Group>
      )}

      <Field
        label="Length"
        hint={modelSetsLength ? "Lengths this model offers." : "Target length. The model may land close rather than exact."}
      >
        <Chips
          label="Length"
          scroll
          value={duration}
          onChange={setDuration}
          options={lengths.map((d) => ({
            value: d,
            label: d >= 60 && d % 60 === 0 ? `${d / 60}m` : `${d}s`,
          }))}
        />
      </Field>

      {wantsTitle && (
        <Field label="Title" hint={suggestedTitle && !title ? `Blank uses “${suggestedTitle}”.` : undefined}>
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={suggestedTitle || "Name the track"}
            />
          )}
        </Field>
      )}

      {wantsNegative && (
        <Field label="Avoid" hint="Sounds or treatments to keep out.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={negativeTags}
              onChange={(e) => setNegativeTags(e.target.value)}
              placeholder="autotune, distortion, spoken word"
            />
          )}
        </Field>
      )}

      <Group label="This take">
        <Specs
          rows={[
            { k: "Model", v: model?.displayName || model?.name },
            { k: "Len", v: `${duration}s` },
            { k: "Style", v: styleText || "Unset" },
            { k: "Voice", v: wantsVocals ? (instrumental ? "Instrumental" : `${vocalWord} vocal`) : null },
            { k: "Title", v: suggestedTitle || null },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Body ─────────────────────────────────────────────────────────────── */
  const settings = [
    model?.displayName || model?.name,
    `${duration}s`,
    instrumental ? "instrumental" : styleText || null,
  ].filter(Boolean).join(" · ");

  const failed = !!error && !generating && !url;

  const body = (
    <div className="st-wave__body">
      {/* Errors go through the kit's Stage error path (Fault) — this surface
          inherits the ErrorPanel upgrade (retry, error ids) at merge. */}
      {failed && <Fault error={error} onRetry={generate} />}

      <div className="hs-row hs-row--between">
        <span className="hs-eyebrow">
          {generating ? "Composing" : url ? suggestedTitle || "Composed" : "Composition"}
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
        label={url ? "Composed track waveform" : "Empty waveform"}
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

      {/* No `crossOrigin`: demanding CORS from a host that does not send it
          would block playback outright. The waveform degrades instead. */}
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
            <IcRefresh className="hs-icon-sm" /> Compose another
          </button>
          <span className="hs-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx-mute)" }}>
            {result?.creditsUsed != null ? `${result.creditsUsed} cr` : ""}
            {result?.elapsed != null ? ` · ${result.elapsed}s` : ""}
          </span>
        </div>
      ) : (
        !generating && !failed && (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcMusic /></span>
            <h3>Describe the track</h3>
            <p>
              Say what plays, what does not, and how it moves. Pick the style and length on the
              left, then write the brief below — or paste lyrics and the composer will set them.
            </p>
            <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="hs-chip"
                  style={{ fontFamily: "var(--ff-ui)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={e}
                  onClick={() => setBrief(e)}
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
          value={brief}
          onChange={setBrief}
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          disabled={!model}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          maxChars={3000}
          submitLabel="Compose"
          placeholder="Describe the track, or paste the lyrics you want set."
        />
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Settings">
        {controls}
      </Sheet>
    </div>
  );
}
