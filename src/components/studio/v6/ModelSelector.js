"use client";

import { useState, useMemo } from "react";

/* ── Inline SVGs ── */
const IconSearch = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
  </svg>
);

const IconZap = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconCheck = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);

const IconGrid = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);

/* ── Helpers ── */
const MODE_LABELS = { tti: "Text to Image", iti: "Image to Image", ttv: "Text to Video", i2v: "Image to Video", v2v: "Video to Video" };
const MODE_KEYS = Object.keys(MODE_LABELS);

const capabilityForMode = (mode) => {
  switch (mode) {
    case "tti": return "tti";
    case "iti": return "iti";
    case "ttv": return "ttv";
    case "i2v": return "i2v";
    case "v2v": return "v2v";
    default: return null;
  }
};

function modelScore(model) {
  let s = 3;
  if (model.speedTier === "fast") s += 1;
  if (model.speedTier === "premium") s += 1;
  if (model.resolutions && model.resolutions.length > 1) s += 1;
  if (model.aspectRatios && model.aspectRatios.length >= 5) s += 1;
  if (model.durations && model.durations.length >= 5) s += 1;
  return Math.min(s, 5);
}

function costLabel(model) {
  if (model.credits) return `${model.credits}c`;
  if (model.speedTier === "premium") return "8c";
  if (model.speedTier === "fast") return "3c";
  return model.durations ? "4c/s" : "4c";
}

function modelGradient(model) {
  const id = model.id || model.name || "";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 30) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 55%, 18%), hsl(${h2}, 40%, 10%))`;
}

/* ══════════════════════════════════════════════════════════════ */
export default function ModelSelector({
  models = [],
  selectedModelId,
  onSelect,
  label = "Choose model",
  filterMode,
}) {
  const [activeMode, setActiveMode] = useState(null);
  const [quickFilter, setQuickFilter] = useState(null);

  /* ── Filter by capability mode ── */
  const modeFiltered = useMemo(() => {
    const cap = capabilityForMode(activeMode || filterMode);
    if (!cap) return models;
    return models.filter((m) => {
      if (cap === "tti") return m.aspectRatios && !m.durations && !m.maxImages && !m.isExtend;
      if (cap === "iti") return m.maxImages && !m.durations;
      if (cap === "ttv") return m.durations && !m.maxImages && !m.isExtend;
      if (cap === "i2v") return m.durations && m.maxImages;
      if (cap === "v2v") return true;
      return true;
    });
  }, [models, activeMode, filterMode]);

  /* ── Quick-filter ── */
  const filtered = useMemo(() => {
    let list = [...modeFiltered];
    if (quickFilter === "best") list.sort((a, b) => modelScore(b) - modelScore(a));
    if (quickFilter === "fast") list = list.filter((m) => m.speedTier === "fast");
    if (quickFilter === "cheap") list = list.filter((m) => m.speedTier !== "premium");
    return list;
  }, [modeFiltered, quickFilter]);

  const showModeBar = !!filterMode;

  return (
    <div className="v6-model-browser">
      {/* ── Header ── */}
      <div className="v6-model-browser-head">
        <div className="v6-eyebrow">{label}</div>
      </div>

      {/* ── Mode toggle bar ── */}
      {showModeBar && (
        <div className="v6-model-mode-bar">
          {MODE_KEYS.map((mode) => (
            <button
              key={mode}
              className={(activeMode || filterMode) === mode ? "v6-active" : ""}
              onClick={() => setActiveMode(activeMode === mode ? null : mode)}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      )}

      {/* ── Quick filter row ── */}
      <div className="v6-model-filters">
        <button
          className={quickFilter === null ? "v6-active" : ""}
          onClick={() => setQuickFilter(null)}
        >
          All
        </button>
        <button
          className={quickFilter === "best" ? "v6-active" : ""}
          onClick={() => setQuickFilter("best")}
        >
          <IconZap /> Best match
        </button>
        <button
          className={quickFilter === "fast" ? "v6-active" : ""}
          onClick={() => setQuickFilter("fast")}
        >
          <IconClock /> Fast
        </button>
        <button
          className={quickFilter === "cheap" ? "v6-active" : ""}
          onClick={() => setQuickFilter("cheap")}
        >
          Lowest cost
        </button>
      </div>

      {/* ── Model grid ── */}
      <div className="v6-model-list v6-stagger">
        {filtered.map((model) => {
          const id = model.id;
          const selected = selectedModelId === id;
          const score = modelScore(model);
          const url = model.backgroundImage || model.image || model.thumbnailUrl;
          const gradient = modelGradient(model);

          return (
            <button
              key={id}
              className={`v6-model-card${selected ? " v6-active" : ""}`}
              onClick={() => onSelect?.(id)}
              style={{ backgroundImage: url ? `url(${url})` : gradient }}
              title={`${model.displayName || model.name || id} — ${costLabel(model)} per generation`}
            >
              <div className="v6-model-card-content">
                {/* Selected checkmark */}
                {selected && (
                  <span className="v6-check-indicator" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                  </span>
                )}

                {/* Recommendation badge */}
                {model.speedTier === "premium" && (
                  <span className="v6-model-rec">Premium</span>
                )}
                {!model.speedTier && !model.maxImages && (
                  <span />
                )}

                {/* Name + cost */}
                <div className="v6-model-head">
                  <span>{model.displayName || model.name || id}</span>
                  <span className="v6-model-cost">{costLabel(model)}</span>
                </div>

                {/* Meta: provider + caps summary */}
                <div className="v6-model-meta">
                  <span>{model.provider || "Provider"}</span>
                  <span>
                    {model.aspectRatios
                      ? `${model.aspectRatios.length} ratios`
                      : model.durations
                        ? `${model.durations.length}s`
                        : ""}
                  </span>
                </div>

                {/* Score bars with gradient colors */}
                <div className="v6-model-score">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={n <= score ? "v6-on" : ""} />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Compare bar ── */}
      <div className="v6-model-compare">
        <span>
          <IconGrid /> {filtered.length} compatible
        </span>
        <span className="v6-muted v6-tiny">
          {selectedModelId ? "1 selected" : "None selected"}
        </span>
      </div>
    </div>
  );
}
