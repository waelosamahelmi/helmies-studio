"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dropzone, Field, RatioPicker, Stepper, Toggle, SpendMeter, clock,
  IcScissors, IcPlay, IcPause, IcExternal, IcDownload, IcCopy, IcCheck, IcBolt, IcClose,
} from "@/components/studio/kit";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";

/* ══════════════════════════════════════════════════════════════════════════
   CLIPPING — .st-cut
   ──────────────────────────────────────────────────────────────────────────
   The job is choosing spans of time, so time is the primary axis: the player
   sits above a ruler and a track, and every clip the run returns is a block
   on that track with draggable — and focusable — edges.

   Fixed in this rewrite:
   · `error` and `elapsed` from useAsyncGeneration were computed and never
     rendered, so a failed run looked identical to an idle one. Both are on
     screen now.
   · `affordable` was unused, so the tool would happily fire a job the wallet
     could not pay for. It now gates the action.
   · `handleGenerate` closed over `clipModelId` but left it out of the
     dependency array, so the first render's model id was submitted forever.
     The model is no longer a moving value: clipping has no model choice —
     the server always routes to the `ai-clipping` endpoint — so the same
     constant is used for the quote and the submission. The old build quoted
     `clipModels[0].id` (whatever video model happened to load first) while
     the server charged the clipping rate.
   ══════════════════════════════════════════════════════════════════════════ */

/* runClipping() always submits to this endpoint, so this is the id the quote
   and the submission must agree on. */
const MODEL = "ai-clipping";

const ASPECTS = ["9:16", "1:1", "4:5", "16:9", "4:3"];
const BARS = 160;
const MIN_SPAN = 0.2;          // seconds — a range narrower than this is not a clip
const MAX_DECODE = 48 * 1024 * 1024;

/* ── Timecode ─────────────────────────────────────────────────────────────
   Every numeral in this tool is mono and tabular. */
function tc(s) {
  const v = Number.isFinite(s) && s > 0 ? s : 0;
  const m = Math.floor(v / 60);
  const sec = Math.floor(v % 60);
  const tenths = Math.floor((v - Math.floor(v)) * 10);
  return `${m}:${String(sec).padStart(2, "0")}.${tenths}`;
}

const pct = (v) => `${Math.max(0, Math.min(100, v * 100))}%`;

/* Ruler: aim for roughly ten labelled marks whatever the duration */
function tickStep(duration) {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900];
  return steps.find((s) => duration / s <= 10) || 1800;
}

/* ── Reading the run ──────────────────────────────────────────────────────
   The provider reports highlights in more than one shape, and the async job
   record can carry only the rendered file. Read what is actually there and
   invent nothing: a clip with no timecodes is listed without a span rather
   than given a made-up one. */
const num = (v) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

function readSpan(entry) {
  if (Array.isArray(entry) && entry.length >= 2) {
    return { start: num(entry[0]), end: num(entry[1]), url: null };
  }
  if (!entry || typeof entry !== "object") return null;
  const start = num(entry.start ?? entry.start_time ?? entry.startTime ?? entry.from ?? entry.begin ?? entry.in);
  const end = num(entry.end ?? entry.end_time ?? entry.endTime ?? entry.to ?? entry.finish ?? entry.out);
  const url = entry.url || entry.video_url || entry.videoUrl || entry.output || null;
  const title = entry.title || entry.label || entry.caption || entry.description || null;
  if (start == null && end == null && !url) return null;
  return { start, end, url, title };
}

