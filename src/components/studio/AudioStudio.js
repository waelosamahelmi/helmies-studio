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
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";
import { matchesGroup } from "@/lib/capability-groups";

/* ── Inline SVGs ── */
const IconMusic = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);
const IconMic = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
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
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconRefresh = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23,4 23,10 17,10" /><polyline points="1,20 1,14 7,14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);
const IconUpload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);
const IconPlay = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5,3 19,12 5,21" />
  </svg>
);
const IconSearch = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/* ── Sub-mode definitions ── */
const SUB_MODES = [
  { id: "music", label: "Music", desc: "Compose original tracks", icon: IconMusic },
  { id: "tts", label: "Voice / TTS", desc: "Text to speech synthesis", icon: IconMic },
  { id: "tools", label: "Tools", desc: "Isolate & process audio", icon: IconTool },
];

/* ── Voice options for TTS ── */
const VOICES = [
  { id: "rachel", name: "Rachel", desc: "Warm, natural female", gender: "female" },
  { id: "domi", name: "Domi", desc: "Calm, steady female", gender: "female" },
  { id: "bella", name: "Bella", desc: "Expressive female", gender: "female" },
  { id: "elli", name: "Elli", desc: "Youthful female", gender: "female" },
  { id: "antoni", name: "Antoni", desc: "Deep, confident male", gender: "male" },
  { id: "josh", name: "Josh", desc: "Friendly male", gender: "male" },
  { id: "arnold", name: "Arnold", desc: "Authoritative male", gender: "male" },
  { id: "sam", name: "Sam", desc: "Balanced male", gender: "male" },
];

/* ── Music style tags ── */
const MUSIC_STYLES = [
  "cinematic", "synthwave", "80s", "orchestral", "electronic", "ambient",
  "lofi", "hip-hop", "rock", "jazz", "pop", "classical", "trap", "EDM",
];

/* ── Audio/TTS prompt suggestions ── */
const AUDIO_SUGGESTIONS = [
  "Epic orchestral score with soaring strings and thunderous drums",
  "Lo-fi chill beats for late night studying, warm vinyl crackle",
  "Dark synthwave with driving bass and neon atmosphere",
  "A peaceful ambient soundscape for meditation, soft pads",
  "80s retro pop with punchy drums and catchy synth melody",
  "Cinematic trailer music with dramatic build-up and powerful brass",
];

