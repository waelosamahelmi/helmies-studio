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

const IconCanvas = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

const IconReference = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
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

const IconMaximize = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15,3 21,3 21,9" /><polyline points="9,21 3,21 3,15" />
    <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

/* ── Determine generation phase from progress ── */
function getPhase(progress) {
  if (progress == null) return "generate";
  if (progress < 20) return "prepare";
  if (progress < 85) return "generate";
  return "refine";
}

function getPhaseLabel(phase, stage) {
  if (stage) return stage;
  switch (phase) {
    case "prepare": return "Preparing\u2026";
    case "generate": return "Generating";
    case "refine":  return "Refining";
    default:        return "Generating";
  }
}

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
  toolDesc = "Describe what you want to create and watch it materialize in the command universe.",
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
    try {
      await onDownload();
    } finally {
      setTimeout(() => setDownloading(false), 1200);
    }
  };

  /* ── Empty state ── */
  if (!generating && !result) {
    return (
      <div className="v6-stage">
        <div className="v6-stage-grid" />
        <div className="v6-empty-state">
          <div className="v6-empty-orbit">
            {toolIcon || <IconOrbit />}
          </div>
          <h2>{toolLabel}</h2>
          <p>{toolDesc}</p>
          {/* Prompt suggestions */}
          {suggestions.length > 0 && (
            <div className="v6-prompt-suggestions">
              {suggestions.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  className="v6-prompt-suggestion"
                  onClick={() => onSuggestionClick?.(s)}
                >
                  {s.length > 60 ? s.slice(0, 60) + "\u2026" : s}
                </button>
              ))}
            </div>
          )}
          {onNew && (
            <button className="v6-btn v6-primary" onClick={onNew} style={{ marginTop: 8 }}>
              <IconMaximize /> Load art direction
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Result view ── */
  if (result && !generating) {
    const url = result?.url || result?.outputUrl || result;
    const title = resultTitle || result?.name || "New creative output";
    const credits = result?.creditsUsed ?? result?.credits ?? "\u2014";
    const elapsed = result?.elapsed ?? "\u2014";
    const resolution = result?.resolution ?? result?.dimensions ?? (quality && ratio ? `${quality} \u00b7 ${ratio}` : "\u2014");

    return (
      <div className="v6-stage">
        <div className="v6-stage-grid" />
        <div className="v6-result-view v6-entrance-scale">
          {/* Media panel */}
          <div className="v6-result-media">
            {typeof url === "string" ? (
              url.endsWith(".mp4") || url.endsWith(".webm") || url.includes("/video/") ? (
                <video src={url} controls playsInline />
              ) : (
                <img src={url} alt={title} loading="lazy" />
              )
            ) : null}
          </div>

          {/* Info panel */}
          <div className="v6-result-info">
            <div className="v6-entrance-fade">
              <div className="v6-eyebrow">Generation complete</div>
              <h2>{title}</h2>
            </div>

            {/* Specs */}
            <div className="v6-quote">
              <div className="v6-quote-row">
                <span className="v6-muted">Model</span>
                <strong>{model || "\u2014"}</strong>
              </div>
              {resolution && (
                <div className="v6-quote-row">
                  <span className="v6-muted">Resolution</span>
                  <strong>{resolution}</strong>
                </div>
              )}
              <div className="v6-quote-row">
                <span className="v6-muted">Cost</span>
                <strong>
                  <IconBolt /> {credits}
                </strong>
              </div>
              <div className="v6-quote-row">
                <span className="v6-muted">Time</span>
                <strong>
                  <IconClock /> {elapsed}s
                </strong>
              </div>
            </div>

            {/* Actions */}
            <div className="v6-result-actions">
              {onDownload && (
                <button
                  className={`v6-btn v6-primary${downloading ? " v6-downloading" : ""}`}
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  <IconDownload /> {downloading ? "Saving\u2026" : "Download"}
                </button>
              )}
              {onNew && (
                <button className="v6-btn" onClick={onNew}>
                  <IconRefresh /> New
                </button>
              )}
              {onReference && (
                <button className="v6-btn" onClick={onReference}>
                  <IconReference /> Reference
                </button>
              )}
              {onCanvas && (
                <button className="v6-btn" onClick={onCanvas}>
                  <IconCanvas /> Canvas
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Generating state ── */
  const progressPct = progress != null ? Math.min(Math.max(progress, 0), 100) : null;
  const phase = getPhase(progressPct);
  const stageText = getPhaseLabel(phase, stage);
  const phaseClass = `v6-phase-${phase}`;

  return (
    <div className={`v6-stage v6-generating ${phaseClass}`}>
      <div className="v6-stage-grid" />

      <div className="v6-generation-space">
        {/* ── Creative loading visuals ── */}
        {/* Light beam sweep */}
        <div className="v6-gen-beams" />

        {/* Orbiting rings */}
        <div className="v6-generation-orbits">
          <div className="v6-gen-orbit" />
          <div className="v6-gen-orbit" />
          <div className="v6-gen-orbit" />
          {/* Orbiting dots (atoms) */}
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

        {/* Caption */}
        <div className={`v6-generation-caption ${phaseClass}`}>{stageText}</div>

        {/* HUD with CSS-only spinning core */}
        <div className="v6-generation-hud">
          <div className="v6-generation-core">
            <div className="v6-generation-core-inner">
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
            <div>
              <span>Model</span>
              <strong>{model}</strong>
            </div>
          )}
          {(quality || ratio) && (
            <div>
              <span>Settings</span>
              <strong>{[quality, ratio].filter(Boolean).join(" \u00b7 ")}</strong>
            </div>
          )}
        </div>

        {/* Cancel button */}
        {onCancel && (
          <div className="v6-generation-cancel">
            <button className="v6-btn v6-ghost" onClick={onCancel}>
              <IconCross /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
