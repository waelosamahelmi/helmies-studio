"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { StudioLayout, ModelSelector, StageArea } from "./v6";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";

/* ── Inline SVGs ── */
const IconMic = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>);
const IconImage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);
const IconVideo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>);
const IconAudio = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>);
const IconUpload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const IconRefresh = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="23,4 23,10 17,10" /><polyline points="1,20 1,14 7,14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>);
const IconCheck = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12" /></svg>);

const WAVEFORMS = [3, 8, 4, 10, 6, 9, 5, 7, 3, 8, 5, 10, 4, 7, 6, 5];

export default function LipSyncStudio() {
  const { models: rawModels } = useModelCatalog({ modelType: "lipsync" });
  const MODELS = useMemo(() => rawModels.map((m) => ({ id: m.id, displayName: m.displayName || m.name, provider: m.provider, speedTier: (m.mode === "video") ? "premium" : undefined, mode: m.mode || (m.id?.includes("video") ? "video" : "image"), endpoint: m.endpoint })), [rawModels]);

  const [model, setModel] = useState("");
  useEffect(() => { if (MODELS.length > 0 && (!model || !MODELS.find((m) => m.id === model))) setModel(MODELS[0].id); }, [MODELS, model]);
  const [imageUrl, setImageUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [seed, setSeed] = useState(-1);
  const [uploading, setUploading] = useState("");

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0] || {};
  const needsVideo = currentModel.mode === "video";
  const sourceReady = needsVideo ? !!videoUrl : !!imageUrl;
  const { cost, affordable, shortfall, balance } = useCreditCost("lipsync", model, { image_url: imageUrl, video_url: videoUrl });

  const upload = useCallback(async (file, setter, label) => {
    if (!file) return; setUploading(label);
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setter(d.url); } catch {}
    setUploading("");
  }, []);

  const handleGenerate = useCallback(() => {
    if (!sourceReady || !audioUrl) return;
    submit("lipsync", model, { endpoint: currentModel.endpoint || model, image_url: needsVideo ? undefined : imageUrl, video_url: needsVideo ? videoUrl : undefined, audio_url: audioUrl, seed: seed >= 0 ? seed : undefined });
  }, [sourceReady, audioUrl, model, currentModel, needsVideo, imageUrl, videoUrl, seed, submit]);

  const handleDownload = () => { if (result?.url) window.open(result.url, "_blank"); };
  const handleNew = () => { setImageUrl(null); setVideoUrl(null); setAudioUrl(null); setSeed(-1); };

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      <ModelSelector models={MODELS} selectedModelId={model} onSelect={setModel} label="Lip Sync Models" />

      {/* Mode selector */}
      <div className="v6-field">
        <label className="v6-field-label">Input Mode</label>
        <div className="v6-mode-grid">
          {[{ mode: "image", icon: IconImage, label: "Image", desc: "Single portrait photo" }, { mode: "video", icon: IconVideo, label: "Video", desc: "Video with a face" }].map((m) => (
            <div key={m.mode} className={`v6-mode-card${(!needsVideo && m.mode === "image") || (needsVideo && m.mode === "video") ? " v6-active" : ""}`} onClick={() => { const vid = MODELS.find(x => x.mode === "video"); const img = MODELS.find(x => x.mode !== "video"); setModel(m.mode === "video" ? vid?.id : img?.id); }}>
              <div className="v6-mode-icon"><m.icon /></div>
              <span className="v6-mode-name">{m.label}</span>
              <span className="v6-mode-desc">{m.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Source upload */}
      <div className="v6-field">
        <label className="v6-field-label">{needsVideo ? "Source Video" : "Portrait Image"}</label>
        <label className="v6-upload-drop" style={{ cursor: uploading === "source" ? "wait" : "pointer", opacity: uploading === "source" ? 0.5 : 1 }}>
          <input type="file" accept={needsVideo ? "video/*" : "image/*"} onChange={(e) => upload(e.target.files?.[0], needsVideo ? setVideoUrl : setImageUrl, "source")} hidden disabled={uploading === "source"} />
          {needsVideo ? <IconVideo /> : <IconImage />}
          <span>{(needsVideo ? videoUrl : imageUrl) ? "Source ready \u2713" : `Upload ${needsVideo ? "video" : "image"}`}</span>
          <span className="v6-file-types">{needsVideo ? "MP4, MOV, WebM" : "PNG, JPG, WebP"}</span>
        </label>
      </div>

      {/* Audio upload */}
      <div className="v6-field">
        <label className="v6-field-label">Audio Track</label>
        <label className="v6-upload-drop" style={{ cursor: uploading === "audio" ? "wait" : "pointer", opacity: uploading === "audio" ? 0.5 : 1 }}>
          <input type="file" accept="audio/*" onChange={(e) => upload(e.target.files?.[0], setAudioUrl, "audio")} hidden disabled={uploading === "audio"} />
          <IconAudio /><span>{audioUrl ? "Audio ready \u2713" : "Upload audio"}</span>
          <span className="v6-file-types">MP3, WAV, AAC, M4A</span>
        </label>
        {/* Waveform after upload */}
        {audioUrl && (
          <div style={{ marginTop: 8, padding: "8px 10px", border: "1px solid var(--v6-line)", borderRadius: 8, background: "var(--v6-surface2)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28, justifyContent: "center" }}>
              {WAVEFORMS.map((h, i) => (
                <div key={i} className="v6-wave-bar" style={{ width: 3, borderRadius: 2, background: "var(--v6-accent)", height: `${h * 2.5}px` }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "var(--v6-muted)" }}><span>0:00</span><span className="v6-status" style={{ fontSize: 8 }}>Ready</span><span>~0:05</span></div>
          </div>
        )}
      </div>

      {/* Seed control */}
      <div className="v6-field">
        <label className="v6-field-label">Seed</label>
        <div className="v6-seed-control">
          <input className="v6-input" type="number" value={seed} min={-1} onChange={(e) => setSeed(Number(e.target.value))} placeholder="-1" />
          <button className="v6-btn v6-ghost v6-sm" onClick={() => setSeed(Math.floor(Math.random() * 999999))}>
            <IconRefresh /> Random
          </button>
        </div>
      </div>

      <button className="v6-btn v6-primary" onClick={handleGenerate} disabled={!sourceReady || !audioUrl || loading} style={{ width: "100%", justifyContent: "center" }}>
        {loading ? "Generating\u2026" : <><IconBolt /> Generate {cost != null ? `(${cost}c)` : ""}</>}
      </button>
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <div className="v6-panel-title"><h3>Status</h3><span className={`v6-status${loading ? " v6-processing" : sourceReady && audioUrl ? "" : " v6-failed"}`}>{loading ? "Processing" : sourceReady && audioUrl ? "Ready" : "Incomplete"}</span></div>
      <div className="v6-quote">
        <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel.displayName}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Mode</span><strong>{needsVideo ? "Video" : "Image"}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Provider</span><strong>{currentModel.provider}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Cost</span><strong><IconBolt /> {cost ?? "\u2026"} credits</strong></div>
        {balance > 0 && <div className="v6-quote-row"><span className="v6-muted">Balance</span><span className="v6-balance"><IconBolt /> {balance}</span></div>}
        {shortfall > 0 && <div style={{ fontSize: 10, color: "var(--v6-bad)", marginTop: 4 }}>Need {shortfall} more credits</div>}
      </div>
    </div>
  );

  return <StudioLayout controls={controls} inspector={inspector}>
    <StageArea generating={loading} result={result} model={currentModel.displayName} toolLabel="Lip Sync" toolDesc="Sync a portrait or video to an audio track \u2014 make any character speak." toolIcon={<IconMic />} onDownload={handleDownload} onNew={handleNew} />
  </StudioLayout>;
}
