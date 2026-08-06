"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fault, clock, IcMusic, IcRefresh, IcBolt } from "@/components/studio/kit";
import { useAsyncGeneration } from "../useAsyncGeneration";
import { useCreditCost } from "../useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import {
  fullRange, normalizeRange, moveRangeEdge, timeAtRatio, continueAtFor,
  replaceWindowIssue, isMusicTrackModel, TRACK_OPS, opParams,
} from "@/lib/music-timeline-core.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   S2 — the Music track workbench: history, timeline, operations
   ──────────────────────────────────────────────────────────────────────────
   The user's completed music Generations are the track list (polled from
   /api/generations exactly like the gallery). Selecting one draws a
   duration-scaled timeline bar — a simple visual, deliberately no waveform
   dependency — with a pointer- and keyboard-driven time-range selector on
   the ClippingStudio grip pattern (same .st-range classes, so the
   coarse-pointer 44px hit areas come from the shared CSS).

   Every operation quotes server-side through useCreditCost (the SAME params
   object the submit sends — a mismatch would quote one price and charge
   another) and submits through the ordinary generation flow with the op's
   real model id. Results are Generations like any other, so they appear in
   the list on the next refresh; failures surface through Fault, the same
   Stage/ErrorPanel path every studio uses.
   ══════════════════════════════════════════════════════════════════════════ */

const KEY_STEP = 0.5;       // seconds per arrow press
const KEY_STEP_BIG = 5;     // with Shift

function trackTitle(gen) {
  const t = gen?.params?.title;
  if (typeof t === "string" && t.trim()) return t.trim();
  const p = String(gen?.prompt || "").trim();
  return p.length > 60 ? `${p.slice(0, 60)}…` : p || "Untitled track";
}

