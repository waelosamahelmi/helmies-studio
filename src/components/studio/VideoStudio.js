"use client";

import { useState, useRef } from "react";
import { VIDEO_MODELS } from "@/lib/models";
import { IconBolt, IconArrowUpRight, IconVideo } from "@/components/Icons";

export default function VideoStudio() {
  const [model, setModel] = useState(VIDEO_MODELS[0]);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [imageUrl, setImageUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleSubmit = async () => {
    if (!prompt.trim() && !imageUrl) {
      setError("Please enter a prompt or upload an image");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id,
          endpoint: model.endpoint || model.id,
          prompt,
          aspect_ratio: aspectRatio,
          duration,
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
              const m = VIDEO_MODELS.find((x) => x.id === e.target.value);
              setModel(m);
              if (m.aspectRatios) setAspectRatio(m.aspectRatios[0]);
              if (m.durations) setDuration(m.durations[0]);
            }}
          >
            {VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.provider}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label">Prompt</label>
          <textarea
            className="field-textarea"
            placeholder="A cinematic drone shot of a futuristic city at sunset..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
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

        {model.durations && (
          <div className="field-group">
            <label className="field-label">Duration (seconds)</label>
            <div className="field-pills">
              {model.durations.map((d) => (
                <button
                  key={d}
                  className={`pill ${duration === d ? "pill--active" : ""}`}
                  onClick={() => setDuration(d)}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Start Frame (optional)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            style={{ display: "none" }}
          />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            {imageUrl ? "Image loaded ✓" : "Upload start frame"}
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
          disabled={loading || (!prompt.trim() && !imageUrl)}
        >
          {loading ? (
            "Generating video..."
          ) : (
            <>
              Generate Video
              <span className="btn__icon">
                <IconBolt />
              </span>
            </>
          )}
        </button>
      </div>

      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && (
          <div className="studio-loading">
            <div className="studio-loading__spinner" />
            <p>Generating your video... This may take a few minutes.</p>
          </div>
        )}
        {result && result.url && (
          <div className="studio-result">
            <video src={result.url} controls autoPlay loop className="studio-result__video" />
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
          <div className="studio-empty">
            <div className="studio-empty__icon">
              <IconVideo />
            </div>
            <h3>Video Studio</h3>
            <p>Enter a prompt to generate AI video clips.</p>
          </div>
        )}
      </div>
    </div>
  );
}