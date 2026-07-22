"use client";

import { useState, useRef } from "react";
import { RECAST_MODELS } from "@/lib/models";
import RichModelPicker from "@/components/studio/RichModelPicker";
import { IconBolt, IconArrowUpRight, IconUsers } from "@/components/Icons";
import { useAsyncGeneration } from "@/components/studio/useAsyncGeneration";

export default function RecastStudio() {
  const [model, setModel] = useState(RECAST_MODELS[0]);
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [orientation, setOrientation] = useState("right");
  const { loading, result, error, submit } = useAsyncGeneration();
  const vidRef = useRef(null);
  const imgRef = useRef(null);

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
    if (!videoUrl || !imageUrl) return;
    submit("recast", model.id, {
      endpoint: model.endpoint,
      video_url: videoUrl,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      character_orientation: model.hasOrientation ? orientation : undefined,
    });
  };

  return (
    <div className="studio-panel">
      <div className="studio-panel__left">
        <RichModelPicker models={RECAST_MODELS} selected={model} onSelect={(m) => { setModel(m); if (m.aspectRatios) setAspectRatio(m.aspectRatios[0]); }} tool="recast" label="Model" />
        <div className="field-group">
          <label className="field-label">Source Video</label>
          <input ref={vidRef} type="file" accept="video/*" onChange={(e) => handleUpload(e, setVideoUrl)} style={{ display: "none" }} />
          <button className="btn btn-secondary" onClick={() => vidRef.current?.click()}>{videoUrl ? "Video loaded ✓" : "Upload video"}</button>
        </div>
        <div className="field-group">
          <label className="field-label">Face Image (to swap in)</label>
          <input ref={imgRef} type="file" accept="image/*" onChange={(e) => handleUpload(e, setImageUrl)} style={{ display: "none" }} />
          <button className="btn btn-secondary" onClick={() => imgRef.current?.click()}>{imageUrl ? "Image loaded ✓" : "Upload face image"}</button>
        </div>
        {model.aspectRatios && (
          <div className="field-group"><label className="field-label">Aspect Ratio</label><div className="field-pills">{model.aspectRatios.map((ar) => <button key={ar} className={`pill ${aspectRatio === ar ? "pill--active" : ""}`} onClick={() => setAspectRatio(ar)}>{ar}</button>)}</div></div>
        )}
        {model.hasOrientation && (
          <div className="field-group"><label className="field-label">Character Orientation</label><div className="field-pills"><button className={`pill ${orientation === "left" ? "pill--active" : ""}`} onClick={() => setOrientation("left")}>Left</button><button className={`pill ${orientation === "right" ? "pill--active" : ""}`} onClick={() => setOrientation("right")}>Right</button></div></div>
        )}
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading || !videoUrl || !imageUrl}>
          {loading ? "Recasting..." : <>Recast Face <span className="btn__icon"><IconBolt /></span></>}
        </button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Recasting face into video... This may take several minutes.</p></div>}
        {result && result.url && (
          <div className="studio-result">
            <video src={result.url} controls autoPlay loop className="studio-result__video" />
            <div className="studio-result__meta">
              <a href={result.url} download className="btn btn-secondary btn-sm">Download<span className="btn__icon"><IconArrowUpRight /></span></a>
              <span className="studio-result__credits"><IconBolt /> {result.creditsUsed} credits</span>
            </div>
          </div>
        )}
        {!loading && !result && !error && <div className="studio-empty"><div className="studio-empty__icon"><IconUsers /></div><h3>Body Swap Studio</h3><p>Recast faces into any video scene.</p></div>}
      </div>
    </div>
  );
}
