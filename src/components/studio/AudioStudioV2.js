"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  WorkspaceShell, PromptComposer, ModelSelector, CostQuote,
  GenerateButton, StagedProgress, ResultCard, EmptyState, KeyboardHint,
} from "./StudioComponents";
import { IconMusic, IconSparkle, IconBolt, IconArrowUpRight } from "@/components/Icons";
import { AUDIO_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

const EASE = [0.32, 0.72, 0, 1];

// Suno vs TTS vs Tools sub-modes
const SUB_MODES = [
  { id: "music", label: "Music", filter: (m) => m.provider === "Suno" },
  { id: "tts", label: "Voice / TTS", filter: (m) => m.hasVoice || m.id.includes("tts") },
  { id: "tools", label: "Tools", filter: (m) => m.id === "audio-isolation" },
];

const SUGGESTIONS = [
  "Epic orchestral with soaring strings and thunderous drums",
  "Lo-fi hip hop for studying, warm vinyl crackle",
  "Upbeat electronic pop, summer festival energy",
  "Cinematic dark trailer tension, brooding bass",
];

const TIPS = [
  "Tip: Name the genre, instruments, tempo, and mood for best results.",
  "Tip: For TTS, use Suno for songs and ElevenLabs for narration.",
  "Tip: Use the sparkle button to expand a sparse prompt before generating.",
];

function AudioWaveform({ active }) {
  // Subtle animated waveform for the empty/preview state
  return (
    <div className="studio__audio-wave" aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
      {Array.from({ length: 28 }).map((_, i) => (
        <motion.span
          key={i}
          style={{ width: 3, background: "var(--color-brand)", borderRadius: 2, originY: 1 }}
          animate={active ? { height: [6, 40 + (i % 5) * 8, 6] } : { height: 6 }}
          transition={active ? { duration: 0.8 + (i % 4) * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

export default function AudioStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.audio.mode") || "basic";
    return "basic";
  });
  const [subMode, setSubMode] = useState("music");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(AUDIO_MODELS[0].id);
  const [duration, setDuration] = useState(30);
  const [voice, setVoice] = useState(null);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [speed, setSpeed] = useState(1);
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState("female");
  const [style, setStyle] = useState("");
  const [title, setTitle] = useState("");
  const [negativeTags, setNegativeTags] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [showQuote, setShowQuote] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.audio.mode", mode); }, [mode]);
  useEffect(() => {
    const t = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  const subModels = useMemo(() => AUDIO_MODELS.filter(SUB_MODES.find((s) => s.id === subMode)?.filter || (() => true)), [subMode]);
  const currentModel = subModels.find((m) => m.id === model) || subModels[0] || AUDIO_MODELS[0];

  // When sub-mode changes, pick the first model in that sub-mode
  useEffect(() => { if (subModels.length) setModel(subModels[0].id); }, [subMode]);

  const { cost, affordable, shortfall } = useCreditCost("audio", model, { duration, prompt });

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    if (!affordable) { setShowQuote(true); return; }
    setGenStage("preparing");
    const params = {
      endpoint: currentModel.endpoint || model,
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
      ...(currentModel.hasNegativeTags && negativeTags ? { negative_tags: negativeTags } : {}),
      ...(audioUrl ? { audio_url: audioUrl } : {}),
    };
    submit("audio", model, params);
  }, [prompt, model, currentModel, duration, voice, stability, similarity, speed, instrumental, vocalGender, style, title, negativeTags, audioUrl, affordable, submit]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setAudioUrl(data.url);
    } catch {}
  };

  const handleAction = (actionId, url) => {
    if (actionId === "download") window.open(url, "_blank");
    // other actions route to other studio tools
  };

  // ── Inputs pane ──
  const inputs = (
    <>
      <div className="studio__sub-tabs" style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {SUB_MODES.map((s) => (
          <button
            key={s.id}
            className={`studio__chip-premium ${subMode === s.id ? "studio__chip-premium--active" : ""}`}
            onClick={() => setSubMode(s.id)}
            style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <ModelSelector
        models={subModels.map((m) => ({
          id: m.id, displayName: m.name, provider: m.provider,
          speedTier: m.speedTier, credits: 0,
        }))}
        selected={model}
        onSelect={setModel}
      />
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Duration (sec)</label>
        <input type="range" min={5} max={300} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="studio__slider" />
        <span className="studio__slider-val">{duration}s</span>
      </div>
      {currentModel.hasVoice && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Voice</label>
          <select value={voice || ""} onChange={(e) => setVoice(e.target.value)} className="studio__select">
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
      {mode === "advanced" && currentModel.hasStability && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Stability</label>
          <input type="range" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(Number(e.target.value))} className="studio__slider" />
        </div>
      )}
      {mode === "advanced" && currentModel.hasSimilarity && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Similarity</label>
          <input type="range" min={0} max={1} step={0.05} value={similarity} onChange={(e) => setSimilarity(Number(e.target.value))} className="studio__slider" />
        </div>
      )}
      {mode === "advanced" && currentModel.hasSpeed && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Speed</label>
          <input type="range" min={0.7} max={1.2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="studio__slider" />
        </div>
      )}
      {currentModel.hasInstrumental && (
        <label className="studio__check" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
          Instrumental only
        </label>
      )}
      {currentModel.hasVocalGender && !instrumental && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Vocal</label>
          <select value={vocalGender} onChange={(e) => setVocalGender(e.target.value)} className="studio__select">
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>
      )}
      {mode === "advanced" && currentModel.hasStyle && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Style tags</label>
          <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. synthwave, 80s" className="studio__input" />
        </div>
      )}
      {mode === "advanced" && currentModel.hasTitle && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="studio__input" />
        </div>
      )}
      {mode === "advanced" && currentModel.hasNegativeTags && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Negative tags</label>
          <input type="text" value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} placeholder="tags to avoid" className="studio__input" />
        </div>
      )}
      {subMode === "tools" && (
        <div style={{ marginTop: 12 }}>
          <label className="studio__label">Audio file</label>
          <input type="file" accept="audio/*" onChange={handleUpload} className="studio__input" />
          {audioUrl && <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Loaded ✓</span>}
        </div>
      )}
    </>
  );

  // ── Center pane ──
  const center = loading ? (
    <StagedProgress stage={genStage} elapsed={elapsed} />
  ) : result ? (
    <ResultCard result={result} type="audio" credits={cost} model={currentModel.name} onAction={handleAction} />
  ) : (
    <EmptyState
      Icon={IconMusic}
      title="Audio Studio"
      description={subMode === "tts" ? "Generate speech and voiceovers with natural-sounding TTS." : subMode === "tools" ? "Isolate vocals or process audio files." : "Generate music, songs, and soundtracks from a prompt."}
      tips={TIPS}
    >
      <AudioWaveform active={false} />
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="studio__chip studio__chip--suggestion" onClick={() => setPrompt(s)} style={{ textAlign: "left" }}>
            {s}
          </button>
        ))}
      </div>
    </EmptyState>
  );

  // ── Inspector pane ──
  const inspector = (
    <>
      <div className="studio__inspector-section">
        <div className="studio__label">Model</div>
        <div className="studio__inspector-value">{currentModel.name}</div>
        <div className="studio__inspector-sub">{currentModel.provider}</div>
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Cost</div>
        <div className="studio__inspector-value"><IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"} credits</div>
        {shortfall > 0 && <div className="studio__inspector-warn">Need {shortfall} more</div>}
      </div>
      {prompt && (
        <div className="studio__inspector-section">
          <div className="studio__label">Prompt</div>
          <div className="studio__inspector-prompt">{prompt}</div>
        </div>
      )}
      <div className="studio__inspector-section">
        <div className="studio__label">Shortcuts</div>
        <KeyboardHint keys={["⌘", "↵"]} label="Generate" />
      </div>
    </>
  );

  // ── Bottom bar ──
  const bottomBar = (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
      <PromptComposer value={prompt} onChange={setPrompt} placeholder={subMode === "tts" ? "Text to speak…" : "Describe the music or sound…"} charLimit={1000}>
        <GenerateButton onClick={handleGenerate} disabled={!prompt.trim()} generating={loading} stage={genStage} credits={cost} />
      </PromptComposer>
    </div>
  );

  return (
    <WorkspaceShell
      title="Audio Studio V2"
      Icon={IconMusic}
      mode={mode}
      onModeChange={setMode}
      inputs={inputs}
      inspector={inspector}
      bottomBar={bottomBar}
      sheetTitle="Audio Settings"
    >
      {/* HELMIES_AUDIO_V2_MARKER */}
      {center}
    </WorkspaceShell>
  );
}