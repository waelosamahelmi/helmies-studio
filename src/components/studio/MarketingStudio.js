"use client";

import { useState, useRef } from "react";
import { MARKETING_AVATARS } from "@/lib/models";
import { IconBolt, IconArrowUpRight, IconMegaphone } from "@/components/Icons";
import { useToast } from "@/components/ToastProvider";

const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
const DURATIONS = [5, 10, 15];
const RESOLUTIONS = ["720p", "1080p"];

export default function MarketingStudio() {
  const { notifyGeneration } = useToast();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("1080p");
  const [images, setImages] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const uploaded = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) uploaded.push(data.url);
      } catch (e) { setError("Upload failed: " + e.message); }
    }
    setImages((prev) => [...prev, ...uploaded]);
  };

  const addAvatar = (url) => {
    if (!images.includes(url)) setImages((prev) => [...prev, url]);
  };

  const handleSubmit = async () => {
    if (!prompt.trim() && !images.length) { setError("Please enter a prompt or add images"); return; }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/generate/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, duration, resolution, images_list: images }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Generation failed");
      else { setResult(data); notifyGeneration("marketing content", data.url); }
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
          <label className="field-label">Ad Prompt</label>
          <textarea className="field-textarea" placeholder="A woman holding a skincare product, talking to camera, UGC style..." value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
        </div>
        <div className="field-group">
          <label className="field-label">Avatar Presets (click to add)</label>
          <div className="marketing-avatars">
            {MARKETING_AVATARS.map((a) => (
              <button key={a.id} className={`marketing-avatar ${images.includes(a.url) ? "marketing-avatar--active" : ""}`} onClick={() => addAvatar(a.url)} title={a.name}>
                <img src={a.url} alt={a.name} />
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Or Upload Your Own Images</label>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: "none" }} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            Upload images ({images.length} loaded)
          </button>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Aspect Ratio</label>
            <div className="field-pills">
              {ASPECT_RATIOS.map((ar) => <button key={ar} className={`pill ${aspectRatio === ar ? "pill--active" : ""}`} onClick={() => setAspectRatio(ar)}>{ar}</button>)}
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Duration</label>
            <div className="field-pills">
              {DURATIONS.map((d) => <button key={d} className={`pill ${duration === d ? "pill--active" : ""}`} onClick={() => setDuration(d)}>{d}s</button>)}
            </div>
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Resolution</label>
          <div className="field-pills">
            {RESOLUTIONS.map((r) => <button key={r} className={`pill ${resolution === r ? "pill--active" : ""}`} onClick={() => setResolution(r)}>{r}</button>)}
          </div>
        </div>
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading || (!prompt.trim() && !images.length)}>
          {loading ? "Generating ad..." : <>Generate Ad <span className="btn__icon"><IconBolt /></span></>}
        </button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Generating your marketing video...</p></div>}
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
          <div className="studio-empty"><div className="studio-empty__icon"><IconMegaphone /></div><h3>Marketing Studio</h3><p>Create UGC video ads with AI avatars.</p></div>
        )}
      </div>
    </div>
  );
}