"use client";

import { useState } from "react";
import { INFLUENCER_TABS } from "@/lib/models";
import { IconBolt, IconArrowUpRight, IconCrown } from "@/components/Icons";

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

export default function AiInfluencerStudio() {
  const [activeTab, setActiveTab] = useState(INFLUENCER_TABS[0].id);
  const [selections, setSelections] = useState({});
  const [customPrompt, setCustomPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buildPrompt = () => {
    const parts = Object.values(selections).filter(Boolean);
    if (customPrompt.trim()) parts.push(customPrompt);
    return parts.join(", ") + ", high quality, professional photo, detailed";
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const fullPrompt = buildPrompt();
      const res = await fetch("/api/generate/influencer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, aspect_ratio: aspectRatio }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Generation failed");
      else setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const tab = INFLUENCER_TABS.find((t) => t.id === activeTab);

  return (
    <div className="studio-panel">
      <div className="studio-panel__left">
        <div className="field-group">
          <label className="field-label">Configure</label>
          <div className="field-pills">
            {INFLUENCER_TABS.map((t) => (
              <button key={t.id} className={`pill ${activeTab === t.id ? "pill--active" : ""}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
        {tab.categories.map((cat) => (
          <div className="field-group" key={cat.id}>
            <label className="field-label">{cat.label}</label>
            <div className="field-pills">
              {cat.options.map((opt) => (
                <button
                  key={opt.id}
                  className={`pill ${selections[cat.id] === opt.promptVal ? "pill--active" : ""}`}
                  onClick={() => setSelections((s) => ({ ...s, [cat.id]: opt.promptVal }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="field-group">
          <label className="field-label">Custom Prompt (optional)</label>
          <textarea className="field-textarea" placeholder="Add any extra details..." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={2} />
        </div>
        <div className="field-group">
          <label className="field-label">Aspect Ratio</label>
          <div className="field-pills">
            {ASPECT_RATIOS.map((ar) => <button key={ar} className={`pill ${aspectRatio === ar ? "pill--active" : ""}`} onClick={() => setAspectRatio(ar)}>{ar}</button>)}
          </div>
        </div>
        <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? "Generating..." : <>Generate Persona <span className="btn__icon"><IconBolt /></span></>}
        </button>
      </div>
      <div className="studio-panel__right">
        {error && <div className="studio-error">{error}</div>}
        {loading && <div className="studio-loading"><div className="studio-loading__spinner" /><p>Generating AI persona...</p></div>}
        {result && result.url && (
          <div className="studio-result">
            <img src={result.url} alt="AI Persona" className="studio-result__img" />
            <div className="studio-result__meta">
              <a href={result.url} download className="btn btn-secondary btn-sm">Download<span className="btn__icon"><IconArrowUpRight /></span></a>
              <span className="studio-result__credits"><IconBolt /> {result.creditsUsed} credits</span>
            </div>
          </div>
        )}
        {!loading && !result && !error && (
          <div className="studio-empty"><div className="studio-empty__icon"><IconCrown /></div><h3>AI Influencer Studio</h3><p>Build consistent AI personas for social media.</p></div>
        )}
      </div>
    </div>
  );
}