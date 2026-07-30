"use client";

import { useMemo, useState } from "react";
import { IconSearch, IconBolt, IconClose } from "@/components/Icons";

const list = (value) => Array.isArray(value) ? value : [];
const modelImage = (model) => model.backgroundImage || model.image || model.thumbnailUrl || "/images/studio/model-default.webp";

export default function ModelBrowser({ models = [], selected, onSelect, open = true, onClose, recommendation }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const providers = useMemo(() => [...new Set(models.map((m) => m.provider).filter(Boolean))], [models]);
  const filtered = useMemo(() => models.filter((model) => {
    const text = `${model.displayName || model.name || model.id} ${model.provider || ""} ${list(model.capabilities).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (provider === "all" || model.provider === provider);
  }), [models, provider, query]);
  if (!open) return null;

  return (
    <section className="universe-models" aria-label="Choose a model">
      <header className="universe-models__header">
        <div><span>Model intelligence</span><h2>Choose the right engine</h2></div>
        {onClose && <button onClick={onClose} aria-label="Close model browser"><IconClose /></button>}
      </header>
      <div className="universe-models__filters">
        <label><IconSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models and capabilities" /></label>
        <select value={provider} onChange={(event) => setProvider(event.target.value)} aria-label="Filter by provider">
          <option value="all">All providers</option>{providers.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <div className="universe-models__grid">
        {filtered.map((model) => {
          const id = model.id;
          const resolutions = list(model.resolutions);
          const durations = list(model.durations);
          const aspectRatios = list(model.aspectRatios);
          const requirements = model.requirements || model.inputSchema || {};
          const pricingBasis = model.pricingBasis || model.pricing?.basis || (durations.length ? "per second" : "per output");
          return (
            <button key={id} className={`universe-model-card ${selected === id ? "is-selected" : ""}`} onClick={() => onSelect?.(id)}>
              <span className="universe-model-card__art" style={{ backgroundImage: `linear-gradient(180deg, transparent, rgba(9,7,12,.94)), url("${modelImage(model)}")` }} />
              <span className="universe-model-card__body">
                <span className="universe-model-card__provider">{model.provider || "Provider"}</span>
                <strong>{model.displayName || model.name || id}</strong>
                <small>{model.description || list(model.capabilities).join(" · ") || "Creative generation model"}</small>
                <span className="universe-model-card__specs">
                  {resolutions.length > 0 && <i>{resolutions.slice(0, 3).join(" / ")}</i>}
                  {durations.length > 0 && <i>{durations.slice(0, 3).join(" / ")} sec</i>}
                  {aspectRatios.length > 0 && <i>{aspectRatios.slice(0, 3).join(" / ")}</i>}
                </span>
                <span className="universe-model-card__foot"><span><IconBolt /> {model.credits || model.estimatedCredits || "Quote"}</span><span>{pricingBasis}</span></span>
                {recommendation === id && <em>Recommended for these inputs</em>}
                <span hidden>{JSON.stringify(requirements)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
