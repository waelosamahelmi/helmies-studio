"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CreationWorkspace from "./universe/CreationWorkspace";
import { IMAGE_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";
import { IconBolt, IconImage, IconSparkle } from "@/components/Icons";

const FALLBACK_MODELS = IMAGE_MODELS.map((item) => ({ ...item, displayName: item.name, credits: 0 }));

export default function ImageStudioV2({ initialModel }) {
  const [mode, setMode] = useState("basic");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const { models: catalogModels } = useModelCatalog({ modelType: "image", fallback: FALLBACK_MODELS });
  const [model, setModel] = useState(initialModel || FALLBACK_MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeed] = useState(null);
  const [references, setReferences] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showQuote, setShowQuote] = useState(false);
  const sourceInput = useRef(null);
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = catalogModels.find((item) => item.id === model) || catalogModels[0] || FALLBACK_MODELS[0];
  const { cost: estCredits, affordable, balance, shortfall, topUpPacks } = useCreditCost("image", model, { aspect_ratio: aspectRatio, resolution, width, height, image_url: imageUrl });

  useEffect(() => { if (catalogModels.length && !catalogModels.some((item) => item.id === model)) setModel(catalogModels[0].id); }, [catalogModels, model]);
  useEffect(() => {
    const tiers = currentModel.resolutions || [];
    if (tiers.length && !tiers.some((tier) => String(tier).toLowerCase() === String(resolution).toLowerCase())) setResolution(tiers[0]);
  }, [currentModel, resolution]);

  const handleAddRefs = useCallback((files) => {
    const additions = Array.from(files || []).map((file, index) => ({ id: `ref_${Date.now()}_${index}`, file, url: URL.createObjectURL(file), role: index === 0 ? "style" : "reference" }));
    setReferences((previous) => [...previous, ...additions].slice(0, 4));
  }, []);
  const handleRemoveRef = useCallback((id) => setReferences((previous) => { const removed = previous.find((item) => item.id === id); if (removed?.url) URL.revokeObjectURL(removed.url); return previous.filter((item) => item.id !== id); }), []);
  const handleUpload = async (files) => {
    const file = files?.[0]; if (!file) return;
    setUploading(true); setUploadError("");
    const body = new FormData(); body.append("file", file);
    try { const response = await apiFetch("/api/upload", { method: "POST", body }); const data = await response.json(); if (!response.ok || !data.url) throw new Error(data.error || "Upload failed"); setImageUrl(data.url); setReferences((previous) => [{ id: "source-image", url: data.url, role: "source" }, ...previous.filter((item) => item.id !== "source-image")].slice(0, 4)); }
    catch (uploadFailure) { setUploadError(uploadFailure.message); }
    finally { setUploading(false); }
  };
  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !affordable) return;
    setShowQuote(false);
    submit("image", model, { endpoint: currentModel.endpoint || model, prompt, negative_prompt: negativePrompt || undefined, aspect_ratio: aspectRatio, resolution, width, height, image_url: imageUrl || undefined, seed: seed ?? undefined, reference_urls: references.map((item) => item.url).filter(Boolean) });
  }, [affordable, aspectRatio, currentModel, height, imageUrl, model, negativePrompt, prompt, references, resolution, seed, submit, width]);

  const aspects = currentModel.aspectRatios?.length ? currentModel.aspectRatios : ["1:1", "4:5", "9:16", "16:9", "3:2", "2:3"];
  const resolutions = currentModel.resolutions?.length ? currentModel.resolutions : ["1k", "2k", "4k"];
  const credits = estCredits || 0;

  return (
    <CreationWorkspace title="Image Studio" description="Compose an image with a precise brief, visual references, and a model matched to the intended format." type="image" prompt={prompt} onPromptChange={setPrompt} models={catalogModels} model={model} onModelChange={setModel} references={references} onAddReferences={handleAddRefs} onRemoveReference={handleRemoveRef} generating={generating} phase="generating" elapsed={elapsed} result={result} error={error || uploadError} credits={credits} onGenerate={() => setShowQuote(true)} onRetry={handleGenerate} disabled={!prompt.trim() || !affordable} promptChildren={<button type="button" className="universe-button universe-button--quiet" onClick={() => setMode((value) => value === "basic" ? "advanced" : "basic")}><IconSparkle /> {mode === "basic" ? "Advanced controls" : "Basic controls"}</button>}>
      <section className="image-intelligence">
        <div className="image-intelligence__mode"><button type="button" className={mode === "basic" ? "is-active" : ""} onClick={() => setMode("basic")}>Basic</button><button type="button" className={mode === "advanced" ? "is-active" : ""} onClick={() => setMode("advanced")}>Advanced</button></div>
        <div className="image-intelligence__group"><header><span>Composition</span><small>{aspectRatio}</small></header><div className="image-intelligence__chips">{aspects.map((value) => <button type="button" key={value} className={aspectRatio === value ? "is-active" : ""} onClick={() => setAspectRatio(value)}>{value}</button>)}</div></div>
        {currentModel.hasDimensions ? <div className="image-intelligence__group"><header><span>Dimensions</span><small>pixels</small></header><div className="image-intelligence__dimensions"><label>Width<input type="number" min="128" max="2048" step="64" value={width} onChange={(event) => setWidth(Number(event.target.value) || 1024)} /></label><label>Height<input type="number" min="128" max="2048" step="64" value={height} onChange={(event) => setHeight(Number(event.target.value) || 1024)} /></label></div></div> : <div className="image-intelligence__group"><header><span>Resolution</span><small>{resolution}</small></header><div className="image-intelligence__chips">{resolutions.map((value) => <button type="button" key={value} className={String(resolution).toLowerCase() === String(value).toLowerCase() ? "is-active" : ""} onClick={() => setResolution(value)}>{value}</button>)}</div></div>}
        <div className="image-intelligence__group"><header><span>Source image</span><small>{imageUrl ? "Ready" : "Optional"}</small></header><button type="button" className="image-intelligence__source" onClick={() => sourceInput.current?.click()}>{imageUrl ? <img src={imageUrl} alt="Uploaded source" /> : <IconImage />}<span>{uploading ? "Uploading source" : imageUrl ? "Replace source image" : "Upload source image"}</span></button><input ref={sourceInput} type="file" accept="image/*" hidden onChange={(event) => handleUpload(event.target.files)} /></div>
        {mode === "advanced" && <div className="image-intelligence__advanced"><label>Negative direction<textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="Elements, styles, or artifacts to avoid" /></label><label>Seed<input type="number" value={seed ?? ""} onChange={(event) => setSeed(event.target.value ? Number(event.target.value) : null)} placeholder="Random" /></label></div>}
        <dl className="image-intelligence__quote"><div><dt>Estimated cost</dt><dd><IconBolt /> {credits || "Quote pending"}</dd></div><div><dt>Available</dt><dd>{balance ?? "—"}</dd></div><div><dt>Model basis</dt><dd>{currentModel.pricingBasis || currentModel.pricing?.basis || "Per output"}</dd></div></dl>
        {!affordable && credits > 0 && <div className="image-intelligence__warning"><strong>{shortfall} more credits required</strong>{topUpPacks.slice(0, 1).map((pack) => <Link key={pack.id} href={`/pricing?pack=${pack.id}`}>Add {pack.credits} credits</Link>)}</div>}
        {showQuote && <div className="image-intelligence__confirm"><span>Generation quote</span><strong>{credits} credits</strong><p>The final charge is settled from the completed provider task.</p><div><button type="button" onClick={() => setShowQuote(false)}>Cancel</button><button type="button" onClick={handleGenerate}>Confirm generation</button></div></div>}
      </section>
    </CreationWorkspace>
  );
}
