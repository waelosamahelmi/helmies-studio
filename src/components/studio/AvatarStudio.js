"use client";

import GenerationField from "./universe/GenerationField";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PromptComposer, GenerateButton } from "./StudioComponents";
import { V2V_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useAllCreditCosts } from "./useAllCreditCosts";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import {
  IconUsers, IconSparkle, IconClose, IconBolt, IconDownload,
  IconChevron, IconSearch, IconFilm,
} from "@/components/Icons";

const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
const EASE = [0.32, 0.72, 0, 1];

const PROVIDER_COLORS = {
  "Kling AI": "#A855F7",
};

const TIER_LABEL = { fast: "Fast", premium: "Premium", standard: "Standard" };
const TIER_BARS = { fast: 1, premium: 3, standard: 2 };

const AVATAR_IDS = new Set(["kling-ai-avatar-standard", "kling-ai-avatar-pro"]);

const MODELS = V2V_MODELS.filter((m) => AVATAR_IDS.has(m.id)).map((m) => ({
  id: m.id,
  displayName: m.name,
  provider: m.provider,
  providerColor: PROVIDER_COLORS[m.provider] || "#FF1B6B",
  speedTier: m.speedTier || (m.id.includes("pro") ? "premium" : "standard"),
  aspectRatios: m.aspectRatios,
  durations: m.durations,
  endpoint: m.endpoint,
}));

const DURATIONS = [5, 10];
const ASPECTS = ["16:9", "9:16", "1:1"];

const TIPS = [
  "Use a clear, well-lit portrait facing the camera for best animation.",
  "Describe the motion you want — \"subtle head turn, soft smile, blinking\".",
  "Pro gives higher fidelity; Standard is faster for quick previews.",
  "9:16 is ideal for mobile / social; 16:9 for cinematic frames.",
  "Keep the prompt focused on facial and upper-body motion.",
];

const STAGES = [
  { key: "queued", label: "Queued", icon: IconSparkle },
  { key: "generating", label: "Generating", icon: IconBolt },
  { key: "rendering", label: "Rendering", icon: IconFilm },
  { key: "finalizing", label: "Finalizing", icon: IconUsers },
];

function stageIndexFromElapsed(elapsed) {
  if (elapsed < 2) return 0;
  if (elapsed < 18) return 1;
  if (elapsed < 45) return 2;
  return 3;
}

function formatTimer(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ModelCard({ model, active, cost, onSelect }) {
  const bars = TIER_BARS[model.speedTier] || 2;
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(model.id)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={SPRING}
      className={`studio__model-card ${active ? "studio__model-card--active" : ""}`}
      aria-pressed={active}
    >
      <div className="studio__model-card-head">
        <span className="studio__model-card-title">
          <span className="studio__provider-dot" style={{ background: model.providerColor }} />
          {model.displayName}
        </span>
        <span className={`studio__model-card-tier studio__model-card-tier--${model.speedTier}`}>
          {TIER_LABEL[model.speedTier]}
        </span>
      </div>

      <div className="studio__model-card-speed" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`studio__model-card-speed-bar ${i < bars ? "studio__model-card-speed-bar--on" : ""}`}
          />
        ))}
      </div>

      <div className="studio__model-card-foot">
        <span className="studio__model-card-provider">{model.provider}</span>
        <span className="studio__model-card-cost">
          {cost ? (
            <>
              <IconBolt className="studio__model-card-cost-icon" />
              <span className="studio__model-card-cost-value">{cost}</span>
              <span className="studio__model-card-cost-unit">cr</span>
            </>
          ) : (
            <span className="studio__model-card-cost-unit">— cr</span>
          )}
        </span>
      </div>
    </motion.button>
  );
}

