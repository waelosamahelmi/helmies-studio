"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PromptComposer, ModelSelector, CostQuote, GenerateButton,
  AssetPicker, StagedProgress, BasicAdvancedToggle,
} from "./StudioComponents";
import { IconImage, IconSparkle, IconClose, IconCamera, IconBolt, IconArrowUpRight } from "@/components/Icons";
import { IMAGE_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import Link from "next/link";

const EASE = [0.32, 0.72, 0, 1];

const V2_MODELS = IMAGE_MODELS.map((m) => ({
  id: m.id,
  displayName: m.name,
  provider: m.provider,
  speedTier: m.id.includes("schnell") || m.id.includes("fast") ? "fast" : m.id.includes("pro") || m.id.includes("ultra") ? "premium" : "standard",
  credits: 0,
  aspectRatios: m.aspectRatios,
  resolutions: m.resolutions,
  hasDimensions: m.hasDimensions,
  endpoint: m.endpoint,
}));

export default function ImageStudioV2() {
  const [mode, setMode] = useState("basic");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [model, setModel] = useState(V2_MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeed] = useState(null);
  const [references, setReferences] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [showQuote, setShowQuote] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  const currentModel = V2_MODELS.find((m) => m.id === model) || V2_MODELS[0];
  const { cost: estCredits, affordable, balance, shortfall, topUpPacks } = useCreditCost("image", model, {
    aspect_ratio: aspectRatio, resolution, width, height, image_url: imageUrl,
  });

  // Keep resolution within the model's supported tiers; models without a
  // `resolutions` list ignore the value, so fall back to "1k".
  useEffect(() => {
    const tiers = currentModel.resolutions;
    if (!tiers || tiers.length === 0) return;
    if (!tiers.map((t) => String(t).toLowerCase()).includes(String(resolution).toLowerCase())) {
      setResolution(tiers[0]);
    }
  }, [currentModel, resolution]);

  const handleAddRefs = useCallback((files) => {
    const newRefs = Array.from(files).map((f, i) => ({
      id: `ref_${Date.now()}_${i}`,
      file: f,
      url: URL.createObjectURL(f),
      role: i === 0 ? "product" : "reference",
    }));
    setReferences((prev) => [...prev, ...newRefs].slice(0, 4));
  }, []);

  const handleRemoveRef = useCallback((id) => {
    setReferences((prev) => {
      const r = prev.find((x) => x.id === id);
      if (r?.url) URL.revokeObjectURL(r.url);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const handleUpload = async (files) => {
    const file = files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
    } catch {}
  };

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    setShowQuote(false);
    setGenStage("preparing");
    submit("image", model, {
      endpoint: currentModel.endpoint || model,
      prompt,
      negative_prompt: negativePrompt || undefined,
      aspect_ratio: aspectRatio,
      resolution,
      width,
      height,
      image_url: imageUrl || undefined,
      seed: seed != null ? seed : undefined,
    });
  }, [prompt, negativePrompt, model, aspectRatio, resolution, width, height, imageUrl, seed, submit, currentModel]);

  const ASPECTS = currentModel.aspectRatios || ["1:1", "4:5", "9:16", "16:9", "3:2", "2:3"];
  const RESOLUTIONS = currentModel.resolutions || ["1k", "2k", "4k"];
  const credits = estCredits || 0;

  return (
    <div className="studio__workspace">
      <div className="studio__workspace-body">
        <aside className="studio__pane studio__pane--left">
          <BasicAdvancedToggle mode={mode} onChange={setMode} />

          <div className="studio__section">
            <h3 className="studio__section-title">Model</h3>
            <ModelSelector models={V2_MODELS} selected={model} onSelect={setModel} recommended={V2_MODELS[0].id} />
          </div>

          <div className="studio__section">
            <h3 className="studio__section-title">References</h3>
            <AssetPicker assets={references} max={4} onAdd={handleAddRefs} onRemove={handleRemoveRef} />
          </div>

          <div className="studio__section">
            <h3 className="studio__section-title">Aspect Ratio</h3>
            <div className="studio__chip-group">
              {ASPECTS.map((a) => (
                <button key={a} onClick={() => setAspectRatio(a)} className={`studio__chip ${aspectRatio === a ? "studio__chip--active" : ""}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          {currentModel.hasDimensions && (
            <div className="studio__section">
              <h3 className="studio__section-title">Dimensions</h3>
              <div className="studio__field">
                <label>Width</label>
                <input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value) || 1024)} step={64} min={128} max={2048} className="studio__input" />
              </div>
              <div className="studio__field">
                <label>Height</label>
                <input type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value) || 1024)} step={64} min={128} max={2048} className="studio__input" />
              </div>
            </div>
          )}

          {!currentModel.hasDimensions && RESOLUTIONS.length > 0 && (
            <div className="studio__section">
              <h3 className="studio__section-title">Resolution</h3>
              <div className="studio__chip-group">
                {RESOLUTIONS.map((r) => (
                  <button key={r} onClick={() => setResolution(r)} className={`studio__chip ${resolution === r ? "studio__chip--active" : ""}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "advanced" && (
            <div className="studio__section">
              <h3 className="studio__section-title">Advanced</h3>
              <div className="studio__field">
                <label>Seed</label>
                <input type="number" value={seed ?? ""} onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : null)} placeholder="Random" className="studio__input" />
              </div>
            </div>
          )}
        </aside>

        <main className="studio__pane studio__pane--center">
          {error && <div className="studio__error">{error}</div>}
          {generating ? (
            <StagedProgress stage={genStage || "preparing"} progress={Math.min(elapsed / 30, 0.95)} message="Creating your image..." />
          ) : result?.url ? (
            <div className="studio__result">
              <img src={result.url} alt="Generated" className="studio__result-img" />
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
              <IconImage style={{ width: 64, height: 64, opacity: 0.3 }} />
              <h2>Image Studio</h2>
              <p>Describe your image, add references, choose a model.</p>
              <p className="studio__idle-modes">T2I · I2I · Edit · Inpaint · Canvas · Multi-Reference</p>
            </div>
          )}
        </main>

        <AnimatePresence>
          {showInspector && (
            <motion.aside
              className="studio__pane studio__pane--right"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div className="studio__section">
                <div className="studio__inspector-header">
                  <h3 className="studio__section-title">Inspector</h3>
                  <button onClick={() => setShowInspector(false)} className="studio__link"><IconClose /></button>
                </div>

                {result?.url ? (
                  <>
                    <div className="studio__inspector-rows">
                      <div className="studio__inspector-row"><span>Model</span><span>{currentModel.displayName}</span></div>
                      <div className="studio__inspector-row"><span>Aspect</span><span>{aspectRatio}</span></div>
                      <div className="studio__inspector-row"><span>Cost</span><span className="studio__text-green">{result.creditsUsed || estCredits} cr</span></div>
                      <div className="studio__inspector-row"><span>Status</span><span className="studio__text-green">Complete</span></div>
                    </div>
                    <div className="studio__section">
                      <h3 className="studio__section-title">Prompt</h3>
                      <p className="studio__inspector-prompt">{prompt}</p>
                      {negativePrompt && <p className="studio__inspector-prompt studio__inspector-prompt--neg">{negativePrompt}</p>}
                    </div>
                    <div className="studio__agent-box">
                      <IconSparkle />
                      <input type="text" placeholder="Make this more cinematic..." className="studio__input" />
                    </div>
                  </>
                ) : (
                  <p className="studio__inspector-hint">Inspector shows job details after generation.</p>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {!showInspector && (
          <button onClick={() => setShowInspector(true)} className="studio__inspector-toggle">
            <IconCamera />
          </button>
        )}
      </div>

      <div className="studio__bottombar">
        {showQuote ? (
          <CostQuote estimated={credits} maximum={Math.ceil(credits * 1.15)} balance={balance} onGenerate={handleGenerate} onCancel={() => setShowQuote(false)} generating={generating} />
        ) : (
          <div className="studio__bottombar-inner">
            <PromptComposer
              value={prompt}
              onChange={setPrompt}
              negativeValue={negativePrompt}
              onNegativeChange={setNegativePrompt}
              showNegative={mode === "advanced"}
            />
            <GenerateButton
              onClick={() => setShowQuote(true)}
              disabled={!prompt.trim() || !affordable}
              generating={generating}
              stage={genStage}
              credits={credits}
            />
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
