"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudioLayout, ModelSelector, PromptDock, StageArea } from "@/components/studio/v6";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";

/* ── Inline SVGs ── */
const IconImage = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21,15 16,10 5,21" />
  </svg>
);

const IconUpload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17,8 12,3 7,8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconCross = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconMaximize = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15,3 21,3 21,9" /><polyline points="9,21 3,21 3,15" />
    <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const IconSpark = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
  </svg>
);

const IconChevronDown = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6,9 12,15 18,9" />
  </svg>
);

/* ── Prompt suggestions ── */
const PROMPT_SUGGESTIONS = [
  "A cinematic portrait with soft golden light and shallow depth of field",
  "Abstract geometric composition, neon color palette, retro-wave aesthetic",
  "Moody landscape at golden hour, 35mm film grain, atmospheric haze",
  "Product photography on dark reflective surface, rim lighting",
  "Architectural interior with natural light, minimalist Scandinavian design",
  "Character concept art, fantasy illustration, detailed armor and textures",
];

/* ── Helpers ── */
function getModelDisplayName(model) {
  return model.displayName || model.name || model.id;
}

/** Parse aspect ratio into width/height numbers for visual indicator */
function parseAspectRatio(ar) {
  const parts = String(ar).split(":").map(Number);
  if (parts.length === 2 && parts[0] && parts[1]) return parts;
  return [16, 9];
}