function readClips(result) {
  if (!result) return [];

  const lists = [];
  const take = (v) => { if (Array.isArray(v)) lists.push(v); };
  take(result.clips); take(result.highlights); take(result.segments);
  take(result.coordinates); take(result.moments);

  for (const key of ["resultJson", "result_json", "data", "raw"]) {
    const raw = result[key];
    let obj = raw;
    if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { obj = null; } }
    if (obj && typeof obj === "object") {
      take(obj.clips); take(obj.highlights); take(obj.segments); take(obj.coordinates);
    }
  }

  const spans = (lists.find((l) => l.length) || [])
    .map(readSpan)
    .filter(Boolean)
    .map((s, i) => ({
      id: `clip-${i}`,
      no: i + 1,
      start: s.start,
      end: s.end != null && s.start != null && s.end <= s.start ? null : s.end,
      url: s.url,
      title: s.title,
    }));
  if (spans.length) return spans;

  /* No timecodes came back — list the files the run produced instead. */
  const files = Array.isArray(result.outputs) && result.outputs.length
    ? result.outputs
    : [result.url || result.outputUrl].filter(Boolean);
  return files.map((url, i) => ({ id: `clip-${i}`, no: i + 1, start: null, end: null, url, title: null }));
}

export default function ClippingStudio({ onCreditsChanged }) {
  const [source, setSource] = useState(null);       // { url, name, … } from /api/upload
  const [highlights, setHighlights] = useState(3);
  const [aspect, setAspect] = useState("9:16");
  const [coordsOnly, setCoordsOnly] = useState(false);

  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [peaks, setPeaks] = useState([]);
  const [clips, setClips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const stopAt = useRef(null);
  const drag = useRef(null);

  const { loading, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Same tool string in the quote and the submission — a mismatch quotes one
     price and charges another. */
  const { cost, affordable, balance, shortfall } = useCreditCost("clipping", MODEL, {
    num_highlights: highlights,
    aspect_ratio: aspect,
    return_coordinates_only: coordsOnly,
  });


  /* ── The run's highlights become the ranges on the track ──────────────── */
  useEffect(() => {
    const next = readClips(result);
    setClips(next);
    setSelected(next[0]?.id ?? null);
  }, [result]);

  /* A new source invalidates the old ranges */
  useEffect(() => {
    setClips([]);
    setSelected(null);
    setDuration(0);
    setNow(0);
    stopAt.current = null;
  }, [source?.url]);

  /* ── Waveform: decoded from the uploaded file, or not drawn at all ────── */
  useEffect(() => {
    const url = source?.url;
    setPeaks([]);
    if (!url || typeof window === "undefined") return;

    let dead = false;
    let ctx = null;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const size = Number(res.headers.get("content-length") || 0);
        if (size > MAX_DECODE) return;   // too large to decode in the tab

        const bytes = await res.arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx || dead) return;

        ctx = new Ctx();
        const audio = await ctx.decodeAudioData(bytes);
        const data = audio.getChannelData(0);
        const per = Math.floor(data.length / BARS) || 1;

        const raw = [];
        let top = 0;
        for (let i = 0; i < BARS; i++) {
          let peak = 0;
          const from = i * per;
          for (let j = from; j < from + per && j < data.length; j += 8) {
            const v = Math.abs(data[j]);
            if (v > peak) peak = v;
          }
          if (peak > top) top = peak;
          raw.push(peak);
        }
        if (dead || !top) return;
        setPeaks(raw.map((p) => Math.round(6 + (p / top) * 88)));
      } catch {
        /* No readable audio track — the track simply renders without a wave. */
      } finally {
        try { await ctx?.close(); } catch { /* already closed */ }
      }
    })();

    return () => { dead = true; };
  }, [source?.url]);

  /* ── Transport ────────────────────────────────────────────────────────── */
  const seek = useCallback((at, until = null) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(at)) return;
    v.currentTime = Math.max(0, Math.min(at, duration || at));
    stopAt.current = until;
    setNow(v.currentTime);
    if (until != null) v.play().catch(() => { /* autoplay refused */ });
  }, [duration]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    stopAt.current = null;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setNow(v.currentTime);
    if (stopAt.current != null && v.currentTime >= stopAt.current) {
      v.pause();
      stopAt.current = null;
    }
  };

  const scrub = (e) => {
    const el = trackRef.current;
    if (!el || !duration) return;
    const rect = el.getBoundingClientRect();
    const at = ((e.clientX - rect.left) / rect.width) * duration;
    seek(at);
  };

  /* ── Range editing ────────────────────────────────────────────────────── */
  const setEdge = useCallback((id, edge, value) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      /* Without loaded metadata there is no known end of the video, so the
         only real bound is the other edge. */
      const span = duration > 0 ? duration : Number.POSITIVE_INFINITY;
      if (edge === "l") {
        const limit = c.end != null ? c.end - MIN_SPAN : span;
        return { ...c, start: Math.max(0, Math.min(value, limit)) };
      }
      const floor = c.start != null ? c.start + MIN_SPAN : 0;
      return { ...c, end: Math.min(span, Math.max(value, floor)) };
    }));
  }, [duration]);

  const nudge = (id, edge, delta) => {
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const from = edge === "l" ? clip.start : clip.end;
    if (from == null) return;
    setEdge(id, edge, from + delta);
    seek(edge === "l" ? from + delta : Math.max(0, from + delta - 0.5));
  };

  const onGripDown = (e, id, edge) => {
    e.preventDefault();
    e.stopPropagation();
    if (!trackRef.current || !duration) return;
    drag.current = { id, edge, rect: trackRef.current.getBoundingClientRect() };
    setSelected(id);
    /* preventDefault above stops the browser focusing the grip, and the grip
       is the arrow-key target — so focus it deliberately. */
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onGripMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const at = ((e.clientX - d.rect.left) / d.rect.width) * duration;
    setEdge(d.id, d.edge, at);
  };

  const onGripUp = (e) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  const onGripKey = (e, id, edge) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.shiftKey ? 1 : 0.1) * (e.key === "ArrowLeft" ? -1 : 1);
    nudge(id, edge, step);
  };

  /* Arrow keys work on the selected row too, so trimming never requires a
     pointer: ← → move the in-point, Shift + ← → move the out-point. */
  const onRowKey = (e, id) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const clip = clips.find((c) => c.id === id);
    if (!clip || clip.start == null) return;
    e.preventDefault();
    nudge(id, e.shiftKey ? "r" : "l", (e.key === "ArrowLeft" ? -0.1 : 0.1));
  };

  /* ── The run ──────────────────────────────────────────────────────────── */
  const generate = useCallback(() => {
    if (!source?.url || loading || !affordable) return;
    submit("clipping", MODEL, {
      endpoint: MODEL,
      video_url: source.url,
      num_highlights: highlights,
      aspect_ratio: aspect,
      return_coordinates_only: coordsOnly,
    });
  }, [source, loading, affordable, highlights, aspect, coordsOnly, submit]);

  const copyTimecodes = async () => {
    const lines = clips
      .filter((c) => c.start != null && c.end != null)
      .map((c) => `${String(c.no).padStart(2, "0")}  ${tc(c.start)} – ${tc(c.end)}`);
    if (!lines.length) return;
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  /* ── Ruler marks ──────────────────────────────────────────────────────── */
  const ticks = useMemo(() => {
    if (!duration) return [];
    const step = tickStep(duration);
    const out = [];
    for (let t = 0, i = 0; t <= duration + 0.001; t += step / 2, i++) {
      out.push({ t, major: i % 2 === 0 });
    }
    return out;
  }, [duration]);

  const spanned = clips.filter((c) => c.start != null && c.end != null);
  const ready = !!source?.url;

  return (
    <div className="st-cut">
      {/* ── Player ─────────────────────────────────────────────────────── */}
      <div className="st-cut__view">
        {ready ? (
          <video
            ref={videoRef}
            src={source.url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            style={{ maxWidth: "100%" }}
          />
        ) : (
          <div className="hs-empty" style={{ maxWidth: 420 }}>
            <span className="hs-empty__mark"><IcScissors /></span>
            <h3>Pull the highlights out of a video</h3>
            <p>
              Add a video and the model finds the moments worth keeping. The clips come
              back as spans on the timeline, and you can trim each one before you use it.
            </p>
            <div style={{ width: "100%", marginTop: "var(--s-2)" }}>
              <Dropzone
                value={source}
                onChange={setSource}
                accept="video/*"
                label="Drop a video or click to browse"
                hint="MP4 or WebM, up to 100MB"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Ruler · track · playhead ───────────────────────────────────── */}
      <div className="st-cut__time">
        <div className="hs-row hs-row--between" style={{ marginBottom: "var(--s-3)", gap: "var(--s-3)" }}>
          <div className="hs-row" style={{ gap: "var(--s-2)" }}>
            <button
              type="button"
              className="hs-btn hs-btn--sm hs-btn--icon"
              onClick={toggle}
              disabled={!ready}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <IcPause className="hs-icon-sm" /> : <IcPlay className="hs-icon-sm" />}
            </button>
            <span className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>
              {tc(now)} / {tc(duration)}
            </span>
            {spanned.length > 0 && (
              <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
                {spanned.length} {spanned.length === 1 ? "range" : "ranges"}
              </span>
            )}
          </div>

          <span className="hs-hint" style={{ textAlign: "right" }}>
            Click the track to scrub. Select a clip, then ← → to move the in-point,
            Shift + ← → for the out-point.
          </span>
        </div>

        <div className="st-ruler" aria-hidden="true">
          {ticks.map(({ t, major }) => (
            <span
              key={t}
              className={`st-ruler__tick${major ? " is-major" : ""}`}
              style={{ left: pct(t / duration) }}
            >
              {major && <span>{clock(t)}</span>}
            </span>
          ))}
        </div>

        <div
          className="st-track"
          ref={trackRef}
          onPointerDown={scrub}
          role="group"
          aria-label="Timeline"
        >
          {peaks.length > 0 && (
            <div className="st-track__wave" aria-hidden="true">
              {peaks.map((h, i) => <i key={i} style={{ "--h": `${h}%` }} />)}
            </div>
          )}

          {duration > 0 && spanned.map((c) => (
            <div
              key={c.id}
              className={`st-range${selected === c.id ? " is-active" : ""}`}
              style={{ left: pct(c.start / duration), width: pct((c.end - c.start) / duration) }}
              onPointerDown={(e) => { e.stopPropagation(); setSelected(c.id); seek(c.start, c.end); }}
            >
              <span className="st-range__label">{String(c.no).padStart(2, "0")}</span>

              <button
                type="button"
                className="st-range__grip st-range__grip--l"
                role="slider"
                aria-label={`Clip ${c.no} in-point`}
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={Number(c.start.toFixed(1))}
                aria-valuetext={tc(c.start)}
                onPointerDown={(e) => onGripDown(e, c.id, "l")}
                onPointerMove={onGripMove}
                onPointerUp={onGripUp}
                onKeyDown={(e) => onGripKey(e, c.id, "l")}
              />
              <button
                type="button"
                className="st-range__grip st-range__grip--r"
                role="slider"
                aria-label={`Clip ${c.no} out-point`}
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={Number(c.end.toFixed(1))}
                aria-valuetext={tc(c.end)}
                onPointerDown={(e) => onGripDown(e, c.id, "r")}
                onPointerMove={onGripMove}
                onPointerUp={onGripUp}
                onKeyDown={(e) => onGripKey(e, c.id, "r")}
              />
            </div>
          ))}

          {duration > 0 && <span className="st-playhead" style={{ left: pct(now / duration) }} />}
        </div>
      </div>

      {/* ── Settings · clips · spend ───────────────────────────────────── */}
      <aside className="st-cut__list" aria-label="Clips and settings">
        <div className="hs-stack">
          {ready && (
            <Field label="Source">
              <div className="hs-row hs-row--between" style={{ gap: "var(--s-2)" }}>
                <span
                  className="hs-mono"
                  style={{ fontSize: 11, color: "var(--tx-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {source.name || "Uploaded video"} · {tc(duration)}
                </span>
                <button
                  type="button"
                  className="hs-btn hs-btn--ghost hs-btn--sm"
                  onClick={() => { setSource(null); reset(); }}
                  disabled={loading}
                >
                  <IcClose className="hs-icon-sm" /> Change
                </button>
              </div>
            </Field>
          )}

          <Field label="Highlights" hint="How many moments to pull out.">
            <Stepper value={highlights} onChange={setHighlights} min={1} max={10} label="Highlights" />
          </Field>

          <Field label="Output aspect">
            <RatioPicker options={ASPECTS} value={aspect} onChange={setAspect} />
          </Field>

          <Toggle
            checked={coordsOnly}
            onChange={setCoordsOnly}
            label="Timecodes only"
            hint="Return the in and out points instead of rendered clips."
          />
        </div>

        <div className="hs-stack" style={{ gap: "var(--s-2)", marginTop: "var(--s-5)" }}>
          <div className="hs-row hs-row--between">
            <span className="hs-label" style={{ margin: 0 }}>Clips</span>
            {spanned.length > 0 && (
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={copyTimecodes}>
                {copied ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
                {copied ? "Copied" : "Copy timecodes"}
              </button>
            )}
          </div>

          {clips.length === 0 && (
            <p className="hs-hint">
              {loading
                ? "The model is watching the video. Clips appear here as soon as it reports back."
                : ready
                  ? "No clips yet. Run the tool and the highlights land here."
                  : "Add a video to begin."}
            </p>
          )}

          {clips.map((c) => (
            <div
              key={c.id}
              className={`st-clip${selected === c.id ? " is-active" : ""}`}
              onKeyDown={(e) => onRowKey(e, c.id)}
            >
              <span className="st-clip__no">{String(c.no).padStart(2, "0")}</span>

              <button
                type="button"
                onClick={() => {
                  setSelected(c.id);
                  if (c.start != null) seek(c.start, c.end ?? null);
                }}
                style={{
                  display: "flex", flexDirection: "column", gap: 2,
                  minWidth: 0, textAlign: "left", padding: 0,
                }}
              >
                <span className="st-clip__title">{c.title || `Clip ${c.no}`}</span>
                <span className="st-clip__span">
                  {c.start != null && c.end != null
                    ? `${tc(c.start)} – ${tc(c.end)} · ${(c.end - c.start).toFixed(1)}s`
                    : "no timecodes returned"}
                </span>
              </button>

              {c.url && (
                <span className="hs-row" style={{ gap: 2 }}>
                  <a
                    className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open clip ${c.no}`}
                  >
                    <IcExternal className="hs-icon-sm" />
                  </a>
                  <a
                    className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
                    href={c.url}
                    download
                    aria-label={`Download clip ${c.no}`}
                  >
                    <IcDownload className="hs-icon-sm" />
                  </a>
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: "auto", paddingTop: "var(--s-5)", display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
          {error && (
            <p className="hs-notice hs-notice--fault" role="alert">
              {error}
            </p>
          )}

          <SpendMeter
            cost={cost || 0}
            balance={balance}
            affordable={affordable}
            shortfall={shortfall}
            label="Cost"
          />

          {loading ? (
            <button type="button" className="hs-btn hs-btn--outline hs-btn--block" onClick={cancel}>
              <span className="hs-spin" />
              {stage ? String(stage).replace(/_/g, " ") : "Working"}
              <span className="hs-mono" style={{ marginLeft: "auto" }}>{clock(elapsed)}</span>
            </button>
          ) : (
            <button
              type="button"
              className="hs-btn hs-btn--primary hs-btn--block"
              onClick={generate}
              disabled={!ready || !affordable}
              title={
                !ready ? "Add a video first"
                : !affordable ? "Not enough credits"
                : "Find the highlights"
              }
            >
              <IcBolt className="hs-icon-sm" />
              {result ? "Run again" : "Find highlights"}
              {cost > 0 && <span className="hs-btn__cost">{cost}</span>}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
