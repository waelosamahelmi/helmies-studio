"use client";

import { useState, useRef } from "react";
import { IMAGE_MODELS } from "@/lib/models";
import { IconBolt, IconArrowUpRight, IconImage } from "@/components/Icons";
import { useCreditCost } from "@/components/studio/useCreditCost";
import RichIdle from "@/components/studio/RichIdle";
import RichModelPicker from "@/components/studio/RichModelPicker";
import StagedProgress from "@/components/studio/StagedProgress";
import BeforeAfterSlider from "@/components/studio/BeforeAfterSlider";
import { useAsyncGeneration } from "@/components/studio/useAsyncGeneration";
import Link from "next/link";
import { apiFetch } from "@/lib/client-fetch";

export default function ImageStudio() {
  const [model, setModel] = useState(IMAGE_MODELS[0]);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [imageUrl, setImageUrl] = useState("");
  const [seed, setSeed] = useState(-1);
  const { cost, affordable, shortfall, topUpPacks } = useCreditCost("image", model.id, { aspect_ratio: aspectRatio, resolution, width, height, image_url: imageUrl });
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const fileRef = useRef(null);

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    submit("image", model.id, {
      endpoint: model.endpoint || model.id,
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
      width,
      height,
      image_url: imageUrl || undefined,
      seed: seed !== -1 ? seed : undefined,
    });
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
        <RichModelPicker
          models={IMAGE_MODELS}
          selected={model}
          onSelect={(m) => { setModel(m); if (m.aspectRatios) setAspectRatio(m.aspectRatios[0]); }}
          tool="image"
        />

        <div className="field-group">
          <label className="field-label">Prompt</label>
          <textarea
            className="field-textarea"
            placeholder="A portrait of a warrior princess in golden armor..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
          />
        </div>

        {model.aspectRatios && (
          <div className="field-group">
            <label className="field-label">Aspect Ratio</label>
            <div className="field-pills">
              {model.aspectRatios.map((ar) => (
                <button key={ar} className={`pill ${aspectRatio === ar ? "pill--active" : ""}`} onClick={() => setAspectRatio(ar)}>{ar}</button>
              ))}
            </div>
          </div>
        )}

        {model.resolutions && (
          <div className="field-group">
            <label className="field-label">Resolution</label>
            <div className="field-pills">
              {model.resolutions.map((r) => (
                <button key={r} className={`pill ${resolution === r ? "pill--active" : ""}`} onClick={() => setResolution(r)}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {model.hasDimensions && (
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Width</label>
              <input className="field-input" type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value) || 1024)} step={64} min={128} max={2048} />
            </div>
            <div className="field-group">
              <label className="field-label">Height</label>
              <input className="field-input" type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value) || 1024)} step={64} min={128} max={2048} />
            </div>
          </div>
        )}

        <details className="field-group" style={{ marginTop: "0.5rem" }}>
          <summary className="field-label" style={{ cursor: "pointer", opacity: 0.6, fontSize: "0.75rem" }}>Advanced</summary>
          <div className="field-group" style={{ marginTop: "0.5rem" }}>
            <label className="field-label">Seed (-1 = random)</label>
            <input className="field-input" type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value) || -1)} min={-1} />
          </div>
        </details>

        <div className="field-group">
          <label className="field-label">Reference Image (optional)</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            {imageUrl ? "Image loaded ✓" : "Upload image"}
          </button>
          {imageUrl && <button className="btn btn-ghost" onClick={() => setImageUrl("")}>Remove</button>}
        </div>

        <button
          className="btn btn-primary btn-lg w-full"
          onClick={handleSubmit}
          disabled={loading || !prompt.trim() || !affordable}
        >
          {loading ? "Generating..." : (
            <>Generate{cost ? ` — ${cost} credits` : ""}<span className="btn__icon"><IconBolt /></span></>
          )}
        </button>
        {!affordable && cost && (
          <div className="studio__cost-warning">
            <p>Insufficient credits. Need {cost} (shortfall: {shortfall}).</p>
            {topUpPacks.length > 0 && (
              <div className="studio__topup-packs">
                {topUpPacks.slice(0, 2).map((p) => (
                  <Link key={p.id} href={`/pricing?pack=${p.id}`} className="btn btn-sm btn-secondary">
                    Top up {p.credits} credits — {p.price}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <StagedProgress tool="image" elapsed={elapsed} />}
        {result && result.url && (
          <div className="studio-result">
            {imageUrl ? (
              <BeforeAfterSlider beforeSrc={imageUrl} afterSrc={result.url} beforeLabel="Reference" afterLabel="Generated" />
            ) : (
              <img src={result.url} alt="Generated" className="studio-result__img" />
            )}
            <div className="studio-result__meta">
              <a href={result.url} download className="btn btn-secondary btn-sm">
                Download<span className="btn__icon"><IconArrowUpRight /></span>
              </a>
              <span className="studio-result__credits"><IconBolt /> {result.creditsUsed} credits</span>
            </div>
          </div>
        )}
        {!loading && !result && !error && (
          <RichIdle tool="image" icon={IconImage} title="Image Studio" description="Enter a prompt and click Generate to create stunning AI images." />
        )}
      </div>
    </div>
  );
}
