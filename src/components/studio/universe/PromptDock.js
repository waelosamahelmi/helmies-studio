"use client";

import { IconSparkle, IconBolt } from "@/components/Icons";

export default function PromptDock({ value, onChange, onEnhance, onGenerate, disabled, generating, credits, children }) {
  return (
    <section className="universe-prompt-dock">
      <textarea value={value} onChange={(event) => onChange?.(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !disabled) onGenerate?.(); }} placeholder="Direct the output with a precise creative brief" />
      <div className="universe-prompt-dock__actions"><div>{children}<button onClick={onEnhance} className="universe-button universe-button--quiet"><IconSparkle /> Enhance</button></div><button onClick={onGenerate} disabled={disabled || generating} className="universe-button universe-button--primary"><IconSparkle /> {generating ? "Generating" : "Generate"}{credits ? <small><IconBolt /> {credits}</small> : null}</button></div>
    </section>
  );
}
