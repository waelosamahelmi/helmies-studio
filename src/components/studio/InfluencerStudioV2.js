"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  WorkspaceShell, ModelSelector, PromptComposer, GenerateButton,
  StagedProgress, ResultCard, EmptyState,
} from "./StudioComponents";
import { IconCrown, IconBolt } from "@/components/Icons";
import { IMAGE_MODELS, INFLUENCER_TABS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";

const EASE = [0.32, 0.72, 0, 1];

const ASPECTS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const TIPS = [
  "Tip: Build a persona across the Face, Body, and Style tabs.",
  "Tip: Save a persona to Memory to reuse it across generations.",
  "Tip: Add a custom prompt to set the scene or activity.",
];

const SCENE_SUGGESTIONS = [
  "in a sunlit modern gym, fitness wear",
  "on a Parisian street, autumn fashion, candid",
  "in a neon-lit studio, dramatic pose",
  "at a beach at golden hour, lifestyle",
];

// Default settings from INFLUENCER_TABS
const DEFAULT_SETTINGS = INFLUENCER_TABS.reduce((acc, tab) => {
  tab.categories.forEach((cat) => { acc[`influencer_${cat.id}`] = cat.options[0].id; });
  return acc;
}, {});

export default function InfluencerStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.influencer.mode") || "basic";
    return "basic";
  });
  const [activeTab, setActiveTab] = useState(INFLUENCER_TABS[0].id);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [customPrompt, setCustomPrompt] = useState("");
  const [model, setModel] = useState("flux-dev");
  const [aspect, setAspect] = useState("3:4");
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.influencer.mode", mode); }, [mode]);

  const currentModel = IMAGE_MODELS.find((m) => m.id === model) || IMAGE_MODELS[0];
  const { cost, affordable, shortfall } = useCreditCost("image", model, { aspect_ratio: aspect });

  const compiledPrompt = useMemo(() => {
    const parts = INFLUENCER_TABS.flatMap((tab) =>
      tab.categories.map((cat) => {
        const sel = settings[`influencer_${cat.id}`];
        const opt = cat.options.find((o) => o.id === sel);
        return opt?.promptVal;
      })
    ).filter(Boolean);
    return [...parts, customPrompt, "high quality, professional photo, detailed"].filter(Boolean).join(", ");
  }, [settings, customPrompt]);

  const handleGenerate = useCallback(() => {
    setGenStage("preparing");
    submit("image", model, {
      endpoint: currentModel.endpoint || model,
      prompt: compiledPrompt,
      aspect_ratio: aspect,
    });
  }, [compiledPrompt, model, currentModel, aspect, submit]);

  const handleAction = (actionId, url) => { if (actionId === "download") window.open(url, "_blank"); };

  const tab = INFLUENCER_TABS.find((t) => t.id === activeTab);

  const inputs = (
    <>
      <ModelSelector
        models={IMAGE_MODELS.slice(0, 12).map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, speedTier: m.speedTier, credits: 0 }))}
        selected={model}
        onSelect={setModel}
      />
      <div style={{ marginTop: 14, display: "flex", gap: 4 }}>
        {INFLUENCER_TABS.map((t) => (
          <button key={t.id} className={`studio__chip-premium ${activeTab === t.id ? "studio__chip-premium--active" : ""}`} onClick={() => setActiveTab(t.id)} style={{ flex: 1, justifyContent: "center", fontSize: 11 }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {tab?.categories.map((cat) => (
          <div key={cat.id}>
            <label className="studio__label">{cat.label}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {cat.options.map((o) => (
                <button
                  key={o.id}
                  className={`studio__chip-premium ${settings[`influencer_${cat.id}`] === o.id ? "studio__chip-premium--active" : ""}`}
                  onClick={() => setSettings((s) => ({ ...s, [`influencer_${cat.id}`]: o.id }))}
                  style={{ padding: "4px 8px", fontSize: 11 }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <label className="studio__label">Aspect</label>
          <div style={{ display: "flex", gap: 4 }}>
            {ASPECTS.map((a) => (
              <button key={a} className={`studio__chip-premium ${aspect === a ? "studio__chip-premium--active" : ""}`} onClick={() => setAspect(a)} style={{ padding: "4px 8px", fontSize: 11 }}>{a}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  const center = loading ? (
    <StagedProgress stage={genStage} elapsed={elapsed} />
  ) : result ? (
    <ResultCard result={result} type="image" credits={cost} model={currentModel.name} onAction={handleAction} />
  ) : (
    <EmptyState Icon={IconCrown} title="AI Influencer" description="Build a consistent AI persona with face, body, and style controls, then place them in any scene." tips={TIPS}>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {SCENE_SUGGESTIONS.map((s) => (
          <button key={s} className="studio__chip--suggestion" onClick={() => setCustomPrompt(s)} style={{ textAlign: "left" }}>{s}</button>
        ))}
      </div>
    </EmptyState>
  );

  const inspector = (
    <>
      <div className="studio__inspector-section">
        <div className="studio__label">Model</div>
        <div className="studio__inspector-value">{currentModel.name}</div>
        <div className="studio__inspector-sub">{currentModel.provider}</div>
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Cost</div>
        <div className="studio__inspector-value"><IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"} credits</div>
        {shortfall > 0 && <div className="studio__inspector-warn">Need {shortfall} more</div>}
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Compiled Persona</div>
        <div className="studio__inspector-prompt">{compiledPrompt}</div>
      </div>
    </>
  );

  const bottomBar = (
    <PromptComposer value={customPrompt} onChange={setCustomPrompt} placeholder="Scene or activity (optional)…" charLimit={1000}>
      <GenerateButton onClick={handleGenerate} disabled={!affordable} generating={loading} stage={genStage} credits={cost} />
    </PromptComposer>
  );

  return (
    <WorkspaceShell title="Influencer" Icon={IconCrown} mode={mode} onModeChange={setMode} inputs={inputs} inspector={inspector} bottomBar={bottomBar} sheetTitle="Persona Builder">
      {center}
    </WorkspaceShell>
  );
}