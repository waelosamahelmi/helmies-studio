"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { StudioLayout, ModelSelector, PromptDock, StageArea } from "./v6";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";

/* ── Inline SVGs ── */
const IconVideo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>);
const IconUpload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const IconImage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);

const VIDEO_EDIT_IDS = ["runway-aleph", "runway-extend", "veo3-extend", "wan-2.6-v2v", "wan-2.6-flash-v2v", "wan-2.7-video-edit", "grok-imagine-extend"];

const EDIT_SUGGESTIONS = [
  "Add cinematic motion blur and dramatic color grading",
  "Change lighting to warm golden hour, soft shadows",
  "Transform the scene to a futuristic cyberpunk city",
  "Add gentle slow motion and dreamy atmosphere",
  "Change season to winter with falling snow particles",
];

export default function VideoEditStudio() {
  const isMobile = useIsMobile();
  const { models: rawModels } = useModelCatalog({ modelType: "video" });
  const MODELS = useMemo(() => {
    const byId = new Map(); for (const m of rawModels) byId.set(m.id, m);
    return VIDEO_EDIT_IDS.map((id) => { const m = byId.get(id); if (!m) return null; const tier = m.speedTier || (m.id?.includes("flash") ? "fast" : m.id?.includes("pro") || m.id?.includes("veo3") || m.id?.includes("aleph") ? "premium" : "standard"); return { id: m.id, displayName: m.displayName || m.name, provider: m.provider, speedTier: tier, aspectRatios: m.aspectRatios, durations: m.durations, isExtend: m.isExtend, endpoint: m.endpoint }; }).filter(Boolean);
  }, [rawModels]);

  const [model, setModel] = useState("");
  useEffect(() => { if (MODELS.length > 0 && (!model || !MODELS.find((m) => m.id === model))) setModel(MODELS[0].id); }, [MODELS, model]);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [videoUrl, setVideoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [videoFile, setVideoFile] = useState(null);

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0] || {};
  const supportsDuration = Array.isArray(currentModel.durations) && currentModel.durations.length > 0;
  const ASPECTS = currentModel.aspectRatios || ["16:9", "9:16", "1:1"];
  const DURATIONS = supportsDuration ? currentModel.durations : [];
  const { cost, affordable, shortfall, balance } = useCreditCost("v2v", model, { duration, video_url: videoUrl });

  const handleUpload = useCallback(async (file) => {
    if (!file) return; setUploading(true);
    setVideoFile(URL.createObjectURL(file));
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setVideoUrl(d.url); } catch {}
    setUploading(false);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !videoUrl || loading) return;
    submit("v2v", model, { endpoint: currentModel.endpoint || model, prompt: prompt.trim(), video_url: videoUrl, duration: supportsDuration ? duration : undefined, aspect_ratio: aspectRatio });
  }, [prompt, videoUrl, loading, model, currentModel, duration, supportsDuration, aspectRatio, submit]);

  const handleDownload = () => { if (result?.url) window.open(result.url, "_blank"); };
  const handleNew = () => { setPrompt(""); setVideoUrl(null); setVideoFile(null); };

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {isMobile ? (
        <MobileModelCarousel models={MODELS} selectedModelId={model} onSelect={setModel} />
      ) : (
        <ModelSelector models={MODELS} selectedModelId={model} onSelect={setModel} label="Video Edit Models" />
      )}

      {/* Video upload */}
      <div className="v6-field">
        <label className="v6-field-label">Source Video</label>
        <label className="v6-upload-drop" style={{ minHeight: 100, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.5 : 1 }}>
          <input type="file" accept="video/*" onChange={(e) => handleUpload(e.target.files?.[0])} hidden disabled={uploading} />
          {videoFile ? (
            <div style={{ width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--v6-line)" }}>
              <video src={videoFile} muted style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 6 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, background: "var(--v6-surface)" }}>
                <IconVideo style={{ width: 14, height: 14 }} />
                <span style={{ color: "var(--v6-good)", fontSize: 11 }}>Video ready \u2713</span>
              </div>
            </div>
          ) : (
            <><IconUpload /><span>Upload source video</span><span className="v6-file-types">MP4, MOV, WebM \u00b7 Max 500MB</span></>
          )}
        </label>
      </div>

      {/* Duration (if supported) */}
      {supportsDuration && DURATIONS.length > 0 && (
        <div className="v6-field">
          <label className="v6-field-label">Duration</label>
          {isMobile ? (
            <MobileChipScroller items={DURATIONS.map((d) => ({ label: `${d}s`, value: d }))} selectedValue={duration} onSelect={setDuration} />
          ) : (
            <div className="v6-segmented">{DURATIONS.map((d) => (<button key={d} className={duration === d ? "v6-active" : ""} onClick={() => setDuration(d)}>{d}s</button>))}</div>
          )}
        </div>
      )}

      {/* Aspect ratio */}
      <div className="v6-field">
        <label className="v6-field-label">Aspect Ratio</label>
        {isMobile ? (
          <MobileChipScroller items={ASPECTS.map((a) => ({ label: a, value: a }))} selectedValue={aspectRatio} onSelect={setAspectRatio} />
        ) : (
          <div className="v6-chip-row">{ASPECTS.map((a) => (<button key={a} className={`v6-chip${aspectRatio === a ? " v6-active" : ""}`} onClick={() => setAspectRatio(a)}>{a}</button>))}</div>
        )}
      </div>

      {/* Edit suggestions */}
      <div className="v6-field">
        <label className="v6-field-label">Edit Ideas</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{EDIT_SUGGESTIONS.map((s) => (<button key={s} className="v6-chip" onClick={() => setPrompt(s)} style={{ justifyContent: "flex-start", textAlign: "left", width: "100%", fontSize: 11, lineHeight: 1.4 }}>{s}</button>))}</div>
      </div>
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <div className="v6-panel-title"><h3>Status</h3><span className={`v6-status${loading ? " v6-processing" : prompt && videoUrl ? "" : " v6-failed"}`}>{loading ? "Processing" : prompt && videoUrl ? "Ready" : "Incomplete"}</span></div>
      <div className="v6-quote">
        <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel.displayName}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Provider</span><strong>{currentModel.provider}</strong></div>
        {currentModel.isExtend && <div className="v6-quote-row"><span className="v6-muted">Type</span><strong>Extension</strong></div>}
        {supportsDuration && <div className="v6-quote-row"><span className="v6-muted">Duration</span><strong>{duration}s</strong></div>}
        <div className="v6-quote-row"><span className="v6-muted">Aspect</span><strong>{aspectRatio}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Cost</span><strong><IconBolt /> {cost ?? "\u2026"} credits</strong></div>
        {balance > 0 && <div className="v6-quote-row"><span className="v6-muted">Balance</span><span className="v6-balance"><IconBolt /> {balance}</span></div>}
        {shortfall > 0 && <div style={{ fontSize: 10, color: "var(--v6-bad)", marginTop: 4 }}>Need {shortfall} more credits</div>}
      </div>
    </div>
  );

  const center = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <StageArea generating={loading} result={result} model={currentModel.displayName} toolLabel="Video Edit Studio" toolDesc="Upload a source clip, describe how to edit it, and pick a model. Restyle scenes, extend clips, or transform footage." toolIcon={<IconVideo />} onDownload={handleDownload} onNew={handleNew} />
      <PromptDock value={prompt} onChange={(v) => setPrompt(v.slice(0, 2000))} onSubmit={handleGenerate} cost={cost} generating={loading} stage={loading ? "generating" : undefined} />
    </div>
  );

  return <StudioLayout controls={controls} inspector={inspector}>{center}</StudioLayout>;
}
