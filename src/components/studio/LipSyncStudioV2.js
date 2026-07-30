"use client";


import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  WorkspaceShell, ModelSelector, CostQuote, GenerateButton,
  StagedProgress, ResultCard, EmptyState, KeyboardHint,
} from "./StudioComponents";
import { IconMic, IconBolt, IconImage, IconVideo, IconArrowUpRight } from "@/components/Icons";
import { LIPSYNC_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

const EASE = [0.32, 0.72, 0, 1];

const TIPS = [
  "Tip: Use a clear, front-facing portrait for best lip sync.",
  "Tip: Upload clean audio without background noise.",
  "Tip: Volcengine Lip Sync works on video; others work on a single image.",
];

function LipSyncStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.lipsync.mode") || "basic";
    return "basic";
  });
  const [model, setModel] = useState(LIPSYNC_MODELS[0].id);
  const [imageUrl, setImageUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [seed, setSeed] = useState(-1);
  const [showQuote, setShowQuote] = useState(false);
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.lipsync.mode", mode); }, [mode]);

  const currentModel = LIPSYNC_MODELS.find((m) => m.id === model) || LIPSYNC_MODELS[0];
  const needsVideo = currentModel.mode === "video";
  const sourceReady = needsVideo ? !!videoUrl : !!imageUrl;
  const { cost, affordable, shortfall } = useCreditCost("lipsync", model, { image_url: imageUrl, video_url: videoUrl });

  const upload = async (file, setter) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) setter(data.url);
    } catch {}
  };

  const handleGenerate = useCallback(() => {
    if (!sourceReady || !audioUrl) return;
    if (!affordable) { setShowQuote(true); return; }
    setGenStage("preparing");
    submit("lipsync", model, {
      endpoint: currentModel.endpoint || model,
      image_url: needsVideo ? undefined : imageUrl,
      video_url: needsVideo ? videoUrl : undefined,
      audio_url: audioUrl,
      seed: seed >= 0 ? seed : undefined,
    });
  }, [sourceReady, audioUrl, affordable, model, currentModel, needsVideo, imageUrl, videoUrl, seed, submit]);

  const handleAction = (actionId, url) => {
    if (actionId === "download") window.open(url, "_blank");
  };

  const inputs = (
    <>
      <ModelSelector
        models={LIPSYNC_MODELS.map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, credits: 0 }))}
        selected={model}
        onSelect={setModel}
      />
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">{needsVideo ? "Source Video" : "Portrait Image"}</label>
        <input
          type="file"
          accept={needsVideo ? "video/*" : "image/*"}
          onChange={(e) => upload(e.target.files?.[0], needsVideo ? setVideoUrl : setImageUrl)}
          className="studio__input"
        />
        {(needsVideo ? videoUrl : imageUrl) && <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Loaded ✓</span>}
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="studio__label">Audio Track</label>
        <input type="file" accept="audio/*" onChange={(e) => upload(e.target.files?.[0], setAudioUrl)} className="studio__input" />
        {audioUrl && <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Loaded ✓</span>}
      </div>
      {mode === "advanced" && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Seed (-1 = random)</label>
          <input type="number" value={seed} min={-1} onChange={(e) => setSeed(Number(e.target.value))} className="studio__input" />
        </div>
      )}
    </>
  );

  const center = loading ? (
    <StagedProgress stage={genStage} elapsed={elapsed} />
  ) : result ? (
    <ResultCard result={result} type="video" credits={cost} model={currentModel.name} onAction={handleAction} />
  ) : (
    <EmptyState
      Icon={IconMic}
      title="Lip Sync"
      description="Sync a portrait or video to an audio track — make any character speak."
      tips={TIPS}
    >
      <div style={{ marginTop: 16, display: "flex", gap: 20, justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          {needsVideo ? <IconVideo style={{ width: 28, height: 28, opacity: 0.4 }} /> : <IconImage style={{ width: 28, height: 28, opacity: 0.4 }} />}
          <div style={{ fontSize: 11, color: sourceReady ? "var(--color-brand)" : "var(--color-text-faint)", marginTop: 4 }}>
            {sourceReady ? "Source ready" : needsVideo ? "Upload video" : "Upload portrait"}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <IconMic style={{ width: 28, height: 28, opacity: 0.4 }} />
          <div style={{ fontSize: 11, color: audioUrl ? "var(--color-brand)" : "var(--color-text-faint)", marginTop: 4 }}>
            {audioUrl ? "Audio ready" : "Upload audio"}
          </div>
        </div>
      </div>
    </EmptyState>
  );

  const inspector = (
    <>
      <div className="studio__inspector-section">
        <div className="studio__label">Model</div>
        <div className="studio__inspector-value">{currentModel.name}</div>
        <div className="studio__inspector-sub">{currentModel.provider} · {needsVideo ? "video mode" : "image mode"}</div>
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Cost</div>
        <div className="studio__inspector-value"><IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"} credits</div>
        {shortfall > 0 && <div className="studio__inspector-warn">Need {shortfall} more</div>}
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Ready</div>
        <div className="studio__inspector-value" style={{ color: sourceReady && audioUrl ? "#4ADE80" : "#ff4444" }}>
          {sourceReady && audioUrl ? "Ready to generate" : "Waiting for inputs"}
        </div>
      </div>
    </>
  );

  const bottomBar = (
    <GenerateButton onClick={handleGenerate} disabled={!sourceReady || !audioUrl} generating={loading} stage={genStage} credits={cost} />
  );

  return (
    <WorkspaceShell
      title="Lip Sync"
      Icon={IconMic}
      mode={mode}
      onModeChange={setMode}
      inputs={inputs}
      inspector={inspector}
      bottomBar={bottomBar}
      sheetTitle="Lip Sync Settings"
    >
      {center}
    </WorkspaceShell>
  );
}

// CreationWorkspace is the canonical Command Universe composition; the adapter
// preserves this instrument's proven API behavior while its controls use the
// shared spatial workspace contract.
export default LipSyncStudioV2;
