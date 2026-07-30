"use client";

import GenerationField from "./universe/GenerationField";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AUDIO_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import {
  IconMusic, IconSparkle, IconClose, IconBolt, IconArrowUpRight,
  IconDownload, IconChevron,
} from "@/components/Icons";

const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
const EASE = [0.32, 0.72, 0, 1];

const PROVIDER_COLORS = {
  Suno: "#FF6B35",
  ElevenLabs: "#22D3EE",
  Google: "#4285F4",
};

const TIER_LABEL = { fast: "Fast", premium: "Premium", standard: "Standard" };
const TIER_BARS = { fast: 1, premium: 3, standard: 2 };

const SUNO_MODELS = AUDIO_MODELS.filter((m) => m.provider === "Suno");
const TTS_MODELS = AUDIO_MODELS.filter((m) => m.provider === "ElevenLabs" || m.provider === "Google");

const ELEVEN_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel — calm narrator" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi — strong, expressive" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella — soft, friendly" },
  { id: "ErXwobaYiNj19PyfpknH", name: "Antoni — deep, warm" },
  { id: "MF3mGy4UZkFAJdSMfFQD", name: "Elli — emotional, young" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh — deep, gravelly" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold — gravelly, assertive" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam — deep, authoritative" },
  { id: "yoZ06aMxZJJ28mC3PNqd", name: "Sam — raspy, warm" },
  { id: "JBFqnCBEp6CHzPCYnPxN", name: "Matthew — calm, documentary" },
];

const TABS = [
  { id: "music", label: "Music", icon: IconMusic },
  { id: "voice", label: "Voice", icon: IconSparkle },
];

const MUSIC_TIPS = [
  "Be specific with genre — “lo-fi hip hop, vinyl crackle, mellow piano, 80 BPM.”",
  "Use Custom mode to set title, style, and vocal gender separately.",
  "Negative tags strip unwanted elements: “heavy metal, screaming, autotune.”",
  "Instrumental toggle removes vocals for background beds and loops.",
  "Suno v5.5 has the best musicality; v4.5+ is great for radio-ready vocals.",
];

const VOICE_TIPS = [
  "Stability above 0.5 keeps delivery consistent; lower for expressive range.",
  "Similarity boost 0.75+ locks the voice identity tightly to the target.",
  "Speed 1.0 is natural; 1.1 adds urgency, 0.9 slows for narration.",
  "ElevenLabs Multilingual v2 handles 29 languages with native accents.",
  "Keep text under 5000 chars per request for best results.",
];

function formatTimer(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ModelChip({ model, active, onSelect }) {
  const bars = TIER_BARS[model.speedTier] || 2;
  const color = PROVIDER_COLORS[model.provider] || "#FF1B6B";
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(model.id)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={SPRING}
      className={`studio__model-card ${active ? "studio__model-card--active" : ""}`}
      aria-pressed={active}
    >
      <div className="studio__model-card-head">
        <span className="studio__model-card-title">
          <span className="studio__provider-dot" style={{ background: color }} />
          {model.name}
        </span>
        {model.speedTier && (
          <span className={`studio__model-card-tier studio__model-card-tier--${model.speedTier}`}>
            {TIER_LABEL[model.speedTier]}
          </span>
        )}
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
      </div>
    </motion.button>
  );
}

