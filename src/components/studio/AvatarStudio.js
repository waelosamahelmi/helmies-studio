"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { StudioLayout, ModelSelector, PromptDock, StageArea } from "./v6";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";

/* ── Inline SVGs ── */
const IconUsers = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>);
const IconImage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>);
const IconUpload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const IconClock = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>);

const DURATIONS = [5, 10];
const ASPECTS = ["16:9", "9:16", "1:1"];

const AVATAR_SUGGESTIONS = [
  "The person smiles warmly and gives a confident nod, natural head movement",
  "Slow turn from profile to facing camera, dramatic hair movement",
  "The person speaks expressively, gesturing with hands, studio lighting",
  "Gentle laugh with natural eye contact, soft bokeh background",
];

export default function AvatarStudio() {
  const { models: rawModels } = useModelCatalog({ modelType: "video", capability: "video-to-video" });
  const AVATAR_IDS = new Set(["kling-ai-avatar-standard", "kling-ai-avatar-pro"]);
  const MODELS = useMemo(() => rawModels.filter((m) => { const name = (m.displayName || m.id || "").toLowerCase(); const id = (m.id || "").toLowerCase(); return AVATAR_IDS.has(m.id) || name.includes("avatar") || id.includes("avatar"); }).map((m) => ({ id: m.id, displayName: m.displayName || m.name, provider: m.provider, speedTier: m.id?.includes("pro") ? "premium" : "standard", aspectRatios: m.aspectRatios, durations: m.durations, endpoint: m.endpoint })), [rawModels]);

  const [model, setModel] = useState("");
  useEffect(() => { if (MODELS.length > 0 && (!model || !MODELS.find((m) => m.id === model))) setModel(MODELS[0].id); }, [MODELS, model]);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0] || {};
  const { cost, affordable, shortfall, balance } = useCreditCost("v2v", model, { duration, aspect_ratio: aspectRatio, image_url: imageUrl });

  const handleUpload = useCallback(async (file) => {
    if (!file) return; setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setImageUrl(d.url); } catch {}
    setUploading(false);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !imageUrl || loading) return;
    submit("v2v", model, { endpoint: currentModel.endpoint || model, prompt: prompt.trim(), image_url: imageUrl, duration, aspect_ratio: aspectRatio });
  }, [prompt, imageUrl, loading, model, currentModel, duration, aspectRatio, submit]);

  const handleDownload = () => { if (result?.url) window.open(result.url, "_blank"); };
  const handleNew = () => { setPrompt(""); setImageUrl(null); };

  const lineCount = prompt.split("\n").filter(l => l.trim()).length;

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      <ModelSelector models={MODELS} selectedModelId={model} onSelect={setModel} label="Avatar Models" />

      {/* Portrait upload */}
      <div className="v6-field">
        <label className="v6-field-label">Portrait</label>
        {imageUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--v6-line)", borderRadius: 12, background: "var(--v6-surface2)" }}>
            <div className="v6-circle-crop"><img src={imageUrl} alt="" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--v6-good)" }}>Portrait ready \u2713</div>
              <button className="v6-btn v6-ghost v6-sm" onClick={() => setImageUrl(null)} style={{ marginTop: 4, fontSize: 10 }}>Change</button>
            </div>
          </div>
        ) : (
          <label className="v6-upload-drop" style={{ cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.5 : 1 }}>
            <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0])} hidden disabled={uploading} />
            <IconUpload /><span>Upload portrait photo</span>
            <span className="v6-file-types">PNG, JPG, WebP \u00b7 Face clearly visible</span>
          </label>
        )}
      </div>

      {/* Script editor */}
      <div className="v6-field">
        <label className="v6-field-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Animation Script</span>
          <span className="v6-mono v6-tiny" style={{ color: "var(--v6-muted)" }}>{prompt.length} <span className="v6-muted">chars</span></span>
        </label>
        <div style={{ position: "relative", display: "flex", gap: 0 }}>
          {lineCount > 1 && (
            <div style={{ padding: "10px 4px", background: "var(--v6-surface2)", border: "1px solid var(--v6-line)", borderRight: 0, borderRadius: "8px 0 0 8px", font: "9px var(--v6-mono)", color: "var(--v6-muted)", textAlign: "right", minWidth: 28, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 0, userSelect: "none" }}>
              {Array.from({ length: lineCount }).map((_, i) => (<span key={i}>{i + 1}</span>))}
            </div>
          )}
          <textarea className="v6-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 2000))} placeholder="Describe the animation\u2026\n\nThe person smiles warmly and gives a confident nod" style={{ borderRadius: lineCount > 1 ? "0 8px 8px 0" : 8, minHeight: 90 }} />
        </div>
      </div>

      {/* Duration + Aspect visual chips */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="v6-field">
          <label className="v6-field-label">Duration</label>
          <div className="v6-segmented">
            {DURATIONS.map((d) => (
              <button key={d} className={duration === d ? "v6-active" : ""} onClick={() => setDuration(d)}>
                <IconClock style={{ width: 10, height: 10 }} /> {d}s
              </button>
            ))}
          </div>
        </div>
        <div className="v6-field">
          <label className="v6-field-label">Aspect</label>
          <div className="v6-chip-row">
            {ASPECTS.map((a) => (<button key={a} className={`v6-chip${aspectRatio === a ? " v6-active" : ""}`} onClick={() => setAspectRatio(a)}>{a}</button>))}
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <div className="v6-panel-title"><h3>Status</h3><span className={`v6-status${loading ? " v6-processing" : prompt && imageUrl ? "" : " v6-failed"}`}>{loading ? "Processing" : prompt && imageUrl ? "Ready" : "Incomplete"}</span></div>
      <div className="v6-quote">
        <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel.displayName}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Provider</span><strong>{currentModel.provider}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Duration</span><strong>{duration}s</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Aspect</span><strong>{aspectRatio}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Cost</span><strong><IconBolt /> {cost ?? "\u2026"} credits</strong></div>
        {balance > 0 && <div className="v6-quote-row"><span className="v6-muted">Balance</span><span className="v6-balance"><IconBolt /> {balance}</span></div>}
        {shortfall > 0 && <div style={{ fontSize: 10, color: "var(--v6-bad)", marginTop: 4 }}>Need {shortfall} more credits</div>}
      </div>

      {/* Quick suggestions */}
      {!prompt && (
        <div style={{ marginTop: 12 }}>
          <div className="v6-eyebrow">Animation Ideas</div>
          <div className="v6-suggestions-row">
            {AVATAR_SUGGESTIONS.map((s) => (<button key={s} className="v6-prompt-suggestion" onClick={() => setPrompt(s)} style={{ fontSize: 9 }}>{s.slice(0, 70)}</button>))}
          </div>
        </div>
      )}
    </div>
  );

  const center = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <StageArea generating={loading} result={result} model={currentModel.displayName} toolLabel="Avatar Studio" toolDesc="Upload a portrait and describe the animation \u2014 bring a still image to life with natural motion." toolIcon={<IconUsers />} onDownload={handleDownload} onNew={handleNew} />
      <PromptDock value={prompt} onChange={(v) => setPrompt(v.slice(0, 2000))} onSubmit={handleGenerate} cost={cost} generating={loading} stage={loading ? "generating" : undefined} />
    </div>
  );

  return <StudioLayout controls={controls} inspector={inspector}>{center}</StudioLayout>;
}
