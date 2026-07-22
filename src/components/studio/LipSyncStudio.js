"use client";

import { useState, useRef } from "react";
import { LIPSYNC_MODELS } from "@/lib/models";
import RichModelPicker from "@/components/studio/RichModelPicker";
import { IconBolt, IconArrowUpRight, IconMic } from "@/components/Icons";
import { useAsyncGeneration } from "@/components/studio/useAsyncGeneration";

export default function LipSyncStudio() {
  const [model, setModel] = useState(LIPSYNC_MODELS[0]);
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [resolution, setResolution] = useState("720p");
  const { loading, result, error, submit } = useAsyncGeneration();
  const imgRef = useRef(null);
  const vidRef = useRef(null);
  const audRef = useRef(null);

  const isVideoMode = model.mode === "video";

  const handleUpload = async (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setter(data.url);
    } catch {}
  };

  const handleSubmit = () => {
    if (!audioUrl || (!imageUrl && !videoUrl)) return;
    submit("lipsync", model.id, {
      endpoint: model.endpoint || model.id,
      image_url: !isVideoMode ? imageUrl : undefined,
      video_url: isVideoMode ? videoUrl : undefined,
      audio_url: audioUrl,
      resolution: model.resolutions ? resolution : undefined,
    });
  };

  return (
    <div className="studio-panel">
      <div className="studio-panel__left">
        <RichModelPicker models={LIPSYNC_MODELS} selected={model} onSelect={(m) => { setModel(m); if (m.resolutions) setResolution(m.resolutions[0]); }} tool="lipsync" label="Model" />
        {!isVideoMode ? (
          <div className="field-group">
            <label className="field-label">Portrait Image</label>
            <input ref={imgRef} type="file" accept="image/*" onChange={(e) => handleUpload(e, setImageUrl)} style={{ display: "none" }} />
            <button className="btn btn-secondary" onClick={() => imgRef.current?.click()}>{imageUrl ? "Image loaded ✓" : "Upload portrait"}</button>
          </div>
        ) : (
          <div className="field-group">
            <label className="field-label">Video</label>
            <input ref={vidRef} type="file" accept="video/*" onChange={(e) => handleUpload(e, setVideoUrl)} style={{ display: "none" }} />
            <button className="btn btn-secondary" onClick={() => vidRef.current?.click()}>{videoUrl ? "Video loaded ✓" : "Upload video"}</button>
          </div>
        )}
        <div className="field-group">
          <label className="field-label">Audio</label>
          <input ref={audRef} type="file" accept="audio/*" onChange={(e) => handleUpload(e, setAudioUrl)} style={{ display: "none" }} />
          <button className="btn btn-secondary" onClick={() => audRef.current?.click()}>{audioUrl ? "Audio loaded ✓" : "Upload audio"}</button>
        </div>
        {model.resolutions && (
          <div className="field-group">
            <label className="field-label">Resolution</label>
            <div className="field-pills">{model.resolutions.map((r) => <button key={r} className={`pill ${resolution === r ? "pill--active" : ""}`} onClick={() => setResolution(r)}>{r}</button>)}</div>
          </div>
        )}
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading || !audioUrl || (!imageUrl && !videoUrl)}>
          {loading ? "Processing lip sync..." : <>Generate Lip Sync <span className="btn__icon"><IconBolt /></span></>}
        </button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Processing lip sync... This may take a few minutes.</p></div>}
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
          <div className="studio-empty"><div className="studio-empty__icon"><IconMic /></div><h3>Lip Sync Studio</h3><p>Upload a portrait or video and audio to create a lip-synced video.</p></div>
        )}
      </div>
    </div>
  );
}
