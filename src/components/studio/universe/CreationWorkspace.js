"use client";

import ModelBrowser from "./ModelBrowser";
import ReferenceConstellation from "./ReferenceConstellation";
import PromptDock from "./PromptDock";
import GenerationField from "./GenerationField";
import GenerationResult from "./GenerationResult";
import ContextInspector from "./ContextInspector";

export default function CreationWorkspace({ title, description, type = "image", prompt, onPromptChange, models = [], model, onModelChange, references = [], onAddReferences, onRemoveReference, generating, phase, elapsed, result, error, credits, onGenerate, onEnhance, onRetry, children }) {
  return <div className="universe-workspace">
    <main className="universe-stage">
      {error && <div className="universe-error" role="alert">{error}</div>}
      {generating ? <GenerationField phase={phase} elapsed={elapsed} model={models.find((item) => item.id === model)?.displayName || model} /> : result ? <GenerationResult result={result} type={type} model={model} elapsed={elapsed} onRetry={onRetry || onGenerate} /> : <div className="universe-empty"><span>Creative instrument</span><h1>{title}</h1><p>{description}</p></div>}
    </main>
    <ReferenceConstellation assets={references} onAdd={onAddReferences} onRemove={onRemoveReference} />
    <ContextInspector title={`${title} intelligence`}><ModelBrowser models={models} selected={model} onSelect={onModelChange} />{children}</ContextInspector>
    {!generating && <PromptDock value={prompt} onChange={onPromptChange} onEnhance={onEnhance} onGenerate={onGenerate} disabled={!prompt?.trim()} credits={credits} />}
  </div>;
}

export function withUniverseCreation(Component, { tool }) {
  function UniverseCreationAdapter(props) { return <div className={`universe-adapted universe-adapted--${tool}`}><Component {...props} /></div>; }
  UniverseCreationAdapter.displayName = `UniverseCreation(${Component.displayName || Component.name || tool})`;
  return UniverseCreationAdapter;
}
