"use client";

import GenerationField from "./universe/GenerationField";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PromptComposer, GenerateButton } from "./StudioComponents";
import { V2V_MODELS, VIDEO_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useAllCreditCosts } from "./useAllCreditCosts";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import {
  IconVideo, IconSparkle, IconClose, IconBolt, IconDownload,
  IconChevron, IconSearch, IconFilm,
} from "@/components/Icons";

const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
const EASE = [0.32, 0.72, 0, 1];

const PROVIDER_COLORS = {
  Runway: "#FF1B6B",
  Google: "#4285F4",
  Alibaba: "#FF6B35",
  "Kling AI": "#A855F7",
};

const TIER_LABEL = { fast: "Fast", premium: "Premium", standard: "Standard" };
const TIER_BARS = { fast: 1, premium: 3, standard: 2 };

const VIDEO_EDIT_IDS = [
  "runway-aleph",
  "runway-extend",
  "veo3-extend",
  "wan-2.6-v2v",
  "wan-2.6-flash-v2v",
  "wan-2.7-video-edit",
];

function buildVideoEditModels() {
  const byId = new Map();
  for (const m of V2V_MODELS) byId.set(m.id, m);
  for (const m of VIDEO_MODELS) if (!byId.has(m.id)) byId.set(m.id, m);
  return VIDEO_EDIT_IDS.map((id) => {
    const m = byId.get(id);
    if (!m) return null;
    const tier =
      m.speedTier ||
      (m.id.includes("flash")
        ? "fast"
        : m.id.includes("pro") || m.id.includes("veo3")
          ? "premium"
          : "standard");
    return {
      id: m.id,
      displayName: m.name,
      provider: m.provider,
      providerColor: PROVIDER_COLORS[m.provider] || "#FF1B6B",
      speedTier: tier,
      aspectRatios: m.aspectRatios,
      durations: m.durations,
      isExtend: m.isExtend,
      endpoint: m.endpoint,
    };
  }).filter(Boolean);
}

const MODELS = buildVideoEditModels();

const TIPS = [
  "Describe the edit precisely — \"replace the sky with a sunset, keep the subject steady\".",
  "Extend models add time to the end of your clip — mention how motion should continue.",
  "Aleph excels at cinematic restyles; Wan 2.7 Video Edit for faithful edits.",
  "Upload a clean, high-bitrate source for the sharpest results.",
  "Mention camera and grade — \"anamorphic, teal-orange, 35mm grain\".",
];

const STAGES = [
  { key: "queued", label: "Queued", icon: IconSparkle },
  { key: "generating", label: "Generating", icon: IconBolt },
  { key: "rendering", label: "Rendering", icon: IconFilm },
  { key: "finalizing", label: "Finalizing", icon: IconVideo },
];

function stageIndexFromElapsed(elapsed) {
  if (elapsed < 2) return 0;
  if (elapsed < 20) return 1;
  if (elapsed < 50) return 2;
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
          {model.isExtend && <span className="studio__badge studio__badge--rec">Extend</span>}
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
  const progress = Math.min(elapsed / 90, 0.95);
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
        Editing your video — restyling and extends can take a minute or more.
      </p>
    </div>
  );
}

function SourceDropzone({ videoUrl, uploading, dragOver, onPick, onDrop, onDragOver, onDragLeave, onRemove, error }) {
  if (videoUrl) {
    return (
      <motion.div
        className="studio__glass studio__glass--flush"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        style={{ padding: 14, borderRadius: 16 }}
      >
        <div className="studio__asset-thumb" style={{ position: "relative", aspectRatio: "16 / 9" }}>
          <video src={videoUrl} className="studio__result-video" muted loop autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
          <button onClick={onRemove} className="studio__asset-remove" type="button" aria-label="Remove source video">
            <IconClose style={{ width: 10, height: 10 }} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontSize: 11, color: "var(--color-text-dim)" }}>Source video ready</span>
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
        <input type="file" accept="video/*" onChange={(e) => onDrop({ dataTransfer: { files: e.target.files } })} hidden />
        <div className="studio__empty-glyph" style={{ width: 56, height: 56 }}>
          <IconVideo className="studio__empty-glyph-icon" style={{ width: 26, height: 26 }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
          {uploading ? "Uploading…" : "Drop a video or click to upload"}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>MP4, MOV, WebM — your source for the edit</span>
      </motion.label>
      {error && <p className="studio__error" style={{ marginTop: 8 }}>{error}</p>}
    </>
  );
}