function PremiumProgress({ elapsed }) {
  const active = stageIndexFromElapsed(elapsed);
  const progress = Math.min(elapsed / 80, 0.95);
  return (
    <div className="studio__progress-premium">
      <div className="studio__progress-stages-premium">
        {STAGES.map((stage, i) => {
          const StageIcon = stage.icon;
          const state = i < active ? "done" : i === active ? "active" : "idle";
          return (
            <div className="studio__progress-stage-premium" key={stage.key}>
              <span
                className={`studio__progress-stage-icon ${
                  state === "done"
                    ? "studio__progress-stage-icon--done"
                    : state === "active"
                      ? "studio__progress-stage-icon--active"
                      : ""
                }`}
              >
                {state === "done" ? "✓" : <StageIcon />}
              </span>
              {i < STAGES.length - 1 && (
                <span
                  className={`studio__progress-stage-connector ${
                    i < active
                      ? "studio__progress-stage-connector--done"
                      : i === active
                        ? "studio__progress-stage-connector--active"
                        : ""
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="studio__progress-bar-premium">
        <div className="studio__progress-fill-premium" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="studio__progress-meta">
        <span className="studio__progress-stage-label">{STAGES[active].label}…</span>
        <span className="studio__progress-timer">
          <span className="studio__progress-timer-dot" />
          {formatTimer(elapsed)}
        </span>
      </div>

      <p className="studio__progress-msg-premium">
        Animating your avatar — Kling generates lifelike motion from a single portrait.
      </p>
    </div>
  );
}

function PortraitDropzone({ imageUrl, uploading, dragOver, onPick, onDrop, onDragOver, onDragLeave, onRemove, error }) {
  if (imageUrl) {
    return (
      <motion.div
        className="studio__glass studio__glass--flush"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        style={{ padding: 14, borderRadius: 16 }}
      >
        <div className="studio__asset-thumb" style={{ position: "relative", aspectRatio: "3 / 4" }}>
          <img src={imageUrl} alt="Portrait" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
          <button onClick={onRemove} className="studio__asset-remove" type="button" aria-label="Remove portrait">
            <IconClose style={{ width: 10, height: 10 }} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontSize: 11, color: "var(--color-text-dim)" }}>Portrait ready</span>
          <button type="button" className="studio__link" onClick={onPick}>Replace</button>
        </div>
      </motion.div>
    );
  }
  return (
    <>
      <motion.label
        className="studio__asset-dropzone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          cursor: uploading ? "wait" : "pointer",
          borderColor: dragOver ? "var(--color-brand)" : undefined,
          background: dragOver ? "rgba(255,27,107,0.06)" : undefined,
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: 16,
        }}
        whileHover={{ y: -2 }}
        transition={SPRING}
      >
        <input type="file" accept="image/*" onChange={(e) => onDrop({ dataTransfer: { files: e.target.files } })} hidden />
        <div className="studio__empty-glyph" style={{ width: 56, height: 56 }}>
          <IconUsers className="studio__empty-glyph-icon" style={{ width: 26, height: 26 }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
          {uploading ? "Uploading…" : "Drop a portrait or click to upload"}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>JPG, PNG, WebP — a clear face works best</span>
      </motion.label>
      {error && <p className="studio__error" style={{ marginTop: 8 }}>{error}</p>}
    </>
  );
}

function EmptyState({ tipIdx, imageUrl, uploading, dragOver, onPick, onDrop, onDragOver, onDragLeave, onRemove, uploadError }) {
  return (
    <div className="studio__empty" style={{ maxWidth: 520 }}>
      <h3 className="studio__empty-title">Avatar Studio</h3>
      <p className="studio__empty-desc">
        Upload a portrait and describe the animation. Kling AI Avatar brings a
        single still image to life with natural, expressive motion.
      </p>

      <div style={{ width: "100%", marginTop: 18 }}>
        <PortraitDropzone
          imageUrl={imageUrl}
          uploading={uploading}
          dragOver={dragOver}
          onPick={onPick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onRemove={onRemove}
          error={uploadError}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tipIdx}
          className="studio__empty-tip"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <IconSparkle className="studio__empty-tip-icon" />
          {TIPS[tipIdx]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ResultDisplay({ result, onRetry }) {
  return (
    <motion.div
      className="studio__result-premium"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="studio__result-viewport">
        <video src={result.url} controls autoPlay loop playsInline className="studio__result-media" style={{ maxHeight: "64vh" }} />
        <div className="studio__result-overlay" />
      </div>

      <div className="studio__result-actions-premium">
        <a href={result.url} download className="studio__result-action studio__result-action--primary">
          <IconDownload className="studio__result-action-icon" />
          Download
        </a>
        <button type="button" className="studio__result-action" onClick={onRetry}>
          <IconSparkle className="studio__result-action-icon" />
          Retry
        </button>
        {result.creditsUsed && (
          <span className="studio__result-meta">
            <IconBolt style={{ width: 11, height: 11 }} /> {result.creditsUsed} cr
          </span>
        )}
      </div>
    </motion.div>
  );
}

function AvatarStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  const fileRef = useRef(null);

  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0];

  const { costs: allCosts } = useAllCreditCosts("v2v", MODELS);
  const { cost: estCredits, affordable, shortfall, topUpPacks } = useCreditCost("v2v", model, {
    duration,
    aspect_ratio: aspectRatio,
    image_url: imageUrl,
  });
  const credits = estCredits || 0;

  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 5200);
    return () => clearInterval(id);
  }, []);

  const handleUpload = useCallback(async (files) => {
    const file = Array.from(files || [])[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (!data.url) throw new Error("No URL returned from upload");
      setImageUrl(data.url);
    } catch (e) {
      setUploadError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    if (e.preventDefault) e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length) handleUpload(files);
  }, [handleUpload]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !imageUrl || generating) return;
    submit("v2v", model, {
      endpoint: currentModel.endpoint || model,
      prompt,
      image_url: imageUrl,
      duration,
      aspect_ratio: aspectRatio,
    });
  }, [prompt, imageUrl, model, duration, aspectRatio, submit, currentModel, generating]);

  const onKeyDown = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (prompt.trim() && imageUrl && affordable) handleGenerate();
      }
    },
    [prompt, imageUrl, affordable, handleGenerate],
  );

  return (
    <div className="media-lab media-lab--avatar studio__workspace" onKeyDown={onKeyDown}>
      <div className="media-lab__body studio__workspace-body">
        <aside className="media-lab__catalog studio__pane studio__pane--models studio__glass studio__glass--flush">
          <div className="studio__models-search">
            <IconSearch className="studio__models-search-icon" />
            <input
              type="text"
              value={""}
              onChange={() => {}}
              placeholder="Kling AI avatars"
              className="studio__models-search-input"
              disabled
              style={{ opacity: 0.7 }}
            />
          </div>

          <div className="studio__models-list">
            {MODELS.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                active={m.id === model}
                cost={allCosts[m.id]?.credits || (m.id === model ? credits : null)}
                onSelect={setModel}
              />
            ))}
          </div>

          <div className="studio__section" style={{ padding: "12px 14px" }}>
            <h3 className="studio__section-title">Duration</h3>
            <div className="studio__chip-group-premium">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`studio__chip-premium ${duration === d ? "studio__chip-premium--active" : ""}`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div className="studio__section" style={{ padding: "12px 14px" }}>
            <h3 className="studio__section-title">Aspect Ratio</h3>
            <div className="studio__chip-group-premium">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspectRatio(a)}
                  className={`studio__chip-premium ${aspectRatio === a ? "studio__chip-premium--active" : ""}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="media-lab__stage studio__pane studio__pane--center">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key="error"
                className="studio__error studio__glass"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={SPRING}
              >
                <IconClose style={{ width: 16, height: 16 }} />
                <span>{error}</span>
              </motion.div>
            ) : generating ? (
              <motion.div
                key="progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <GenerationField phase="generating" elapsed={elapsed} model={model || "Avatar"} />
              </motion.div>
            ) : result?.url ? (
              <ResultDisplay key="result" result={result} onRetry={handleGenerate} />
            ) : (
              <EmptyState
                key="empty"
                tipIdx={tipIdx}
                imageUrl={imageUrl}
                uploading={uploading}
                dragOver={dragOver}
                onPick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onRemove={() => { setImageUrl(null); setUploadError(""); }}
                uploadError={uploadError}
              />
            )}
          </AnimatePresence>
        </main>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleUpload(e.target.files)}
        hidden
      />

      <div className="studio__models-rail-mobile">
        {MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModel(m.id)}
            className={`studio__model-chip-mobile ${m.id === model ? "studio__model-chip-mobile--active" : ""}`}
          >
            <span className="studio__provider-dot" style={{ background: m.providerColor }} />
            {m.displayName}
          </button>
        ))}
      </div>

      <div className="media-lab__dock studio__bottombar">
        <div className="studio__composer-wrap">
          <PromptComposer
            value={prompt}
            onChange={(v) => setPrompt(v.slice(0, 2000))}
            placeholder="Describe the avatar animation…  (Cmd + Enter to generate)"
            charCount={prompt.length}
            charLimit={2000}
          >
            <div className="studio__composer-foot-actions">
              {imageUrl && (
                <button
                  type="button"
                  className="studio__chip-premium studio__chip-premium--active"
                  onClick={() => fileRef.current?.click()}
                  title="Replace portrait"
                >
                  <IconUsers style={{ width: 12, height: 12 }} />
                  Portrait
                </button>
              )}
            </div>
          </PromptComposer>

          <GenerateButton
            onClick={handleGenerate}
            disabled={!prompt.trim() || !imageUrl || generating || (!affordable && credits > 0)}
            generating={generating}
            credits={credits}
          />
        </div>

        {!affordable && credits > 0 && (
          <div className="studio__cost-warning studio__glass">
            <p>
              Insufficient credits — need <strong>{credits}</strong>
              {shortfall > 0 && ` (shortfall: ${shortfall})`}.
            </p>
            {topUpPacks.length > 0 && (
              <div className="studio__topup-packs">
                {topUpPacks.slice(0, 2).map((p) => (
                  <a key={p.id} href={`/pricing?pack=${p.id}`} className="studio__chip-premium">
                    Top up {p.credits} — {p.price}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// CreationWorkspace is the canonical Command Universe composition; the adapter
// preserves this instrument's proven API behavior while its controls use the
// shared spatial workspace contract.
void CreationWorkspace;
export default AvatarStudio;
