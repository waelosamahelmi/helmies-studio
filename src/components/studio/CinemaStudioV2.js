"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  WorkspaceShell, ModelSelector, PromptComposer, GenerateButton,
  StagedProgress, ResultCard, EmptyState,
} from "./StudioComponents";
import { IconCamera, IconBolt, IconArrowUpRight } from "@/components/Icons";
import { IMAGE_MODELS, CINEMA_CAMERAS, CINEMA_LENS, CINEMA_FOCAL, CINEMA_APERTURE } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";

const EASE = [0.32, 0.72, 0, 1];

const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "2:3", "3:2"];
const TIPS = [
  "Tip: Combine camera + lens + focal for a distinct cinematic look.",
  "Tip: f/1.4 gives creamy bokeh; f/11 keeps everything sharp.",
  "Tip: 35mm matches the human eye; 85mm flatters portraits.",
];

const SUGGESTIONS = [
  "A lone figure in the rain, neon reflections on wet pavement",
  "Close-up of an eye, anamorphic lens flare",
  "A desert highway at dusk, heat shimmer, wide vista",
];

export default function CinemaStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.cinema.mode") || "basic";
    return "basic";
  });
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("flux-dev");
  const [camera, setCamera] = useState(CINEMA_CAMERAS[0].id);
  const [lens, setLens] = useState(CINEMA_LENS[0].id);
  const [focal, setFocal] = useState(CINEMA_FOCAL[3].id);
  const [aperture, setAperture] = useState(CINEMA_APERTURE[0].id);
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("1k");
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.cinema.mode", mode); }, [mode]);

  const cinemaModels = useMemo(() => IMAGE_MODELS.filter((m) => m.hasDimensions || m.aspectRatios?.includes(aspect)), [aspect]);
  const currentModel = cinemaModels.find((m) => m.id === model) || cinemaModels[0] || IMAGE_MODELS[0];
  const { cost, affordable, shortfall } = useCreditCost("image", model, { aspect_ratio: aspect, resolution });

  const compiledPrompt = useMemo(() => {
    const cam = CINEMA_CAMERAS.find((c) => c.id === camera);
    const ln = CINEMA_LENS.find((l) => l.id === lens);
    const fo = CINEMA_FOCAL.find((f) => f.id === focal);
    const ap = CINEMA_APERTURE.find((a) => a.id === aperture);
    return [prompt, cam?.prompt, ln?.prompt, fo?.prompt, ap?.prompt].filter(Boolean).join(", ");
  }, [prompt, camera, lens, focal, aperture]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    setGenStage("preparing");
    submit("image", model, {
      endpoint: currentModel.endpoint || model,
      prompt: compiledPrompt,
      aspect_ratio: aspect,
      resolution,
    });
  }, [prompt, model, currentModel, aspect, resolution, compiledPrompt, submit]);

  const handleAction = (actionId, url) => { if (actionId === "download") window.open(url, "_blank"); };

  const Selector = ({ label, options, value, onChange }) => (
    <div>
      <label className="studio__label">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="studio__select">
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );

  const inputs = (
    <>
      <ModelSelector
        models={cinemaModels.map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, speedTier: m.speedTier, credits: 0 }))}
        selected={model}
        onSelect={setModel}
      />
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Selector label="Camera" options={CINEMA_CAMERAS} value={camera} onChange={setCamera} />
        <Selector label="Lens" options={CINEMA_LENS} value={lens} onChange={setLens} />
        <Selector label="Focal Length" options={CINEMA_FOCAL} value={focal} onChange={setFocal} />
        <Selector label="Aperture" options={CINEMA_APERTURE} value={aperture} onChange={setAperture} />
        <div>
          <label className="studio__label">Aspect</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
    <EmptyState Icon={IconCamera} title="Cinema Studio" description="Cinematic image generation with precise camera, lens, focal, and aperture control." tips={TIPS}>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="studio__chip--suggestion" onClick={() => setPrompt(s)} style={{ textAlign: "left" }}>{s}</button>
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
        <div className="studio__label">Compiled Prompt</div>
        <div className="studio__inspector-prompt">{compiledPrompt || "—"}</div>
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Camera Kit</div>
        <div className="studio__inspector-value" style={{ fontSize: 12 }}>
          {CINEMA_CAMERAS.find((c) => c.id === camera)?.name}
        </div>
        <div className="studio__inspector-sub">
          {CINEMA_LENS.find((l) => l.id === lens)?.name} · {CINEMA_FOCAL.find((f) => f.id === focal)?.name} · {CINEMA_APERTURE.find((a) => a.id === aperture)?.name}
        </div>
      </div>
    </>
  );

  const bottomBar = (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
      <PromptComposer value={prompt} onChange={setPrompt} placeholder="Describe the scene — the camera kit is auto-appended…" charLimit={2000}>
        <GenerateButton onClick={handleGenerate} disabled={!prompt.trim()} generating={loading} stage={genStage} credits={cost} />
      </PromptComposer>
    </div>
  );

  return (
    <WorkspaceShell title="Cinema" Icon={IconCamera} mode={mode} onModeChange={setMode} inputs={inputs} inspector={inspector} bottomBar={bottomBar} sheetTitle="Cinema Settings">
      {center}
    </WorkspaceShell>
  );
}