function EmptyState({ tipIdx, videoUrl, onPick, uploading, dragOver, onDrop, onDragOver, onDragLeave, onRemove, uploadError }) {
  return (
    <div className="studio__empty" style={{ maxWidth: 520 }}>
      <h3 className="studio__empty-title">Video Edit Studio</h3>
      <p className="studio__empty-desc">
        Upload a source clip, describe how to edit it, and pick a model. Restyle
        scenes, extend clips, or transform footage with cinematic models.
      </p>

      <div style={{ width: "100%", marginTop: 18 }}>
        <SourceDropzone
          videoUrl={videoUrl}
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

function VideoEditStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [duration, setDuration] = useState(5);
  const [videoUrl, setVideoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState("");
  const [tipIdx, setTipIdx] = useState(0);
  const fileRef = useRef(null);

  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0];

  const { costs: allCosts } = useAllCreditCosts("v2v", MODELS);
  const { cost: estCredits, affordable, shortfall, topUpPacks } = useCreditCost("v2v", model, {
    duration,
    video_url: videoUrl,
  });
  const credits = estCredits || 0;

  const supportsDuration = Array.isArray(currentModel.durations) && currentModel.durations.length > 0;
  const DURATIONS = supportsDuration ? currentModel.durations : [];

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
      setVideoUrl(data.url);
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
    if (!prompt.trim() || !videoUrl || generating) return;
    submit("v2v", model, {
      endpoint: currentModel.endpoint || model,
      prompt,
      video_url: videoUrl,
      duration: supportsDuration ? duration : undefined,
    });
  }, [prompt, videoUrl, model, duration, supportsDuration, submit, currentModel, generating]);

  const onKeyDown = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (prompt.trim() && videoUrl && affordable) handleGenerate();
      }
    },
    [prompt, videoUrl, affordable, handleGenerate],
  );

  const filteredModels = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return MODELS;
    return MODELS.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );
  })();

  return (
    <div className="media-lab media-lab--video-edit studio__workspace" onKeyDown={onKeyDown}>
      <div className="media-lab__body studio__workspace-body">
        <aside className="media-lab__catalog studio__pane studio__pane--models studio__glass studio__glass--flush">
          <div className="studio__models-search">
            <IconSearch className="studio__models-search-icon" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search edit models…"
              className="studio__models-search-input"
            />
            {search && (
              <button
                type="button"
                className="studio__models-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <IconClose style={{ width: 12, height: 12 }} />
              </button>
            )}
          </div>

          <div className="studio__models-list">
            {filteredModels.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                active={m.id === model}
                cost={allCosts[m.id]?.credits || (m.id === model ? credits : null)}
                onSelect={setModel}
              />
            ))}
            {filteredModels.length === 0 && (
              <p className="studio__models-empty">No models match “{search}”.</p>
            )}
          </div>

          {supportsDuration && (
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
          )}
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
                <GenerationField phase="generating" elapsed={elapsed} model={model || "Video edit"} />
              </motion.div>
            ) : result?.url ? (
              <ResultDisplay key="result" result={result} onRetry={handleGenerate} />
            ) : (
              <EmptyState
                key="empty"
                tipIdx={tipIdx}
                videoUrl={videoUrl}
                uploading={uploading}
                dragOver={dragOver}
                onPick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onRemove={() => { setVideoUrl(null); setUploadError(""); }}
                uploadError={uploadError}
              />
            )}
          </AnimatePresence>
        </main>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
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
            placeholder="Describe how to edit the video…  (Cmd + Enter to generate)"
            charCount={prompt.length}
            charLimit={2000}
          >
            <div className="studio__composer-foot-actions">
              {videoUrl && (
                <button
                  type="button"
                  className="studio__chip-premium studio__chip-premium--active"
                  onClick={() => fileRef.current?.click()}
                  title="Replace source video"
                >
                  <IconVideo style={{ width: 12, height: 12 }} />
                  Source
                </button>
              )}
            </div>
          </PromptComposer>

          <GenerateButton
            onClick={handleGenerate}
            disabled={!prompt.trim() || !videoUrl || generating || (!affordable && credits > 0)}
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

export default VideoEditStudio;
