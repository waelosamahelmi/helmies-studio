"use client";

import { useState, useCallback, useRef } from "react";
import { StudioLayout, ModelSelector, PromptDock, StageArea } from "./v6";
import { V2V_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

/* ── Inline SVGs ── */
const IconUsers = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const IconImage = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconUpload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

/* ── Avatar model IDs ── */
const AVATAR_IDS = new Set(["kling-ai-avatar-standard", "kling-ai-avatar-pro"]);

const MODELS = V2V_MODELS
  .filter((m) => AVATAR_IDS.has(m.id))
  .map((m) => ({
    id: m.id,
    displayName: m.name,
    provider: m.provider,
    speedTier: m.id.includes("pro") ? "premium" : "standard",
    aspectRatios: m.aspectRatios,
    durations: m.durations,
    endpoint: m.endpoint,
  }));

const DURATIONS = [5, 10];
const ASPECTS = ["16:9", "9:16", "1:1"];

export default function AvatarStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef(null);
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();

  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0];
  const { cost, affordable, shortfall, balance } = useCreditCost("v2v", model, {
    duration,
    aspect_ratio: aspectRatio,
    image_url: imageUrl,
  });

  /* ── Upload ── */
  const handleUpload = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await apiFetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.url) setImageUrl(d.url);
    } catch {}
    setUploading(false);
  }, []);

  /* ── Generate ── */
  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !imageUrl || loading) return;
    submit("v2v", model, {
      endpoint: currentModel.endpoint || model,
      prompt: prompt.trim(),
      image_url: imageUrl,
      duration,
      aspect_ratio: aspectRatio,
    });
  }, [prompt, imageUrl, loading, model, currentModel, duration, aspectRatio, submit]);

  const handleDownload = () => {
    if (result?.url) window.open(result.url, "_blank");
  };

  const handleNew = () => {
    setPrompt("");
    setImageUrl(null);
  };

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      <ModelSelector
        models={MODELS}
        selectedModelId={model}
        onSelect={setModel}
        label="Avatar Models"
      />

      {/* Portrait upload */}
      <div className="v6-field">
        <label className="v6-field-label">Portrait</label>
        <label
          className="v6-drop"
          style={{ cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.5 : 1 }}
        >
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleUpload(e.target.files?.[0])}
            hidden
            disabled={uploading}
          />
          {imageUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={imageUrl} alt="Portrait" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
              <span style={{ color: "var(--v6-good)", fontSize: 11 }}>Portrait ready ✓</span>
            </div>
          ) : (
            <>
              <IconUpload />
              <span>Upload portrait</span>
            </>
          )}
        </label>
      </div>

      {/* Duration */}
      <div className="v6-field">
        <label className="v6-field-label">Duration</label>
        <div className="v6-segmented">
          {DURATIONS.map((d) => (
            <button
              key={d}
              className={duration === d ? "v6-active" : ""}
              onClick={() => setDuration(d)}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>

      {/* Aspect ratio */}
      <div className="v6-field">
        <label className="v6-field-label">Aspect Ratio</label>
        <div className="v6-chip-row">
          {ASPECTS.map((a) => (
            <button
              key={a}
              className={`v6-chip${aspectRatio === a ? " v6-active" : ""}`}
              onClick={() => setAspectRatio(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <div className="v6-panel-title">
        <h3>Status</h3>
        <span className={`v6-status${loading ? " v6-processing" : prompt && imageUrl ? "" : " v6-failed"}`}>
          {loading ? "Processing" : prompt && imageUrl ? "Ready" : "Incomplete"}
        </span>
      </div>

      <div className="v6-quote">
        <div className="v6-quote-row">
          <span className="v6-muted">Model</span>
          <strong>{currentModel.displayName}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Provider</span>
          <strong>{currentModel.provider}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Duration</span>
          <strong>{duration}s</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Aspect</span>
          <strong>{aspectRatio}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Cost</span>
          <strong><IconBolt /> {cost ?? "…"} credits</strong>
        </div>
        {balance > 0 && (
          <div className="v6-quote-row">
            <span className="v6-muted">Balance</span>
            <span className="v6-balance"><IconBolt /> {balance}</span>
          </div>
        )}
        {shortfall > 0 && (
          <div style={{ fontSize: 10, color: "var(--v6-bad)", marginTop: 4 }}>
            Need {shortfall} more credits
          </div>
        )}
      </div>
    </div>
  );

  /* ── Center: Stage + PromptDock ── */
  const center = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <StageArea
        generating={loading}
        result={result}
        model={currentModel.displayName}
        toolLabel="Avatar Studio"
        toolDesc="Upload a portrait and describe the animation — bring a still image to life with natural motion."
        toolIcon={<IconUsers />}
        onDownload={handleDownload}
        onNew={handleNew}
      />
      <PromptDock
        value={prompt}
        onChange={(v) => setPrompt(v.slice(0, 2000))}
        onSubmit={handleGenerate}
        cost={cost}
        generating={loading}
        stage={loading ? "generating" : undefined}
      />
    </div>
  );

  return (
    <StudioLayout controls={controls} inspector={inspector}>
      {center}
    </StudioLayout>
  );
}
