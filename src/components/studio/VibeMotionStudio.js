"use client";

import { useState } from "react";
import { IconBolt, IconArrowUpRight, IconFilm } from "@/components/Icons";

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const DURATIONS = [3, 6, 10, 15];

export default function VibeMotionStudio() {
  const [mode, setMode] = useState("generate");
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(6);
  const [requestId, setRequestId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (mode === "generate" && !prompt.trim()) { setError("Please enter a prompt"); return; }
    if (mode === "edit" && !requestId.trim()) { setError("Please enter a request ID"); return; }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const body = mode === "edit"
        ? { request_id: requestId, edit_prompt: editPrompt, aspect_ratio: aspectRatio, duration_seconds: duration }
        : { prompt, aspect_ratio: aspectRatio, duration_seconds: duration };
      const res = await fetch("/api/generate/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Generation failed");
      else { setResult(data); if (data.requestId) setRequestId(data.requestId); }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="studio-panel">
      <div className="studio-panel__left">
        <div className="field-group">
          <label className="field-label">Mode</label>
          <div className="field-pills">
            <button className={`pill ${mode === "generate" ? "pill--active" : ""}`} onClick={() => setMode("generate")}>Generate</button>
            <button className={`pill ${mode === "edit" ? "pill--active" : ""}`} onClick={() => setMode("edit")}>Edit / Remix</button>
          </div>
        </div>
        {mode === "generate" ? (
          <div className="field-group">
            <label className="field-label">Prompt</label>
            <textarea className="field-textarea" placeholder="A dynamic title sequence with golden particles..." value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
          </div>
        ) : (
          <>
            <div className="field-group">
              <label className="field-label">Request ID (from previous generation)</label>
              <input className="field-input" type="text" placeholder="Paste request ID..." value={requestId} onChange={(e) => setRequestId(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">Edit Prompt</label>
              <textarea className="field-textarea" placeholder="Make it more vibrant and add sparkles..." value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={3} />
            </div>
          </>
        )}
        <div className="field-group">
          <label className="field-label">Aspect Ratio</label>
          <div className="field-pills">
            {ASPECT_RATIOS.map((ar) => <button key={ar} className={`pill ${aspectRatio === ar ? "pill--active" : ""}`} onClick={() => setAspectRatio(ar)}>{ar}</button>)}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Duration (seconds)</label>
          <div className="field-pills">
            {DURATIONS.map((d) => <button key={d} className={`pill ${duration === d ? "pill--active" : ""}`} onClick={() => setDuration(d)}>{d}s</button>)}
          </div>
        </div>
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? "Generating..." : <>Generate Motion <span className="btn__icon"><IconBolt /></span></>}
        </button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Generating motion graphics...</p></div>}
        {result && result.url && (
          <div className="studio-result">
            <video src={result.url} controls autoPlay loop className="studio-result__video" />
            <div className="studio-result__meta">
              <a href={result.url} download className="btn btn-secondary btn-sm">Download<span className="btn__icon"><IconArrowUpRight /></span></a>
              <span className="studio-result__credits"><IconBolt /> {result.creditsUsed} credits</span>
            </div>
          </div>
        )}
        {!loading && !result && !error && (
          <div className="studio-empty"><div className="studio-empty__icon"><IconFilm /></div><h3>Vibe Motion Studio</h3><p>Create motion graphics and remix with AI.</p></div>
        )}
      </div>
    </div>
  );
}