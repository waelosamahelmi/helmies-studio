"use client";

import { useState, useCallback } from "react";
import { StudioLayout, StageArea } from "./v6";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

/* ── Inline SVGs ── */
const IconCut = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" /><path d="M8.12 8.12L12 12" /><circle cx="18" cy="6" r="3" />
    <path d="M12 12l3.88 3.88" /><circle cx="6" cy="18" r="3" /><path d="M18 18l-6-6" />
  </svg>
);

const IconVideo = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
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

const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];

export default function ClippingStudio() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [numHighlights, setNumHighlights] = useState(3);
  const [aspect, setAspect] = useState("9:16");
  const [coordsOnly, setCoordsOnly] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const { cost, affordable, shortfall, balance } = useCreditCost("clipping", "default", {
    num_highlights: numHighlights,
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
      if (d.url) setVideoUrl(d.url);
    } catch {}
    setUploading(false);
  }, []);

  /* ── Generate ── */
  const handleGenerate = useCallback(() => {
    if (!videoUrl || loading) return;
    submit("clipping", "default", {
      video_url: videoUrl,
      num_highlights: numHighlights,
      aspect_ratio: aspect,
      return_coordinates_only: coordsOnly,
    });
  }, [videoUrl, loading, numHighlights, aspect, coordsOnly, submit]);

  const handleDownload = () => {
    if (result?.url) window.open(result.url, "_blank");
  };

  const handleNew = () => {
    setVideoUrl(null);
    setNumHighlights(3);
    setAspect("9:16");
    setCoordsOnly(false);
  };

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Video upload */}
      <div className="v6-field">
        <label className="v6-field-label">Source Video</label>
        <label
          className="v6-drop"
          style={{ cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.5 : 1 }}
        >
          <input
            type="file"
            accept="video/*"
            onChange={(e) => handleUpload(e.target.files?.[0])}
            hidden
            disabled={uploading}
          />
          {videoUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconVideo />
              <span style={{ color: "var(--v6-good)", fontSize: 11 }}>Video ready ✓</span>
            </div>
          ) : (
            <>
              <IconUpload />
              <span>Upload source video</span>
            </>
          )}
        </label>
      </div>

      {/* Highlights slider */}
      <div className="v6-field">
        <label className="v6-field-label">
          Highlights <span className="v6-muted v6-mono">({numHighlights})</span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          value={numHighlights}
          onChange={(e) => setNumHighlights(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--v6-accent)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--v6-muted)" }}>
          <span>1</span><span>10</span>
        </div>
      </div>

      {/* Aspect ratio chips */}
      <div className="v6-field">
        <label className="v6-field-label">Output Aspect</label>
        <div className="v6-chip-row">
          {ASPECTS.map((a) => (
            <button
              key={a}
              className={`v6-chip${aspect === a ? " v6-active" : ""}`}
              onClick={() => setAspect(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Coordinates-only toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11 }}>
        <input
          type="checkbox"
          checked={coordsOnly}
          onChange={(e) => setCoordsOnly(e.target.checked)}
          style={{ accentColor: "var(--v6-accent)" }}
        />
        <span style={{ color: "var(--v6-muted)" }}>Coordinates only (no clip rendering)</span>
      </label>

      {/* Generate */}
      <button
        className="v6-btn v6-primary"
        onClick={handleGenerate}
        disabled={!videoUrl || loading}
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
        <span className={`v6-status${loading ? " v6-processing" : videoUrl ? "" : " v6-failed"}`}>
          {loading ? "Processing" : videoUrl ? "Ready" : "Incomplete"}
        </span>
      </div>

      <div className="v6-quote">
        <div className="v6-quote-row">
          <span className="v6-muted">Highlights</span>
          <strong>{numHighlights} clips</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Aspect</span>
          <strong>{aspect}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Mode</span>
          <strong>{coordsOnly ? "Coords only" : "Full clips"}</strong>
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

  /* ── Stage ── */
  const stage = (
    <StageArea
      generating={loading}
      result={result}
      model="AI Clipping"
      toolLabel="Clipping Studio"
      toolDesc="Upload a video and AI extracts the most engaging highlight clips automatically."
      toolIcon={<IconCut />}
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
