"use client";

import { useState, useCallback, useEffect } from "react";
import {
  WorkspaceShell, PromptComposer, GenerateButton,
  StagedProgress, ResultCard, EmptyState,
} from "./StudioComponents";
import { IconFilm, IconBolt } from "@/components/Icons";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

const EASE = [0.32, 0.72, 0, 1];

const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const DURATIONS = [3, 6, 10, 15];
const TIPS = [
  "Tip: Motion graphics work best with abstract, flowing descriptions.",
  "Tip: Edit mode refines an existing motion graphic using a request ID.",
  "Tip: Use shorter durations for social, longer for ambient loops.",
];

const SUGGESTIONS = [
  "Smooth motion graphics with flowing particles and gradient transitions",
  "Liquid morphing shapes in pastel colors",
  "Geometric patterns pulsing to an energetic rhythm",
];

export default function MotionStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.vibe-motion.mode") || "basic";
    return "basic";
  });
  const [subMode, setSubMode] = useState("generate");
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(6);
  const [requestId, setRequestId] = useState("");
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.vibe-motion.mode", mode); }, [mode]);

  const { cost, affordable, shortfall } = useCreditCost("vibe-motion", "default", { duration_seconds: duration });

  const handleGenerate = useCallback(() => {
    if (subMode === "edit") {
      if (!requestId || !editPrompt) return;
      setGenStage("preparing");
      submit("motion", "default", { edit_prompt: editPrompt, request_id: requestId, aspect_ratio: aspect });
    } else {
      if (!prompt.trim()) return;
      setGenStage("preparing");
      submit("motion", "default", { prompt, aspect_ratio: aspect, duration_seconds: duration });
    }
  }, [subMode, prompt, editPrompt, requestId, aspect, duration, submit]);

  const handleAction = (actionId, url) => { if (actionId === "download") window.open(url, "_blank"); };

  const inputs = (
    <>
      <div>
        <label className="studio__label">Mode</label>
        <div style={{ display: "flex", gap: 4 }}>
          {["generate", "edit"].map((m) => (
            <button key={m} className={`studio__chip-premium ${subMode === m ? "studio__chip-premium--active" : ""}`} onClick={() => setSubMode(m)} style={{ flex: 1, justifyContent: "center", fontSize: 11 }}>
              {m === "generate" ? "Generate" : "Edit"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Aspect</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ASPECTS.map((a) => (
            <button key={a} className={`studio__chip-premium ${aspect === a ? "studio__chip-premium--active" : ""}`} onClick={() => setAspect(a)} style={{ padding: "4px 8px", fontSize: 11 }}>{a}</button>
          ))}
        </div>
      </div>
      {subMode === "generate" && (
        <div style={{ marginTop: 14 }}>
          <label className="studio__label">Duration</label>
          <div style={{ display: "flex", gap: 4 }}>
            {DURATIONS.map((d) => (
              <button key={d} className={`studio__chip-premium ${duration === d ? "studio__chip-premium--active" : ""}`} onClick={() => setDuration(d)} style={{ flex: 1, justifyContent: "center", fontSize: 11 }}>{d}s</button>
            ))}
          </div>
        </div>
      )}
      {subMode === "edit" && (
        <div style={{ marginTop: 14 }}>
          <label className="studio__label">Request ID (from previous gen)</label>
          <input type="text" value={requestId} onChange={(e) => setRequestId(e.target.value)} className="studio__input" placeholder="req_xxx" />
        </div>
      )}
    </>
  );

  const center = loading ? (
    <StagedProgress stage={genStage} elapsed={elapsed} />
  ) : result ? (
    <ResultCard result={result} type="video" credits={cost} model="Motion Graphics" onAction={handleAction} />
  ) : (
    <EmptyState Icon={IconFilm} title="Motion Studio" description="Generate or edit motion graphics, animated backgrounds, and visual loops." tips={TIPS}>
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
        <div className="studio__label">Mode</div>
        <div className="studio__inspector-value">{subMode === "generate" ? "Generate" : "Edit"}</div>
        <div className="studio__inspector-sub">{aspect}{subMode === "generate" ? ` · ${duration}s` : ""}</div>
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Cost</div>
        <div className="studio__inspector-value"><IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"} credits</div>
        {shortfall > 0 && <div className="studio__inspector-warn">Need {shortfall} more</div>}
      </div>
    </>
  );

  const bottomBar = subMode === "generate" ? (
    <PromptComposer value={prompt} onChange={setPrompt} placeholder="Describe the motion graphic…" charLimit={1500}>
      <GenerateButton onClick={handleGenerate} disabled={!prompt.trim()} generating={loading} stage={genStage} credits={cost} />
    </PromptComposer>
  ) : (
    <PromptComposer value={editPrompt} onChange={setEditPrompt} placeholder="Describe what to edit…" charLimit={1500}>
      <GenerateButton onClick={handleGenerate} disabled={!editPrompt.trim() || !requestId} generating={loading} stage={genStage} credits={cost} />
    </PromptComposer>
  );

  return (
    <WorkspaceShell title="Motion" Icon={IconFilm} mode={mode} onModeChange={setMode} inputs={inputs} inspector={inspector} bottomBar={bottomBar} sheetTitle="Motion Settings">
      {center}
    </WorkspaceShell>
  );
}