"use client";

import { useState } from "react";

/* ── Inline SVGs ── */
const IconOrbit = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M4.93 4.93c3.9-3.9 10.24-3.9 14.14 0" />
    <path d="M19.07 19.07c-3.9 3.9-10.24 3.9-14.14 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconDownload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconRefresh = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23,4 23,10 17,10" />
    <polyline points="1,20 1,14 7,14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);

const IconCross = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconBoltSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

/* ── Prompt suggestions for empty state ── */
const DEFAULT_SUGGESTIONS = [
  "A cinematic portrait with soft golden light",
  "Abstract geometric composition, neon palette",
  "Moody landscape at golden hour, film grain",
  "Product photography on dark reflective surface",
];

/* ══════════════════════════════════════════════════════════════ */
export default function StageArea({
  generating = false,
  progress,
  stage,
  model,
  quality,
  ratio,
  result,
  resultTitle,
  toolLabel = "Creative instrument",
  toolDesc = "Describe your vision with precision — every detail, every nuance — and watch it emerge in seconds.",
  toolIcon,
  onCancel,
  onNew,
  onDownload,
  onCanvas,
  onReference,
  suggestions = DEFAULT_SUGGESTIONS,
  onSuggestionClick,
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!onDownload) return;
    setDownloading(true);
    try { await onDownload(); } finally {
      setTimeout(() => setDownloading(false), 1200);
    }
  };

  /* ── Empty state — ethereal glass ring + suggestions ── */
  if (!generating && !result) {
    return (
      <div className="v6-stage">
        <div className="v6-stage-grid" />
        <div className="v6-empty-state" style={{ maxWidth: 500 }}>
          {/* 128px glowing ring */}
          <div className="v6-glow-ring" style={{ margin: "0 auto 28px" }}>
            {toolIcon || <IconOrbit />}
          </div>
          <h2 style={{ fontFamily: "var(--v6-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.04em", margin: "0 0 10px", background: "linear-gradient(135deg, var(--v6-text) 30%, var(--v6-muted) 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {toolLabel}
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--v6-muted)", maxWidth: 380, margin: "0 auto 24px" }}>
            {toolDesc}
          </p>
          {/* Suggestion cluster with varied chip sizes */}
          {suggestions.length > 0 && (
            <div className="v6-suggestion-cluster" style={{ marginBottom: 20 }}>
              {suggestions.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  className={`v6-suggestion-chip${i === 0 ? " v6-chip-lg" : ""}`}
                  onClick={() => onSuggestionClick?.(s)}
                >
                  {s.length > 60 ? s.slice(0, 60) + "\u2026" : s}
                </button>
              ))}
            </div>
          )}
          {/* Button-in-button */}
          {onNew && (
            <button
              className="v6-btn-glow"
              onClick={onNew}
              style={{ margin: "0 auto" }}
            >
              Start a new project
              <span className="v6-btn-icon-nest">
                <IconBoltSmall />
              </span>
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Result view — double-bezel frame with capsules ── */
  if (result && !generating) {
    const url = result?.url || result?.outputUrl || result;
    const title = resultTitle || result?.name || "New creative output";
    const credits = result?.creditsUsed ?? result?.credits ?? "\u2014";
    const elapsed = result?.elapsed ?? "\u2014";
    const resolution = result?.resolution ?? result?.dimensions ?? (quality && ratio ? `${quality} \u00b7 ${ratio}` : "\u2014");

    return (
      <div className="v6-stage">
        <div className="v6-stage-grid" />
        <div className="v6-result-bezel">
          {/* Media panel with inner shadow */}
          <div className="v6-result-media-bezel">
            {typeof url === "string" ? (
              url.endsWith(".mp4") || url.endsWith(".webm") || url.includes("/video/") ? (
                <video src={url} controls playsInline />
              ) : (
                <img src={url} alt={title} loading="lazy" />
              )
            ) : null}
          </div>

          {/* Info panel */}
          <div className="v6-result-info-bezel">
            <div>
              <div className="v6-eyebrow">Generation complete</div>
              <h2>{title}</h2>
            </div>

            {/* Specs as glass capsules */}
            <div className="v6-specs-grid">
              <div className="v6-capsule">
                <IconBoltSmall />
                <span>{credits} credits</span>
              </div>
              <div className="v6-capsule">
                <IconClock />
                <span>{elapsed}s</span>
              </div>
              {resolution && resolution !== "\u2014" && (
                <div className="v6-capsule" style={{ gridColumn: "span 2" }}>
                  <span>Resolution: <strong>{resolution}</strong></span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {onDownload && (
                <button
                  className={`v6-btn-glow${downloading ? "" : ""}`}
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  <IconDownload />
                  {downloading ? "Saving\u2026" : "Download"}
                  <span className="v6-btn-icon-nest">
                    <IconBoltSmall />
                  </span>
                </button>
              )}
              {onNew && (
                <button className="v6-btn v6-btn-glow" onClick={onNew} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "none", color: "var(--v6-muted)" }}>
                  <IconRefresh /> New
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Generating state — cinematic 180px core ── */
  const progressPct = progress != null ? Math.min(Math.max(progress, 0), 100) : null;
  const stageText = stage || "Generating";

  return (
    <div className="v6-stage v6-generating">
      <div className="v6-stage-grid" />

      <div className="v6-generation-space" style={{
        background:
          "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(255,65,111,0.1) 0%, transparent 55%)," +
          "radial-gradient(ellipse 40% 30% at 30% 55%, rgba(242,179,93,0.06) 0%, transparent 45%)",
      }}>
        {/* Orbiting rings + dots */}
        <div className="v6-generation-orbits">
          <div className="v6-gen-orbit" />
          <div className="v6-gen-orbit" />
          <div className="v6-gen-orbit" />
          <div className="v6-gen-dot" />
          <div className="v6-gen-dot" />
          <div className="v6-gen-dot" />
        </div>

        {/* Floating particles */}
        <div className="v6-gen-particles">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="v6-gen-particle" />
          ))}
        </div>

        {/* Stage label pill */}
        <div className="v6-stage-label" style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 5 }}>
          {stageText}
        </div>

        {/* Cinematic loading core */}
        <div className="v6-generation-hud">
          <div className="v6-cinematic-core">
            <div className="v6-cinematic-core-inner">
              {progressPct != null ? (
                <strong>{Math.round(progressPct)}%</strong>
              ) : (
                <strong>{stageText}</strong>
              )}
              <small>rendering</small>
            </div>
          </div>
        </div>

        {/* Bottom meta */}
        <div className="v6-generation-meta">
          {model && (
            <div><span>Model</span><strong>{model}</strong></div>
          )}
          {(quality || ratio) && (
            <div><span>Settings</span><strong>{[quality, ratio].filter(Boolean).join(" \u00b7 ")}</strong></div>
          )}
        </div>

        {/* Cancel button */}
        {onCancel && (
          <div className="v6-generation-cancel">
            <button className="v6-btn v6-btn-glow" onClick={onCancel} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "none", color: "var(--v6-muted)" }}>
              <IconCross /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
