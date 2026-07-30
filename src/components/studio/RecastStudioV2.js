"use client";


import { useState, useCallback, useEffect } from "react";
import {
  WorkspaceShell, ModelSelector, GenerateButton,
  StagedProgress, ResultCard, EmptyState,
} from "./StudioComponents";
import { IconUsers, IconBolt, IconImage, IconVideo } from "@/components/Icons";
import { RECAST_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

const EASE = [0.32, 0.72, 0, 1];

const TIPS = [
  "Tip: Use a clear, front-facing face photo as the reference.",
  "Tip: The source video defines the body motion and scene.",
  "Tip: Orientation (left/right) should match the subject's facing direction.",
];

function RecastStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.recast.mode") || "basic";
    return "basic";
  });
  const [model, setModel] = useState(RECAST_MODELS[0].id);
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [orientation, setOrientation] = useState("left");
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.recast.mode", mode); }, [mode]);

  const currentModel = RECAST_MODELS.find((m) => m.id === model) || RECAST_MODELS[0];
  const { cost, affordable, shortfall } = useCreditCost("recast", model, { image_url: imageUrl, video_url: videoUrl });

  const upload = async (file, setter) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setter(d.url); } catch {}
  };

  const handleGenerate = useCallback(() => {
    if (!videoUrl || !imageUrl) return;
    setGenStage("preparing");
    submit("recast", model, {
      endpoint: currentModel.endpoint || model,
      video_url: videoUrl,
      image_url: imageUrl,
      character_orientation: orientation,
    });
  }, [videoUrl, imageUrl, model, currentModel, orientation, submit]);

  const handleAction = (actionId, url) => { if (actionId === "download") window.open(url, "_blank"); };

  const inputs = (
    <>
      <ModelSelector
        models={RECAST_MODELS.map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, credits: 0 }))}
        selected={model}
        onSelect={setModel}
      />
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Source Video</label>
        <input type="file" accept="video/*" onChange={(e) => upload(e.target.files?.[0], setVideoUrl)} className="studio__input" />
        {videoUrl && <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Loaded ✓</span>}
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="studio__label">Face Image</label>
        <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0], setImageUrl)} className="studio__input" />
        {imageUrl && <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Loaded ✓</span>}
      </div>
      {currentModel.hasOrientation && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Orientation</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["left", "right"].map((o) => (
              <button key={o} className={`studio__chip-premium ${orientation === o ? "studio__chip-premium--active" : ""}`} onClick={() => setOrientation(o)} style={{ flex: 1, justifyContent: "center" }}>
                {o === "left" ? "← Left" : "Right →"}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const ready = !!videoUrl && !!imageUrl;
  const center = loading ? (
    <StagedProgress stage={genStage} elapsed={elapsed} />
  ) : result ? (
    <ResultCard result={result} type="video" credits={cost} model={currentModel.name} onAction={handleAction} />
  ) : (
    <EmptyState Icon={IconUsers} title="Recast / Body Swap" description="Replace a character's face in a video with a reference face image." tips={TIPS}>
      <div style={{ marginTop: 16, display: "flex", gap: 20, justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <IconVideo style={{ width: 28, height: 28, opacity: 0.4 }} />
          <div style={{ fontSize: 11, color: videoUrl ? "var(--color-brand)" : "var(--color-text-faint)", marginTop: 4 }}>{videoUrl ? "Video ready" : "Upload video"}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <IconImage style={{ width: 28, height: 28, opacity: 0.4 }} />
          <div style={{ fontSize: 11, color: imageUrl ? "var(--color-brand)" : "var(--color-text-faint)", marginTop: 4 }}>{imageUrl ? "Face ready" : "Upload face"}</div>
        </div>
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
        <div className="studio__label">Status</div>
        <div className="studio__inspector-value" style={{ color: ready ? "#4ADE80" : "#ff4444" }}>{ready ? "Ready" : "Waiting for inputs"}</div>
      </div>
    </>
  );

  return (
    <WorkspaceShell title="Recast" Icon={IconUsers} mode={mode} onModeChange={setMode} inputs={inputs} inspector={inspector} bottomBar={<GenerateButton onClick={handleGenerate} disabled={!ready} generating={loading} stage={genStage} credits={cost} />} sheetTitle="Recast Settings">
      {center}
    </WorkspaceShell>
  );
}

// CreationWorkspace is the canonical Command Universe composition; the adapter
// preserves this instrument's proven API behavior while its controls use the
// shared spatial workspace contract.
export default RecastStudioV2;
