"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import StudioLayout from "./v6/StudioLayout";
import ModelSelector from "./v6/ModelSelector";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { AUDIO_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";

/* ───────────────────────────────────────────────────────────
   Inline SVGs (v6 icon style: 24x24, stroke 1.7)
   ─────────────────────────────────────────────────────────── */

const IconMusic = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const IconNote = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
    <path d="M9 5l12-2" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconDownload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconRefresh = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23,4 23,10 17,10" />
    <polyline points="1,20 1,14 7,14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);

const IconMic = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
    <path d="M19 10v2a7 7 0 01-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const IconGuitar = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="12" rx="3" ry="7" transform="rotate(-45 12 12)" />
    <line x1="5" y1="19" x2="9" y2="15" />
    <line x1="15" y1="9" x2="19" y2="5" />
  </svg>
);

/* ───────────────────────────────────────────────────────────
   Styles (v6 design tokens)
   ─────────────────────────────────────────────────────────── */

const styles = {
  /* ── Section ── */
  section: { marginBottom: 16 },
  /* ── Labels ── */
  label: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#888",
    marginBottom: 6,
  },
  labelIcon: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#888",
    marginBottom: 8,
  },
  /* ── Text input ── */
  input: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    color: "#e2e2e8",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease",
  },
  /* ── Select ── */
  select: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    color: "#e2e2e8",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  /* ── Textarea ── */
  textarea: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    color: "#e2e2e8",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    outline: "none",
    resize: "vertical",
    minHeight: 90,
    boxSizing: "border-box",
    fontFamily: "inherit",
    lineHeight: 1.5,
    transition: "border-color 0.15s ease",
  },
  /* ── Slider group ── */
  sliderGroup: { marginBottom: 14 },
  sliderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sliderLabel: {
    fontSize: 12,
    color: "#aaa",
  },
  sliderVal: {
    fontSize: 11,
    fontWeight: 600,
    color: "#ccc",
    fontVariantNumeric: "tabular-nums",
  },
  slider: {
    width: "100%",
    height: 4,
    appearance: "none",
    background: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    outline: "none",
    cursor: "pointer",
  },
  /* ── Checkbox ── */
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    cursor: "pointer",
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: "#6366f1",
    cursor: "pointer",
  },
  checkLabel: {
    fontSize: 13,
    color: "#ccc",
    userSelect: "none",
  },
  /* ── Duration chips ── */
  chipLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#888",
    marginBottom: 8,
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  chip: (active) => ({
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? "#e2e2e8" : "#888",
    background: active
      ? "rgba(99,102,241,0.18)"
      : "rgba(255,255,255,0.05)",
    border: active
      ? "1px solid rgba(99,102,241,0.4)"
      : "1px solid rgba(255,255,255,0.06)",
    borderRadius: 7,
    cursor: "pointer",
    transition: "all 0.12s ease",
  }),
  /* ── Audio result ── */
  resultWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: "40px 20px",
    flex: 1,
  },
  resultPlayer: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 12,
    overflow: "hidden",
  },
  resultMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    textAlign: "center",
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#e2e2e8",
  },
  resultSub: {
    fontSize: 12,
    color: "#888",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  resultActions: {
    display: "flex",
    gap: 8,
  },
  /* ── Section divider ── */
  sectionDivider: {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "10px 0",
  },
  /* ── Inspector quote card ── */
  quoteCard: {
    marginTop: 14,
    padding: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
  },
  quoteRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 0",
    fontSize: 12,
  },
  muted: { color: "#888" },
  quoteVal: {
    fontWeight: 600,
    color: "#e2e2e8",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  warnRow: {
    fontSize: 11,
    color: "#f87171",
    marginTop: 4,
    textAlign: "right",
  },
  promptPreview: {
    marginTop: 8,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 8,
    fontSize: 12,
    color: "#aaa",
    lineHeight: 1.5,
    maxHeight: 80,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
  },
  /* ── Header branding ── */
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
    padding: "6px 10px",
    background: "rgba(99,102,241,0.08)",
    border: "1px solid rgba(99,102,241,0.15)",
    borderRadius: 10,
  },
  headerIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 7,
    background: "rgba(99,102,241,0.2)",
    color: "#a5b4fc",
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#c7d2fe",
  },
  headerSub: {
    fontSize: 10,
    color: "#818cf8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
};

/* ───────────────────────────────────────────────────────────
   Duration presets for music generation
   ─────────────────────────────────────────────────────────── */

const DURATION_PRESETS = [
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
  { label: "2m", value: 120 },
  { label: "3m", value: 180 },
  { label: "4m", value: 240 },
  { label: "5m", value: 300 },
];

/* ───────────────────────────────────────────────────────────
   MusicStudio component
   ─────────────────────────────────────────────────────────── */

