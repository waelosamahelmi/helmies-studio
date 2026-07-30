"use client";


import { useState, useCallback, useEffect } from "react";
import {
  WorkspaceShell, GenerateButton,
  StagedProgress, ResultCard, EmptyState,
} from "./StudioComponents";
import { IconCut, IconBolt, IconVideo } from "@/components/Icons";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

const EASE = [0.32, 0.72, 0, 1];

const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const TIPS = [
  "Tip: Upload a longer video to auto-extract the best moments.",
  "Tip: 3-5 highlights works well for most content.",
  "Tip: Use coordinates-only mode to get timestamps without clips.",
];

function ClippingStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.clipping.mode") || "basic";
    return "basic";
  });
  const [videoUrl, setVideoUrl] = useState(null);
  const [numHighlights, setNumHighlights] = useState(3);
  const [aspect, setAspect] = useState("9:16");
  const [coordsOnly, setCoordsOnly] = useState(false);
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.clipping.mode", mode); }, [mode]);

  const { cost, affordable, shortfall } = useCreditCost("clipping", "default", { num_highlights: numHighlights });

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setVideoUrl(d.url); } catch {}
  };

  const handleGenerate = useCallback(() => {
    if (!videoUrl) return;
    setGenStage("preparing");
    submit("clipping", "default", {
      video_url: videoUrl,
      num_highlights: numHighlights,
      aspect_ratio: aspect,
      return_coordinates_only: coordsOnly,
    });
  }, [videoUrl, numHighlights, aspect, coordsOnly, submit]);

  const handleAction = (actionId, url) => { if (actionId === "download") window.open(url, "_blank"); };

  const inputs = (
    <>
      <div>
        <label className="studio__label">Highlights</label>
        <input type="range" min={1} max={10} value={numHighlights} onChange={(e) => setNumHighlights(Number(e.target.value))} className="studio__slider" />
        <span className="studio__slider-val">{numHighlights}</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Output Aspect</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ASPECTS.map((a) => (
            <button key={a} className={`studio__chip-premium ${aspect === a ? "studio__chip-premium--active" : ""}`} onClick={() => setAspect(a)} style={{ padding: "4px 8px", fontSize: 11 }}>{a}</button>
          ))}
        </div>
      </div>
      <label className="studio__check" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={coordsOnly} onChange={(e) => setCoordsOnly(e.target.checked)} />
        Coordinates only (no clip rendering)
      </label>
    </>
  );

  const center = loading ? (
    <StagedProgress stage={genStage} elapsed={elapsed} />
  ) : result ? (
    <ResultCard result={result} type="video" credits={cost} model="AI Clipping" onAction={handleAction} />
  ) : (
    <EmptyState Icon={IconCut} title="Clipping Studio" description="Upload a video and AI extracts the most engaging highlight clips automatically." tips={TIPS}>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, color: videoUrl ? "var(--color-brand)" : "var(--color-text-faint)", marginBottom: 8 }}>
          {videoUrl ? "Video loaded ✓" : "Upload a video to begin"}
        </div>
      </div>
    </EmptyState>
  );

  const inspector = (
    <>
      <div className="studio__inspector-section">
        <div className="studio__label">Highlights</div>
        <div className="studio__inspector-value">{numHighlights} clips</div>
        <div className="studio__inspector-sub">{aspect}{coordsOnly ? " · coords only" : ""}</div>
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Cost</div>
        <div className="studio__inspector-value"><IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"} credits</div>
        {shortfall > 0 && <div className="studio__inspector-warn">Need {shortfall} more</div>}
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Status</div>
        <div className="studio__inspector-value" style={{ color: videoUrl ? "#4ADE80" : "#ff4444" }}>{videoUrl ? "Ready" : "Waiting for video"}</div>
      </div>
    </>
  );

  return (
    <WorkspaceShell title="Clipping" Icon={IconCut} mode={mode} onModeChange={setMode} inputs={inputs} inspector={inspector} bottomBar={
      <>
        <input type="file" accept="video/*" onChange={(e) => upload(e.target.files?.[0])} className="studio__input" style={{ marginBottom: 10 }} />
        <GenerateButton onClick={handleGenerate} disabled={!videoUrl} generating={loading} stage={genStage} credits={cost} />
      </>
    } sheetTitle="Clipping Settings">
      {center}
    </WorkspaceShell>
  );
}

export default ClippingStudioV2;
