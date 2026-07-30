"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import StudioLayout from "./v6/StudioLayout";
import ModelSelector from "./v6/ModelSelector";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

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

const IconMic = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
    <path d="M19 10v2a7 7 0 01-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const IconTool = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
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

const IconUpload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17,8 12,3 7,8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);

/* ───────────────────────────────────────────────────────────
   Styles (v6 design tokens)
   ─────────────────────────────────────────────────────────── */

const styles = {
  /* ── Sub-mode tabs ── */
  subTabs: {
    display: "flex",
    gap: 4,
    marginBottom: 16,
    padding: 3,
    background: "rgba(255,255,255,0.04)",
    borderRadius: 10,
  },
  subTab: (active) => ({
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? "#e2e2e8" : "#888",
    background: active ? "rgba(255,255,255,0.08)" : "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
  }),
  /* ── Panel section ── */
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
    minHeight: 72,
    boxSizing: "border-box",
    fontFamily: "inherit",
    lineHeight: 1.5,
    transition: "border-color 0.15s ease",
  },
  /* ── Slider group ── */
  sliderGroup: { marginBottom: 12 },
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
    marginBottom: 12,
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
  /* ── File upload ── */
  fileInput: {
    fontSize: 12,
    color: "#888",
  },
  fileLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    padding: "10px",
    fontSize: 12,
    color: "#aaa",
    background: "rgba(255,255,255,0.03)",
    border: "1px dashed rgba(255,255,255,0.12)",
    borderRadius: 8,
    cursor: "pointer",
    transition: "border-color 0.15s ease",
  },
  fileLoaded: {
    fontSize: 11,
    color: "#34d399",
    marginTop: 4,
  },
  /* ── Chip row for durations ── */
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: (active) => ({
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? "#e2e2e8" : "#888",
    background: active ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.05)",
    border: active ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.06)",
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
  quoteVal: { fontWeight: 600, color: "#e2e2e8" },
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
  sectionDivider: {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "12px 0",
  },
};

/* ───────────────────────────────────────────────────────────
   Sub-mode definitions
   ─────────────────────────────────────────────────────────── */

const SUB_MODES = [
  { id: "music", label: "Music", icon: IconMusic },
  { id: "tts", label: "Voice / TTS", icon: IconMic },
  { id: "tools", label: "Tools", icon: IconTool },
];

/* ───────────────────────────────────────────────────────────
   AudioStudio component
   ─────────────────────────────────────────────────────────── */

