"use client";

import { useState, useRef } from "react";
import { AUDIO_MODELS } from "@/lib/models";
import RichModelPicker from "@/components/studio/RichModelPicker";
import { IconBolt, IconArrowUpRight, IconMusic } from "@/components/Icons";
import { useAsyncGeneration } from "@/components/studio/useAsyncGeneration";
import { apiFetch } from "@/lib/client-fetch";

export default function AudioStudio() {
  const [model, setModel] = useState(AUDIO_MODELS[0]);
  const [params, setParams] = useState({});
  const { loading, result, error, submit } = useAsyncGeneration();
  const fileRef = useRef(null);

  const handleSubmit = () => {
    submit("audio", model.id, { ...params, _modelId: model.id, endpoint: model.endpoint });
  };

  const handleUpload = async (e, fieldName) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setParams((p) => ({ ...p, [fieldName]: data.url }));
    } catch {}
  };

  const renderField = (key, field) => {
    if (field.type === "string" && (field.title?.includes("Prompt") || field.title === "Prompt" || field.title === "Text" || field.title === "Text to Speak")) {
      return <textarea key={key} className="field-textarea" placeholder={field.title} value={params[key] || ""} onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} rows={4} />;
    }
    if (field.type === "file") {
      return (
        <div key={key}>
          <input ref={fileRef} type="file" accept={field.accept || "audio/*"} onChange={(e) => handleUpload(e, key)} style={{ display: "none" }} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>{params[key] ? "Audio loaded ✓" : `Upload ${field.title}`}</button>
        </div>
      );
    }
    if (field.type === "enum") {
      return <select key={key} className="field-select" value={params[key] || field.default} onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}>{field.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>;
    }
    if (field.type === "int" || field.type === "number") {
      return <input key={key} className="field-input" type="number" value={params[key] ?? field.default ?? 30} min={field.minValue} max={field.maxValue} onChange={(e) => setParams((p) => ({ ...p, [key]: parseInt(e.target.value) }))} />;
    }
    return <input key={key} className="field-input" type="text" placeholder={field.title} value={params[key] || ""} onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} />;
  };

  return (
    <div className="studio-panel">
      <div className="studio-panel__left">
        <RichModelPicker models={AUDIO_MODELS} selected={model} onSelect={(m) => { setModel(m); setParams({}); }} tool="audio" label="Model" />
        {model.inputs && Object.entries(model.inputs).map(([key, field]) => (
          <div className="field-group" key={key}><label className="field-label">{field.title}</label>{renderField(key, field)}</div>
        ))}
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? "Generating audio..." : <>Generate Audio <span className="btn__icon"><IconBolt /></span></>}
        </button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Generating audio... This may take a minute.</p></div>}
        {result && result.url && (
          <div className="studio-result">
            <audio src={result.url} controls className="studio-result__audio" />
            <div className="studio-result__meta">
              <a href={result.url} download className="btn btn-secondary btn-sm">Download<span className="btn__icon"><IconArrowUpRight /></span></a>
              <span className="studio-result__credits"><IconBolt /> {result.creditsUsed} credits</span>
            </div>
          </div>
        )}
        {!loading && !result && !error && (
          <div className="studio-empty"><div className="studio-empty__icon"><IconMusic /></div><h3>Audio Studio</h3><p>Generate music, voice, and sound effects with AI.</p></div>
        )}
      </div>
    </div>
  );
}
