"use client";

import { useEffect, useRef, useState } from "react";
import { IcDownload, IcRefresh, IcCopy, IcCheck, IcExternal, IcClose } from "./Icons";
import ErrorPanel from "./ErrorPanel";
import SendTo from "./SendTo";

/* ══════════════════════════════════════════════════════════════════════════
   STAGE — where the work is shown
   ──────────────────────────────────────────────────────────────────────────
   Four states: idle, rendering, result, fault. Each is a plain statement of
   what is true right now. The render state shows real elapsed time and the
   real pipeline step — no invented percentages, no orbiting particles.
   ══════════════════════════════════════════════════════════════════════════ */

const isVideo = (u) => typeof u === "string" && (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes("/video/"));
const isAudio = (u) => typeof u === "string" && /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u);

export function mediaUrl(result) {
  if (!result) return null;
  if (typeof result === "string") return result;
  return result.url || result.outputUrl || result.outputs?.[0] || null;
}

/* ── Readout strip: model, settings, elapsed ───────────────────────────── */
export function Readout({ items = [] }) {
  const shown = items.filter((i) => i && i.v != null && i.v !== "" && i.v !== "—");
  if (!shown.length) return null;
  return (
    <div className="st-readout">
      {shown.map(({ k, v }) => (
        <span key={k}>
          {k} <b>{v}</b>
        </span>
      ))}
    </div>
  );
}

/* ── Elapsed timer ─────────────────────────────────────────────────────── */
function useElapsed(active, seed = 0) {
  const [s, setS] = useState(seed);
  useEffect(() => {
    if (!active) { setS(seed); return; }
    setS(seed);
    const t0 = Date.now() - seed * 1000;
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active, seed]);
  return s;
}

export function clock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ── Rendering ─────────────────────────────────────────────────────────── */
const STEPS = ["queued", "rendering", "finishing"];
const STEP_OF = {
  preparing: 0, submitting: 0, pending: 0, queued: 0,
  generating: 1, processing: 1, rendering: 1, running: 1,
  quality_check: 2, finalizing: 2, downloading: 2, finishing: 2,
};

export function Rendering({ stage, elapsed, ratio = "16:9", model, settings, note, onCancel }) {
  const t = useElapsed(true, elapsed ?? 0);
  const now = STEP_OF[String(stage || "").toLowerCase()] ?? 1;
  const [w, h] = String(ratio).split(":").map(Number);

  return (
    <div className="st-stage">
      <Readout items={[{ k: "MODEL", v: model }, { k: "SET", v: settings }]} />

      <div className="st-render">
        <div
          className="st-render__frame"
          style={{ "--render-ar": w && h ? `${w} / ${h}` : "16 / 9" }}
          role="status"
          aria-live="polite"
          aria-label={`Rendering, ${clock(t)} elapsed`}
        />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s-3)" }}>
          <span className="st-render__timer">{clock(t)}</span>
          <div className="st-render__steps">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={`st-render__step${i < now ? " is-done" : i === now ? " is-now" : ""}`}
              >
                {label}
              </span>
            ))}
          </div>
          {note && <span className="hs-hint" role="status">{note}</span>}
        </div>

        {onCancel && (
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={onCancel}>
            <IcClose className="hs-icon-sm" /> Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Result ────────────────────────────────────────────────────────────── */
export function Result({
  result,
  model,
  settings,
  onNew,
  onDownload,
  actions = [],
  /** The brief that produced this, carried along on a handoff so the next
      tool starts with context instead of an empty form. */
  prompt,
}) {
  const [copied, setCopied] = useState(false);
  const url = mediaUrl(result);
  if (!url) return null;

  const credits = result?.creditsUsed ?? result?.credits;
  const took = result?.elapsed;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  const download = () => {
    if (onDownload) return onDownload();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="st-stage">
      <Readout
        items={[
          { k: "MODEL", v: model },
          { k: "SET", v: settings },
          { k: "COST", v: credits != null ? `${credits}cr` : null },
          { k: "TOOK", v: took != null ? `${took}s` : null },
        ]}
      />

      <figure className="st-stage__media">
        {isVideo(url) ? (
          <video src={url} controls playsInline preload="metadata" disableRemotePlayback />
        ) : isAudio(url) ? (
          <audio src={url} controls style={{ width: "min(520px, 80vw)", margin: "var(--s-8)" }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
          <img src={url} alt="Generated result" />
        )}

        <div className="st-stage__acts">
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={download}>
            <IcDownload className="hs-icon-sm" /> Download
          </button>
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={copy}>
            {copied ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            className="hs-btn hs-btn--ghost hs-btn--sm"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IcExternal className="hs-icon-sm" /> Open
          </a>
          <SendTo url={url} result={result} prompt={prompt} />
          {actions.map((a) => (
            <button key={a.id} type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => a.run?.(url, result)}>
              {a.icon}
              {a.label}
            </button>
          ))}
          {onNew && (
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={onNew}>
              <IcRefresh className="hs-icon-sm" /> New
            </button>
          )}
        </div>
      </figure>
    </div>
  );
}

/* ── Idle ──────────────────────────────────────────────────────────────── */
export function Idle({ icon, title, description, examples = [], onExample, children }) {
  return (
    <div className="st-stage">
      <div className="hs-empty">
        {icon && <span className="hs-empty__mark">{icon}</span>}
        <h3>{title}</h3>
        {description && <p>{description}</p>}

        {examples.length > 0 && (
          <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
            {examples.slice(0, 4).map((e, i) => (
              <button
                key={i}
                type="button"
                className="hs-chip"
                onClick={() => onExample?.(e)}
                style={{ fontFamily: "var(--ff-ui)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                title={e}
              >
                {e.length > 44 ? `${e.slice(0, 44)}…` : e}
              </button>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── Fault ─────────────────────────────────────────────────────────────── */
/* Backward-compatible wrapper: 10 studios pass `error` as a string or an
   ApiError. All rendering now lives in ErrorPanel (title, explanation,
   validation details, Retry, Edit settings, internal error id). */
export function Fault({ error, onRetry, onEditSettings }) {
  return <ErrorPanel error={error} title={typeof error === "string" ? "Generation failed" : undefined} onRetry={onRetry} onEditSettings={onEditSettings} />;
}

/* ══════════════════════════════════════════════════════════════════════════
   Stage — picks the right state. Tools that want full control can import the
   four pieces directly instead.
   ══════════════════════════════════════════════════════════════════════════ */
export default function Stage({
  generating,
  result,
  error,
  stage,
  elapsed,
  model,
  settings,
  ratio,
  note,
  onCancel,
  onRetry,
  onEditSettings,
  onNew,
  onDownload,
  actions,
  prompt,
  idle,
}) {
  if (generating) {
    return <Rendering stage={stage} elapsed={elapsed} ratio={ratio} model={model} settings={settings} note={note} onCancel={onCancel} />;
  }
  if (error && !result) {
    return <Fault error={error} onRetry={onRetry} onEditSettings={onEditSettings} />;
  }
  if (result) {
    return <Result result={result} model={model} settings={settings} onNew={onNew} onDownload={onDownload} actions={actions} prompt={prompt} />;
  }
  return idle || null;
}
