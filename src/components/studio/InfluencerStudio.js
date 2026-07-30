"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import StudioLayout from "./v6/StudioLayout";
import ModelSelector from "./v6/ModelSelector";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { IconCrown, IconBolt } from "@/components/Icons";
import { INFLUENCER_TABS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";

const ASPECTS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const SCENE_SUGGESTIONS = [
  "in a sunlit modern gym, fitness wear, confident stance",
  "on a Parisian street, autumn fashion, candid breeze",
  "in a neon-lit studio, dramatic pose, artistic portrait",
  "at a beach at golden hour, lifestyle, warm tones",
  "in a minimalist cafe, natural light, cozy atmosphere",
];

const CATEGORY_COLORS = {
  gender: "#f472b6", ethnicity: "#c084fc", age: "#60a5fa",
  body_type: "#65dca6", hair: "#fbbf24", expression: "#fb923c",
  outfit: "#a78bfa", lighting: "#facc15", pose: "#38bdf8",
};

const TAB_ICONS = {
  face: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  body: "M2 12h20M12 2v20M12 2l8 10M12 2L4 12M12 22l8-10M12 22L4 12",
  style: "M12 2l3.09 6.26L22 9.27l-5 4.14 1.18 6.88L12 17.77l-6.18 3.42L7 14.14 2 9.27l6.91-1.01L12 2z",
};

const DEFAULT_SETTINGS = INFLUENCER_TABS.reduce((acc, tab) => {
  tab.categories.forEach((cat) => { acc[`influencer_${cat.id}`] = cat.options[0]?.id; });
  return acc;
}, {});

export default function InfluencerStudio() {
  const [activeTab, setActiveTab] = useState(INFLUENCER_TABS[0]?.id);
  const [personaName, setPersonaName] = useState("");
  const [scenePrompt, setScenePrompt] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [selectedModelId, setSelectedModelId] = useState("flux-dev");
  const [genStage, setGenStage] = useState("");

  const { models: imageModels } = useModelCatalog({ modelType: "image", capability: "text-to-image" });
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = imageModels.find((m) => m.id === selectedModelId) || imageModels[0] || {};
  const { cost, affordable, shortfall } = useCreditCost("image", selectedModelId, { aspect_ratio: aspectRatio });

  const compiledPrompt = useMemo(() => {
    const parts = INFLUENCER_TABS.flatMap((tab) => tab.categories.map((cat) => { const sel = settings[`influencer_${cat.id}`]; const opt = cat.options.find((o) => o.id === sel); return opt?.promptVal; })).filter(Boolean);
    return [...parts, personaName, scenePrompt, "high quality, professional photo, detailed"].filter(Boolean).join(", ");
  }, [settings, personaName, scenePrompt]);

  const compiledSegments = useMemo(() => {
    const segs = [];
    INFLUENCER_TABS.forEach((tab) => {
      tab.categories.forEach((cat) => {
        const sel = settings[`influencer_${cat.id}`];
        const opt = cat.options.find((o) => o.id === sel);
        if (opt?.promptVal) segs.push({ label: cat.label, value: opt.promptVal, category: cat.id });
      });
    });
    return segs;
  }, [settings]);

  const handleGenerate = useCallback(() => {
    setGenStage("preparing");
    submit("image", selectedModelId, { endpoint: currentModel.endpoint || selectedModelId, prompt: compiledPrompt, aspect_ratio: aspectRatio });
  }, [compiledPrompt, selectedModelId, currentModel, aspectRatio, submit]);

  const handleDownload = useCallback(() => { if (result?.url) window.open(result.url, "_blank"); }, [result]);
  const handleReset = useCallback(() => { setGenStage(""); }, []);

  const tab = INFLUENCER_TABS.find((t) => t.id === activeTab);

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Persona name with counter */}
      <div className="v6-field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="v6-field-label">Persona Name</span>
          <span className="v6-mono v6-tiny" style={{ color: personaName.length > 20 ? "var(--v6-warn)" : "var(--v6-muted)" }}>{personaName.length}/20</span>
        </div>
        <input className="v6-input" type="text" value={personaName} maxLength={20} onChange={(e) => setPersonaName(e.target.value)} placeholder="e.g. Alex, Sophia\u2026" />
      </div>

      {/* Persona tabs with icons */}
      <div className="v6-field">
        <span className="v6-field-label">Persona</span>
        <div className="v6-segmented">
          {INFLUENCER_TABS.map((t) => (
            <button key={t.id} className={activeTab === t.id ? "v6-active" : ""} onClick={() => setActiveTab(t.id)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={TAB_ICONS[t.id] || "M12 2l3.09 6.26L22 9.27l-5 4.14 1.18 6.88L12 17.77l-6.18 3.42L7 14.14 2 9.27l6.91-1.01L12 2z"} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chip selectors per active tab with colored headers */}
      {tab?.categories.map((cat) => {
        const accentColor = CATEGORY_COLORS[cat.id] || "var(--v6-accent)";
        return (
          <div className="v6-field" key={cat.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
              <span className="v6-field-label" style={{ marginBottom: 0, color: accentColor }}>{cat.label}</span>
            </div>
            <div className="v6-chip-row">
              {cat.options.map((o) => (
                <button key={o.id} className={`v6-chip${settings[`influencer_${cat.id}`] === o.id ? " v6-active" : ""}`} onClick={() => setSettings((s) => ({ ...s, [`influencer_${cat.id}`]: o.id }))} style={settings[`influencer_${cat.id}`] === o.id ? { borderColor: accentColor, color: accentColor, background: `${accentColor}15` } : {}}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Aspect ratio */}
      <div className="v6-field">
        <span className="v6-field-label">Aspect Ratio</span>
        <div className="v6-chip-row">{ASPECTS.map((a) => (<button key={a} className={`v6-chip${aspectRatio === a ? " v6-active" : ""}`} onClick={() => setAspectRatio(a)}>{a}</button>))}</div>
      </div>

      {/* Scene prompt */}
      <div className="v6-field">
        <span className="v6-field-label">Scene (optional)</span>
        <textarea className="v6-textarea" value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)} placeholder="Describe the scene and activity\u2026" rows={2} />
        <div className="v6-suggestions-row">{SCENE_SUGGESTIONS.map((s) => (<button key={s} className="v6-prompt-suggestion" onClick={() => setScenePrompt(s)} style={{ fontSize: 9 }}>{s.slice(0, 65)}</button>))}</div>
      </div>
    </div>
  );

  /* ── Center ── */
  const center = (
    <>
      <StageArea generating={loading} stage={genStage} model={currentModel.name} quality={currentModel.resolutions?.[0]} ratio={aspectRatio} result={result} resultTitle={personaName || "AI Persona"} toolLabel="AI Influencer" toolDesc="Build a consistent AI persona with face, body, and style controls, then place them in any scene." toolIcon={<IconCrown />} onDownload={handleDownload} onNew={handleReset} />
      <PromptDock value={scenePrompt} onChange={setScenePrompt} onSubmit={handleGenerate} cost={cost} generating={loading} stage={genStage} icon="spark" />
    </>
  );

  /* ── Inspector ── */
  const inspector = (
    <>
      <ModelSelector models={imageModels.slice(0, 12)} selectedModelId={selectedModelId} onSelect={setSelectedModelId} label="Image Model" />
      <div className="v6-section-rule" style={{ margin: "14px 0" }} />
      <div className="v6-eyebrow">Cost</div>
      <div className="v6-quote" style={{ marginTop: 8 }}>
        <div className="v6-quote-row"><span className="v6-muted">Credits</span><strong><IconBolt /> {cost || "\u2014"}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel.name}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Provider</span><strong>{currentModel.provider}</strong></div>
      </div>
      {shortfall > 0 && <div style={{ marginTop: 6 }}><span style={{ color: "var(--v6-bad)", fontSize: 10 }}>Need {shortfall} more credits</span></div>}
      <div className="v6-section-rule" style={{ margin: "14px 0" }} />

      {/* Compiled prompt with syntax highlighting */}
      <div className="v6-eyebrow">Compiled Persona</div>
      <div className="v6-quote" style={{ marginTop: 8, padding: 10 }}>
        {compiledSegments.length > 0 ? (
          <div className="v6-prompt-syntax">
            {compiledSegments.map((seg, i) => {
              const accentColor = CATEGORY_COLORS[seg.category] || "var(--v6-accent)";
              return (
                <span key={i}>
                  <span style={{ fontSize: 9, opacity: 0.5 }}>{seg.label}: </span>
                  <span style={{ color: accentColor }}>{seg.value}</span>
                  {i < compiledSegments.length - 1 && ", "}
                </span>
              );
            })}
            {personaName && <><span style={{ color: "var(--v6-muted)" }}>, </span><span className="v6-syn-prompt">{personaName}</span></>}
            {scenePrompt && <><span style={{ color: "var(--v6-muted)" }}>, </span><span className="v6-syn-dim">{scenePrompt}</span></>}
          </div>
        ) : (
          <span className="v6-syn-dim">Select persona traits to build a prompt\u2026</span>
        )}
      </div>
    </>
  );

  return <StudioLayout controls={controls} inspector={inspector}>{center}</StudioLayout>;
}
