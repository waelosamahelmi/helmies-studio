"use client";

import { useState, useCallback } from "react";
import { PromptComposer, GenerateButton, StagedProgress, CostQuote, ModelSelector } from "./StudioComponents";
import { IconVideo, IconBolt, IconArrowUpRight } from "@/components/Icons";
import { VIDEO_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import Link from "next/link";
import { useEffect } from "react";
import { useModelCatalog } from "./useModelCatalog";

const EASE = [0.32, 0.72, 0, 1];

const V2_MODELS = VIDEO_MODELS.map((m) => ({
  id: m.id,
  displayName: m.name,
  provider: m.provider,
  speedTier: m.id.includes("fast") ? "fast" : m.id.includes("pro") ? "premium" : "standard",
  credits: 0,
  aspectRatios: m.aspectRatios,
  durations: m.durations,
  endpoint: m.endpoint,
}));

export default function VideoStudioV2() {
  const { models: catalogModels } = useModelCatalog({ modelType: "video", fallback: V2_MODELS });
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(V2_MODELS[0].id);
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [showQuote, setShowQuote] = useState(false);
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  const currentModel = catalogModels.find((m) => m.id === model) || catalogModels[0] || V2_MODELS[0];
  const { cost: estCredits, affordable, balance, shortfall, topUpPacks } = useCreditCost("video", model, {
    duration, resolution, aspect_ratio: aspectRatio,
  });

  const handleGenerate = useCallback(() => {
    setShowQuote(false);
    setGenStage("preparing");
    submit("video", model, {
      endpoint: currentModel.endpoint || model,
      prompt,
      duration,
      resolution,
      aspect_ratio: aspectRatio,
    });
  }, [prompt, model, duration, resolution, aspectRatio, submit, currentModel]);

  const credits = estCredits || 0;
  const DURATIONS = currentModel.durations || [3, 5, 10, 15];
  const ASPECTS = currentModel.aspectRatios || ["16:9", "9:16", "1:1"];
  const RESOLUTIONS = currentModel.resolutions || ["720p"];

  useEffect(() => {
    if (catalogModels.length && !catalogModels.some((item) => item.id === model)) setModel(catalogModels[0].id);
  }, [catalogModels, model]);

  useEffect(() => {
    if (RESOLUTIONS.length && !RESOLUTIONS.includes(resolution)) setResolution(RESOLUTIONS[0]);
  }, [currentModel, resolution]);

  return (
    <div className="studio__workspace">
      <div className="studio__workspace-body">
        <aside className="studio__pane studio__pane--left">
          <div className="studio__section">
            <h3 className="studio__section-title">Model</h3>
            <ModelSelector models={catalogModels} selected={model} onSelect={setModel} recommended={catalogModels[0]?.id} />
          </div>

          <div className="studio__section">
            <h3 className="studio__section-title">Duration</h3>
            <div className="studio__chip-group">
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => setDuration(d)} className={`studio__chip ${duration === d ? "studio__chip--active" : ""}`}>{d}s</button>
              ))}
            </div>
          </div>

          <div className="studio__section">
            <h3 className="studio__section-title">Aspect Ratio</h3>
            <div className="studio__chip-group">
              {ASPECTS.map((a) => (
                <button key={a} onClick={() => setAspectRatio(a)} className={`studio__chip ${aspectRatio === a ? "studio__chip--active" : ""}`}>{a}</button>
              ))}
            </div>
          </div>

          <div className="studio__section">
            <h3 className="studio__section-title">Resolution</h3>
            <div className="studio__chip-group">
              {RESOLUTIONS.map((value) => (
                <button key={value} onClick={() => setResolution(value)} className={`studio__chip ${resolution === value ? "studio__chip--active" : ""}`}>{value}</button>
              ))}
            </div>
          </div>
        </aside>

        <main className="studio__pane studio__pane--center">
          {error && <div className="studio__error">{error}</div>}
          {generating ? (
            <StagedProgress stage={genStage || "preparing"} progress={Math.min(elapsed / 60, 0.95)} message="Creating your video..." />
          ) : result?.url ? (
            <div className="studio__result">
              <video src={result.url} controls autoPlay loop className="studio__result-video" />
              <div className="studio__result-actions">
                <button className="studio__chip" onClick={handleGenerate}>Retry</button>
                <a href={result.url} download className="studio__chip">
                  Download <IconArrowUpRight style={{ width: 12, height: 12 }} />
                </a>
                {result.creditsUsed && (
                  <span className="studio__result-credits"><IconBolt style={{ width: 12, height: 12 }} /> {result.creditsUsed} credits</span>
                )}
              </div>
            </div>
          ) : (
            <div className="studio__idle">
              <IconVideo style={{ width: 64, height: 64, opacity: 0.3 }} />
              <h2>Video Studio</h2>
              <p>Describe your video and generate cinematic motion.</p>
              <p className="studio__idle-modes">T2V · I2V · First/Last Frame · Extend · Cinematic</p>
            </div>
          )}
        </main>
      </div>

      <div className="studio__bottombar">
        {showQuote ? (
          <CostQuote estimated={credits} maximum={Math.ceil(credits * 1.15)} balance={balance} onGenerate={handleGenerate} onCancel={() => setShowQuote(false)} generating={generating} />
        ) : (
          <div className="studio__bottombar-inner">
            <PromptComposer value={prompt} onChange={setPrompt} placeholder="Describe the video you want to create..." />
            <GenerateButton onClick={() => setShowQuote(true)} disabled={!prompt.trim() || !affordable} generating={generating} stage={genStage} credits={credits} />
          </div>
        )}
      </div>
      {!affordable && credits > 0 && (
        <div className="studio__cost-warning">
          <p>Insufficient credits. Need {credits} (shortfall: {shortfall}).</p>
          {topUpPacks.length > 0 && (
            <div className="studio__topup-packs">
              {topUpPacks.slice(0, 2).map((p) => (
                <Link key={p.id} href={`/pricing?pack=${p.id}`} className="btn btn-sm btn-secondary">
                  Top up {p.credits} credits — {p.price}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
