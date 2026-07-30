"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import StudioLayout from "./v6/StudioLayout";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { IconMegaphone, IconBolt } from "@/components/Icons";
import { MARKETING_AVATARS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import { useModelCatalog } from "@/components/studio/useModelCatalog";

/* ── Platform definitions with brand colors ── */
const PLATFORMS = [
  { id: "instagram", label: "Instagram", aspect: "9:16", color: "#E1306C", gradient: "linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)" },
  { id: "tiktok", label: "TikTok", aspect: "9:16", color: "#00F2EA", gradient: "linear-gradient(135deg, #00F2EA, #FF0050)" },
  { id: "youtube", label: "YouTube", aspect: "16:9", color: "#FF0000" },
  { id: "shorts", label: "Shorts", aspect: "9:16", color: "#FF0000" },
  { id: "x", label: "X", aspect: "16:9", color: "#ffffff" },
];

const DURATIONS = [15, 30, 60];
const RESOLUTIONS = ["1080p", "4K"];

const CAMPAIGN_FORMATS = [
  { id: "product_hero", label: "Product Hero", desc: "Cinematic close-up", icon: "M12 2l3.09 6.26L22 9.27l-5 4.14 1.18 6.88L12 17.77l-6.18 3.42L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { id: "ugc_advert", label: "UGC Advert", desc: "Authentic testimonial", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
  { id: "social_set", label: "Social Set", desc: "Multi-platform", icon: "M18 20V10M12 20V4M6 20v-6" },
];

const SUGGESTIONS = [
  "A UGC-style ad for a luxury skincare product, energetic and authentic",
  "Cinematic product reveal with dramatic lighting and slow rotation",
  "Lifestyle ad showing a morning routine with the product",
];

export default function MarketingStudio() {
  const [platform, setPlatform] = useState("instagram");
  const [duration, setDuration] = useState(15);
  const [resolution, setResolution] = useState("1080p");
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [productImages, setProductImages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [campaignFormat, setCampaignFormat] = useState("ugc_advert");
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  const { models: marketingModels } = useModelCatalog({ modelType: "video" });
  const marketingModelId = marketingModels[0]?.id || "";
  const aspect = PLATFORMS.find((p) => p.id === platform)?.aspect || "9:16";
  const { cost, affordable, shortfall } = useCreditCost("marketing", marketingModelId, { duration, resolution });

  const handleAvatarSelect = (a) => { setSelectedAvatar((prev) => (prev?.id === a.id ? null : a)); };

  const handleProductUpload = async (files) => {
    const newImgs = [];
    for (const file of Array.from(files).slice(0, 4 - productImages.length)) {
      const fd = new FormData(); fd.append("file", file);
      try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) newImgs.push({ id: `prod_${Date.now()}_${Math.random().toString(36).slice(2)}`, url: d.url }); } catch {}
    }
    setProductImages((prev) => [...prev, ...newImgs]);
  };

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    setGenStage("preparing");
    submit("marketing", marketingModelId, { prompt, aspect_ratio: aspect, duration, resolution, images_list: [...(selectedAvatar ? [selectedAvatar.url] : []), ...productImages.map((p) => p.url)] });
  }, [prompt, aspect, duration, resolution, selectedAvatar, productImages, submit]);

  const handleDownload = useCallback(() => { if (result?.url) window.open(result.url, "_blank"); }, [result]);
  const handleReset = useCallback(() => { setGenStage(""); }, []);

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Platform cards */}
      <div className="v6-field">
        <span className="v6-field-label">Platform</span>
        <div className="v6-platform-grid">
          {PLATFORMS.map((p) => {
            const active = platform === p.id;
            return (
              <button key={p.id} className={`v6-platform-card${active ? " v6-active" : ""}`} onClick={() => setPlatform(p.id)}>
                {p.gradient ? (
                  <span className="v6-platform-dot" style={{ background: p.gradient }} />
                ) : (
                  <span className="v6-platform-dot" style={{ background: p.color }} />
                )}
                {p.label}
                <span className="v6-tiny" style={{ color: "var(--v6-muted)", marginLeft: "auto" }}>{p.aspect}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration + Resolution */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="v6-field">
          <span className="v6-field-label">Duration</span>
          <div className="v6-segmented">{DURATIONS.map((d) => (<button key={d} className={duration === d ? "v6-active" : ""} onClick={() => setDuration(d)}>{d}s</button>))}</div>
        </div>
        <div className="v6-field">
          <span className="v6-field-label">Resolution</span>
          <div className="v6-segmented">{RESOLUTIONS.map((r) => (<button key={r} className={resolution === r ? "v6-active" : ""} onClick={() => setResolution(r)}>{r}</button>))}</div>
        </div>
      </div>

      {/* Avatar grid */}
      <div className="v6-field">
        <span className="v6-field-label">Avatar {selectedAvatar ? `\u00b7 ${selectedAvatar.name}` : ""}</span>
        <div className="v6-avatar-grid">
          {MARKETING_AVATARS.map((a) => {
            const sel = selectedAvatar?.id === a.id;
            return (
              <button key={a.id} className={`v6-avatar-card${sel ? " v6-active" : ""}`} onClick={() => handleAvatarSelect(a)}>
                <img src={a.url} alt={a.name} />
                <span className="v6-avatar-name">{a.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Product upload */}
      <div className="v6-field">
        <span className="v6-field-label">Product Images ({productImages.length}/4)</span>
        <label className="v6-upload-drop" style={{ cursor: "pointer" }}>
          <input type="file" accept="image/*" multiple onChange={(e) => { handleProductUpload(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
          Drop or click to upload product images
        </label>
        {productImages.length > 0 && (
          <div className="v6-upload-preview">
            {productImages.map((p) => (
              <div className="v6-upload-preview-item" key={p.id}>
                <img src={p.url} alt="" />
                <button onClick={() => setProductImages((prev) => prev.filter((x) => x.id !== p.id))}>&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="v6-field">
        <span className="v6-field-label">Try an idea</span>
        <div className="v6-chip-row">{SUGGESTIONS.map((s) => (<button key={s} className="v6-chip" onClick={() => setPrompt(s)}>{s}</button>))}</div>
      </div>
    </div>
  );

  /* ── Center ── */
  const center = (
    <>
      <StageArea generating={loading} stage={genStage} model="Marketing Ad" quality={resolution} ratio={aspect} result={result} resultTitle="Marketing Ad" toolLabel="Marketing Studio" toolDesc="Create UGC-style video ads with avatars, product images, and platform-optimized formats." toolIcon={<IconMegaphone />} onDownload={handleDownload} onNew={handleReset} />
      <PromptDock value={prompt} onChange={setPrompt} onSubmit={handleGenerate} cost={cost} generating={loading} stage={genStage} icon="bolt" />
    </>
  );

  /* ── Inspector ── */
  const inspector = (
    <>
      {/* Campaign format */}
      <div className="v6-field">
        <span className="v6-field-label">Campaign Format</span>
        <div className="v6-format-grid">
          {CAMPAIGN_FORMATS.map((cf) => (
            <div key={cf.id} className={`v6-format-card${campaignFormat === cf.id ? " v6-active" : ""}`} onClick={() => setCampaignFormat(cf.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={cf.icon} />
              </svg>
              <span className="v6-format-name">{cf.label}</span>
              <span className="v6-tiny" style={{ color: "var(--v6-muted)" }}>{cf.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="v6-section-rule" style={{ margin: "14px 0" }} />

      {/* Avatar preview */}
      <div style={{ marginBottom: 14 }}>
        <div className="v6-eyebrow">Avatar Preview</div>
        {selectedAvatar ? (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 8, borderRadius: 12, overflow: "hidden", border: "1px solid var(--v6-line)" }}>
            <img src={selectedAvatar.url} alt={selectedAvatar.name} style={{ width: "100%", display: "block" }} />
            <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, background: "var(--v6-surface2)" }}>{selectedAvatar.name}</div>
          </motion.div>
        ) : (
          <div style={{ marginTop: 8, padding: 16, border: "1px dashed var(--v6-line)", borderRadius: 12, textAlign: "center", fontSize: 10, color: "var(--v6-muted)" }}>Select an avatar above</div>
        )}
      </div>

      <div className="v6-section-rule" style={{ marginBottom: 14 }} />

      {/* Cost */}
      <div className="v6-eyebrow">Cost</div>
      <div className="v6-quote" style={{ marginTop: 8 }}>
        <div className="v6-quote-row"><span className="v6-muted">Credits</span><strong><IconBolt /> {cost || "\u2014"}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Platform</span><strong>{PLATFORMS.find((p) => p.id === platform)?.label}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Format</span><strong>{aspect} \u00b7 {duration}s \u00b7 {resolution}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Assets</span><strong>{selectedAvatar ? "1 avatar" : "0 avatars"} \u00b7 {productImages.length} product(s)</strong></div>
      </div>
      {shortfall > 0 && <div style={{ marginTop: 6 }}><span style={{ color: "var(--v6-bad)", fontSize: 10 }}>Need {shortfall} more credits</span></div>}

      <div className="v6-section-rule" style={{ margin: "14px 0" }} />

      {prompt && (
        <div>
          <div className="v6-eyebrow">Prompt</div>
          <div className="v6-quote" style={{ marginTop: 8, fontSize: 10, lineHeight: 1.55, color: "var(--v6-muted)" }}>{prompt}</div>
        </div>
      )}
    </>
  );

  return <StudioLayout controls={controls} inspector={inspector}>{center}</StudioLayout>;
}