export default function TrackWorkbench({ refreshKey = 0, onCreditsChanged }) {
  const [tracks, setTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState(null);
  const [opId, setOpId] = useState(TRACK_OPS[0].id);
  const [opPrompt, setOpPrompt] = useState("");
  const [opStyle, setOpStyle] = useState("");
  const [bump, setBump] = useState(0);

  const audioRef = useRef(null);
  const barRef = useRef(null);
  const drag = useRef(null);

  const { loading: running, result, error, elapsed, stage, submit, cancel } = useAsyncGeneration();

  /* ── The track list is the user's completed music Generations ─────────── */
  useEffect(() => {
    let alive = true;
    setLoadingTracks(true);
    (async () => {
      try {
        const res = await apiFetch("/api/generations?tool=audio&status=completed&limit=50", { retries: 0 });
        const data = await res.json();
        if (!alive) return;
        const list = (data.generations || []).filter(
          (g) => g.outputUrl && !String(g.outputUrl).startsWith("data:") && isMusicTrackModel(g.model),
        );
        setTracks(list);
        setListError("");
      } catch (e) {
        if (alive) setListError(e?.message || "Could not load your tracks.");
      } finally {
        if (alive) setLoadingTracks(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshKey, bump]);

  /* A finished op is a new Generation — pull the list again. */
  useEffect(() => {
    if (!result) return;
    onCreditsChanged?.();
    setBump((b) => b + 1);
  }, [result, onCreditsChanged]);

  const track = tracks.find((t) => t.id === selectedId) || null;

  /* ── Duration: the file's own metadata, or the submitted length ───────── */
  useEffect(() => {
    setDuration(0);
    setRange(null);
    const el = audioRef.current;
    if (!el || !track?.outputUrl) return undefined;
    const fallback = Number(track?.params?.duration);
    if (Number.isFinite(fallback) && fallback > 0) {
      setDuration(fallback);
      setRange(fullRange(fallback));
    }
    const meta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
        setRange(fullRange(el.duration));
      }
    };
    el.addEventListener("loadedmetadata", meta);
    return () => el.removeEventListener("loadedmetadata", meta);
  }, [track?.id, track?.outputUrl, track?.params?.duration]);

  const r = useMemo(
    () => (duration > 0 ? normalizeRange(range || fullRange(duration), duration) : null),
    [range, duration],
  );

  /* ── Range grips: pointer (captured drag) + keyboard, per ClippingStudio ─ */
  const setEdge = useCallback((edge, value) => {
    setRange((prev) => moveRangeEdge(prev || fullRange(duration), edge, value, duration));
  }, [duration]);

  const onGripDown = (e, edge) => {
    e.preventDefault();
    e.stopPropagation();
    if (!barRef.current || !duration) return;
    drag.current = { edge, rect: barRef.current.getBoundingClientRect() };
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setEdge(d.edge, timeAtRatio((e.clientX - d.rect.left) / d.rect.width, duration));
  };
  const onGripUp = (e) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };
  const onGripKey = (e, edge) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.shiftKey ? KEY_STEP_BIG : KEY_STEP) * (e.key === "ArrowLeft" ? -1 : 1);
    const from = edge === "l" ? (r?.start ?? 0) : (r?.end ?? duration);
    setEdge(edge, from + step);
  };

  /* ── The selected operation, quoted server-side on the SAME params ────── */
  const op = TRACK_OPS.find((o) => o.id === opId) || TRACK_OPS[0];
  const params = useMemo(
    () => opParams(op.id, {
      track, range: r, duration,
      prompt: opPrompt, style: opStyle.trim() || undefined,
    }),
    [op.id, track, r, duration, opPrompt, opStyle],
  );

  const { cost, affordable, balance, shortfall } = useCreditCost(
    track ? "audio" : "", op.id, params,
  );

  const rangeIssue = op.id === "replace-section" ? replaceWindowIssue(r, duration) : null;
  const missingPrompt = op.needsPrompt && op.id !== "upload-and-extend-audio" && !opPrompt.trim();
  const blocked = !track || running || !affordable || !!rangeIssue || missingPrompt;
  const blockReason = !track ? "Select a track first"
    : rangeIssue || (missingPrompt ? "Describe what to generate" : !affordable ? "Not enough credits" : null);

  const runOp = useCallback(() => {
    if (blocked || !track) return;
    submit("audio", op.id, { endpoint: op.id, ...params });
  }, [blocked, track, submit, op.id, params]);

  const failed = !!error && !running;

  return (
    <section className="st-mtl" aria-label="Tracks and timeline">
      <div className="hs-row hs-row--between">
        <span className="hs-eyebrow">Tracks</span>
        <button
          type="button"
          className="hs-btn hs-btn--ghost hs-btn--sm"
          onClick={() => setBump((b) => b + 1)}
          disabled={loadingTracks}
        >
          <IcRefresh className="hs-icon-sm" /> Refresh
        </button>
      </div>

      {listError && <p className="hs-notice hs-notice--fault" role="alert">{listError}</p>}

      {tracks.length === 0 && !listError ? (
        <p className="hs-hint">
          {loadingTracks
            ? "Loading your tracks…"
            : "Nothing here yet. Compose a track above and it lands in this list — then you can extend it, cover it, or pull its stems."}
        </p>
      ) : (
        <ul className="st-mtl__list">
          {tracks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`st-mtl__track${selectedId === t.id ? " is-active" : ""}`}
                onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                aria-pressed={selectedId === t.id}
              >
                <span className="st-mtl__mark"><IcMusic className="hs-icon-sm" /></span>
                <span className="st-mtl__meta">
                  <span className="st-mtl__title">{trackTitle(t)}</span>
                  <span className="st-mtl__sub hs-mono">
                    {new Date(t.createdAt).toLocaleDateString()}
                    {Number(t.params?.duration) > 0 ? ` · ${Number(t.params.duration)}s` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {track && (
        <div className="st-mtl__work">
          {/* Metadata reader + playback for the selected track */}
          <audio ref={audioRef} src={track.outputUrl} controls preload="metadata" className="st-mtl__audio" />

          <div className="hs-row hs-row--between" style={{ gap: "var(--s-3)" }}>
            <span className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>
              {r ? `${clock(r.start)} – ${clock(r.end)} of ${clock(duration)}` : "Reading track length…"}
            </span>
            <span className="hs-hint" style={{ textAlign: "right" }}>
              Drag the grips, or focus one and use ← → (Shift for 5s).
            </span>
          </div>

          <div
            ref={barRef}
            className="st-mtl__bar"
            role="group"
            aria-label="Track timeline"
          >
            {r && duration > 0 && (
              <div
                className="st-range is-active"
                style={{
                  left: `${(r.start / duration) * 100}%`,
                  width: `${((r.end - r.start) / duration) * 100}%`,
                }}
              >
                <button
                  type="button"
                  className="st-range__grip st-range__grip--l"
                  role="slider"
                  aria-label="Selection start"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration * 10) / 10}
                  aria-valuenow={Math.round(r.start * 10) / 10}
                  aria-valuetext={clock(r.start)}
                  onPointerDown={(e) => onGripDown(e, "l")}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onKeyDown={(e) => onGripKey(e, "l")}
                />
                <button
                  type="button"
                  className="st-range__grip st-range__grip--r"
                  role="slider"
                  aria-label="Selection end"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration * 10) / 10}
                  aria-valuenow={Math.round(r.end * 10) / 10}
                  aria-valuetext={clock(r.end)}
                  onPointerDown={(e) => onGripDown(e, "r")}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onKeyDown={(e) => onGripKey(e, "r")}
                />
              </div>
            )}
          </div>

          {/* Operation choice */}
          <div className="hs-chips" role="group" aria-label="Track operation">
            {TRACK_OPS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`hs-chip${o.id === op.id ? " is-on" : ""}`}
                aria-pressed={o.id === op.id}
                title={o.hint}
                onClick={() => setOpId(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="hs-hint">{op.hint}</span>

          {op.needsPrompt && (
            <input
              className="hs-input"
              value={opPrompt}
              onChange={(e) => setOpPrompt(e.target.value)}
              placeholder={
                op.id === "upload-and-extend-audio"
                  ? "Optional: how the continuation should sound"
                  : op.id === "replace-section"
                    ? "What plays in the replaced section"
                    : "Describe the result"
              }
              aria-label="Operation brief"
            />
          )}
          {op.needsPrompt && (
            <input
              className="hs-input"
              value={opStyle}
              onChange={(e) => setOpStyle(e.target.value)}
              placeholder="Optional style tags — lo-fi, cinematic…"
              aria-label="Operation style"
            />
          )}

          {failed && <Fault error={error} onRetry={runOp} />}

          <div className="hs-row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
            {running ? (
              <button type="button" className="hs-btn hs-btn--outline" onClick={cancel}>
                <span className="hs-spin" />
                {String(stage || "working").replace(/_/g, " ")}
                <span className="hs-mono" style={{ marginLeft: "var(--s-2)" }}>{clock(elapsed)}</span>
              </button>
            ) : (
              <button
                type="button"
                className="hs-btn hs-btn--primary"
                onClick={runOp}
                disabled={blocked}
                title={blockReason || op.label}
              >
                <IcBolt className="hs-icon-sm" />
                {op.label}
                {cost > 0 && <span className="hs-btn__cost">{cost}</span>}
              </button>
            )}
            <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)", alignSelf: "center" }}>
              {blockReason
                ? blockReason
                : cost != null
                  ? `${cost} cr · balance ${balance ?? "—"}${shortfall ? ` · short ${shortfall}` : ""}`
                  : "Quoting…"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
