"use client";

import { useState, useRef } from "react";
import { IconBolt, IconArrowUpRight, IconCut } from "@/components/Icons";

const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4"];

export default function ClippingStudio() {
  const [videoUrl, setVideoUrl] = useState("");
  const [numHighlights, setNumHighlights] = useState(3);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [coordinatesOnly, setCoordinatesOnly] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setVideoUrl(data.url);
    } catch (e) {
      setError("Upload failed: " + e.message);
    }
  };

  const handleSubmit = async () => {
    if (!videoUrl) { setError("Please upload a video"); return; }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/generate/clipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: videoUrl, num_highlights: numHighlights, aspect_ratio: aspectRatio, return_coordinates_only: coordinatesOnly }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Clipping failed");
      else setResult(data);
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
          <label className="field-label">Video</label>
          <input ref={fileRef} type="file" accept="video/*" onChange={handleUpload} style={{ display: "none" }} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            {videoUrl ? "Video loaded ✓" : "Upload video"}
          </button>
        </div>
        <div className="field-group">
          <label className="field-label">Number of Highlights</label>
          <input className="field-input" type="number" min={1} max={10} value={numHighlights} onChange={(e) => setNumHighlights(parseInt(e.target.value) || 3)} />
        </div>
        <div className="field-group">
          <label className="field-label">Aspect Ratio</label>
          <div className="field-pills">
            {ASPECT_RATIOS.map((ar) => <button key={ar} className={`pill ${aspectRatio === ar ? "pill--active" : ""}`} onClick={() => setAspectRatio(ar)}>{ar}</button>)}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Output Mode</label>
          <div className="field-pills">
            <button className={`pill ${!coordinatesOnly ? "pill--active" : ""}`} onClick={() => setCoordinatesOnly(false)}>Video Clips</button>
            <button className={`pill ${coordinatesOnly ? "pill--active" : ""}`} onClick={() => setCoordinatesOnly(true)}>Coordinates Only</button>
          </div>
        </div>
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading || !videoUrl}>
          {loading ? "Extracting highlights..." : <>Extract Highlights <span className="btn__icon"><IconBolt /></span></>}
        </button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Extracting highlights from your video...</p></div>}
        {result && (
          <div className="studio-result">
            {result.url && <video src={result.url} controls autoPlay loop className="studio-result__video" />}
            {result.outputs && (
              <div className="studio-clips">
                {result.outputs.map((clip, i) => (
                  <video key={i} src={clip} controls className="studio-result__video" />
                ))}
              </div>
            )}
            <div className="studio-result__meta">
              <span className="studio-result__credits"><IconBolt /> {result.creditsUsed} credits</span>
            </div>
          </div>
        )}
        {!loading && !result && !error && (
          <div className="studio-empty"><div className="studio-empty__icon"><IconCut /></div><h3>Clipping Studio</h3><p>Extract AI-powered highlights from your videos.</p></div>
        )}
      </div>
    </div>
  );
}