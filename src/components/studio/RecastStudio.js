"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { StudioLayout, ModelSelector, StageArea } from "./v6";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";

/* ── Inline SVGs ── */
const IconUsers = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const IconVideo = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
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

export default function RecastStudio() {
  /* ── Live model catalog ── */
  const { models: rawModels, loading: catalogLoading } = useModelCatalog({ modelType: "video", capability: "video-to-video" });
  const MODELS = useMemo(() => rawModels.map((m) => ({
    id: m.id,
    displayName: m.displayName || m.name,
    provider: m.provider,
    speedTier: m.id?.includes("pro") ? "premium" : undefined,
    aspectRatios: m.aspectRatios,
    hasOrientation: m.hasOrientation,
    endpoint: m.endpoint,
  })), [rawModels]);

  const [model, setModel] = useState("");
  useEffect(() => {
    if (MODELS.length > 0 && (!model || !MODELS.find((m) => m.id === model))) {
      setModel(MODELS[0].id);
    }
  }, [MODELS, model]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [orientation, setOrientation] = useState("left");
  const [uploading, setUploading] = useState("");

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();

  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0] || {};
  const ready = !!videoUrl && !!imageUrl;
  const { cost, affordable, shortfall, balance } = useCreditCost("recast", model, {
    image_url: imageUrl,
    video_url: videoUrl,
  });

  /* ── Upload ── */
  const upload = useCallback(async (file, setter, label) => {
    if (!file) return;
    setUploading(label);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await apiFetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.url) setter(d.url);
    } catch {}
    setUploading("");
  }, []);

  /* ── Generate ── */
  const handleGenerate = useCallback(() => {
    if (!ready) return;
    submit("recast", model, {
      endpoint: currentModel.endpoint || model,
      video_url: videoUrl,
      image_url: imageUrl,
      character_orientation: currentModel.hasOrientation ? orientation : undefined,
    });
  }, [ready, model, currentModel, videoUrl, imageUrl, orientation, submit]);

  const handleDownload = () => {
    if (result?.url) window.open(result.url, "_blank");
  };

  const handleNew = () => {
    setVideoUrl(null);
    setImageUrl(null);
    setOrientation("left");
  };

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      <ModelSelector
        models={MODELS}
        selectedModelId={model}
        onSelect={setModel}
        label="Recast Models"
      />

      {/* Source video */}
      <div className="v6-field">
        <label className="v6-field-label">Source Video</label>
        <label
          className="v6-drop"
          style={{ cursor: uploading === "video" ? "wait" : "pointer", opacity: uploading === "video" ? 0.5 : 1 }}
        >
          <input
            type="file"
            accept="video/*"
            onChange={(e) => upload(e.target.files?.[0], setVideoUrl, "video")}
            hidden
            disabled={uploading === "video"}
          />
          <IconVideo />
          <span>{videoUrl ? "Video ready ✓" : "Upload source video"}</span>
        </label>
      </div>

      {/* Face image */}
      <div className="v6-field">
        <label className="v6-field-label">Face Image</label>
        <label
          className="v6-drop"
          style={{ cursor: uploading === "face" ? "wait" : "pointer", opacity: uploading === "face" ? 0.5 : 1 }}
        >
          <input
            type="file"
            accept="image/*"
            onChange={(e) => upload(e.target.files?.[0], setImageUrl, "face")}
            hidden
            disabled={uploading === "face"}
          />
          <IconImage />
          <span>{imageUrl ? "Face ready ✓" : "Upload face image"}</span>
        </label>
      </div>

      {/* Orientation selector */}
      {currentModel.hasOrientation && (
        <div className="v6-field">
          <label className="v6-field-label">Orientation</label>
          <div className="v6-segmented">
            <button
              className={orientation === "left" ? "v6-active" : ""}
              onClick={() => setOrientation("left")}
            >
              ← Left
            </button>
            <button
              className={orientation === "right" ? "v6-active" : ""}
              onClick={() => setOrientation("right")}
            >
              Right →
            </button>
          </div>
        </div>
      )}

      {/* Generate */}
      <button
        className="v6-btn v6-primary"
        onClick={handleGenerate}
        disabled={!ready || loading}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {loading ? "Generating…" : (
          <>
            <IconBolt /> Generate {cost != null ? `(${cost}c)` : ""}
          </>
        )}
      </button>
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <div className="v6-panel-title">
        <h3>Status</h3>
        <span className={`v6-status${loading ? " v6-processing" : ready ? "" : " v6-failed"}`}>
          {loading ? "Processing" : ready ? "Ready" : "Incomplete"}
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
        {currentModel.hasOrientation && (
          <div className="v6-quote-row">
            <span className="v6-muted">Orientation</span>
            <strong>{orientation === "left" ? "← Left" : "Right →"}</strong>
          </div>
        )}
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

  /* ── Stage ── */
  const stage = (
    <StageArea
      generating={loading}
      result={result}
      model={currentModel.displayName}
      toolLabel="Recast / Body Swap"
      toolDesc="Replace a character's face in a video with a reference face image."
      toolIcon={<IconUsers />}
      onDownload={handleDownload}
      onNew={handleNew}
    />
  );

  return (
    <StudioLayout controls={controls} inspector={inspector}>
      {stage}
    </StudioLayout>
  );
}
