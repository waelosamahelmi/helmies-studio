"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";

/* ── Inline SVG Icons (v6 style: 24x24, stroke currentColor, strokeWidth 1.7) ── */

const IconSpark = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconCheck = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

const IconCross = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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

const IconRefresh = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23,4 23,10 17,10" /><polyline points="1,20 1,14 7,14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

const IconDownload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconHash = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

const IconList = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconAlert = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

/* ── Status Badge ── */
function StatusBadge({ status }) {
  const colors = {
    draft: "#6b7280", planning: "#60a5fa", awaiting_approval: "#facc15", quoted: "#c084fc",
    queued: "#94a3b8", generating_images: "#facc15", generating_video: "#f472b6", generating_audio: "#a78bfa",
    quality_check: "#c084fc", assembling: "#fb923c", completed: "#4ade80",
    paused: "#fbbf24", failed: "#ef4444", cancelled: "#9ca3af",
    pending: "#6b7280",
  };
  const color = colors[status] || colors.pending;
  const label = (status || "pending").replace(/_/g, " ");
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.6rem",
        padding: "2px 7px", borderRadius: 100, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.06em",
        background: `${color}20`, color, border: `1px solid ${color}30`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

/* ── Production Type Definitions ── */
const PRODUCTION_TYPES = [
  { id: "music_video", label: "Music Video" },
  { id: "short_form", label: "Short Form" },
  { id: "cinematic", label: "Cinematic" },
  { id: "commercial", label: "Commercial" },
  { id: "social_media", label: "Social Media" },
];

const PLATFORMS = [
  { id: "instagram", label: "Instagram", ratio: "9:16" },
  { id: "tiktok", label: "TikTok", ratio: "9:16" },
  { id: "youtube", label: "YouTube", ratio: "16:9" },
  { id: "youtube_shorts", label: "Shorts", ratio: "9:16" },
  { id: "twitter", label: "X", ratio: "16:9" },
  { id: "linkedin", label: "LinkedIn", ratio: "1:1" },
];

const ON_FAILURE_OPTIONS = [
  { id: "stop", label: "Stop pipeline on first failure" },
  { id: "skip", label: "Skip failed shots, continue" },
  { id: "retry", label: "Retry once, then skip" },
];

const BRIEF_IDEAS = [
  { title: "Cosmic Dancer", concept: "A dancer floats through zero gravity inside a nebula, stars swirling with each movement. Neon silhouette against cosmic dust." },
  { title: "Urban Noir", concept: "A detective walks rain-slicked streets under flickering neon signs. Long shadows, cigarette smoke, 1940s atmosphere meets cyberpunk." },
  { title: "Product Reel", concept: "Cinematic close-ups of a luxury watch. Light caresses the polished surfaces. Slow motion, macro lens, dramatic score." },
  { title: "Nature Awakens", concept: "Time-lapse journey from frozen winter to blooming spring. A single tree through four seasons, morning mist to golden sunset." },
];

/* ══════════════════════════════════════════════════════════════ */
export default function DirectorStudio() {
  /* ── State ── */
  const isMobile = useIsMobile();
  const [brief, setBrief] = useState({
    concept: "", title: "", type: "short_form", platform: "youtube",
    style: "", mood: "", duration: 30,
  });
  const [plan, setPlan] = useState(null);
  const [costEstimate, setCostEstimate] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [mode, setMode] = useState("brief");
  const [activePipelineId, setActivePipelineId] = useState(null);
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approvalMode, setApprovalMode] = useState("auto");
  const [onFailure, setOnFailure] = useState("skip");
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [pipelines, setPipelines] = useState([]);
  const [brandContext, setBrandContext] = useState(null);

  const pollRef = useRef(null);

  /* ── Load pipelines ── */
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/director/status");
        const data = await res.json();
        if (data.pipelines) setPipelines(data.pipelines);
      } catch {}
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  /* ── Helpers ── */
  const updateBrief = (field, value) => {
    setBrief((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "platform") {
        const p = PLATFORMS.find((x) => x.id === value);
        if (p) next.aspectRatio = p.ratio;
      }
      return next;
    });
  };

  const fillBriefIdea = (idea) => {
    setBrief((prev) => ({ ...prev, title: idea.title, concept: idea.concept }));
  };

  const formatCredits = (n) => (n != null ? `${n} credits` : "\u2014");
  const aspectRatio = brief.aspectRatio || PLATFORMS.find((p) => p.id === brief.platform)?.ratio || "16:9";
  const completedShots = shots.filter((s) => s.status === "completed").length;
  const shotProgressPct = shots.length > 0 ? Math.round((completedShots / shots.length) * 100) : 0;

  /* ── Build Production Plan ── */
  const handleCreatePlan = async () => {
    if (!brief.concept && !brief.title) { setError("Provide a concept or title"); return; }
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/director/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: brief.concept, title: brief.title, type: brief.type,
          platform: brief.platform, duration: brief.duration, style: brief.style,
          mood: brief.mood, aspectRatio, brandKit: brandContext,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const data = await res.json();
      setPlan(data.plan);
      setCostEstimate(data.costEstimate);
      setActivePipelineId(data.pipelineId);
      setShots(data.plan?.shots || []);
      setMode("plan");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  /* ── Execute Pipeline ── */
  const handleExecute = async () => {
    if (!activePipelineId) return;
    setLoading(true); setError(null); setMode("execute");
    setPipelineStatus("queued");
    try {
      const res = await apiFetch("/api/director/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: activePipelineId, stopOnFailure: onFailure === "stop" }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Execution failed"); }
      const data = await res.json();
      if (data.success) {
        setPipelineStatus("completed");
        setShots(data.results || []);
      } else {
        setPipelineStatus("failed");
        setError(data.error || "Execution failed");
      }
    } catch (e) { setError(e.message); setPipelineStatus("failed"); } finally { setLoading(false); }
  };

  /* ── Polling ── */
  const startPolling = useCallback((pipelineId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const poll = async () => {
      try {
        const res = await apiFetch(`/api/director/status?pipelineId=${pipelineId}`);
        const data = await res.json();
        if (!data.pipeline) return;
        setPipelineStatus(data.pipeline.status);
        setShots(data.pipeline.shots || []);
        if (["completed", "failed", "cancelled"].includes(data.pipeline.status)) {
          clearInterval(pollRef.current); pollRef.current = null;
          if (data.pipeline.status === "completed") setPipelineStatus("completed");
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 3000);
    poll();
  }, []);

  /* ── Load existing pipeline ── */
  const handleLoadPipeline = async (pipelineId) => {
    if (!pipelineId) return;
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/director/status?pipelineId=${pipelineId}`);
      const data = await res.json();
      if (!data.pipeline) throw new Error("Pipeline not found");
      setActivePipelineId(pipelineId);
      setPlan(data.pipeline.plan);
      setCostEstimate(data.pipeline.costEstimate);
      setPipelineStatus(data.pipeline.status);
      setShots(data.pipeline.shots || []);
      if (data.pipeline.brief) setBrief((prev) => ({ ...prev, ...data.pipeline.brief }));
      const st = data.pipeline.status;
      if (st === "completed" || st === "failed") setMode("execute");
      else if (["generating_images", "generating_video", "generating_audio", "assembling", "queued"].includes(st)) {
        setMode("execute"); startPolling(pipelineId);
      } else setMode("plan");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  /* ── Rerun a shot ── */
  const handleRerunShot = async (shotId, rerunType = "full") => {
    setError(null);
    try {
      const res = await apiFetch("/api/director/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: activePipelineId, shotId, rerunType }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Rerun failed"); }
      if (activePipelineId) {
        const sr = await apiFetch(`/api/director/status?pipelineId=${activePipelineId}`);
        const sd = await sr.json();
        if (sd.pipeline) setShots(sd.pipeline.shots || []);
      }
    } catch (e) { setError(e.message); }
  };

  /* ── Estimated runtime ── */
  const estimatedRuntime = plan ? Math.ceil((plan.shots?.length || 0) * 8 / 60) : 0;

  /* ── Node positions with stagger ── */
  const nodePositions = (shots.length > 0)
    ? shots.map((_, i) => {
        const cols = Math.ceil(Math.sqrt(shots.length));
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          left: `${5 + col * ((90 - 5) / Math.max(cols, 1))}%`,
          top: `${10 + row * ((80 - 10) / Math.ceil(shots.length / Math.max(cols, 1)))}%`,
        };
      })
    : [];

  /* ═══════════════════ RENDER: Brief Panel (Left) ═══════════════ */
  const renderBriefPanel = () => (
    <div className="v6-builder-panel v6-entrance-fade" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="v6-eyebrow">Production Brief</div>

      {/* Title */}
      <div className="v6-field">
        <label className="v6-field-label">Title</label>
        <input
          className="v6-input"
          value={brief.title}
          onChange={(e) => updateBrief("title", e.target.value)}
          placeholder="e.g. Midnight Drive \u2014 Official Music Video"
        />
      </div>

      {/* Type + Platform */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="v6-field">
          <label className="v6-field-label">Type</label>
          {isMobile ? (
            <MobileChipScroller items={PRODUCTION_TYPES.map(t => ({ label: t.label, value: t.id }))} selectedValue={brief.type} onSelect={(v) => updateBrief("type", v)} />
          ) : (
            <div className="v6-select-wrap">
              <select className="v6-select" value={brief.type} onChange={(e) => updateBrief("type", e.target.value)}>
                {PRODUCTION_TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
              </select>
            </div>
          )}
        </div>
        <div className="v6-field">
          <label className="v6-field-label">Platform</label>
          {isMobile ? (
            <MobileChipScroller items={PLATFORMS.map(p => ({ label: p.label, value: p.id }))} selectedValue={brief.platform} onSelect={(v) => updateBrief("platform", v)} />
          ) : (
            <div className="v6-select-wrap">
              <select className="v6-select" value={brief.platform} onChange={(e) => updateBrief("platform", e.target.value)}>
                {PLATFORMS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Duration + Aspect */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="v6-field">
          <label className="v6-field-label">Duration (sec)</label>
          {isMobile ? (
            <MobileChipScroller items={[{ label: "15s", value: 15 }, { label: "30s", value: 30 }, { label: "60s", value: 60 }, { label: "90s", value: 90 }, { label: "120s", value: 120 }, { label: "180s", value: 180 }, { label: "300s", value: 300 }]} selectedValue={brief.duration} onSelect={(v) => updateBrief("duration", v)} />
          ) : (
            <input className="v6-input" type="number" value={brief.duration} onChange={(e) => updateBrief("duration", parseInt(e.target.value) || 30)} min={5} max={600} />
          )}
        </div>
        <div className="v6-field">
          <label className="v6-field-label">Aspect</label>
          <input className="v6-input" value={aspectRatio} readOnly style={{ opacity: 0.6 }} />
        </div>
      </div>

      {/* Style + Mood */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        <div className="v6-field">
          <label className="v6-field-label">Visual Style</label>
          <input className="v6-input" value={brief.style} onChange={(e) => updateBrief("style", e.target.value)} placeholder="Cyberpunk anime, noir thriller..." />
        </div>
        <div className="v6-field">
          <label className="v6-field-label">Mood / Tone</label>
          <input className="v6-input" value={brief.mood} onChange={(e) => updateBrief("mood", e.target.value)} placeholder="Dark, atmospheric, hopeful..." />
        </div>
      </div>

      {/* Concept */}
      <div className="v6-field" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <label className="v6-field-label">Creative Concept</label>
        <textarea
          className="v6-textarea"
          value={brief.concept}
          onChange={(e) => updateBrief("concept", e.target.value)}
          placeholder="Describe your vision\u2026\n\nA lone traveler walks through neon-lit streets at midnight, chasing a memory that keeps slipping away\u2026"
          style={{ flex: 1 }}
        />
      </div>

      {/* Brand context */}
      <div className="v6-field">
        <label className="v6-field-label">Brand Context</label>
        <div className="v6-select-wrap">
          <select className="v6-select" value={brandContext?.id || ""} onChange={(e) => setBrandContext(e.target.value ? { id: e.target.value } : null)}>
            <option value="">No brand kit</option>
            <option value="brand_1">Helmies Studio</option>
          </select>
        </div>
      </div>

      {/* Budget quote */}
      {costEstimate && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="v6-quote" style={{ borderColor: "color-mix(in srgb, var(--v6-accent), var(--v6-line) 50%)" }}>
          <div className="v6-quote-row"><span className="v6-muted">Budget Quote</span></div>
          <div className="v6-quote-row">
            <strong>Planned</strong>
            <strong style={{ color: "var(--v6-accent)", fontFamily: "var(--v6-mono)" }}>{formatCredits(costEstimate.totalCredits)}</strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Max ({costEstimate.shotCount} shots)</span>
            <span className="v6-muted">{formatCredits((costEstimate.totalCredits || 0) + (costEstimate.assemblyCost || 0))}</span>
          </div>
        </motion.div>
      )}

      {/* Build button */}
      <button className="v6-btn v6-primary" onClick={handleCreatePlan} disabled={loading} style={{ width: "100%" }}>
        <IconSpark /> {loading ? "Planning\u2026" : "Build Production Plan"}
      </button>
      <span className="v6-kbd-hint" style={{ textAlign: "center" }}>Shift + Enter to execute</span>

      {/* Load existing */}
      {pipelines.length > 0 && (
        <div className="v6-field">
          <label className="v6-field-label">Load Pipeline</label>
          <div className="v6-select-wrap">
            <select className="v6-select" defaultValue="" onChange={(e) => e.target.value && handleLoadPipeline(e.target.value)}>
              <option value="" disabled>Select a pipeline\u2026</option>
              {pipelines.map((p) => (<option key={p.id} value={p.id}>{p.title} ({p.status})</option>))}
            </select>
          </div>
        </div>
      )}
    </div>
  );

  /* ═══════════════════ RENDER: Center Panel ═══════════════ */
  const renderCenterPanel = () => (
    <div className="v6-builder-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="v6-eyebrow">{mode === "execute" ? "Pipeline" : "Production Plan"}</div>
          <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {brief.title || plan?.conceptSummary?.slice(0, 40) || "Untitled Production"}
          </h3>
        </div>
        {mode === "plan" && plan && (
          <button className="v6-btn v6-primary" onClick={handleExecute} disabled={loading}>
            <IconPlay /> Execute Pipeline
          </button>
        )}
        {mode === "execute" && pipelineStatus === "completed" && (
          <button className="v6-btn" onClick={() => { setMode("brief"); setPlan(null); setCostEstimate(null); setPipelineStatus(null); setShots([]); }}>
            <IconRefresh /> New Production
          </button>
        )}
      </div>

      {/* ── Plan Mode: Node Canvas with stagger ── */}
      {mode === "plan" && plan && (
        <div className="v6-node-canvas" style={{ flex: 1, borderRadius: 10 }}>
          {shots.map((shot, i) => {
            const pos = nodePositions[i] || { left: "10%", top: `${10 + i * 15}%` };
            return (
              <motion.div
                key={shot.id}
                className="v6-node"
                style={{ left: pos.left, top: pos.top }}
                initial={{ opacity: 0, scale: 0.9, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.35, ease: "easeOut" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, background: "var(--v6-accent)",
                    color: "#fff", fontSize: 9, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0
                  }}>{i + 1}</span>
                  <strong>{shot.title || `Shot ${i + 1}`}</strong>
                </div>
                <p>{shot.section} \u00b7 {shot.durationSec}s</p>
                <p>{shot.camera?.framing} \u00b7 {shot.camera?.lens}</p>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <StatusBadge status="draft" />
                  <span style={{ fontSize: 9, color: "var(--v6-muted)", display: "flex", alignItems: "center", gap: 2 }}>
                    <IconBolt />{costEstimate?.shotCosts?.[i]?.total || "?"}c
                  </span>
                </div>
              </motion.div>
            );
          })}
          {/* Connecting lines */}
          {shots.length > 1 && shots.slice(0, -1).map((_, i) => {
            const a = nodePositions[i]; const b = nodePositions[i + 1];
            if (!a || !b) return null;
            const angle = Math.atan2(parseFloat(b.top) - parseFloat(a.top), parseFloat(b.left) - parseFloat(a.left)) * (180 / Math.PI);
            const len = Math.sqrt(Math.pow(parseFloat(b.left) - parseFloat(a.left), 2) + Math.pow(parseFloat(b.top) - parseFloat(a.top), 2));
            return (
              <div key={`line-${i}`} style={{
                position: "absolute", left: a.left, top: a.top, width: `${len}%`,
                transform: `rotate(${angle}deg)`, transformOrigin: "0 0",
                borderTop: "1px dashed var(--v6-line)", opacity: 0.5, pointerEvents: "none",
              }} />
            );
          })}
        </div>
      )}

      {/* ── Execute Mode: Shot Cards ── */}
      {mode === "execute" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Progress bar */}
          {shots.length > 0 && (
            <div className="v6-progress-bar-wrap">
              <IconList />
              <div className="v6-progress-bar">
                <div className="v6-progress-fill" style={{ width: `${shotProgressPct}%` }} />
              </div>
              <span className="v6-progress-label">{completedShots}/{shots.length}</span>
            </div>
          )}

          {shots.length === 0 && !loading && (
            <div className="v6-empty-state" style={{ flex: 1 }}>
              <div className="v6-empty-orbit"><IconPlay /></div>
              <p className="v6-muted">Pipeline is queued. Shots will appear as they generate.</p>
            </div>
          )}

          <div className="v6-stagger" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shots.map((shot, i) => {
              const status = shot.status || "pending";
              const imageUrl = shot.imageResult?.url || shot.imageResult?.rawUrl;
              const videoUrl = shot.videoResult?.url || shot.videoResult?.rawUrl;
              const statusColors = {
                completed: "var(--v6-good)", failed: "var(--v6-bad)",
                processing: "var(--v6-warn)", generating_images: "var(--v6-warn)",
                generating_video: "var(--v6-warn)", pending: "var(--v6-muted)",
              };
              const barColor = statusColors[status] || "var(--v6-muted)";

              return (
                <div key={shot.id || i} className="v6-shot-card" style={{ animationDelay: `${i * 0.05}s` }}>
                  {/* Status bar */}
                  <div className="v6-shot-status-bar" style={{ background: barColor }} />

                  {/* Thumbnail */}
                  <div className="v6-shot-thumb">
                    {imageUrl
                      ? <img src={imageUrl} alt="" />
                      : videoUrl
                        ? <video src={videoUrl} muted />
                        : <IconHash style={{ width: 18, height: 18, color: "var(--v6-line)" }} />
                    }
                    <span className="v6-shot-number">#{i + 1}</span>
                  </div>

                  {/* Info */}
                  <div className="v6-shot-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <strong>{shot.title || shot.plan?.title || `Shot ${i + 1}`}</strong>
                      <StatusBadge status={status} />
                    </div>
                    {shot.section && <p>{shot.section} \u00b7 {shot.durationSec}s \u00b7 {shot.camera?.framing}</p>}
                    {shot.error && <p style={{ color: "var(--v6-bad)", fontSize: 10, margin: 0 }}>{shot.error.slice(0, 100)}</p>}
                    {shot.videoResult?.prompt && (
                      <p style={{ fontSize: 10, color: "var(--v6-muted)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {shot.videoResult.prompt.slice(0, 80)}
                      </p>
                    )}
                  </div>

                  {/* Rerun actions */}
                  {(status === "completed" || status === "failed") && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button className="v6-btn v6-ghost v6-sm v6-tooltip" data-tooltip="Rerun image" onClick={() => handleRerunShot(shot.id, "image")}>Img</button>
                      <button className="v6-btn v6-ghost v6-sm v6-tooltip" data-tooltip="Rerun video" onClick={() => handleRerunShot(shot.id, "video")}>Vid</button>
                      <button className="v6-btn v6-primary v6-sm" onClick={() => handleRerunShot(shot.id, "full")}>All</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Completed banner */}
          {pipelineStatus === "completed" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ padding: 14, borderRadius: 10, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <IconCheck style={{ width: 16, height: 16, color: "#4ade80" }} />
                <strong style={{ color: "#4ade80", fontSize: 13 }}>Production Complete</strong>
              </div>
              <p style={{ fontSize: 11, color: "var(--v6-muted)", margin: 0 }}>
                {completedShots}/{shots.length} shots rendered{costEstimate && ` \u00b7 Total: ${formatCredits(costEstimate.totalCredits)}`}
              </p>
            </motion.div>
          )}

          {/* Generating state */}
          {pipelineStatus && pipelineStatus !== "completed" && pipelineStatus !== "failed" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 }}>
              <div className="v6-typing-dots"><span /><span /><span /></div>
              <span className="v6-muted" style={{ fontSize: 12 }}>
                {pipelineStatus.replace(/_/g, " ")}{pipelineStatus === "queued" ? " \u00b7 Starting soon\u2026" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Empty plan state with brief ideas ── */}
      {mode === "plan" && !plan && (
        <div className="v6-empty-state" style={{ flex: 1 }}>
          <div className="v6-empty-orbit"><IconSpark /></div>
          <h2>Create your first production</h2>
          <p>Fill in the production brief and build a shot-by-shot plan, or start from one of these ideas.</p>
          <div className="v6-brief-ideas">
            {BRIEF_IDEAS.map((idea, i) => (
              <motion.button
                key={i}
                className="v6-brief-idea"
                onClick={() => fillBriefIdea(idea)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <strong style={{ display: "block", fontSize: 10, marginBottom: 2, color: "var(--v6-text)" }}>{idea.title}</strong>
                {idea.concept.slice(0, 90)}\u2026
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ═══════════════════ RENDER: Guardrails Panel (Right) ═══════════════ */
  const renderGuardrailsPanel = () => (
    <div className="v6-builder-panel v6-entrance-fade" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="v6-eyebrow">Guardrails</div>

      {/* Approval mode */}
      <div className="v6-field">
        <label className="v6-field-label">Approval Mode</label>
        <div className="v6-select-wrap">
          <select className="v6-select" value={approvalMode} onChange={(e) => setApprovalMode(e.target.value)}>
            <option value="auto">Auto-approve all shots</option>
            <option value="manual">Manual review per shot</option>
            <option value="critical">Review only key shots</option>
          </select>
        </div>
      </div>

      {/* On-failure behavior */}
      <div className="v6-field">
        <label className="v6-field-label">On Failure</label>
        <div className="v6-select-wrap">
          <select className="v6-select" value={onFailure} onChange={(e) => setOnFailure(e.target.value)}>
            {ON_FAILURE_OPTIONS.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
          </select>
        </div>
      </div>

      {/* Output format */}
      <div className="v6-field">
        <label className="v6-field-label">Output Format</label>
        <div className="v6-select-wrap">
          <select className="v6-select" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
            <option value="mp4">MP4 (H.264)</option>
            <option value="webm">WebM</option>
            <option value="individual">Individual clips</option>
          </select>
        </div>
      </div>

      <div className="v6-section-rule" />

      {/* Pipeline Metrics */}
      <div className="v6-eyebrow">Pipeline Metrics</div>
      <div className="v6-metric-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>State</span>
          <motion.strong
            key={pipelineStatus || mode}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: 12, textTransform: "capitalize", marginTop: 4, display: "block" }}
          >
            {pipelineStatus ? pipelineStatus.replace(/_/g, " ") : (mode === "brief" ? "Draft" : mode === "plan" ? "Planning" : "Active")}
          </motion.strong>
        </div>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>Shots</span>
          <motion.strong
            key={shots.length}
            initial={{ scale: 1.2 }} animate={{ scale: 1 }}
            style={{ fontSize: 18, marginTop: 4, display: "block", letterSpacing: "-0.03em" }}
          >
            {plan ? plan.shots?.length || shots.length : 0}
          </motion.strong>
        </div>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>Runtime</span>
          <strong style={{ fontSize: 12, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <IconClock /> ~{estimatedRuntime}m
          </strong>
        </div>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>Budget</span>
          <strong style={{ fontSize: 12, marginTop: 4, color: "var(--v6-accent)", display: "flex", alignItems: "center", gap: 4 }}>
            <IconBolt /> {costEstimate ? costEstimate.totalCredits : "\u2014"}
          </strong>
        </div>
      </div>

      {/* Shot Breakdown */}
      {shots.length > 0 && pipelineStatus === "completed" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 8 }}>
          <div className="v6-eyebrow">Shot Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {shots.slice(0, 6).map((shot, i) => (
              <div key={shot.id || i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusBadge status={shot.status || "pending"} />
                <span style={{ fontSize: 11 }}>{shot.title || `Shot ${i + 1}`}</span>
              </div>
            ))}
            {shots.length > 6 && <span className="v6-muted v6-tiny" style={{ marginLeft: 8 }}>+{shots.length - 6} more shots</span>}
          </div>
        </motion.div>
      )}

      {/* Error display */}
      {error && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 11, color: "#ef4444", display: "flex", alignItems: "flex-start", gap: 6 }}>
          <IconAlert style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} /> {error}
        </motion.div>
      )}
    </div>
  );

  /* ═══════════════════ RENDER: Header ── */
  const renderHeader = () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-display, inherit)", letterSpacing: "-0.03em", margin: 0 }}>
          Director Studio
        </h1>
        <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--v6-muted)" }}>
          Multi-shot production pipeline director
        </p>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {["brief", "plan", "execute"].map((m) => (
          <motion.span
            key={m}
            whileTap={{ scale: 0.95 }}
            style={{
              fontSize: 10, fontWeight: 600, padding: "4px 12px", borderRadius: 100, cursor: "pointer",
              background: mode === m ? "var(--v6-accent)" : "var(--v6-surface2)",
              color: mode === m ? "var(--v6-accent-text)" : "var(--v6-muted)",
              textTransform: "capitalize", letterSpacing: "0.04em",
              transition: "all 0.2s",
            }}
          >
            {m}
          </motion.span>
        ))}
      </div>
    </div>
  );

  /* ═══════════════════ RENDER ── */
  return (
    <div style={{ height: "100%", padding: 18, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {renderHeader()}
      <div className="v6-builder-grid" style={{ flex: 1, minHeight: 0 }}>
        {renderBriefPanel()}
        {renderCenterPanel()}
        {renderGuardrailsPanel()}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
