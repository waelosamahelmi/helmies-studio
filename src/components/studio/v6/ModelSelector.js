"use client";

import { useState, useMemo } from "react";

/* ── Inline SVGs ── */
const IconZap = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
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
  return `linear-gradient(135deg, hsl(${h1}, 45%, 14%), hsl(${h2}, 35%, 7%))`;
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

  /* Pick a featured model (premium tier, first in list) for the lg bento slot */
  const hasBentoLayout = filtered.length >= 3;
  const featuredModel = hasBentoLayout ? (filtered.find(m => m.speedTier === "premium") || filtered[0]) : null;
  const regularModels = hasBentoLayout ? filtered.filter(m => m !== featuredModel) : filtered;

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
        <button className={quickFilter === null ? "v6-active" : ""} onClick={() => setQuickFilter(null)}>All</button>
        <button className={quickFilter === "best" ? "v6-active" : ""} onClick={() => setQuickFilter("best")}><IconZap /> Best match</button>
        <button className={quickFilter === "fast" ? "v6-active" : ""} onClick={() => setQuickFilter("fast")}><IconClock /> Fast</button>
        <button className={quickFilter === "cheap" ? "v6-active" : ""} onClick={() => setQuickFilter("cheap")}>Lowest cost</button>
      </div>

      {/* ── Asymmetric bento grid ── */}
      <div className="v6-bento-grid">
        {/* Featured model (col-span-8 row-span-2) */}
        {featuredModel && (
          <ModelBentoCard
            model={featuredModel}
            selected={selectedModelId === featuredModel.id}
            onSelect={() => onSelect?.(featuredModel.id)}
            size="lg"
          />
        )}
        {/* Regular models — get md (4 cols) or sm (4 cols) */}
        {regularModels.map((model) => {
          const size = filtered.length <= 4 ? "md" : "sm";
          return (
            <ModelBentoCard
              key={model.id}
              model={model}
              selected={selectedModelId === model.id}
              onSelect={() => onSelect?.(model.id)}
              size={size}
            />
          );
        })}
      </div>

      {/* ── Compare bar ── */}
      <div className="v6-model-compare" style={{ marginTop: 10 }}>
        <span><IconGrid /> {filtered.length} compatible</span>
        <span className="v6-muted v6-tiny">{selectedModelId ? "1 selected" : "None selected"}</span>
      </div>
    </div>
  );
}

/* ── Model Bento Card (double-bezel) ── */
function ModelBentoCard({ model, selected, onSelect, size = "md" }) {
  const id = model.id;
  const score = modelScore(model);
  const url = model.backgroundImage || model.image || model.thumbnailUrl;
  const gradient = modelGradient(model);
  const sizeClass = size === "lg" ? "v6-bento-lg" : size === "sm" ? "v6-bento-sm" : "v6-bento-md";
  const displayName = model.displayName || model.name || id;
  const provider = model.provider || "Provider";
  const cost = costLabel(model);

  return (
    <button
      className={`v6-bento-card ${sizeClass}`}
      onClick={onSelect}
      style={{ cursor: "pointer", background: "transparent", border: 0, padding: 0, textAlign: "left", color: "inherit" }}
    >
      <div className={`v6-bezel${selected ? " v6-bezel-accent" : ""}`} style={{ height: "100%" }}>
        <div className="v6-bezel-inner" style={{
          height: "100%",
          backgroundImage: url ? `url(${url})` : gradient,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: size === "lg" ? "16px" : "12px",
        }}>
          {/* Gradient overlay */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "inherit",
            background: "linear-gradient(180deg, rgba(6,4,10,0.1), rgba(4,2,8,0.92))",
            zIndex: 0,
          }} />
          {/* Selected checkmark */}
          {selected && (
            <span className="v6-check-indicator" aria-hidden="true" style={{ zIndex: 2 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </span>
          )}
          {/* Premium badge */}
          {model.speedTier === "premium" && (
            <span className="v6-model-rec" style={{ zIndex: 1 }}>Premium</span>
          )}
          {/* Content */}
          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: size === "lg" ? 14 : 11, lineHeight: 1.2, marginBottom: 2 }}>{displayName}</div>
                <div style={{ fontSize: 10, opacity: 0.65 }}>{provider}</div>
              </div>
              <span className="v6-model-cost">{cost}</span>
            </div>
            {/* Score orbs */}
            <div className="v6-score-orbs">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className={`v6-score-orb${n <= score ? " v6-on" : ""}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
