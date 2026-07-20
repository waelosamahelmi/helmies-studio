"use client";

import { useState, useRef } from "react";
import { IMAGE_MODELS } from "@/lib/models";
import { IconBolt, IconArrowUpRight, IconImage } from "@/components/Icons";
import { useCreditCost } from "@/components/studio/useCreditCost";
import RichIdle from "@/components/studio/RichIdle";

export default function ImageStudio() {
  const [model, setModel] = useState(IMAGE_MODELS[0]);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [imageUrl, setImageUrl] = useState("");
  const [result, setResult] = useState(null);
  const { cost, affordable } = useCreditCost("image", model.id, { aspect_ratio: aspectRatio, resolution, width, height, image_url: imageUrl });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id,
          endpoint: model.endpoint || model.id,
          prompt,
          aspect_ratio: aspectRatio,
          resolution,
          width,
          height,
          image_url: imageUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
    } catch (e) {
      setError("Upload failed: " + e.message);
    }
  };

  return (
    <div className="studio-panel">
      <div className="studio-panel__left">
        <div className="field-group">
          <label className="field-label">Model</label>
          <select
            className="field-select"
            value={model.id}
            onChange={(e) => {
              const m = IMAGE_MODELS.find((x) => x.id === e.target.value);
              setModel(m);
              if (m.aspectRatios) setAspectRatio(m.aspectRatios[0]);
            }}
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

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
                <button
                  key={ar}
                  className={`pill ${aspectRatio === ar ? "pill--active" : ""}`}
                  onClick={() => setAspectRatio(ar)}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>
        )}

        {model.resolutions && (
          <div className="field-group">
            <label className="field-label">Resolution</label>
            <div className="field-pills">
              {model.resolutions.map((r) => (
                <button
                  key={r}
                  className={`pill ${resolution === r ? "pill--active" : ""}`}
                  onClick={() => setResolution(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {model.hasDimensions && (
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Width</label>
              <input
                className="field-input"
                type="number"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value) || 1024)}
                step={64}
                min={128}
                max={2048}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Height</label>
              <input
                className="field-input"
                type="number"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value) || 1024)}
                step={64}
                min={128}
                max={2048}
              />
            </div>
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Reference Image (optional)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            style={{ display: "none" }}
          />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            {imageUrl ? "Image loaded ✓" : "Upload image"}
          </button>
          {imageUrl && (
            <button className="btn btn-ghost" onClick={() => setImageUrl("")}>
              Remove
            </button>
          )}
        </div>

        <button
          className="btn btn-primary btn-lg w-full"
          onClick={handleSubmit}
          disabled={loading || !prompt.trim() || !affordable}
        >
          {loading ? (
            "Generating..."
          ) : (
            <>
              Generate{cost ? ` — ${cost} credits` : ""}
              <span className="btn__icon">
                <IconBolt />
              </span>
            </>
          )}
        </button>
        {!affordable && cost && (
          <p className="studio__cost-warning">Insufficient credits. Need {cost}, upgrade to continue.</p>
        )}
      </div>

      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && (
          <div className="studio-loading">
            <div className="studio-loading__spinner" />
            <p>Generating your image...</p>
          </div>
        )}
        {result && result.url && (
          <div className="studio-result">
            <img src={result.url} alt="Generated" className="studio-result__img" />
            <div className="studio-result__meta">
              <a href={result.url} download className="btn btn-secondary btn-sm">
                Download
                <span className="btn__icon">
                  <IconArrowUpRight />
                </span>
              </a>
              <span className="studio-result__credits">
                <IconBolt /> {result.creditsUsed} credits
              </span>
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