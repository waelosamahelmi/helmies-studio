"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CreationWorkspace from "./universe/CreationWorkspace";
import { VIDEO_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";
import { IconBolt } from "@/components/Icons";

const FALLBACK_MODELS = VIDEO_MODELS.map((item) => ({ ...item, displayName: item.name, credits: 0 }));

export default function VideoStudioV2({ initialModel }) {
  const { models: catalogModels } = useModelCatalog({ modelType: "video", fallback: FALLBACK_MODELS });
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(initialModel || FALLBACK_MODELS[0].id);
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [cameraMotion, setCameraMotion] = useState("model-choice");
  const [references, setReferences] = useState([]);
  const [showQuote, setShowQuote] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = catalogModels.find((item) => item.id === model) || catalogModels[0] || FALLBACK_MODELS[0];
  const { cost: estCredits, affordable, balance, shortfall, topUpPacks } = useCreditCost("video", model, { duration, resolution, aspect_ratio: aspectRatio });

  const durations = currentModel.durations?.length ? currentModel.durations : [3, 5, 10, 15];
  const aspects = currentModel.aspectRatios?.length ? currentModel.aspectRatios : ["16:9", "9:16", "1:1"];
  const resolutions = currentModel.resolutions?.length ? currentModel.resolutions : ["720p"];
  const credits = estCredits || 0;

  useEffect(() => { if (catalogModels.length && !catalogModels.some((item) => item.id === model)) setModel(catalogModels[0].id); }, [catalogModels, model]);
  useEffect(() => { if (durations.length && !durations.map(Number).includes(Number(duration))) setDuration(Number(durations[0])); }, [currentModel]);
  useEffect(() => { if (resolutions.length && !resolutions.some((value) => String(value).toLowerCase() === String(resolution).toLowerCase())) setResolution(resolutions[0]); }, [currentModel, resolution]);

  const uploadFrame = useCallback(async (file, role) => {
    const localId = `${role}-${Date.now()}`;
    setReferences((previous) => [...previous.filter((item) => item.role !== role), { id: localId, role, url: URL.createObjectURL(file), uploading: true }].slice(0, 4));
    const body = new FormData(); body.append("file", file);
    try { const response = await apiFetch("/api/upload", { method: "POST", body }); const data = await response.json(); if (!response.ok || !data.url) throw new Error(data.error || "Frame upload failed"); setReferences((previous) => previous.map((item) => item.id === localId ? { ...item, url: data.url, uploading: false } : item)); }
    catch (failure) { setUploadError(failure.message); setReferences((previous) => previous.filter((item) => item.id !== localId)); }
  }, []);
  const handleAddRefs = useCallback((files) => { Array.from(files || []).slice(0, 2).forEach((file, index) => uploadFrame(file, references.some((item) => item.role === "first frame") || index ? "last frame" : "first frame")); }, [references, uploadFrame]);
  const handleRemoveRef = useCallback((id) => setReferences((previous) => previous.filter((item) => item.id !== id)), []);
  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !affordable) return;
    setShowQuote(false);
    const firstFrame = references.find((item) => item.role === "first frame" && !item.uploading)?.url;
    const lastFrame = references.find((item) => item.role === "last frame" && !item.uploading)?.url;
    submit("video", model, { endpoint: currentModel.endpoint || model, prompt, duration, resolution, aspect_ratio: aspectRatio, image_url: firstFrame, first_frame_url: firstFrame, last_frame_url: lastFrame, camera_motion: cameraMotion === "model-choice" ? undefined : cameraMotion });
  }, [affordable, aspectRatio, cameraMotion, currentModel, duration, model, prompt, references, resolution, submit]);

  return (
    <CreationWorkspace title="Video Studio" description="Direct motion from text or frames with duration-aware pricing and model compatibility visible before generation." type="video" prompt={prompt} onPromptChange={setPrompt} models={catalogModels} model={model} onModelChange={setModel} references={references} onAddReferences={handleAddRefs} onRemoveReference={handleRemoveRef} generating={generating} phase="generating" elapsed={elapsed} result={result} error={error || uploadError} credits={credits} onGenerate={() => setShowQuote(true)} onRetry={handleGenerate} disabled={!prompt.trim() || !affordable || references.some((item) => item.uploading)}>
      <section className="image-intelligence video-intelligence">
        <div className="image-intelligence__group"><header><span>Duration</span><small>{duration} seconds</small></header><div className="image-intelligence__chips">{durations.map((value) => <button type="button" key={value} className={Number(duration) === Number(value) ? "is-active" : ""} onClick={() => setDuration(Number(value))}>{value}s</button>)}</div></div>
        <div className="image-intelligence__group"><header><span>Frame format</span><small>{aspectRatio}</small></header><div className="image-intelligence__chips">{aspects.map((value) => <button type="button" key={value} className={aspectRatio === value ? "is-active" : ""} onClick={() => setAspectRatio(value)}>{value}</button>)}</div></div>
        <div className="image-intelligence__group"><header><span>Resolution</span><small>{resolution}</small></header><div className="image-intelligence__chips">{resolutions.map((value) => <button type="button" key={value} className={String(resolution).toLowerCase() === String(value).toLowerCase() ? "is-active" : ""} onClick={() => setResolution(value)}>{value}</button>)}</div></div>
        <div className="image-intelligence__group"><header><span>Camera motion</span><small>Direction</small></header><select className="video-intelligence__select" value={cameraMotion} onChange={(event) => setCameraMotion(event.target.value)}><option value="model-choice">Let the model decide</option><option value="push-in">Slow push in</option><option value="pull-out">Controlled pull out</option><option value="orbit-left">Orbit left</option><option value="orbit-right">Orbit right</option><option value="locked">Locked camera</option></select></div>
        <div className="video-intelligence__roles"><span>Reference roles</span><p>The first uploaded image becomes the opening frame. A second image becomes the final frame when the selected model supports interpolation.</p></div>
        <dl className="image-intelligence__quote"><div><dt>Estimated cost</dt><dd><IconBolt /> {credits || "Quote pending"}</dd></div><div><dt>Pricing unit</dt><dd>{currentModel.pricingBasis || currentModel.pricing?.basis || "Per second"}</dd></div><div><dt>Available</dt><dd>{balance ?? "—"}</dd></div></dl>
        {!affordable && credits > 0 && <div className="image-intelligence__warning"><strong>{shortfall} more credits required</strong>{topUpPacks.slice(0, 1).map((pack) => <Link key={pack.id} href={`/pricing?pack=${pack.id}`}>Add {pack.credits} credits</Link>)}</div>}
        {showQuote && <div className="image-intelligence__confirm"><span>Duration-aware quote</span><strong>{credits} credits</strong><p>{duration} seconds at {resolution}. Final cost settles from the completed task.</p><div><button type="button" onClick={() => setShowQuote(false)}>Cancel</button><button type="button" onClick={handleGenerate}>Confirm generation</button></div></div>}
      </section>
    </CreationWorkspace>
  );
}
