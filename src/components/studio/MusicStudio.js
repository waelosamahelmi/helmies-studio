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
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";

/* ── Inline SVGs ── */
const IconMusic = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
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
const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);
const IconSpark = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
  </svg>
);

/* ── Music style tags with mood/genre coloring ── */
const MUSIC_STYLES = [
  { label: "cinematic", color: "#c084fc" }, { label: "synthwave", color: "#f472b6" },
  { label: "orchestral", color: "#fbbf24" }, { label: "electronic", color: "#60a5fa" },
  { label: "ambient", color: "#65dca6" }, { label: "lofi", color: "#fb923c" },
  { label: "rock", color: "#ef4444" }, { label: "pop", color: "#f472b6" },
  { label: "jazz", color: "#a78bfa" }, { label: "classical", color: "#94a3b8" },
  { label: "trap", color: "#f87171" }, { label: "EDM", color: "#38bdf8" },
  { label: "hip-hop", color: "#facc15" }, { label: "R&B", color: "#c084fc" },
];

const DURATION_PRESETS = [
  { label: "30s", value: 30 }, { label: "60s", value: 60 }, { label: "90s", value: 90 },
  { label: "2m", value: 120 }, { label: "3m", value: 180 }, { label: "4m", value: 240 }, { label: "5m", value: 300 },
];