/* ══════════════════════════════════════════════════════════════ */
export default function AudioStudio() {
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
  const [styleSearch, setStyleSearch] = useState("");

  const { models: catalogModels, loading: modelsLoading } = useModelCatalog({});
  const audioModels = useMemo(() => catalogModels.filter((m) => matchesGroup(m, "audio")), [catalogModels]);
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const isMobile = useIsMobile();

  const subModels = useMemo(() => {
    switch (subMode) {
      case "music": return audioModels.filter(m => m.capability === "audio" && m.provider?.toLowerCase() === "suno");
      case "tts": return audioModels.filter(m => m.capability === "text-to-speech");
      case "tools": return audioModels.filter(m => m.capability === "audio" && m.provider?.toLowerCase() !== "suno");
      default: return audioModels;
    }
  }, [subMode, audioModels]);

  const [selectedModelId, setSelectedModelId] = useState(null);

  useEffect(() => {
    if (subModels.length) setSelectedModelId(subModels[0].id);
  }, [subModels]);

  const currentModel = subModels.find((m) => m.id === selectedModelId) || subModels[0] || audioModels[0] || {};
  const { cost, affordable, shortfall } = useCreditCost("audio", selectedModelId, { duration, prompt });

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    if (!affordable) return;
    setGenStage("preparing");
    const params = {
      endpoint: currentModel.endpoint || selectedModelId, prompt, duration,
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
    submit("audio", selectedModelId, params);
  }, [prompt, selectedModelId, currentModel, duration, voice, stability, similarity, speed, instrumental, vocalGender, style, title, negativeTags, audioUrl, affordable, submit]);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try { const r = await apiFetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (d.url) setAudioUrl(d.url); } catch {}
  }, []);

  const handleNew = useCallback(() => { setGenStage(""); setPrompt(""); setStyle(""); setTitle(""); setNegativeTags(""); setAudioUrl(null); }, []);
  const handleDownload = useCallback(() => { const url = result?.url || result?.outputUrl || result; if (url && typeof url === "string") window.open(url, "_blank"); }, [result]);

  const filteredStyles = MUSIC_STYLES.filter(s => !styleSearch || s.toLowerCase().includes(styleSearch.toLowerCase()));
  const durationMax = subMode === "tts" ? 60 : 300;

  /* ── Controls ── */
  const controls = (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Sub-mode tabs */}
      {isMobile ? (
        <MobileChipScroller items={SUB_MODES.map(sm => ({ label: sm.label, value: sm.id }))} selectedValue={subMode} onSelect={setSubMode} />
      ) : (
        <div className="v6-segmented" style={{ marginBottom: 16 }}>
          {SUB_MODES.map((sm) => {
            const Icon = sm.icon; const active = subMode === sm.id;
            return (
              <button key={sm.id} className={`v6-segmented-tab${active ? " v6-active" : ""}`}
                style={{ flex: 1, border: 0, background: active ? "var(--v6-surface)" : "transparent", padding: "9px 6px", borderRadius: 8, fontSize: 11, color: active ? "var(--v6-text)" : "var(--v6-muted)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
                onClick={() => setSubMode(sm.id)}>
                <Icon /> {sm.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Music mode */}
      {subMode === "music" && (
        <>
          <div className="v6-field">
            <label className="v6-field-label">Style tags</label>
            <div className="v6-field" style={{ marginBottom: 6 }}>
              <div style={{ position: "relative" }}>
                <IconSearch style={{ width: 12, height: 12, position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--v6-muted)" }} />
                <input className="v6-input" style={{ paddingLeft: 26 }} value={styleSearch} onChange={(e) => setStyleSearch(e.target.value)} placeholder="Filter styles..." />
              </div>
            </div>
            {isMobile ? (
              <MobileChipScroller items={filteredStyles.map(s => ({ label: s, value: s }))} selectedValue={style} onSelect={setStyle} />
            ) : (
              <div className="v6-style-chip-grid">
                {filteredStyles.map((s) => {
                  const active = style.toLowerCase().includes(s.toLowerCase());
                  const styleColors = { cinematic: "#c084fc", synthwave: "#f472b6", electronic: "#60a5fa", orchestral: "#fbbf24", ambient: "#65dca6", lofi: "#fb923c", "hip-hop": "#facc15", rock: "#ef4444", jazz: "#a78bfa", pop: "#f472b6", classical: "#94a3b8", trap: "#f87171", EDM: "#38bdf8" };
                  const dotColor = styleColors[s] || "var(--v6-accent)";
                  return (
                    <button key={s} className={`v6-style-chip${active ? " v6-active" : ""}`} onClick={() => setStyle((prev) => { const parts = prev.split(",").map(p => p.trim()).filter(Boolean); const idx = parts.findIndex(p => p.toLowerCase() === s.toLowerCase()); if (idx >= 0) parts.splice(idx, 1); else parts.push(s); return parts.join(", "); })}>
                      <span className="v6-style-dot" style={{ background: dotColor }} /> {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="v6-field"><label className="v6-field-label">Title</label><input className="v6-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your track a name" /></div>
          <div className="v6-field"><label className="v6-field-label">Lyrics / Prompt</label><textarea className="v6-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Write lyrics or describe the music you want to create\u2026" /></div>

          <div className="v6-field">
            <label className="v6-field-label">Vocal Gender</label>
            <div className="v6-segmented">
              {[{ id: "female", label: "Female", icon: "v6-gender-female" }, { id: "male", label: "Male", icon: "v6-gender-male" }].map((g) => (
                <button key={g.id} className={vocalGender === g.id ? "v6-active" : ""} onClick={() => setVocalGender(g.id)} disabled={instrumental} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flex: 1 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="8" r="5"/>{g.id === "female" ? <><line x1="12" y1="13" x2="12" y2="22"/><line x1="9" y1="17" x2="15" y2="17"/></> : <><line x1="12" y1="13" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>}</svg>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <button className="v6-toggle" onClick={() => setInstrumental(!instrumental)} style={{ marginBottom: 12 }}>
            <div className={`v6-toggle-track${instrumental ? " v6-on" : ""}`}><div className="v6-toggle-thumb" /></div>
            <span className="v6-toggle-label">Instrumental only</span>
          </button>

          <div className="v6-field"><label className="v6-field-label">Negative tags</label><input className="v6-input" value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} placeholder="Tags to avoid" /></div>
        </>
      )}

      {/* TTS mode */}
      {subMode === "tts" && (
        <>
          {currentModel.hasVoice && (
            <div className="v6-field">
              <label className="v6-field-label">Voice</label>
              {isMobile ? (
                <MobileChipScroller items={VOICES.map(v => ({ label: `${v.name} \u2014 ${v.desc}`, value: v.id }))} selectedValue={voice} onSelect={setVoice} />
              ) : (
                <div className="v6-voice-grid" style={{ marginTop: 6 }}>
                  {VOICES.map((v) => {
                    const active = voice === v.id;
                    return (
                      <div key={v.id} className={`v6-voice-card${active ? " v6-active" : ""}`} onClick={() => setVoice(v.id)}>
                        <button className="v6-voice-play" onClick={(e) => { e.stopPropagation(); }}><IconPlay /></button>
                        <div>
                          <div className="v6-voice-name">{v.name}</div>
                          <div className="v6-voice-desc">{v.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="v6-field"><label className="v6-field-label">Text to speak</label><textarea className="v6-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter the text you want to turn into speech\u2026" /></div>

          {currentModel.hasStability && (
            <div className="v6-field">
              <div className="v6-range-row"><span className="v6-muted v6-tiny">Stability</span><span className="v6-mono v6-tiny">{stability.toFixed(2)}</span></div>
              <input type="range" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--v6-accent)" }} />
            </div>
          )}
          {currentModel.hasSimilarity && (
            <div className="v6-field">
              <div className="v6-range-row"><span className="v6-muted v6-tiny">Similarity</span><span className="v6-mono v6-tiny">{similarity.toFixed(2)}</span></div>
              <input type="range" min={0} max={1} step={0.05} value={similarity} onChange={(e) => setSimilarity(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--v6-accent)" }} />
            </div>
          )}
          {currentModel.hasSpeed && (
            <div className="v6-field">
              <div className="v6-range-row"><span className="v6-muted v6-tiny">Speed</span><span className="v6-mono v6-tiny">{speed.toFixed(2)}</span></div>
              <input type="range" min={0.7} max={1.2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--v6-accent)" }} />
            </div>
          )}
        </>
      )}

      {/* Tools mode */}
      {subMode === "tools" && (
        <div className="v6-field">
          <label className="v6-field-label">Audio file to isolate</label>
          <label className="v6-upload-drop"><input type="file" accept="audio/*" onChange={handleUpload} style={{ display: "none" }} /><IconUpload />{audioUrl ? "File loaded \u2014 tap to change" : "Choose audio file"}</label>
          {audioUrl && <div style={{ fontSize: 11, color: "var(--v6-good)", marginTop: 4 }}>Loaded \u2713</div>}
        </div>
      )}

      {/* Duration slider */}
      {subMode !== "tools" && (
        <div className="v6-field">
          {isMobile && (
            <MobileChipScroller
              items={[
                { label: "15s", value: 15 }, { label: "30s", value: 30 }, { label: "45s", value: 45 },
                { label: "60s", value: 60 }, { label: "90s", value: 90 }, { label: "120s", value: 120 },
                { label: "180s", value: 180 }, { label: "300s", value: 300 },
              ]}
              selectedValue={duration}
              onSelect={(v) => setDuration(v)}
            />
          )}
          <div className="v6-range-row">
            <span className="v6-muted" style={{ fontSize: 11 }}>Duration</span>
            <span className="v6-mono" style={{ fontSize: 11, fontWeight: 600 }}>{duration}s</span>
          </div>
          <div className="v6-timeline-bar">
            <input type="range" min={5} max={durationMax} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--v6-accent)" }} />
          </div>
          <div className="v6-timeline-ticks">
            {Array.from({ length: 5 }).map((_, i) => (<span key={i}>{Math.round(durationMax * (i / 4))}s</span>))}
          </div>
        </div>
      )}
    </div>
  );

  /* ── Center ── */
  const centerContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {loading ? (
          <StageArea generating={true} stage={genStage} model={currentModel.name} onCancel={handleNew} />
        ) : result ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "40px 20px", flex: 1 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }} style={{ width: "100%", maxWidth: 460 }}>
              {/* Waveform visualization */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <div className="v6-waveform">
                  {Array.from({ length: 10 }).map((_, i) => (<div key={i} className="v6-wave-bar" />))}
                </div>
              </div>

              <div style={{ borderRadius: 12, overflow: "hidden" }}>
                <audio controls style={{ width: "100%", borderRadius: 10 }} src={result?.url || result?.outputUrl || result} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", marginTop: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{result?.name || title || "Generated audio"}</div>
                <div style={{ fontSize: 12, color: "var(--v6-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <IconBolt />{result?.creditsUsed ?? cost ?? "\u2014"} credits <span style={{ margin: "0 4px", opacity: 0.2 }}>\u00b7</span> <IconClock />{elapsed}s
                </div>
                <div style={{ fontSize: 11, color: "var(--v6-muted)" }}>{currentModel.name} \u00b7 {currentModel.provider}</div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button className="v6-btn v6-primary" onClick={handleDownload}><IconDownload /> Download</button>
                <button className="v6-btn" onClick={handleNew}><IconRefresh /> New</button>
              </div>
            </motion.div>
          </div>
        ) : (
          <StageArea toolLabel="Audio Studio"
            toolDesc={subMode === "tts" ? "Generate speech and voiceovers with natural-sounding TTS." : subMode === "tools" ? "Isolate vocals or process audio files." : "Generate music, songs, and soundtracks from a prompt."}
            toolIcon={<IconMusic />}
            suggestions={AUDIO_SUGGESTIONS}
            onSuggestionClick={(s) => setPrompt(s)}
          />
        )}
      </div>

      <PromptDock value={prompt} onChange={setPrompt} onSubmit={handleGenerate} cost={cost} generating={loading} stage={genStage} icon="bolt" />
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {isMobile ? (
        <MobileModelCarousel models={subModels.map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, speedTier: m.speedTier, credits: 0 }))} selectedModelId={selectedModelId} onSelect={setSelectedModelId} />
      ) : (
        <ModelSelector models={subModels.map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, speedTier: m.speedTier, credits: 0 }))} selectedModelId={selectedModelId} onSelect={setSelectedModelId} label="Audio models" />
      )}
      {selectedModelId && (
        <div className="v6-quote" style={{ marginTop: 14 }}>
          <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel.name}</strong></div>
          <div className="v6-quote-row"><span className="v6-muted">Provider</span><strong>{currentModel.provider}</strong></div>
          {currentModel.speedTier && <div className="v6-quote-row"><span className="v6-muted">Speed</span><strong>{currentModel.speedTier === "premium" ? "Premium" : currentModel.speedTier === "fast" ? "Fast" : currentModel.speedTier}</strong></div>}
          <div className="v6-section-rule" style={{ margin: "8px 0" }} />
          <div className="v6-quote-row"><span className="v6-muted">Cost</span><strong><IconBolt /> {cost != null ? `${cost} credits` : "\u2014"}</strong></div>
          {shortfall > 0 && <div style={{ fontSize: 11, color: "var(--v6-bad)", marginTop: 4, textAlign: "right" }}>Need {shortfall} more credits</div>}
          {duration > 0 && <div className="v6-quote-row"><span className="v6-muted">Duration</span><strong>{duration}s</strong></div>}
        </div>
      )}
      {prompt && (
        <div style={{ marginTop: 12 }}>
          <div className="v6-eyebrow">Prompt</div>
          <div className="v6-quote" style={{ marginTop: 6, fontSize: 11, color: "var(--v6-muted)", lineHeight: 1.5 }}>{prompt}</div>
        </div>
      )}
    </div>
  );

  return <StudioLayout controls={controls} inspector={inspector}>{centerContent}</StudioLayout>;
}
