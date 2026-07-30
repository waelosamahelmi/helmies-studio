"use client";

import { useState } from "react";

import ModelBrowser from "./ModelBrowser";
import ReferenceConstellation from "./ReferenceConstellation";
import PromptDock from "./PromptDock";
import GenerationField from "./GenerationField";
import GenerationResult from "./GenerationResult";
import ContextInspector from "./ContextInspector";

export default function CreationWorkspace({ title, description, type = "image", prompt, onPromptChange, models = [], model, onModelChange, references = [], onAddReferences, onRemoveReference, generating, phase, elapsed, result, error, credits, onGenerate, onEnhance, onRetry, onResultReference, disabled, promptChildren, children }) {
  const [modelBrowserOpen, setModelBrowserOpen] = useState(false);
  const currentModel = models.find((item) => item.id === model) || models[0];
  return <div className="universe-workspace">
    <main className="universe-stage">
      {error && <div className="universe-error" role="alert">{error}</div>}
      {generating ? <GenerationField phase={phase} elapsed={elapsed} model={currentModel?.displayName || currentModel?.name || model} /> : result ? <GenerationResult result={result} type={type} model={currentModel?.displayName || currentModel?.name || model} elapsed={elapsed} onRetry={onRetry || onGenerate} onReference={onResultReference} /> : <div className="universe-empty"><span>Creative instrument</span><h1>{title}</h1><p>{description}</p></div>}
    </main>
    <ReferenceConstellation assets={references} onAdd={onAddReferences} onRemove={onRemoveReference} />
    <ContextInspector title={`${title} intelligence`}><button className="universe-model-summary" type="button" onClick={() => setModelBrowserOpen(true)}><span className="universe-model-summary__art" style={{ backgroundImage: `linear-gradient(90deg,rgba(9,7,12,.2),rgba(9,7,12,.95)),url(${currentModel?.backgroundImage || currentModel?.image || "/images/studio/model-default.webp"})` }} /><span><small>{currentModel?.provider || "Generation model"}</small><strong>{currentModel?.displayName || currentModel?.name || model}</strong><em>Browse and compare models</em></span></button>{children}</ContextInspector>
    {modelBrowserOpen && <div className="universe-model-browser-layer"><button className="universe-model-browser-layer__backdrop" aria-label="Close model browser" onClick={() => setModelBrowserOpen(false)} /><ModelBrowser models={models} selected={model} onSelect={(value) => { onModelChange?.(value); setModelBrowserOpen(false); }} onClose={() => setModelBrowserOpen(false)} /></div>}
    {!generating && <PromptDock value={prompt} onChange={onPromptChange} onEnhance={onEnhance} onGenerate={onGenerate} disabled={disabled ?? !prompt?.trim()} credits={credits}>{promptChildren}</PromptDock>}
  </div>;
}

export function withUniverseCreation(Component, { tool }) {
  function UniverseCreationAdapter(props) { return <div className={`universe-adapted universe-adapted--${tool}`}><Component {...props} /></div>; }
  UniverseCreationAdapter.displayName = `UniverseCreation(${Component.displayName || Component.name || tool})`;
  return UniverseCreationAdapter;
}