/* ══════════════════════════════════════════════════════════════ */
export default function MusicStudio() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [title, setTitle] = useState("");
  const [negativeTags, setNegativeTags] = useState("");
  const [duration, setDuration] = useState(30);
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState("female");
  const [genStage, setGenStage] = useState("");
  const [lyricsExpanded, setLyricsExpanded] = useState(false);

  const { models: audioModels } = useModelCatalog({ modelType: "audio" });
  const sunoModels = useMemo(() => audioModels?.filter(m => m.provider?.toLowerCase() === "suno") || [], [audioModels]);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => { if (sunoModels.length) setSelectedModelId(sunoModels[0].id); }, [sunoModels]);
  const currentModel = sunoModels.find((m) => m.id === selectedModelId) || sunoModels[0] || {};
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const { cost, affordable, shortfall } = useCreditCost("audio", selectedModelId, { duration, prompt });

  /* ── Auto-generate title ── */
  const suggestedTitle = useMemo(() => {
    if (title) return title;
    const styleParts = style ? style.split(",").map(s => s.trim()).filter(Boolean).slice(0, 2) : [];
    const moodParts = vocalGender === "female" ? "Female" : "Male";
    const parts = [...styleParts, instrumental ? "Instrumental" : `${moodParts} Vocal`].filter(Boolean);
    return parts.length ? parts.join(" \u2014 ") : "";
  }, [style, vocalGender, instrumental, title]);

  const lineCount = prompt.split("\n").filter(l => l.trim()).length;

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    if (!affordable) return;
    setGenStage("preparing");
    const params = {
      endpoint: currentModel.endpoint || selectedModelId, prompt, duration,
      ...(currentModel.hasInstrumental ? { instrumental } : {}),
      ...(currentModel.hasVocalGender ? { vocal_gender: vocalGender } : {}),
      ...(currentModel.hasStyle && style ? { style } : {}),
      ...(currentModel.hasTitle ? { title: title || suggestedTitle } : {}),
      ...(currentModel.hasNegativeTags && negativeTags ? { negative_tags: negativeTags } : {}),
    };
    submit("audio", selectedModelId, params);
  }, [prompt, selectedModelId, currentModel, duration, instrumental, vocalGender, style, title, suggestedTitle, negativeTags, affordable, submit]);

  const handleNew = useCallback(() => { setGenStage(""); setPrompt(""); setStyle(""); setTitle(""); setNegativeTags(""); }, []);
  const handleDownload = useCallback(() => { const url = result?.url || result?.outputUrl || result; if (url && typeof url === "string") window.open(url, "_blank"); }, [result]);

  /* ── Controls ── */
  const controls = (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, padding: "8px 10px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}><IconMusic /></div>
        <div><div style={{ fontSize: 13, fontWeight: 600, color: "#c7d2fe" }}>Music Composer</div><div style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Suno AI</div></div>
      </div>

      {/* Style tags */}
      <div className="v6-field">
        <label className="v6-field-label">Style &amp; Mood</label>
        {isMobile ? (
          <MobileChipScroller items={MUSIC_STYLES.map(s => ({ label: s.label, value: s.label }))} selectedValue={style} onSelect={setStyle} />
        ) : (
          <div className="v6-style-chip-grid" style={{ marginTop: 6 }}>
            {MUSIC_STYLES.map((s) => {
              const active = style.toLowerCase().includes(s.label.toLowerCase());
              return (
                <button key={s.label} className={`v6-style-chip${active ? " v6-active" : ""}`}
                  onClick={() => setStyle((prev) => { const parts = prev.split(",").map(p => p.trim()).filter(Boolean); const idx = parts.findIndex(p => p.toLowerCase() === s.label.toLowerCase()); if (idx >= 0) parts.splice(idx, 1); else parts.push(s.label); return parts.join(", "); })}>
                  <span className="v6-style-dot" style={{ background: s.color }} />{s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Track title with auto-suggest */}
      <div className="v6-field">
        <label className="v6-field-label">Track Title</label>
        <input className="v6-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle || "Name your composition"} />
        {suggestedTitle && !title && (
          <div style={{ fontSize: 10, color: "var(--v6-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <IconSpark style={{ width: 10, height: 10 }} /> Auto-suggested: {suggestedTitle}
          </div>
        )}
      </div>

      {/* Lyrics / Prompt */}
      <div className="v6-field">
        <label className="v6-field-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Lyrics / Prompt</span>
          <span className="v6-mono v6-tiny" style={{ color: "var(--v6-muted)" }}>{lineCount} lines</span>
        </label>
        <textarea className="v6-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Write lyrics or describe the music\u2026\n\nEpic orchestral with soaring strings and thunderous drums"
          style={{ minHeight: lyricsExpanded ? 180 : 90, transition: "min-height 0.3s ease" }} />
        <button className="v6-btn v6-ghost v6-sm" onClick={() => setLyricsExpanded(!lyricsExpanded)} style={{ marginTop: 4, fontSize: 10 }}>
          {lyricsExpanded ? "Collapse" : "Expand lyrics"}
        </button>
      </div>

      {/* Instrumental toggle */}
      <button className="v6-toggle" onClick={() => setInstrumental(!instrumental)} style={{ marginBottom: 12 }}>
        <div className={`v6-toggle-track${instrumental ? " v6-on" : ""}`}><div className="v6-toggle-thumb" /></div>
        <span className="v6-toggle-label">Instrumental only</span>
      </button>

      {/* Vocal gender */}
      <div className="v6-field">
        <label className="v6-field-label">Vocal Gender</label>
        <div className="v6-segmented">
          {[{ id: "female", label: "Female" }, { id: "male", label: "Male" }].map((g) => (
            <button key={g.id} className={vocalGender === g.id && !instrumental ? "v6-active" : ""} onClick={() => setVocalGender(g.id)} disabled={instrumental}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flex: 1 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="12" cy="8" r="5"/>{g.id === "female" ? <><line x1="12" y1="13" x2="12" y2="22"/><line x1="9" y1="17" x2="15" y2="17"/></> : <><line x1="12" y1="13" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>}
              </svg> {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Negative tags */}
      <div className="v6-field" style={{ marginTop: 10 }}>
        <label className="v6-field-label">Negative tags</label>
        <input className="v6-input" value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} placeholder="e.g. autotune, lo-fi" />
      </div>

      {/* Duration chips */}
      <div style={{ marginTop: 12 }}>
        <div className="v6-field-label" style={{ marginBottom: 6 }}>Duration</div>
        {isMobile ? (
          <MobileChipScroller items={DURATION_PRESETS.map(p => ({ label: p.label, value: p.value }))} selectedValue={duration} onSelect={setDuration} />
        ) : (
          <div className="v6-chip-row">
            {DURATION_PRESETS.map((preset) => (
              <button key={preset.value} className={`v6-chip${duration === preset.value ? " v6-active" : ""}`} onClick={() => setDuration(preset.value)}>{preset.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Duration timeline */}
      <div className="v6-field" style={{ marginTop: 8 }}>
        <div className="v6-range-row">
          <span className="v6-muted" style={{ fontSize: 11 }}>Fine-tune</span>
          <span className="v6-mono" style={{ fontSize: 11, fontWeight: 600 }}>{duration}s</span>
        </div>
        <div className="v6-timeline-bar">
          <div className="v6-timeline-track">
            <div className="v6-timeline-fill" style={{ width: `${(duration / 300) * 100}%` }} />
          </div>
          <span className="v6-timeline-label">max 5m</span>
        </div>
        <div className="v6-timeline-ticks">
          <span>0s</span><span>1m</span><span>2m</span><span>3m</span><span>5m</span>
        </div>
      </div>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <div className="v6-waveform">
                  {Array.from({ length: 10 }).map((_, i) => (<div key={i} className="v6-wave-bar" />))}
                </div>
              </div>
              <div style={{ borderRadius: 12, overflow: "hidden" }}>
                <audio controls style={{ width: "100%", borderRadius: 10 }} src={result?.url || result?.outputUrl || result} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", marginTop: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{title || result?.name || "Composition"}</div>
                <div style={{ fontSize: 12, color: "var(--v6-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <IconBolt />{result?.creditsUsed ?? cost ?? "\u2014"} credits <span style={{ margin: "0 4px", opacity: 0.2 }}>\u00b7</span> <IconClock />{elapsed}s
                </div>
                <div style={{ fontSize: 11, color: "var(--v6-muted)" }}>{currentModel.name}{instrumental ? " \u00b7 Instrumental" : ` \u00b7 ${vocalGender} vocals`}</div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button className="v6-btn v6-primary" onClick={handleDownload}><IconDownload /> Download</button>
                <button className="v6-btn" onClick={handleNew}><IconRefresh /> Compose again</button>
              </div>
            </motion.div>
          </div>
        ) : (
          <StageArea toolLabel="Music Composer" toolDesc="Compose original music with Suno AI. Describe the style, mood, and genre \u2014 from cinematic scores to electronic beats." toolIcon={<IconMusic />} onSuggestionClick={(s) => setPrompt(s)} />
        )}
      </div>
      <PromptDock value={prompt} onChange={setPrompt} onSubmit={handleGenerate} cost={cost} generating={loading} stage={genStage} icon="bolt" />
    </div>
  );

  /* ── Inspector ── */
  const inspector = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {isMobile ? (
        <MobileModelCarousel models={sunoModels.map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, speedTier: m.speedTier, credits: 0 }))} selectedModelId={selectedModelId} onSelect={setSelectedModelId} />
      ) : (
        <ModelSelector models={sunoModels.map((m) => ({ id: m.id, displayName: m.name, provider: m.provider, speedTier: m.speedTier, credits: 0 }))} selectedModelId={selectedModelId} onSelect={setSelectedModelId} label="Suno models" />
      )}
      {selectedModelId && (
        <div className="v6-quote" style={{ marginTop: 14 }}>
          <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel.name}</strong></div>
          <div className="v6-quote-row"><span className="v6-muted">Provider</span><strong>{currentModel.provider}</strong></div>
          <div className="v6-quote-row"><span className="v6-muted">Duration</span><strong>{duration}s</strong></div>
          {instrumental ? <div className="v6-quote-row"><span className="v6-muted">Mode</span><strong>Instrumental</strong></div>
            : <div className="v6-quote-row"><span className="v6-muted">Vocals</span><strong>{vocalGender === "female" ? "Female" : "Male"}</strong></div>}
          {style && <div className="v6-quote-row"><span className="v6-muted">Style</span><strong>{style}</strong></div>}
          <div className="v6-section-rule" style={{ margin: "8px 0" }} />
          <div className="v6-quote-row"><span className="v6-muted">Estimated cost</span><strong><IconBolt /> {cost != null ? `${cost} credits` : "\u2014"}</strong></div>
          {shortfall > 0 && <div style={{ fontSize: 11, color: "var(--v6-bad)", marginTop: 4, textAlign: "right" }}>Need {shortfall} more credits</div>}
          {cost != null && affordable && <div style={{ fontSize: 11, color: "var(--v6-good)", marginTop: 4, textAlign: "right" }}>\u2713 Affordable</div>}
        </div>
      )}
      {prompt && (
        <div style={{ marginTop: 12 }}>
          <div className="v6-eyebrow">Lyrics / Prompt</div>
          <div className="v6-quote" style={{ marginTop: 6, fontSize: 11, color: "var(--v6-muted)", lineHeight: 1.5, maxHeight: 100, overflow: "hidden" }}>{prompt}</div>
        </div>
      )}
    </div>
  );

  return <StudioLayout controls={controls} inspector={inspector}>{centerContent}</StudioLayout>;
}