function EmptyState({ tab }) {
  const tips = tab === "music" ? MUSIC_TIPS : VOICE_TIPS;
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % tips.length), 5200);
    return () => clearInterval(id);
  }, [tips]);
  return (
    <div className="studio__empty">
      <div className="studio__empty-glyph">
        {tab === "music" ? <IconMusic className="studio__empty-glyph-icon" /> : <IconSparkle className="studio__empty-glyph-icon" />}
      </div>
      <h3 className="studio__empty-title">{tab === "music" ? "Music Studio" : "Voice Studio"}</h3>
      <p className="studio__empty-desc">
        {tab === "music"
          ? "Describe a track and let Suno compose it. Use Custom mode for full control over style, title, and vocals."
          : "Turn text into lifelike speech. Pick a voice, tune stability and style, and generate studio-quality narration."}
      </p>
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
          {tips[tipIdx]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PremiumProgress({ elapsed, tab }) {
  const progress = Math.min(elapsed / 45, 0.95);
  return (
    <div className="studio__progress-premium">
      <div className="studio__progress-bar-premium">
        <div className="studio__progress-fill-premium" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="studio__progress-meta">
        <span className="studio__progress-stage-label">
          Composing your {tab === "music" ? "track" : "voice"}…
        </span>
        <span className="studio__progress-timer">
          <span className="studio__progress-timer-dot" />
          {formatTimer(elapsed)}
        </span>
      </div>
      <p className="studio__progress-msg-premium">
        {tab === "music" ? "Suno is arranging your track — this usually takes 30–40s." : "Synthesizing your voice — almost there."}
      </p>
    </div>
  );
}

function AudioResult({ result, onAddToAssets, saved, onRetry, tab }) {
  return (
    <motion.div
      className="studio__result-premium"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="studio__result-viewport" style={{ padding: "32px 24px" }}>
        <div className="studio__waveform-premium" aria-hidden>
          {Array.from({ length: 72 }).map((_, i) => (
            <span
              key={i}
              className="studio__waveform-bar-premium"
              style={{ height: `${20 + Math.abs(Math.sin(i * 0.5) * Math.cos(i * 0.3)) * 70}%` }}
            />
          ))}
        </div>
        <audio src={result.url} controls autoPlay className="studio__audio-player" style={{ marginTop: 20 }} />
      </div>

      <div className="studio__result-actions-premium">
        <a href={result.url} download className="studio__result-action studio__result-action--primary">
          <IconDownload className="studio__result-action-icon" />
          Download
        </a>
        <button type="button" className="studio__result-action" onClick={onAddToAssets}>
          <IconArrowUpRight className="studio__result-action-icon" />
          {saved ? "Added" : "Add to assets"}
        </button>
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

function PremiumSlider({ label, value, min, max, step, onChange, format }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="studio__section">
      <div className="studio__slider-row-premium">
        <span className="studio__slider-label-premium">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="studio__slider-premium"
          style={{ "--studio-slider-fill": `${pct}%` }}
        />
        <span className="studio__slider-value-premium">{format ? format(value) : value.toFixed(2)}</span>
      </div>
    </div>
  );
}

function MusicStudio() {
  const [tab, setTab] = useState("music");

  const { loading, result, error, elapsed, submit } = useAsyncGeneration();

  const [musicModel, setMusicModel] = useState(SUNO_MODELS[0].id);
  const [musicPrompt, setMusicPrompt] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [musicStyle, setMusicStyle] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicInstrumental, setMusicInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState("");
  const [negativeTags, setNegativeTags] = useState("");

  const [ttsModel, setTtsModel] = useState(TTS_MODELS[0].id);
  const [ttsText, setTtsText] = useState("");
  const [voiceId, setVoiceId] = useState(ELEVEN_VOICES[0].id);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [speed, setSpeed] = useState(1);

  const [saved, setSaved] = useState(false);

  const currentTTSModel = TTS_MODELS.find((m) => m.id === ttsModel) || TTS_MODELS[0];

  const handleGenerateMusic = useCallback(() => {
    if (!musicPrompt.trim() && !customMode) return;
    setSaved(false);
    const params = customMode
      ? {
          endpoint: musicModel,
          tool_override: "audio",
          prompt: musicPrompt || undefined,
          style: musicStyle || undefined,
          title: musicTitle || undefined,
          instrumental: musicInstrumental,
          vocal_gender: vocalGender || undefined,
          negative_tags: negativeTags || undefined,
        }
      : {
          endpoint: musicModel,
          prompt: musicPrompt,
          negative_tags: negativeTags || undefined,
        };
    submit("audio", musicModel, params);
  }, [musicModel, musicPrompt, customMode, musicStyle, musicTitle, musicInstrumental, vocalGender, negativeTags, submit]);

  const handleGenerateTTS = useCallback(() => {
    if (!ttsText.trim()) return;
    setSaved(false);
    const params = {
      endpoint: ttsModel,
      text: ttsText.slice(0, 5000),
      voice_id: voiceId,
    };
    if (currentTTSModel.hasStability || currentTTSModel.hasSimilarity || currentTTSModel.hasSpeed) {
      params.voice_settings = {
        stability,
        similarity_boost: similarity,
        style,
        speed,
      };
    }
    submit("audio", ttsModel, params);
  }, [ttsModel, ttsText, voiceId, stability, similarity, style, speed, submit, currentTTSModel]);

  const handleAddToAssets = useCallback(() => {
    if (!result?.url) return;
    setSaved(true);
  }, [result]);

  const handleRetry = useCallback(() => {
    setSaved(false);
    if (tab === "music") handleGenerateMusic();
    else handleGenerateTTS();
  }, [tab, handleGenerateMusic, handleGenerateTTS]);

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (tab === "music") handleGenerateMusic();
        else handleGenerateTTS();
      }
    },
    [tab, handleGenerateMusic, handleGenerateTTS],
  );

  const audioUrl = result?.url;
  const ttsCharLimit = 5000;
  const musicCharLimit = 1000;

  return (
    <div className="media-lab media-lab--music studio__workspace" onKeyDown={handleKeyDown}>
      <div className="media-lab__body studio__workspace-body">
        <aside className="media-lab__catalog studio__pane studio__pane--models studio__glass studio__glass--flush">
          <div className="studio__tabs" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`studio__tab ${tab === t.id ? "studio__tab--active" : ""}`}
                >
                  <Icon style={{ width: 14, height: 14 }} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="studio__models-list">
            <AnimatePresence mode="wait">
              {tab === "music" ? (
                <motion.div
                  key="music-models"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {SUNO_MODELS.map((m) => (
                    <ModelChip key={m.id} model={m} active={m.id === musicModel} onSelect={setMusicModel} />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="tts-models"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {TTS_MODELS.map((m) => (
                    <ModelChip key={m.id} model={m} active={m.id === ttsModel} onSelect={setTtsModel} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="studio__models-settings">
            <AnimatePresence mode="wait">
              {tab === "music" ? (
                <motion.div
                  key="music-settings"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="studio__section">
                    <h3 className="studio__section-title">Mode</h3>
                    <div className="studio__toggle" style={{ marginBottom: 0 }}>
                      <button
                        type="button"
                        onClick={() => setCustomMode(false)}
                        className={`studio__toggle-btn ${!customMode ? "studio__toggle-btn--active" : ""}`}
                      >
                        Simple
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMode(true)}
                        className={`studio__toggle-btn ${customMode ? "studio__toggle-btn--active" : ""}`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {customMode && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="studio__section">
                          <h3 className="studio__section-title">Style</h3>
                          <input
                            value={musicStyle}
                            onChange={(e) => setMusicStyle(e.target.value)}
                            placeholder="e.g. lo-fi hip hop, dreamy"
                            className="studio__input"
                          />
                        </div>
                        <div className="studio__section">
                          <h3 className="studio__section-title">Title</h3>
                          <input
                            value={musicTitle}
                            onChange={(e) => setMusicTitle(e.target.value)}
                            placeholder="Song title"
                            className="studio__input"
                          />
                        </div>
                        <div className="studio__section">
                          <h3 className="studio__section-title">Vocal Gender</h3>
                          <div className="studio__chip-group-premium">
                            {["", "male", "female"].map((g) => (
                              <button
                                key={g || "any"}
                                type="button"
                                onClick={() => setVocalGender(g)}
                                className={`studio__chip-premium ${vocalGender === g ? "studio__chip-premium--active" : ""}`}
                              >
                                {g === "" ? "Any" : g.charAt(0).toUpperCase() + g.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="studio__section">
                          <h3 className="studio__section-title">Instrumental</h3>
                          <div className="studio__toggle" style={{ marginBottom: 0 }}>
                            <button
                              type="button"
                              onClick={() => setMusicInstrumental(false)}
                              className={`studio__toggle-btn ${!musicInstrumental ? "studio__toggle-btn--active" : ""}`}
                            >
                              Off
                            </button>
                            <button
                              type="button"
                              onClick={() => setMusicInstrumental(true)}
                              className={`studio__toggle-btn ${musicInstrumental ? "studio__toggle-btn--active" : ""}`}
                            >
                              On
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="studio__section">
                    <h3 className="studio__section-title">Negative Tags</h3>
                    <input
                      value={negativeTags}
                      onChange={(e) => setNegativeTags(e.target.value)}
                      placeholder="e.g. vocals, drums, heavy bass"
                      className="studio__input"
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="tts-settings"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentTTSModel.hasVoice && (
                    <div className="studio__section">
                      <h3 className="studio__section-title">Voice</h3>
                      <select
                        value={voiceId}
                        onChange={(e) => setVoiceId(e.target.value)}
                        className="studio__input"
                        style={{ width: "100%" }}
                      >
                        {ELEVEN_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentTTSModel.hasStability && (
                    <PremiumSlider
                      label="Stability"
                      value={stability}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={setStability}
                    />
                  )}
                  {currentTTSModel.hasSimilarity && (
                    <PremiumSlider
                      label="Similarity"
                      value={similarity}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={setSimilarity}
                    />
                  )}
                  {currentTTSModel.hasStability && (
                    <PremiumSlider
                      label="Style"
                      value={style}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={setStyle}
                    />
                  )}
                  {currentTTSModel.hasSpeed && (
                    <PremiumSlider
                      label="Speed"
                      value={speed}
                      min={0.7}
                      max={1.2}
                      step={0.01}
                      onChange={setSpeed}
                      format={(v) => `${v.toFixed(2)}x`}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
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
            ) : loading ? (
              <motion.div
                key="progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <GenerationField phase="generating" elapsed={elapsed} model={tab === "music" ? "Music composition" : "Voice synthesis"} />
              </motion.div>
            ) : audioUrl ? (
              <AudioResult
                key="result"
                result={result}
                onAddToAssets={handleAddToAssets}
                saved={saved}
                onRetry={handleRetry}
                tab={tab}
              />
            ) : (
              <EmptyState key="empty" tab={tab} />
            )}
          </AnimatePresence>
        </main>
      </div>

      <div className="media-lab__dock studio__bottombar">
        <div className="studio__composer-wrap">
          <AnimatePresence mode="wait">
            {tab === "music" ? (
              <motion.div
                key="music-composer"
                className="studio__composer-premium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ flex: 1 }}
              >
                <div className="studio__composer-premium-inner">
                  <textarea
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value.slice(0, musicCharLimit))}
                    placeholder="Describe the music you want…  (Cmd + Enter to generate)"
                    className="studio__composer-premium-textarea"
                    rows={3}
                  />
                  <div className="studio__composer-premium-foot">
                    <span className="studio__composer-count">
                      <span className="studio__composer-count-dot" />
                      {musicPrompt.length} / {musicCharLimit}
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="tts-composer"
                className="studio__composer-premium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ flex: 1 }}
              >
                <div className="studio__composer-premium-inner">
                  <textarea
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value.slice(0, ttsCharLimit))}
                    placeholder="Type the text you want spoken…  (Cmd + Enter to generate)"
                    className="studio__composer-premium-textarea"
                    rows={3}
                  />
                  <div className="studio__composer-premium-foot">
                    <span className={`studio__composer-count ${ttsText.length > ttsCharLimit * 0.85 ? "studio__composer-count--warn" : ""}`}>
                      <span className="studio__composer-count-dot" />
                      {ttsText.length} / {ttsCharLimit}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={tab === "music" ? handleGenerateMusic : handleGenerateTTS}
            disabled={loading || (tab === "music" ? !musicPrompt.trim() && !customMode : !ttsText.trim())}
            className="studio__generate"
          >
            {loading ? (
              <>
                <span className="studio__spinner" style={{ width: 16, height: 16 }} />
                Generating…
              </>
            ) : (
              <>
                <IconSparkle className="studio__generate-icon" />
                {tab === "music" ? "Generate Music" : "Generate Voice"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MusicStudio;
