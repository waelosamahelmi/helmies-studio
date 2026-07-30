"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { StudioLayout, ModelSelector, StageArea } from "./v6";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";

/* ── Inline SVGs ── */
const IconUsers = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>);
const IconVideo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>);
const IconImage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>);
const IconUpload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const IconArrowLeft = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" /></svg>);
const IconArrowRight = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12,5 19,12 12,19" /></svg>);
const IconCompare = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5M21 3l-7 7M3 21l7-7" /></svg>);

export default function RecastStudio() {
  const { models: rawModels } = useModelCatalog({ modelType: "video", capability: "video-to-video" });
  const MODELS = useMemo(() => rawModels.map((m) => ({ id: m.id, displayName: m.displayName || m.name, provider: m.provider, speedTier: m.id?.includes("pro") ? "premium" : undefined, aspectRatios: m.aspectRatios, hasOrientation: m.hasOrientation, endpoint: m.endpoint })), [rawModels]);

  const [model, setModel] = useState("");
  useEffect(() => { if (MODELS.length > 0 && (!model || !MODELS.find((m) => m.id === model))) setModel(MODELS[0].id); }, [MODELS, model]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [orientation, setOrientation] = useState("left");
  const [uploading, setUploading] = useState("");
  const [compareMode, setCompareMode] = useState(false);

  const isMobile = useIsMobile();

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0] || {};
  const ready = !!videoUrl && !!imageUrl;
  const { cost, affordable, shortfall, balance } = useCreditCost("recast", model, { image_url: imageUrl, video_url: videoUrl });

  const upload = useCallback(async (file, setter, label) => {
    if (!file) return; setUploading(label);
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setter(d.url); } catch {}
    setUploading("");
  }, []);

  const handleGenerate = useCallback(() => {
    if (!ready) return;
    submit("recast", model, { endpoint: currentModel.endpoint || model, video_url: videoUrl, image_url: imageUrl, character_orientation: currentModel.hasOrientation ? orientation : undefined });
  }, [ready, model, currentModel, videoUrl, imageUrl, orientation, submit]);

  const handleDownload = () => { if (result?.url) window.open(result.url, "_blank"); };
  const handleNew = () => { setVideoUrl(null); setImageUrl(null); setOrientation("left"); };

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {isMobile ? (
        <MobileModelCarousel models={MODELS} selectedModelId={model} onSelect={setModel} />
      ) : (
        <ModelSelector models={MODELS} selectedModelId={model} onSelect={setModel} label="Recast Models" />
      )}

      {/* Uploads side by side */}
      <div className="v6-field">
        <label className="v6-field-label">Media Uploads</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="v6-upload-drop" style={{ cursor: uploading === "video" ? "wait" : "pointer", opacity: uploading === "video" ? 0.5 : 1 }}>
            <input type="file" accept="video/*" onChange={(e) => upload(e.target.files?.[0], setVideoUrl, "video")} hidden disabled={uploading === "video"} />
            <IconVideo /><span style={{ fontSize: 10 }}>{videoUrl ? "Ready \u2713" : "Source video"}</span>
          </label>
          <label className="v6-upload-drop" style={{ cursor: uploading === "face" ? "wait" : "pointer", opacity: uploading === "face" ? 0.5 : 1 }}>
            <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0], setImageUrl, "face")} hidden disabled={uploading === "face"} />
            <IconImage /><span style={{ fontSize: 10 }}>{imageUrl ? "Ready \u2713" : "Face image"}</span>
          </label>
        </div>
      </div>

      {/* Orientation visual selector */}
      {currentModel.hasOrientation && (
        <div className="v6-field">
          <label className="v6-field-label">Face Orientation</label>
          {isMobile ? (
            <MobileChipScroller
              items={[{ label: "Left", value: "left" }, { label: "Right", value: "right" }]}
              selectedValue={orientation}
              onSelect={setOrientation}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { id: "left", icon: IconArrowLeft, label: "Left profile" },
                { id: "right", icon: IconArrowRight, label: "Right profile" },
              ].map((o) => (
                <div key={o.id} className={`v6-mode-card${orientation === o.id ? " v6-active" : ""}`} onClick={() => setOrientation(o.id)} style={{ padding: 12 }}>
                  <div className="v6-mode-icon"><o.icon /></div>
                  <span className="v6-mode-name">{o.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button className="v6-btn v6-primary" onClick={handleGenerate} disabled={!ready || loading} style={{ width: "100%", justifyContent: "center" }}>
        {loading ? "Generating\u2026" : <><IconBolt /> Generate {cost != null ? `(${cost}c)` : ""}</>}
      </button>
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <div className="v6-panel-title"><h3>Status</h3><span className={`v6-status${loading ? " v6-processing" : ready ? "" : " v6-failed"}`}>{loading ? "Processing" : ready ? "Ready" : "Incomplete"}</span></div>
      <div className="v6-quote">
        <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel.displayName}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Provider</span><strong>{currentModel.provider}</strong></div>
        {currentModel.hasOrientation && <div className="v6-quote-row"><span className="v6-muted">Orientation</span><strong>{orientation === "left" ? "\u2190 Left" : "Right \u2192"}</strong></div>}
        <div className="v6-quote-row"><span className="v6-muted">Cost</span><strong><IconBolt /> {cost ?? "\u2026"} credits</strong></div>
        {balance > 0 && <div className="v6-quote-row"><span className="v6-muted">Balance</span><span className="v6-balance"><IconBolt /> {balance}</span></div>}
        {shortfall > 0 && <div style={{ fontSize: 10, color: "var(--v6-bad)", marginTop: 4 }}>Need {shortfall} more credits</div>}
      </div>

      {/* Before/After toggle */}
      {result && imageUrl && (
        <motion.button className="v6-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setCompareMode(!compareMode)} style={{ marginTop: 12, width: "100%" }}>
          <IconCompare /> {compareMode ? "Hide comparison" : "Show before/after"}
        </motion.button>
      )}
    </div>
  );

  /* ── Stage with compare view ── */
  const stage = compareMode && result && imageUrl ? (
    <div className="v6-stage">
      <div className="v6-stage-grid" />
      <div className="v6-compare-view" style={{ width: "80%", height: "70%", margin: "auto" }}>
        <img src={imageUrl} alt="Original" className="v6-compare-before" />
        <img src={result?.url} alt="Recast" className="v6-compare-after" />
        <div className="v6-compare-labels">
          <span className="v6-compare-label v6-compare-before">Original</span>
          <span className="v6-compare-label v6-compare-after">Recast</span>
        </div>
      </div>
      <button className="v6-btn v6-primary" style={{ position: "absolute", bottom: 80, zIndex: 6 }} onClick={() => setCompareMode(false)}>Close comparison</button>
    </div>
  ) : (
    <StageArea generating={loading} result={result} model={currentModel.displayName} toolLabel="Recast / Body Swap" toolDesc="Replace a character's face in a video with a reference face image." toolIcon={<IconUsers />} onDownload={handleDownload} onNew={handleNew} />
  );

  return <StudioLayout controls={controls} inspector={inspector}>{stage}</StudioLayout>;
}
