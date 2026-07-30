"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { StudioLayout, StageArea } from "./v6";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import { useModelCatalog } from "@/components/studio/useModelCatalog";

/* ── Inline SVGs ── */
const IconCut = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><path d="M8.12 8.12L12 12" /><circle cx="18" cy="6" r="3" /><path d="M12 12l3.88 3.88" /><circle cx="6" cy="18" r="3" /><path d="M18 18l-6-6" /></svg>);
const IconVideo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>);
const IconUpload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const IconInfo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>);
const IconScissors = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><line x1="8.12" y1="8.12" x2="12" y2="12" /><circle cx="18" cy="6" r="3" /><line x1="12" y1="12" x2="15.88" y2="15.88" /><line x1="18" y1="18" x2="12" y2="12" /></svg>);

const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];

export default function ClippingStudio() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [numHighlights, setNumHighlights] = useState(3);
  const [aspect, setAspect] = useState("9:16");
  const [coordsOnly, setCoordsOnly] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCoordInfo, setShowCoordInfo] = useState(false);

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const { models: clipModels } = useModelCatalog({ modelType: "video" });
  const clipModelId = clipModels[0]?.id || "";
  const { cost, affordable, shortfall, balance } = useCreditCost("clipping", clipModelId, { num_highlights: numHighlights });

  const handleUpload = useCallback(async (file) => {
    if (!file) return; setUploading(true);
    setVideoFile(URL.createObjectURL(file));
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setVideoUrl(d.url); } catch {}
    setUploading(false);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!videoUrl || loading) return;
    submit("clipping", clipModelId, { video_url: videoUrl, num_highlights: numHighlights, aspect_ratio: aspect, return_coordinates_only: coordsOnly });
  }, [videoUrl, loading, numHighlights, aspect, coordsOnly, submit]);

  const handleDownload = () => { if (result?.url) window.open(result.url, "_blank"); };
  const handleNew = () => { setVideoUrl(null); setVideoFile(null); setNumHighlights(3); setAspect("9:16"); setCoordsOnly(false); };

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Video upload */}
      <div className="v6-field">
        <label className="v6-field-label">Source Video</label>
        <label className="v6-upload-drop" style={{ minHeight: 90, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.5 : 1 }}>
          <input type="file" accept="video/*" onChange={(e) => handleUpload(e.target.files?.[0])} hidden disabled={uploading} />
          {videoFile ? (
            <div style={{ width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--v6-line)" }}>
              <video src={videoFile} muted style={{ width: "100%", maxHeight: 80, objectFit: "cover", borderRadius: 6 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, fontSize: 11, color: "var(--v6-good)" }}><IconVideo style={{ width: 14, height: 14 }} /> Video ready \u2713</div>
            </div>
          ) : (<><IconUpload /><span>Upload video to clip</span><span className="v6-file-types">MP4, MOV, WebM</span></>)}
        </label>
      </div>

      {/* Highlights slider with badge */}
      <div className="v6-field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label className="v6-field-label" style={{ marginBottom: 0 }}>Highlights</label>
          <span className="v6-highlights-badge">{numHighlights} {numHighlights === 1 ? "highlight" : "highlights"}</span>
        </div>
        <div className="v6-timeline-bar">
          <div className="v6-timeline-track">
            <div className="v6-timeline-fill" style={{ width: `${(numHighlights / 10) * 100}%` }} />
          </div>
        </div>
        <div className="v6-range-row" style={{ marginTop: 6 }}>
          <input type="range" min={1} max={10} value={numHighlights} onChange={(e) => setNumHighlights(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--v6-accent)" }} />
        </div>
        <div className="v6-timeline-ticks"><span>1</span><span>3</span><span>5</span><span>7</span><span>10</span></div>
      </div>

      {/* Aspect ratio */}
      <div className="v6-field">
        <label className="v6-field-label">Output Aspect</label>
        <div className="v6-chip-row">{ASPECTS.map((a) => (<button key={a} className={`v6-chip${aspect === a ? " v6-active" : ""}`} onClick={() => setAspect(a)}>{a}</button>))}</div>
      </div>

      {/* Coordinates only toggle */}
      <button className="v6-toggle" onClick={() => setCoordsOnly(!coordsOnly)} style={{ marginBottom: 4 }}>
        <div className={`v6-toggle-track${coordsOnly ? " v6-on" : ""}`}><div className="v6-toggle-thumb" /></div>
        <span className="v6-toggle-label">Coordinates only</span>
        <span className="v6-tooltip v6-tiny" style={{ cursor: "help", color: "var(--v6-muted)" }} data-tooltip="Returns timestamp coordinates instead of rendering clips" onClick={(e) => { e.stopPropagation(); setShowCoordInfo(!showCoordInfo); }}>
          <IconInfo style={{ width: 12, height: 12 }} />
        </span>
      </button>
      {showCoordInfo && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          style={{ fontSize: 10, color: "var(--v6-muted)", lineHeight: 1.5, padding: "6px 10px", border: "1px solid var(--v6-line)", borderRadius: 8, background: "var(--v6-surface2)" }}>
          When enabled, the AI returns timestamps for the best moments. Use these coordinates to edit in your preferred video editor. When disabled, full clips are rendered.
        </motion.div>
      )}

      <button className="v6-btn v6-primary" onClick={handleGenerate} disabled={!videoUrl || loading} style={{ width: "100%", justifyContent: "center" }}>
        {loading ? "Generating\u2026" : <><IconBolt /> Generate {cost != null ? `(${cost}c)` : ""}</>}
      </button>
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <div className="v6-panel-title"><h3>Status</h3><span className={`v6-status${loading ? " v6-processing" : videoUrl ? "" : " v6-failed"}`}>{loading ? "Processing" : videoUrl ? "Ready" : "Incomplete"}</span></div>
      <div className="v6-quote">
        <div className="v6-quote-row"><span className="v6-muted">Highlights</span><strong><IconScissors style={{ width: 12, height: 12 }} /> {numHighlights} clips</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Aspect</span><strong>{aspect}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Mode</span><strong>{coordsOnly ? "Coords only" : "Full clips"}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Cost</span><strong><IconBolt /> {cost ?? "\u2026"} credits</strong></div>
        {balance > 0 && <div className="v6-quote-row"><span className="v6-muted">Balance</span><span className="v6-balance"><IconBolt /> {balance}</span></div>}
        {shortfall > 0 && <div style={{ fontSize: 10, color: "var(--v6-bad)", marginTop: 4 }}>Need {shortfall} more credits</div>}
      </div>
    </div>
  );

  return <StudioLayout controls={controls} inspector={inspector}>
    <StageArea generating={loading} result={result} model="AI Clipping" toolLabel="Clipping Studio" toolDesc="Upload a video and AI extracts the most engaging highlight clips automatically." toolIcon={<IconCut />} onDownload={handleDownload} onNew={handleNew} />
  </StudioLayout>;
}