/* ══════════════════════════════════════════════════════════════ */
export default function ImageStudio() {
  /* ── State ── */
  const [mode, setMode] = useState("tti");
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("2K");
  const [seed, setSeed] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  /* ── Drag-drop state ── */
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  /* ── Cost pulse ── */
  const [costPulse, setCostPulse] = useState(false);
  const prevCostRef = useRef(0);

  /* ── Before/after comparison ── */
  const [comparePos, setComparePos] = useState(50);
  const compareRef = useRef(null);

  /* ── Hooks ── */
  const isMobile = useIsMobile();
  const { loading: generating, result, error: genError, elapsed, submit } = useAsyncGeneration();
  const { models: allModels, loading } = useModelCatalog({ modelType: "image" });

  /* ── Model selection ── */
  const activeModels = useMemo(() => {
    if (!allModels?.length) return [];
    if (mode === "tti") return allModels.filter(m => m.capability === "text-to-image");
    return allModels.filter(m => m.capability === "image-to-image");
  }, [allModels, mode]);
  const currentModel = activeModels.find((m) => m.id === selectedModelId) || activeModels[0];

  useEffect(() => {
    if (activeModels?.length && !selectedModelId) {
      setSelectedModelId(activeModels[0]?.id);
    }
  }, [activeModels, selectedModelId]);

  /* ── Credit cost ── */
  const { cost: estCredits, affordable, balance, shortfall, topUpPacks } = useCreditCost(
    "image",
    currentModel?.id || "",
    {
      aspect_ratio: aspectRatio,
      resolution,
      image_url: referenceImage?.url || undefined,
    }
  );

  const cost = estCredits || 0;

  /* ── Cost pulse effect ── */
  useEffect(() => {
    if (prevCostRef.current !== 0 && cost !== prevCostRef.current) {
      setCostPulse(true);
      setTimeout(() => setCostPulse(false), 500);
    }
    prevCostRef.current = cost;
  }, [cost]);

  /* ── Sync model when mode changes ── */
  useEffect(() => {
    if (activeModels.length && !activeModels.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(activeModels[0].id);
    }
  }, [mode]);

  /* ── Derived ── */
  const allAspectRatios = currentModel?.aspectRatios?.length
    ? currentModel.aspectRatios
    : ["1:1", "4:5", "9:16", "16:9", "3:2", "2:3"];
  const resolutions = currentModel?.resolutions?.length
    ? currentModel.resolutions
    : ["1K", "2K", "4K"];
  const error = genError || uploadError;

  /* ── Comparison slider mouse handling ── */
  const handleCompareMouseDown = useCallback((e) => {
    e.preventDefault();
    const el = compareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const onMove = (ev) => {
      const x = ev.clientX - rect.left;
      setComparePos(Math.min(100, Math.max(0, (x / rect.width) * 100)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  /* ── Drag-drop handlers ── */
  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.types?.includes("Files")) setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  }, []);
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length) handleUpload(files);
  }, []);

  /* ── Handlers ── */
  const handleUpload = useCallback(async (files) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      setReferenceImage({ url: data.url, file });
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleClearReference = useCallback(() => {
    setReferenceImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !affordable) return;
    submit("image", currentModel?.id, {
      endpoint: currentModel?.endpoint || currentModel?.id,
      prompt,
      negative_prompt: negativePrompt || undefined,
      aspect_ratio: aspectRatio,
      resolution,
      image_url: referenceImage?.url || undefined,
      seed: seed ?? undefined,
    });
  }, [affordable, aspectRatio, currentModel, negativePrompt, prompt, referenceImage, resolution, seed, submit]);

  const handleModelSelect = useCallback((id) => {
    setSelectedModelId(id);
  }, []);

  const pickSuggestion = useCallback((s) => {
    setPrompt((prev) => prev ? `${prev}. ${s}` : s);
  }, []);

  /* ── Aspect ratio visual dimensions ── */
  const [arW, arH] = parseAspectRatio(aspectRatio);
  const arMaxDim = 32;
  const arScale = arMaxDim / Math.max(arW, arH);
  const arBoxW = Math.round(arW * arScale);
  const arBoxH = Math.round(arH * arScale);

  /* ── Has reference + result for comparison view ── */
  const showCompare = mode === "iti" && referenceImage?.url && result?.url && !generating;

  /* ── Render helpers ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Mode Toggle */}
      <div className="v6-field">
        <div className="v6-field-label">Mode</div>
        <div className="v6-segmented">
          <button
            className={mode === "tti" ? "v6-active" : ""}
            onClick={() => setMode("tti")}
          >
            Text → Image
          </button>
          <button
            className={mode === "iti" ? "v6-active" : ""}
            onClick={() => setMode("iti")}
          >
            Image → Image
          </button>
        </div>
      </div>

      {/* Aspect Ratio with visual indicator */}
      <div className="v6-field">
        <div className="v6-field-label">
          Aspect ratio
          <span className="v6-aspect-visual" style={{ marginLeft: 8, verticalAlign: "middle" }}>
            <span
              className="v6-aspect-box"
              style={{ display: "inline-block", width: arBoxW, height: arBoxH }}
            />
            <span className="v6-mono v6-tiny">{aspectRatio}</span>
          </span>
        </div>
        {isMobile ? (
          <MobileChipScroller items={allAspectRatios.map(ar => ({ label: ar, value: ar }))} selectedValue={aspectRatio} onSelect={setAspectRatio} />
        ) : (
          <div className="v6-chip-row">
            {allAspectRatios.map((ar) => (
              <button
                key={ar}
                className={`v6-chip${aspectRatio === ar ? " v6-active" : ""}`}
                onClick={() => setAspectRatio(ar)}
              >
                {ar}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resolution */}
      {!currentModel?.hasDimensions && (
        <div className="v6-field">
          <div className="v6-field-label">Resolution</div>
          {isMobile ? (
            <MobileChipScroller items={resolutions.map(r => ({ label: String(r).toUpperCase(), value: String(r).toLowerCase() }))} selectedValue={String(resolution).toLowerCase()} onSelect={setResolution} />
          ) : (
            <div className="v6-segmented">
              {resolutions.map((r) => (
                <button
                  key={r}
                  className={String(resolution).toLowerCase() === String(r).toLowerCase() ? "v6-active" : ""}
                  onClick={() => setResolution(r)}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Negative prompt */}
      <div className="v6-field">
        <label className="v6-field-label">Negative direction</label>
        <textarea
          className="v6-input v6-textarea"
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder="Elements, styles, or artifacts to avoid\u2026"
          rows={2}
        />
      </div>

      {/* Seed */}
      <div className="v6-field">
        <label className="v6-field-label">Seed</label>
        <input
          className="v6-input"
          type="number"
          value={seed ?? ""}
          onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : null)}
          placeholder="Random"
        />
      </div>

      {/* Reference image (ITI mode) */}
      {mode === "iti" && (
        <div className="v6-field">
          <div className="v6-field-label">Reference image</div>
          {referenceImage?.url ? (
            <div className="v6-upload-preview">
              <div className="v6-upload-preview-item">
                <img src={referenceImage.url} alt="Reference" />
                <button onClick={handleClearReference}><IconCross /></button>
              </div>
            </div>
          ) : (
            <button
              className="v6-drop"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading\u2026" : "Drop or click to upload"}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleUpload(e.target.files)}
          />
          {uploadError && (
            <span className="v6-muted v6-tiny" style={{ color: "var(--v6-bad)", marginTop: 4 }}>
              {uploadError}
            </span>
          )}
        </div>
      )}

      {/* Upload drop zone */}
      <button
        className="v6-drop"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{ minHeight: 54 }}
      >
        <IconUpload /> Upload source
      </button>
    </div>
  );

  /* ── Stage area (with drag-drop overlay for ITI) ── */
  const center = (
    <>
      {/* Drag-drop overlay on stage (ITI mode) */}
      {mode === "iti" && !generating && !result && (
        <div
          className={`v6-drop-zone${dragOver ? " v6-drag-over" : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ pointerEvents: dragOver ? "auto" : "none", zIndex: dragOver ? 11 : 10 }}
        >
          {!dragOver && referenceImage?.url && (
            <span className="v6-drop-zone-label">
              <IconUpload /> Drop an image to replace reference
            </span>
          )}
        </div>
      )}

      {/* Before/After comparison or normal stage */}
      {showCompare ? (
        <div className="v6-stage">
          <div className="v6-stage-grid" />
          <div className="v6-result-view v6-entrance-scale" style={{ padding: 0, background: "transparent", border: 0 }}>
            <div className="v6-compare-view" ref={compareRef}>
              <img src={referenceImage.url} alt="Before" />
              <div className="v6-compare-label v6-compare-before">Reference</div>
              <img
                src={result.url || result.outputUrl}
                alt="Generated"
                className="v6-compare-after"
                style={{ clipPath: `inset(0 0 0 ${comparePos}%)` }}
              />
              <div className="v6-compare-label v6-compare-after">Generated</div>
              <div
                className="v6-compare-slider"
                style={{ left: `${comparePos}%` }}
                onMouseDown={handleCompareMouseDown}
              />
            </div>
          </div>
        </div>
      ) : (
        <StageArea
          generating={generating}
          progress={null}
          stage={generating ? "generating" : undefined}
          model={currentModel?.name || currentModel?.id}
          quality={resolution}
          ratio={aspectRatio}
          result={result}
          resultTitle="Image generation"
          toolLabel="Image Studio"
          toolDesc="Compose an image with a precise brief, visual references, and a model matched to the intended format."
          toolIcon={<IconImage />}
          suggestions={PROMPT_SUGGESTIONS}
          onSuggestionClick={pickSuggestion}
          onNew={() => {
            setPrompt("");
            setReferenceImage(null);
          }}
          onDownload={() => {
            if (result?.url) window.open(result.url, "_blank");
          }}
          onCancel={() => {}}
        />
      )}

      {/* Prompt suggestions above dock */}
      {!generating && !result && (
        <div className="v6-suggestions-row" style={{ padding: "0 12px" }}>
          {PROMPT_SUGGESTIONS.slice(0, 4).map((s, i) => (
            <button
              key={i}
              className="v6-prompt-suggestion"
              onClick={() => pickSuggestion(s)}
              title={`Use suggestion: ${s.slice(0, 60)}\u2026`}
            >
              {s.length > 55 ? s.slice(0, 55) + "\u2026" : s}
            </button>
          ))}
        </div>
      )}

      <PromptDock
        value={prompt}
        onChange={setPrompt}
        onSubmit={generating ? undefined : handleGenerate}
        cost={cost}
        generating={generating}
        stage={generating ? "generating" : undefined}
        icon="spark"
      />
    </>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      {isMobile ? (
        <MobileModelCarousel models={activeModels} selectedModelId={selectedModelId} onSelect={handleModelSelect} />
      ) : (
        <ModelSelector
          models={activeModels}
          selectedModelId={selectedModelId}
          onSelect={handleModelSelect}
          label="Choose model"
          filterMode={mode}
        />
      )}
      <div className="v6-section-rule" />
      <div className="v6-quote">
        <div className="v6-quote-row">
          <span className="v6-muted">Estimated cost</span>
          <strong className={costPulse ? "v6-cost-badge-pulse" : ""}>
            <IconBolt /> {cost || "\u2014"}
          </strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Balance</span>
          <strong className="v6-balance">{balance ?? "\u2014"}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Model</span>
          <strong>{currentModel?.name || "\u2014"}</strong>
        </div>
      </div>
      {!affordable && cost > 0 && (
        <div style={{ fontSize: 11, color: "var(--v6-warn)", lineHeight: 1.4 }}>
          <strong>{shortfall} more credits required</strong>
        </div>
      )}
      <div className="v6-section-rule" />
      <div className="v6-field">
        <div className="v6-field-label">Mode</div>
        <div className="v6-segmented">
          <button className="v6-active">{mode === "tti" ? "Text → Image" : "Image → Image"}</button>
        </div>
      </div>
      <div className="v6-field">
        <div className="v6-field-label">Aspect</div>
        <span className="v6-mono v6-tiny">{aspectRatio}</span>
      </div>
      <div className="v6-field">
        <div className="v6-field-label">Resolution</div>
        <span className="v6-mono v6-tiny">{resolution}</span>
      </div>
      <div className="v6-field">
        <div className="v6-field-label">Seed</div>
        <span className="v6-mono v6-tiny">{seed ?? "Random"}</span>
      </div>
      {referenceImage && (
        <div className="v6-field">
          <div className="v6-field-label">Reference</div>
          <span className="v6-mono v6-tiny">Uploaded</span>
        </div>
      )}
    </div>
  );

  return (
    <StudioLayout controls={controls} inspector={inspector} inspectorVisible>
      {center}
    </StudioLayout>
  );
}