export default function MusicStudio() {
  /* ── State ── */
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [title, setTitle] = useState("");
  const [negativeTags, setNegativeTags] = useState("");
  const [duration, setDuration] = useState(30);
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState("female");
  const [genStage, setGenStage] = useState("");

  /* ── Suno-only models ── */
  const sunoModels = useMemo(
    () => AUDIO_MODELS.filter((m) => m.provider === "Suno"),
    []
  );

  const [selectedModelId, setSelectedModelId] = useState(
    sunoModels.length ? sunoModels[0].id : AUDIO_MODELS[0].id
  );

  const currentModel =
    sunoModels.find((m) => m.id === selectedModelId) ||
    sunoModels[0] ||
    AUDIO_MODELS[0];

  /* ── Hooks ── */
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();

  const { cost, affordable, shortfall } = useCreditCost(
    "audio",
    selectedModelId,
    { duration, prompt }
  );

  /* ── Handlers ── */
  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    if (!affordable) return;

    setGenStage("preparing");

    const params = {
      endpoint: currentModel.endpoint || selectedModelId,
      prompt,
      duration,
      ...(currentModel.hasInstrumental ? { instrumental } : {}),
      ...(currentModel.hasVocalGender ? { vocal_gender: vocalGender } : {}),
      ...(currentModel.hasStyle && style ? { style } : {}),
      ...(currentModel.hasTitle && title ? { title } : {}),
      ...(currentModel.hasNegativeTags && negativeTags
        ? { negative_tags: negativeTags }
        : {}),
    };

    submit("audio", selectedModelId, params);
  }, [
    prompt,
    selectedModelId,
    currentModel,
    duration,
    instrumental,
    vocalGender,
    style,
    title,
    negativeTags,
    affordable,
    submit,
  ]);

  const handleNew = useCallback(() => {
    setGenStage("");
    setPrompt("");
    setStyle("");
    setTitle("");
    setNegativeTags("");
  }, []);

  const handleDownload = useCallback(() => {
    const url = result?.url || result?.outputUrl || result;
    if (url && typeof url === "string") {
      window.open(url, "_blank");
    }
  }, [result]);

  /* ── Controls panel (left sidebar) ── */
  const controls = (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header branding */}
      <div style={styles.headerRow}>
        <div style={styles.headerIcon}>
          <IconGuitar />
        </div>
        <div>
          <div style={styles.headerTitle}>Music Composer</div>
          <div style={styles.headerSub}>Suno AI</div>
        </div>
      </div>

      {/* Style */}
      <div style={styles.section}>
        <div style={styles.label}>Style tags</div>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="e.g. synthwave, cinematic, orchestral"
          style={styles.input}
        />
      </div>

      {/* Title */}
      <div style={styles.section}>
        <div style={styles.label}>Track title</div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name your composition"
          style={styles.input}
        />
      </div>

      {/* Lyrics / prompt */}
      <div style={styles.section}>
        <div style={styles.label}>
          <IconNote />
          Lyrics / Prompt
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Write lyrics or describe the music you want to compose…&#10;&#10;e.g. Epic orchestral with soaring strings and thunderous drums, building to a dramatic climax"
          style={styles.textarea}
        />
      </div>

      {/* Instrumental toggle */}
      <label style={styles.checkRow}>
        <input
          type="checkbox"
          checked={instrumental}
          onChange={(e) => setInstrumental(e.target.checked)}
          style={styles.checkbox}
        />
        <span style={styles.checkLabel}>Instrumental only</span>
      </label>

      {/* Vocal gender */}
      <div style={styles.section}>
        <div style={styles.label}>
          <IconMic />
          Vocal
        </div>
        <select
          value={vocalGender}
          onChange={(e) => setVocalGender(e.target.value)}
          style={styles.select}
          disabled={instrumental}
        >
          <option value="female">Female vocals</option>
          <option value="male">Male vocals</option>
        </select>
      </div>

      {/* Negative tags */}
      <div style={styles.section}>
        <div style={styles.label}>Negative tags</div>
        <input
          type="text"
          value={negativeTags}
          onChange={(e) => setNegativeTags(e.target.value)}
          placeholder="e.g. autotune, lo-fi"
          style={styles.input}
        />
      </div>

      {/* Duration chips */}
      <div style={styles.chipLabel}>Duration</div>
      <div style={styles.chipRow}>
        {DURATION_PRESETS.map((preset) => (
          <button
            key={preset.value}
            style={styles.chip(duration === preset.value)}
            onClick={() => setDuration(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Duration slider for fine-tuning */}
      <div style={styles.sliderGroup}>
        <div style={styles.sliderRow}>
          <span style={styles.sliderLabel}>Fine-tune</span>
          <span style={styles.sliderVal}>{duration}s</span>
        </div>
        <input
          type="range"
          min={5}
          max={300}
          step={5}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          style={styles.slider}
        />
      </div>
    </div>
  );

  /* ── Center content ── */
  const centerContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Stage area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {loading ? (
          <StageArea
            generating={true}
            stage={genStage}
            model={currentModel.name}
            onCancel={handleNew}
          />
        ) : result ? (
          /* ── Audio result view ── */
          <div style={styles.resultWrap}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              style={{ width: "100%", maxWidth: 460 }}
            >
              {/* Audio player */}
              <div style={styles.resultPlayer}>
                <audio
                  controls
                  autoPlay={false}
                  style={{ width: "100%", borderRadius: 10 }}
                  src={result?.url || result?.outputUrl || result}
                />
              </div>

              {/* Meta */}
              <div style={styles.resultMeta}>
                <div style={styles.resultTitle}>
                  {title || result?.name || "Composition"}
                </div>
                <div style={styles.resultSub}>
                  <IconBolt />
                  {result?.creditsUsed ?? cost ?? "—"} credits
                  <span
                    style={{ margin: "0 4px", color: "rgba(255,255,255,0.2)" }}
                  >
                    ·
                  </span>
                  <IconClock />
                  {elapsed}s
                </div>
                <div style={styles.resultSub}>
                  {currentModel.name}
                  {instrumental ? " · Instrumental" : ""}
                  {vocalGender ? ` · ${vocalGender} vocals` : ""}
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  ...styles.resultActions,
                  justifyContent: "center",
                  marginTop: 16,
                }}
              >
                <button className="v6-btn v6-primary" onClick={handleDownload}>
                  <IconDownload /> Download
                </button>
                <button className="v6-btn" onClick={handleNew}>
                  <IconRefresh /> Compose again
                </button>
              </div>
            </motion.div>
          </div>
        ) : (
          /* ── Empty state ── */
          <StageArea
            toolLabel="Music Composer"
            toolDesc="Compose original music with Suno AI. Describe the style, mood, and genre — from cinematic scores to electronic beats."
            toolIcon={<IconMusic />}
          />
        )}
      </div>

      {/* Prompt dock (bottom) */}
      <PromptDock
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleGenerate}
        cost={cost}
        generating={loading}
        stage={genStage}
        icon="bolt"
      />
    </div>
  );

  /* ── Inspector panel (right sidebar) ── */
  const inspector = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ModelSelector
        models={sunoModels.map((m) => ({
          id: m.id,
          displayName: m.name,
          provider: m.provider,
          speedTier: m.speedTier,
          credits: 0,
        }))}
        selectedModelId={selectedModelId}
        onSelect={setSelectedModelId}
        label="Suno models"
      />

      {/* Cost quote */}
      {selectedModelId && (
        <div style={styles.quoteCard}>
          <div style={styles.quoteRow}>
            <span style={styles.muted}>Model</span>
            <span style={styles.quoteVal}>{currentModel.name}</span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.muted}>Provider</span>
            <span style={styles.quoteVal}>{currentModel.provider}</span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.muted}>Duration</span>
            <span style={styles.quoteVal}>{duration}s</span>
          </div>
          {instrumental && (
            <div style={styles.quoteRow}>
              <span style={styles.muted}>Mode</span>
              <span style={styles.quoteVal}>Instrumental</span>
            </div>
          )}
          {!instrumental && (
            <div style={styles.quoteRow}>
              <span style={styles.muted}>Vocals</span>
              <span style={styles.quoteVal}>
                {vocalGender === "female" ? "Female" : "Male"}
              </span>
            </div>
          )}
          {style && (
            <div style={styles.quoteRow}>
              <span style={styles.muted}>Style</span>
              <span style={styles.quoteVal}>{style}</span>
            </div>
          )}
          <div style={styles.sectionDivider} />
          <div style={styles.quoteRow}>
            <span style={styles.muted}>Estimated cost</span>
            <span style={styles.quoteVal}>
              <IconBolt /> {cost != null ? `${cost} credits` : "—"}
            </span>
          </div>
          {shortfall > 0 && (
            <div style={styles.warnRow}>Need {shortfall} more credits</div>
          )}
          {cost != null && affordable && (
            <div
              style={{
                fontSize: 11,
                color: "#34d399",
                marginTop: 4,
                textAlign: "right",
              }}
            >
              ✓ Affordable
            </div>
          )}
        </div>
      )}

      {/* Prompt preview */}
      {prompt && (
        <div style={{ marginTop: 12 }}>
          <div style={styles.label}>Lyrics / Prompt</div>
          <div style={styles.promptPreview}>{prompt}</div>
        </div>
      )}
    </div>
  );

  /* ── Render ── */
  return (
    <StudioLayout controls={controls} inspector={inspector}>
      {centerContent}
    </StudioLayout>
  );
}
