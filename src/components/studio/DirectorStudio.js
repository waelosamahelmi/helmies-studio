"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/client-fetch";

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

const Icons = { IconSpark, IconBolt, IconCheck, IconCross, IconClock, IconPlay, IconRefresh, IconDownload, IconHash };

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
        display: "inline-block", fontSize: "0.6rem", padding: "2px 7px", borderRadius: 100,
        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
        background: `${color}20`, color, border: `1px solid ${color}30`,
      }}
    >
      {label}
    </span>
  );
}

/* ── Production Type Options ── */
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

/* ══════════════════════════════════════════════════════════════ */
export default function DirectorStudio() {
  /* ── State ── */
  const [brief, setBrief] = useState({
    concept: "", title: "", type: "short_form", platform: "youtube",
    style: "", mood: "", duration: 30,
  });
  const [plan, setPlan] = useState(null);
  const [costEstimate, setCostEstimate] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [mode, setMode] = useState("brief"); // "brief" | "plan" | "execute"
  const [activePipelineId, setActivePipelineId] = useState(null);
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approvalMode, setApprovalMode] = useState("auto");
  const [onFailure, setOnFailure] = useState("skip");
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

  const formatCredits = (n) => (n != null ? `${n} credits` : "—");
  const aspectRatio = brief.aspectRatio || PLATFORMS.find((p) => p.id === brief.platform)?.ratio || "16:9";

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
        if (data.pipeline.status === "completed" || data.pipeline.status === "failed" || data.pipeline.status === "cancelled") {
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

  /* ── Layout: node positions for shots ── */
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
    <div className="v6-builder-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="v6-eyebrow">Production Brief</div>

      {/* Title */}
      <div>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Title</label>
        <input
          value={brief.title}
          onChange={(e) => updateBrief("title", e.target.value)}
          placeholder="e.g. Midnight Drive — Official Music Video"
          style={inputStyle}
        />
      </div>

      {/* Type select */}
      <div>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Production Type</label>
        <select
          value={brief.type}
          onChange={(e) => updateBrief("type", e.target.value)}
          style={inputStyle}
        >
          {PRODUCTION_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Platform chips */}
      <div>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Platform</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => updateBrief("platform", p.id)}
              style={{
                padding: "4px 10px", borderRadius: 100, border: `1px solid ${brief.platform === p.id ? "var(--v6-accent)" : "var(--v6-line)"}`,
                background: brief.platform === p.id ? "var(--v6-accent)" : "transparent",
                color: brief.platform === p.id ? "var(--v6-accent-text)" : "var(--v6-muted)",
                fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: "inherit",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Duration (sec)</label>
          <input
            type="number"
            value={brief.duration}
            onChange={(e) => updateBrief("duration", parseInt(e.target.value) || 30)}
            min={5} max={600}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Aspect</label>
          <input value={aspectRatio} readOnly style={{ ...inputStyle, background: "var(--v6-surface2)" }} />
        </div>
      </div>

      {/* Style + Mood */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        <div>
          <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Visual Style</label>
          <input
            value={brief.style}
            onChange={(e) => updateBrief("style", e.target.value)}
            placeholder="Cyberpunk anime, noir thriller..."
            style={inputStyle}
          />
        </div>
        <div>
          <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Mood / Tone</label>
          <input
            value={brief.mood}
            onChange={(e) => updateBrief("mood", e.target.value)}
            placeholder="Dark, atmospheric, hopeful..."
            style={inputStyle}
          />
        </div>
      </div>

      {/* Concept */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Creative Concept</label>
        <textarea
          value={brief.concept}
          onChange={(e) => updateBrief("concept", e.target.value)}
          placeholder="Describe your vision…&#10;&#10;A lone traveler walks through neon-lit streets at midnight, chasing a memory that keeps slipping away…"
          style={{ ...inputStyle, flex: 1, resize: "vertical", minHeight: 100, fontFamily: "inherit" }}
        />
      </div>

      {/* Brand context */}
      <div>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Brand Context</label>
        <select
          value={brandContext?.id || ""}
          onChange={(e) => setBrandContext(e.target.value ? { id: e.target.value } : null)}
          style={inputStyle}
        >
          <option value="">No brand kit</option>
          <option value="brand_1">Helmies Studio</option>
        </select>
      </div>

      {/* Budget quote */}
      {costEstimate && (
        <div style={{
          padding: 10, borderRadius: 10, background: "var(--v6-surface2)",
          border: "1px solid var(--v6-line)", display: "flex", flexDirection: "column", gap: 6,
        }}>
          <span className="v6-muted" style={{ fontSize: 10 }}>Budget Quote</span>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
            <span>Planned</span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", color: "var(--v6-accent)" }}>{formatCredits(costEstimate.totalCredits)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--v6-muted)" }}>
            <span>Max ({costEstimate.shotCount} shots)</span>
            <span>{formatCredits((costEstimate.totalCredits || 0) + (costEstimate.assemblyCost || 0))}</span>
          </div>
        </div>
      )}

      {/* Build button */}
      <button
        className="v6-btn v6-primary"
        onClick={handleCreatePlan}
        disabled={loading}
        style={{ width: "100%" }}
      >
        <IconSpark /> {loading ? "Planning…" : "Build Production Plan"}
      </button>

      {/* Load existing */}
      {pipelines.length > 0 && (
        <div>
          <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Load Pipeline</label>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && handleLoadPipeline(e.target.value)}
            style={inputStyle}
          >
            <option value="" disabled>Select a pipeline…</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  /* ═══════════════════ RENDER: Center Panel (Plan or Execute) ═══════════════ */
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

      {/* ── Plan Mode: Node Canvas ── */}
      {mode === "plan" && plan && (
        <div className="v6-node-canvas" style={{ flex: 1, borderRadius: 10 }}>
          {shots.map((shot, i) => {
            const pos = nodePositions[i] || { left: "10%", top: `${10 + i * 15}%` };
            return (
              <div
                key={shot.id}
                className="v6-node"
                style={{ left: pos.left, top: pos.top }}
              >
                <strong>{shot.title || `Shot ${i + 1}`}</strong>
                <p>{shot.section} · {shot.durationSec}s</p>
                <p>{shot.camera?.framing} · {shot.camera?.lens}</p>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <StatusBadge status="draft" />
                  <span style={{ fontSize: 9, color: "var(--v6-muted)" }}>
                    <IconBolt width={10} height={10} />
                    {costEstimate?.shotCosts?.[i]?.total || "?"}c
                  </span>
                </div>
              </div>
            );
          })}
          {/* Connecting lines between nodes */}
          {shots.length > 1 && shots.slice(0, -1).map((_, i) => {
            const a = nodePositions[i];
            const b = nodePositions[i + 1];
            const angle = Math.atan2(
              parseFloat(b.top) - parseFloat(a.top),
              parseFloat(b.left) - parseFloat(a.left)
            ) * (180 / Math.PI);
            const len = Math.sqrt(
              Math.pow(parseFloat(b.left) - parseFloat(a.left), 2) +
              Math.pow(parseFloat(b.top) - parseFloat(a.top), 2)
            );
            return (
              <div
                key={`line-${i}`}
                style={{
                  position: "absolute",
                  left: a.left,
                  top: a.top,
                  width: `${len}%`,
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: "0 0",
                  borderTop: "1px dashed var(--v6-line)",
                  opacity: 0.5,
                  pointerEvents: "none",
                }}
              />
            );
          })}
        </div>
      )}

      {/* ── Execute Mode: Shot Cards ── */}
      {mode === "execute" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {shots.length === 0 && !loading && (
            <div className="v6-empty-state" style={{ flex: 1 }}>
              <p className="v6-muted">No shots to display</p>
            </div>
          )}

          {shots.map((shot, i) => {
            const status = shot.status || "pending";
            const imageUrl = shot.imageResult?.url || shot.imageResult?.rawUrl;
            const videoUrl = shot.videoResult?.url || shot.videoResult?.rawUrl;
            return (
              <div
                key={shot.id || i}
                style={{
                  padding: 12, borderRadius: 10, border: "1px solid var(--v6-line)",
                  background: "var(--v6-surface2)", display: "flex", alignItems: "flex-start", gap: 12,
                }}
              >
                {/* Thumb */}
                <div style={{
                  width: 72, height: 48, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                  background: "var(--v6-surface)", border: "1px solid var(--v6-line)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : videoUrl ? (
                    <video src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                  ) : (
                    <IconHash width={16} height={16} style={{ color: "var(--v6-line)" }} />
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 12, letterSpacing: "-0.01em" }}>{shot.title || shot.plan?.title || `Shot ${i + 1}`}</strong>
                    <StatusBadge status={status} />
                  </div>
                  {shot.error && (
                    <p style={{ fontSize: 10, color: "#ef4444", margin: 0 }}>{shot.error.slice(0, 100)}</p>
                  )}
                  {shot.videoResult?.prompt && (
                    <p style={{ fontSize: 10, color: "var(--v6-muted)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shot.videoResult.prompt.slice(0, 80)}</p>
                  )}
                </div>

                {/* Rerun actions */}
                {(status === "completed" || status === "failed") && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="v6-btn v6-ghost v6-sm" onClick={() => handleRerunShot(shot.id, "image")} title="Rerun image">Img</button>
                    <button className="v6-btn v6-ghost v6-sm" onClick={() => handleRerunShot(shot.id, "video")} title="Rerun video">Vid</button>
                    <button className="v6-btn v6-primary v6-sm" onClick={() => handleRerunShot(shot.id, "full")} title="Full rerun">All</button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Completed banner */}
          {pipelineStatus === "completed" && (
            <div style={{
              padding: 14, borderRadius: 10, background: "rgba(74,222,128,0.06)",
              border: "1px solid rgba(74,222,128,0.15)", marginTop: 4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <IconCheck width={16} height={16} style={{ color: "#4ade80" }} />
                <strong style={{ color: "#4ade80", fontSize: 13 }}>Production Complete</strong>
              </div>
              <p style={{ fontSize: 11, color: "var(--v6-muted)", margin: 0 }}>
                {shots.filter((s) => s.status === "completed").length}/{shots.length} shots rendered
                {costEstimate && ` · Total: ${formatCredits(costEstimate.totalCredits)}`}
              </p>
            </div>
          )}

          {/* Generating state */}
          {pipelineStatus && pipelineStatus !== "completed" && pipelineStatus !== "failed" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid var(--v6-accent)", borderTopColor: "transparent",
                animation: "spin 1s linear infinite",
              }} />
              <span className="v6-muted" style={{ fontSize: 12 }}>
                {pipelineStatus.replace(/_/g, " ")}
                {pipelineStatus === "queued" && " · Starting soon…"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Empty plan state ── */}
      {mode === "plan" && !plan && (
        <div className="v6-empty-state" style={{ flex: 1 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--v6-surface2)", border: "1px solid var(--v6-line)", display: "grid", placeItems: "center", marginBottom: 12 }}>
            <IconSpark width={24} height={24} style={{ color: "var(--v6-muted)" }} />
          </div>
          <p className="v6-muted" style={{ textAlign: "center" }}>
            Fill in the production brief and click <strong>"Build Production Plan"</strong> to create a shot list
          </p>
        </div>
      )}
    </div>
  );

  /* ═══════════════════ RENDER: Guardrails Panel (Right) ═══════════════ */
  const renderGuardrailsPanel = () => (
    <div className="v6-builder-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="v6-eyebrow">Guardrails</div>

      {/* Approval mode */}
      <div>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Approval Mode</label>
        <select
          value={approvalMode}
          onChange={(e) => setApprovalMode(e.target.value)}
          style={inputStyle}
        >
          <option value="auto">Auto-approve all shots</option>
          <option value="manual">Manual review per shot</option>
          <option value="critical">Review only key shots</option>
        </select>
      </div>

      {/* On-failure behavior */}
      <div>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>On Failure</label>
        <select
          value={onFailure}
          onChange={(e) => setOnFailure(e.target.value)}
          style={inputStyle}
        >
          {ON_FAILURE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Output format */}
      <div>
        <label className="v6-muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>Output Format</label>
        <select
          style={inputStyle}
          defaultValue="mp4"
        >
          <option value="mp4">MP4 (H.264)</option>
          <option value="webm">WebM</option>
          <option value="individual">Individual clips</option>
        </select>
      </div>

      {/* Separator */}
      <div style={{ borderTop: "1px solid var(--v6-line)", margin: "4px 0" }} />

      {/* Metric Grid */}
      <div className="v6-eyebrow">Pipeline Metrics</div>
      <div className="v6-metric-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>State</span>
          <strong style={{ fontSize: 12, textTransform: "capitalize", marginTop: 4 }}>
            {pipelineStatus ? pipelineStatus.replace(/_/g, " ") : (mode === "brief" ? "Draft" : mode === "plan" ? "Planning" : "Active")}
          </strong>
        </div>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>Shots</span>
          <strong style={{ fontSize: 12, marginTop: 4 }}>
            {plan ? plan.shots?.length || shots.length : 0}
          </strong>
        </div>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>Runtime</span>
          <strong style={{ fontSize: 12, marginTop: 4 }}>
            <IconClock width={11} height={11} /> ~{estimatedRuntime}m
          </strong>
        </div>
        <div className="v6-metric" style={{ padding: 12 }}>
          <span>Budget</span>
          <strong style={{ fontSize: 12, marginTop: 4, color: "var(--v6-accent)" }}>
            <IconBolt width={11} height={11} /> {costEstimate ? costEstimate.totalCredits : "—"}
          </strong>
        </div>
      </div>

      {/* Completed shots */}
      {shots.length > 0 && pipelineStatus === "completed" && (
        <div style={{ marginTop: 8 }}>
          <div className="v6-eyebrow">Shot Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {shots.slice(0, 6).map((shot, i) => (
              <div key={shot.id || i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusBadge status={shot.status || "pending"} />
                <span style={{ fontSize: 11 }}>{shot.title || `Shot ${i + 1}`}</span>
              </div>
            ))}
            {shots.length > 6 && (
              <span className="v6-muted" style={{ fontSize: 10, marginLeft: 8 }}>+{shots.length - 6} more shots</span>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)", fontSize: 11, color: "#ef4444",
        }}>
          {error}
        </div>
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
      {/* Mode indicator */}
      <div style={{ display: "flex", gap: 6 }}>
        {["brief", "plan", "execute"].map((m) => (
          <span
            key={m}
            style={{
              fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 100,
              background: mode === m ? "var(--v6-accent)" : "var(--v6-surface2)",
              color: mode === m ? "var(--v6-accent-text)" : "var(--v6-muted)",
              textTransform: "capitalize", letterSpacing: "0.04em",
            }}
          >
            {m}
          </span>
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

      {/* Inline keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Input Style ── */
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  background: "var(--v6-surface2)",
  border: "1px solid var(--v6-line)",
  color: "var(--v6-text)",
  fontSize: 12,
  outline: "none",
  fontFamily: "inherit",
};
