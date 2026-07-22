"use client";

import { useState, useRef } from "react";
import { CINEMA_CAMERAS, CINEMA_LENS, CINEMA_FOCAL, CINEMA_APERTURE } from "@/lib/models";
import { IconBolt, IconArrowUpRight, IconCamera } from "@/components/Icons";
import RichSelect from "@/components/studio/RichSelect";
import { useAsyncGeneration } from "@/components/studio/useAsyncGeneration";
import { apiFetch } from "@/lib/client-fetch";

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"];
const RESOLUTIONS = ["1k", "2k", "4k"];

export default function CinemaStudio() {
  const [camera, setCamera] = useState(CINEMA_CAMERAS[0]);
  const [lens, setLens] = useState(CINEMA_LENS[0]);
  const [focal, setFocal] = useState(CINEMA_FOCAL[0]);
  const [aperture, setAperture] = useState(CINEMA_APERTURE[0]);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("2k");
  const [imageUrl, setImageUrl] = useState("");
  const { loading, result, error, submit } = useAsyncGeneration();
  const fileRef = useRef(null);

  const buildPrompt = () => [prompt, camera.prompt, lens.prompt, focal.prompt, aperture.prompt].filter(Boolean).join(", ");

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    submit("cinema", "cinema", { prompt: buildPrompt(), aspect_ratio: aspectRatio, resolution, image_url: imageUrl || undefined });
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
    } catch {}
  };

  return (
    <div className="studio-panel">
      <div className="studio-panel__left">
        <RichSelect label="Camera" options={CINEMA_CAMERAS} selected={camera} onSelect={setCamera} />
        <RichSelect label="Lens" options={CINEMA_LENS} selected={lens} onSelect={setLens} />
        <div className="field-row"><RichSelect label="Focal Length" options={CINEMA_FOCAL} selected={focal} onSelect={setFocal} /><RichSelect label="Aperture" options={CINEMA_APERTURE} selected={aperture} onSelect={setAperture} /></div>
        <div className="field-group"><label className="field-label">Scene Description</label><textarea className="field-textarea" placeholder="A lone figure walking through a neon-lit alley in the rain..." value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} /></div>
        <div className="field-group"><label className="field-label">Aspect Ratio</label><div className="field-pills">{ASPECT_RATIOS.map((ar) => <button key={ar} className={`pill ${aspectRatio === ar ? "pill--active" : ""}`} onClick={() => setAspectRatio(ar)}>{ar}</button>)}</div></div>
        <div className="field-group"><label className="field-label">Resolution</label><div className="field-pills">{RESOLUTIONS.map((r) => <button key={r} className={`pill ${resolution === r ? "pill--active" : ""}`} onClick={() => setResolution(r)}>{r}</button>)}</div></div>
        <div className="field-group"><label className="field-label">Reference Image (optional)</label><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} /><button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>{imageUrl ? "Image loaded ✓" : "Upload image"}</button>{imageUrl && <button className="btn btn-ghost" onClick={() => setImageUrl("")}>Remove</button>}</div>
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading || !prompt.trim()}>{loading ? "Generating..." : <>Generate <span className="btn__icon"><IconBolt /></span></>}</button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Generating cinematic image...</p></div>}
        {result && result.url && <div className="studio-result"><img src={result.url} alt="Cinematic" className="studio-result__img" /><div className="studio-result__meta"><a href={result.url} download className="btn btn-secondary btn-sm">Download<span className="btn__icon"><IconArrowUpRight /></span></a><span className="studio-result__credits"><IconBolt /> {result.creditsUsed} credits</span></div></div>}
        {!loading && !result && !error && <div className="studio-empty"><div className="studio-empty__icon"><IconCamera /></div><h3>Cinema Studio</h3><p>Pro camera controls for cinematic AI images.</p></div>}
      </div>
    </div>
  );
}