export default function AudioStudio() {
  /* ── State ── */
  const [subMode, setSubMode] = useState("music");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [title, setTitle] = useState("");
  const [negativeTags, setNegativeTags] = useState("");
  const [duration, setDuration] = useState(30);
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState("female");
  const [voice, setVoice] = useState(null);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [speed, setSpeed] = useState(1);
  const [audioUrl, setAudioUrl] = useState(null);
  const [genStage, setGenStage] = useState("");

  /* ── Hooks ── */
  const { models: audioModels, loading: modelsLoading } = useModelCatalog({ modelType: "audio" });
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();

  /* ── Derived ── */
  const subModels = useMemo(() => {
    switch (subMode) {
      case "music":
        return audioModels.filter(m => m.capability === "audio" && m.provider?.toLowerCase() === "suno");
      case "tts":
        return audioModels.filter(m => m.capability === "text-to-speech");
      case "tools":
        return audioModels.filter(m => m.capability === "audio" && m.provider?.toLowerCase() !== "suno");
      default:
        return audioModels;
    }
  }, [subMode, audioModels]);

  const [selectedModelId, setSelectedModelId] = useState(null);

  // Default model selection from hook data
  useEffect(() => {
    if (subModels.length) {
      setSelectedModelId(subModels[0].id);
    }
  }, [subModels]);

  const currentModel =
    subModels.find((m) => m.id === selectedModelId) ||
    subModels[0] ||
    audioModels[0] ||
    {};

  const { cost, affordable, shortfall } = useCreditCost("audio", selectedModelId, {
    duration,
    prompt,
  });

  /* ── Handlers ── */
  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    if (!affordable) return;

    setGenStage("preparing");

    const params = {
      endpoint: currentModel.endpoint || selectedModelId,
      prompt,
      duration,
      ...(currentModel.hasVoice && voice ? { voice } : {}),
      ...(currentModel.hasStability ? { stability } : {}),
      ...(currentModel.hasSimilarity ? { similarity } : {}),
      ...(currentModel.hasSpeed ? { speed } : {}),
      ...(currentModel.hasInstrumental ? { instrumental } : {}),
      ...(currentModel.hasVocalGender ? { vocal_gender: vocalGender } : {}),
      ...(currentModel.hasStyle && style ? { style } : {}),
      ...(currentModel.hasTitle && title ? { title } : {}),
      ...(currentModel.hasNegativeTags && negativeTags
        ? { negative_tags: negativeTags }
        : {}),
      ...(audioUrl ? { audio_url: audioUrl } : {}),
    };

    submit("audio", selectedModelId, params);
  }, [
    prompt,
    selectedModelId,
    currentModel,
    duration,
    voice,
    stability,
    similarity,
    speed,
    instrumental,
    vocalGender,
    style,
    title,
    negativeTags,
    audioUrl,
    affordable,
    submit,
  ]);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.url) setAudioUrl(data.url);
    } catch {
      // silently fail
    }
  }, []);

  const handleNew = useCallback(() => {
    setGenStage("");
    setPrompt("");
    setStyle("");
    setTitle("");
    setNegativeTags("");
    setAudioUrl(null);
  }, []);

  const handleDownload = useCallback(() => {
    const url =
      result?.url || result?.outputUrl || result;
    if (url && typeof url === "string") {
      window.open(url, "_blank");
    }
  }, [result]);

  /* ── Controls panel (left sidebar) ── */
  const controls = (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Sub-mode tabs */}
      <div style={styles.subTabs}>
        {SUB_MODES.map((sm) => {
          const Icon = sm.icon;
          return (
            <button
              key={sm.id}
              style={styles.subTab(subMode === sm.id)}
              onClick={() => setSubMode(sm.id)}
            >
              <Icon />
              {sm.label}
            </button>
          );
        })}
      </div>

      {/* ── Music mode controls ── */}
      {subMode === "music" && (
        <>
          <div style={styles.section}>
            <div style={styles.label}>Style tags</div>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. synthwave, 80s, cinematic"
              style={styles.input}
            />
          </div>

          <div style={styles.section}>
            <div style={styles.label}>Title</div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your track a name"
              style={styles.input}
            />
          </div>

          <div style={styles.section}>
            <div style={styles.label}>Lyrics / Prompt</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Write lyrics or describe the music you want to create…"
              style={styles.textarea}
            />
          </div>

          <div style={styles.section}>
            <div style={styles.label}>Vocal gender</div>
            <select
              value={vocalGender}
              onChange={(e) => setVocalGender(e.target.value)}
              style={styles.select}
              disabled={instrumental}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>

          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={instrumental}
              onChange={(e) => setInstrumental(e.target.checked)}
              style={styles.checkbox}
            />
            <span style={styles.checkLabel}>Instrumental only</span>
          </label>

          <div style={styles.section}>
            <div style={styles.label}>Negative tags</div>
            <input
              type="text"
              value={negativeTags}
              onChange={(e) => setNegativeTags(e.target.value)}
              placeholder="tags to avoid"
              style={styles.input}
            />
          </div>
        </>
      )}

      {/* ── TTS mode controls ── */}
      {subMode === "tts" && (
        <>
          {currentModel.hasVoice && (
            <div style={styles.section}>
              <div style={styles.label}>Voice</div>
              <select
                value={voice || ""}
                onChange={(e) => setVoice(e.target.value || null)}
                style={styles.select}
              >
                <option value="">Auto</option>
                <option value="rachel">Rachel</option>
                <option value="domi">Domi</option>
                <option value="bella">Bella</option>
                <option value="antoni">Antoni</option>
                <option value="elli">Elli</option>
                <option value="josh">Josh</option>
                <option value="arnold">Arnold</option>
              </select>
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.label}>Text to speak</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter the text you want to turn into speech…"
              style={styles.textarea}
            />
          </div>

          {currentModel.hasStability && (
            <div style={styles.sliderGroup}>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>Stability</span>
                <span style={styles.sliderVal}>{stability.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={stability}
                onChange={(e) => setStability(Number(e.target.value))}
                style={styles.slider}
              />
            </div>
          )}

          {currentModel.hasSimilarity && (
            <div style={styles.sliderGroup}>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>Similarity</span>
                <span style={styles.sliderVal}>{similarity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={similarity}
                onChange={(e) => setSimilarity(Number(e.target.value))}
                style={styles.slider}
              />
            </div>
          )}

          {currentModel.hasSpeed && (
            <div style={styles.sliderGroup}>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>Speed</span>
                <span style={styles.sliderVal}>{speed.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.2}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                style={styles.slider}
              />
            </div>
          )}
        </>
      )}

      {/* ── Tools mode controls ── */}
      {subMode === "tools" && (
        <div style={styles.section}>
          <div style={styles.label}>Audio file to isolate</div>
          <label style={styles.fileLabel}>
            <IconUpload />
            {audioUrl ? "File loaded — tap to change" : "Choose audio file"}
            <input
              type="file"
              accept="audio/*"
              onChange={handleUpload}
              style={{ display: "none" }}
            />
          </label>
          {audioUrl && <div style={styles.fileLoaded}>Loaded ✓</div>}
        </div>
      )}

      {/* ── Duration (all modes except maybe tools) ── */}
      {subMode !== "tools" && (
        <div style={styles.sliderGroup}>
          <div style={styles.sliderRow}>
            <span style={styles.sliderLabel}>Duration</span>
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
      )}
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
              <div style={styles.resultPlayer}>
                <audio
                  controls
                  style={{ width: "100%", borderRadius: 10 }}
                  src={result?.url || result?.outputUrl || result}
                />
              </div>

              <div style={styles.resultMeta}>
                <div style={styles.resultTitle}>
                  {result?.name || title || "Generated audio"}
                </div>
                <div style={styles.resultSub}>
                  <IconBolt />
                  {result?.creditsUsed ?? cost ?? "—"} credits
                  <span style={{ margin: "0 4px", color: "rgba(255,255,255,0.2)" }}>·</span>
                  <IconClock />
                  {elapsed}s
                </div>
                <div style={styles.resultSub}>
                  {currentModel.name} · {currentModel.provider}
                </div>
              </div>

              <div style={{ ...styles.resultActions, justifyContent: "center", marginTop: 16 }}>
                <button
                  className="v6-btn v6-primary"
                  onClick={handleDownload}
                >
                  <IconDownload /> Download
                </button>
                <button className="v6-btn" onClick={handleNew}>
                  <IconRefresh /> New
                </button>
              </div>
            </motion.div>
          </div>
        ) : (
          /* ── Empty state ── */
          <StageArea
            toolLabel="Audio Studio"
            toolDesc={
              subMode === "tts"
                ? "Generate speech and voiceovers with natural-sounding TTS."
                : subMode === "tools"
                  ? "Isolate vocals or process audio files."
                  : "Generate music, songs, and soundtracks from a prompt."
            }
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
        models={subModels.map((m) => ({
          id: m.id,
          displayName: m.name,
          provider: m.provider,
          speedTier: m.speedTier,
          credits: 0,
        }))}
        selectedModelId={selectedModelId}
        onSelect={setSelectedModelId}
        label="Audio models"
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
          {currentModel.speedTier && (
            <div style={styles.quoteRow}>
              <span style={styles.muted}>Speed</span>
              <span style={styles.quoteVal}>
                {currentModel.speedTier === "premium"
                  ? "Premium"
                  : currentModel.speedTier === "fast"
                    ? "Fast"
                    : currentModel.speedTier}
              </span>
            </div>
          )}
          <div style={styles.sectionDivider} />
          <div style={styles.quoteRow}>
            <span style={styles.muted}>Cost</span>
            <span style={styles.quoteVal}>
              <IconBolt /> {cost != null ? `${cost} credits` : "—"}
            </span>
          </div>
          {shortfall > 0 && (
            <div style={styles.warnRow}>Need {shortfall} more credits</div>
          )}
          {duration > 0 && (
            <div style={styles.quoteRow}>
              <span style={styles.muted}>Duration</span>
              <span style={styles.quoteVal}>{duration}s</span>
            </div>
          )}
        </div>
      )}

      {/* Prompt preview */}
      {prompt && (
        <div style={{ marginTop: 12 }}>
          <div style={styles.label}>Prompt</div>
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
