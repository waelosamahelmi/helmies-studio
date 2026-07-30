"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import StudioLayout from "./v6/StudioLayout";
import ModelSelector from "./v6/ModelSelector";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { IconCrown, IconBolt } from "@/components/Icons";
import { INFLUENCER_TABS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";

/* ── Aspect ratios ── */
const ASPECTS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

/* ── Scene suggestions ── */
const SCENE_SUGGESTIONS = [
  "in a sunlit modern gym, fitness wear",
  "on a Parisian street, autumn fashion, candid",
  "in a neon-lit studio, dramatic pose",
  "at a beach at golden hour, lifestyle",
];

/* ── Default selections from INFLUENCER_TABS ── */
const DEFAULT_SETTINGS = INFLUENCER_TABS.reduce((acc, tab) => {
  tab.categories.forEach((cat) => {
    acc[`influencer_${cat.id}`] = cat.options[0].id;
  });
  return acc;
}, {});

/* ══════════════════════════════════════════════════════════════ */
export default function InfluencerStudio() {
  const [activeTab, setActiveTab] = useState(INFLUENCER_TABS[0].id);
  const [personaName, setPersonaName] = useState("");
  const [scenePrompt, setScenePrompt] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [selectedModelId, setSelectedModelId] = useState("flux-dev");
  const [genStage, setGenStage] = useState("");

  /* ── Live model catalog ── */
  const { models: imageModels, loading: catalogLoading } = useModelCatalog({ modelType: "image", capability: "text-to-image" });

  /* ── Hooks ── */
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();

  /* ── Current model ── */
  const currentModel = imageModels.find((m) => m.id === selectedModelId) || imageModels[0] || {};

  /* ── Credit cost estimate ── */
  const { cost, affordable, shortfall } = useCreditCost("image", selectedModelId, {
    aspect_ratio: aspectRatio,
  });

  /* ── Compiled persona prompt ── */
  const compiledPrompt = useMemo(() => {
    const parts = INFLUENCER_TABS.flatMap((tab) =>
      tab.categories.map((cat) => {
        const sel = settings[`influencer_${cat.id}`];
        const opt = cat.options.find((o) => o.id === sel);
        return opt?.promptVal;
      })
    ).filter(Boolean);
    const full = [...parts, personaName, scenePrompt, "high quality, professional photo, detailed"]
      .filter(Boolean)
      .join(", ");
    return full;
  }, [settings, personaName, scenePrompt]);

  /* ── Generate handler ── */
  const handleGenerate = useCallback(() => {
    setGenStage("preparing");
    submit("image", selectedModelId, {
      endpoint: currentModel.endpoint || selectedModelId,
      prompt: compiledPrompt,
      aspect_ratio: aspectRatio,
    });
  }, [compiledPrompt, selectedModelId, currentModel, aspectRatio, submit]);

  /* ── Download handler ── */
  const handleDownload = useCallback(() => {
    if (result?.url) window.open(result.url, "_blank");
  }, [result]);

  /* ── Reset ── */
  const handleReset = useCallback(() => {
    setGenStage("");
  }, [submit]);

  /* ── Active tab ── */
  const tab = INFLUENCER_TABS.find((t) => t.id === activeTab);

  /* ── Controls sidebar ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Persona name */}
      <div className="v6-field">
        <span className="v6-field-label">Persona Name</span>
        <input
          className="v6-input"
          type="text"
          value={personaName}
          onChange={(e) => setPersonaName(e.target.value)}
          placeholder="e.g. Alex, Sophia…"
        />
      </div>

      {/* Persona tabs */}
      <div className="v6-field">
        <span className="v6-field-label">Persona</span>
        <div className="v6-segmented">
          {INFLUENCER_TABS.map((t) => (
            <button
              key={t.id}
              className={activeTab === t.id ? "v6-active" : ""}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chip selectors per active tab */}
      {tab?.categories.map((cat) => (
        <div className="v6-field" key={cat.id}>
          <span className="v6-field-label">{cat.label}</span>
          <div className="v6-chip-row">
            {cat.options.map((o) => (
              <button
                key={o.id}
                className={`v6-chip${settings[`influencer_${cat.id}`] === o.id ? " v6-active" : ""}`}
                onClick={() =>
                  setSettings((s) => ({ ...s, [`influencer_${cat.id}`]: o.id }))
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Aspect ratio */}
      <div className="v6-field">
        <span className="v6-field-label">Aspect Ratio</span>
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

      {/* Scene prompt */}
      <div className="v6-field">
        <span className="v6-field-label">Scene (optional)</span>
        <textarea
          className="v6-textarea"
          value={scenePrompt}
          onChange={(e) => setScenePrompt(e.target.value)}
          placeholder="Describe the scene and activity…"
          rows={3}
        />
        {/* Scene suggestions */}
        <div className="v6-chip-row" style={{ marginTop: 6 }}>
          {SCENE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="v6-chip"
              onClick={() => setScenePrompt(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── Center: StageArea + PromptDock ── */
  const center = (
    <>
      <StageArea
        generating={loading}
        stage={genStage}
        model={currentModel.name}
        quality={currentModel.resolutions?.[0]}
        ratio={aspectRatio}
        result={result}
        resultTitle={personaName || "AI Persona"}
        toolLabel="AI Influencer"
        toolDesc="Build a consistent AI persona with face, body, and style controls, then place them in any scene."
        toolIcon={<IconCrown />}
        onDownload={handleDownload}
        onNew={handleReset}
      />
      <PromptDock
        value={scenePrompt}
        onChange={setScenePrompt}
        onSubmit={handleGenerate}
        cost={cost}
        generating={loading}
        stage={genStage}
        icon="spark"
      />
    </>
  );

  /* ── Inspector sidebar ── */
  const inspector = (
    <>
      {/* Model selector (first 12 catalog models) */}
      <ModelSelector
        models={imageModels.slice(0, 12)}
        selectedModelId={selectedModelId}
        onSelect={setSelectedModelId}
        label="Image Model"
      />

      <div style={{ marginTop: 14 }}>
        <div className="v6-section-rule" />
      </div>

      {/* Cost quote */}
      <div style={{ marginTop: 14 }}>
        <div className="v6-eyebrow">Cost</div>
        <div className="v6-quote" style={{ marginTop: 8 }}>
          <div className="v6-quote-row">
            <span className="v6-muted">Credits</span>
            <strong>
              <IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"}
            </strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Model</span>
            <strong>{currentModel.name}</strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Provider</span>
            <strong>{currentModel.provider}</strong>
          </div>
        </div>
        {shortfall > 0 && (
          <div className="v6-status" style={{ marginTop: 6 }}>
            <span style={{ color: "var(--v6-bad)", fontSize: 10 }}>
              Need {shortfall} more credits
            </span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="v6-section-rule" />
      </div>

      {/* Compiled prompt preview */}
      <div style={{ marginTop: 14 }}>
        <div className="v6-eyebrow">Compiled Persona</div>
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: "1px solid var(--v6-line)",
            borderRadius: 12,
            background: "var(--v6-surface2)",
            fontSize: 10,
            lineHeight: 1.55,
            color: "var(--v6-muted)",
            wordBreak: "break-word",
          }}
        >
          {compiledPrompt || "Select persona traits to build a prompt…"}
        </div>
      </div>
    </>
  );

  return (
    <StudioLayout controls={controls} inspector={inspector}>
      {center}
    </StudioLayout>
  );
}
