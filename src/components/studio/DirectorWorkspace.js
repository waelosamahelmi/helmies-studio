"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import { PRODUCTION_TYPE_PRESETS } from "@/lib/director-constants";
import { IconArrowUpRight, IconBolt, IconSparkle, IconCheck, IconChevron } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];
const SPRING = { type: "spring", stiffness: 420, damping: 30 };

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: "📸", aspect: "9:16" },
  { id: "tiktok", label: "TikTok", icon: "🎵", aspect: "9:16" },
  { id: "youtube", label: "YouTube", icon: "▶", aspect: "16:9" },
  { id: "youtube_shorts", label: "Shorts", icon: "⚡", aspect: "9:16" },
  { id: "twitter", label: "X", icon: "✕", aspect: "16:9" },
  { id: "linkedin", label: "LinkedIn", icon: "in", aspect: "1:1" },
  { id: "facebook", label: "Facebook", icon: "f", aspect: "1:1" },
];

const PRODUCTION_TYPES = Object.entries(PRODUCTION_TYPE_PRESETS).map(([id, p]) => ({ id, label: p.label }));

const PIPELINE_STAGE_LABELS = {
  draft: "Draft", planning: "Planning", awaiting_approval: "Approval", quoted: "Quoted",
  queued: "Queued", generating_images: "Images", generating_video: "Video", generating_audio: "Audio",
  quality_check: "QA", assembling: "Assemble", completed: "Done",
  paused: "Paused", failed: "Failed", cancelled: "Cancelled",
};

const PIPELINE_STAGE_ORDER = [
  "draft", "planning", "awaiting_approval", "quoted", "queued",
  "generating_images", "generating_video", "generating_audio",
  "quality_check", "assembling", "completed",
];

const stageIndex = (s) => PIPELINE_STAGE_ORDER.indexOf(s);
const isStageComplete = (a, b) => stageIndex(a) >= stageIndex(b);
const isStageActive = (a, b) => a === b;
const isStageFailed = (a) => a === "failed" || a === "cancelled";

function PipelineStage({ status }) {
  const failed = isStageFailed(status);
  return (
    <div className="studio__progress-premium" style={{ maxWidth: "100%" }}>
      <div className="studio__progress-stages-premium">
        {PIPELINE_STAGE_ORDER.map((stage, i) => {
          const complete = isStageComplete(status, stage);
          const active = isStageActive(status, stage);
          const cls = complete ? "done" : active ? "active" : "";
          return (
            <div className="studio__progress-stage-premium" key={stage}>
              <div className={`studio__progress-stage-icon ${cls ? `studio__progress-stage-icon--${cls}` : ""}`}
                style={failed && i === stageIndex(status) ? { background: "#FF4D4D", borderColor: "#FF4D4D", color: "#fff" } : undefined}>
                {complete && !failed ? <IconCheck width={11} height={11} /> : active && !complete ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent" }} /> : <span style={{ fontSize: 9 }}>{i + 1}</span>}
              </div>
              {i < PIPELINE_STAGE_ORDER.length - 1 && (
                <div className={`studio__progress-stage-connector ${complete ? "studio__progress-stage-connector--done" : active ? "studio__progress-stage-connector--active" : ""}`} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {PIPELINE_STAGE_ORDER.map((stage) => (
          <span key={stage} style={{ fontSize: "0.55rem", color: isStageActive(status, stage) ? "var(--color-brand)" : "var(--color-text-faint)", fontWeight: isStageActive(status, stage) ? 600 : 400, flex: 1, textAlign: "center" }}>
            {PIPELINE_STAGE_LABELS[stage]}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlatformChip({ p, active, onClick }) {
  return (
    <motion.button
      className={`studio__chip-premium ${active ? "studio__chip-premium--active" : ""}`}
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      type="button"
    >
      <span className="studio__chip-premium-icon" style={{ fontSize: 11, width: "auto", height: "auto" }}>{p.icon}</span>
      {p.label}
    </motion.button>
  );
}

function PresetCard({ t, active, onClick }) {
  return (
    <motion.button
      className={`studio__glass studio__model-card ${active ? "studio__model-card--active" : ""}`}
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      style={{ padding: "12px 14px", textAlign: "left" }}
      type="button"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>{t.label}</span>
        {active && <IconCheck width={14} height={14} style={{ color: "var(--color-brand)" }} />}
      </div>
    </motion.button>
  );
}

function PremiumInput(props) {
  return <input {...props} className="studio__composer-premium" style={inputStyle} />;
}
function PremiumTextarea(props) {
  return <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: props.minHeight || 96, fontFamily: "var(--font-sans)" }} />;
}
function PremiumSelect({ children, ...props }) {
  return <select {...props} style={inputStyle}>{children}</select>;
}
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--color-hairline)",
  color: "var(--color-text)",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--font-sans)",
};

function Label({ children }) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {children}
    </label>
  );
}

function GlassField({ label, children }) {
  return (
    <div className="studio__glass" style={{ padding: 12, borderRadius: 12 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function DirectorWorkspace() {
  const [mode, setMode] = useState("brief");
  const [pipelines, setPipelines] = useState([]);
  const [activePipeline, setActivePipeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [brief, setBrief] = useState({
    title: "", type: "music_video", duration: 60, platform: "instagram",
    concept: "", style: "", mood: "", characters: [], references: [],
    modelImage: "", modelVideo: "",
  });

  const [plan, setPlan] = useState(null);
  const [costEstimate, setCostEstimate] = useState(null);
  const [validation, setValidation] = useState(null);
  const [expandedShot, setExpandedShot] = useState(null);

  const [executing, setExecuting] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [shots, setShots] = useState([]);
  const pollRef = useRef(null);

  useEffect(() => {
    loadPipelines();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadPipelines = async () => {
    try {
      const res = await apiFetch("/api/director/status");
      const data = await res.json();
      if (data.pipelines) setPipelines(data.pipelines);
    } catch {}
  };

  const handleCreatePlan = async () => {
    if (!brief.concept && !brief.title) { setError("Please provide a title or concept"); return; }
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/director/plan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create plan"); }
      const data = await res.json();
      setPlan(data.plan); setCostEstimate(data.costEstimate); setValidation(data.validation);
      setActivePipeline(data.pipelineId); setMode("plan");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleExecute = async () => {
    if (!activePipeline) return;
    setExecuting(true); setError(null); setMode("executing");
    try {
      const res = await apiFetch("/api/director/execute", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: activePipeline }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Execution failed"); }
      const data = await res.json();
      if (data.success) { setMode("complete"); setPipelineStatus("completed"); setShots(data.results || []); }
      else { setPipelineStatus("failed"); setError(data.error || "Execution failed"); }
    } catch (e) { setError(e.message); setPipelineStatus("failed"); } finally { setExecuting(false); }
  };

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
          clearInterval(pollRef.current); pollRef.current = null; setExecuting(false);
          if (data.pipeline.status === "completed") setMode("complete");
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 3000); poll();
  }, []);

  const handleRerunShot = async (shotId, rerunType = "full") => {
    setError(null);
    try {
      const res = await apiFetch("/api/director/rerun", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: activePipeline, shotId, rerunType }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Rerun failed"); }
      if (activePipeline) {
        const statusRes = await apiFetch(`/api/director/status?pipelineId=${activePipeline}`);
        const statusData = await statusRes.json();
        if (statusData.pipeline) setShots(statusData.pipeline.shots || []);
      }
    } catch (e) { setError(e.message); }
  };

  const handleLoadPipeline = async (pipelineId) => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/director/status?pipelineId=${pipelineId}`);
      const data = await res.json();
      if (!data.pipeline) throw new Error("Pipeline not found");
      setActivePipeline(pipelineId); setPlan(data.pipeline.plan);
      setCostEstimate(data.pipeline.costEstimate); setPipelineStatus(data.pipeline.status);
      setShots(data.pipeline.shots || []);
      if (data.pipeline.status === "completed") setMode("complete");
      else if (["generating_images", "generating_video", "generating_audio", "assembling"].includes(data.pipeline.status)) {
        setMode("executing"); setExecuting(true); startPolling(pipelineId);
      } else setMode("plan");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const updateBrief = (field, value) => {
    setBrief((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "platform") {
        const p = PLATFORMS.find((x) => x.id === value);
        if (p) next.aspectRatio = p.aspect;
      }
      return next;
    });
  };

  const formatCredits = (n) => `${n || 0} credits`;
  const preset = PRODUCTION_TYPE_PRESETS[brief.type] || PRODUCTION_TYPE_PRESETS.music_video;

  const renderBriefForm = () => (
    <motion.div className="flex flex-col h-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>Director — Production Planner</h1>
          <p style={{ fontSize: 13, marginTop: 4, color: "var(--color-text-dim)" }}>Create a multi-shot video production with AI</p>
        </div>
        {pipelines.length > 0 && (
          <PremiumSelect onChange={(e) => e.target.value && handleLoadPipeline(e.target.value)} defaultValue="" style={{ width: "auto" }}>
            <option value="" disabled>Load pipeline…</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.status})</option>)}
          </PremiumSelect>
        )}
      </div>

      <AnimatePresence>{error && (
        <motion.div className="studio__error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ marginBottom: 16 }}>
          {error}
        </motion.div>
      )}</AnimatePresence>

      {/* Platform chips */}
      <div style={{ marginBottom: 16 }}>
        <Label>Platform</Label>
        <div className="studio__chip-group-premium">
          {PLATFORMS.map((p) => (
            <PlatformChip key={p.id} p={p} active={brief.platform === p.id} onClick={() => updateBrief("platform", p.id)} />
          ))}
        </div>
      </div>

      {/* Production type cards */}
      <div style={{ marginBottom: 16 }}>
        <Label>Production Type</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {PRODUCTION_TYPES.map((t) => (
            <PresetCard key={t.id} t={t} active={brief.type === t.id} onClick={() => updateBrief("type", t.id)} />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
        <div className="studio__glass" style={{ padding: 16, borderRadius: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <Label>Production Title</Label>
            <PremiumInput type="text" value={brief.title} onChange={(e) => updateBrief("title", e.target.value)} placeholder="e.g. Midnight Drive — Official Music Video" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Label>Duration (sec)</Label>
              <PremiumInput type="number" value={brief.duration} onChange={(e) => updateBrief("duration", parseInt(e.target.value) || 60)} min={5} max={600} />
            </div>
            <div>
              <Label>Aspect</Label>
              <PremiumInput type="text" value={brief.aspectRatio || preset.defaultAspectRatio} readOnly />
            </div>
          </div>
          <div>
            <Label>Visual Style</Label>
            <PremiumInput type="text" value={brief.style} onChange={(e) => updateBrief("style", e.target.value)} placeholder="Cyberpunk anime, noir thriller, warm analog film…" />
          </div>
          <div>
            <Label>Mood / Tone</Label>
            <PremiumInput type="text" value={brief.mood} onChange={(e) => updateBrief("mood", e.target.value)} placeholder="Dark, atmospheric, hopeful, energetic…" />
          </div>
        </div>

        <div className="studio__glass" style={{ padding: 16, borderRadius: 14, display: "flex", flexDirection: "column" }}>
          <Label>Creative Concept</Label>
          <PremiumTextarea value={brief.concept} onChange={(e) => updateBrief("concept", e.target.value)} placeholder="Describe your vision…&#10;&#10;A lone traveler walks through neon-lit streets at midnight…" minHeight={140} style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)" }}>Estimated shots: ~{Math.ceil(brief.duration / 5)}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 2 }}>{preset.label} • {brief.aspectRatio || preset.defaultAspectRatio}</div>
            </div>
            <motion.button
              className="studio__generate"
              onClick={handleCreatePlan}
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.03 }}
              whileTap={{ scale: loading ? 1 : 0.97 }}
            >
              <IconSparkle width={15} height={15} />
              {loading ? "Planning…" : "Create Plan"}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderPlanView = () => (
    <motion.div className="flex flex-col h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: EASE }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <motion.button onClick={() => setMode("brief")} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-hairline)", borderRadius: 10, padding: "6px 10px", color: "var(--color-text-dim)", cursor: "pointer" }}>←</motion.button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>{brief.title || "Production Plan"}</h1>
            <p style={{ fontSize: 12, color: "var(--color-text-dim)", marginTop: 2 }}>{plan?.shots?.length || 0} shots • ~{plan?.estimatedDuration || brief.duration}s • {preset.label}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {costEstimate && (
            <div className="studio__glass" style={{ padding: "8px 14px", borderRadius: 100, display: "flex", alignItems: "center", gap: 8 }}>
              <IconBolt width={12} height={12} style={{ color: "var(--color-brand)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: costEstimate.totalCredits > 100 ? "#FFD166" : "#4ADE80", fontFamily: "var(--font-mono)" }}>{formatCredits(costEstimate.totalCredits)}</span>
              <span style={{ fontSize: 10, color: "var(--color-text-faint)" }}>{costEstimate.shotCount} shots</span>
            </div>
          )}
          <motion.button className="studio__generate" onClick={handleExecute} disabled={!plan} whileHover={{ scale: plan ? 1.03 : 1 }} whileTap={{ scale: plan ? 0.97 : 1 }}>
            <IconArrowUpRight width={15} height={15} /> Execute Pipeline
          </motion.button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {plan?.globalStyle && (
            <motion.div className="studio__glass" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 14, borderRadius: 12, marginBottom: 4 }}>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--color-text-dim)", flexWrap: "wrap" }}>
                <span>Style: <strong style={{ color: "var(--color-text)" }}>{plan.globalStyle.visualStyle}</strong></span>
                <span>Palette: <strong style={{ color: "var(--color-text)" }}>{plan.globalStyle.colorPalette}</strong></span>
                <span>Pace: <strong style={{ color: "var(--color-text)" }}>{plan.globalStyle.pace}</strong></span>
                <span>Transition: <strong style={{ color: "var(--color-text)" }}>{plan.globalStyle.transition}</strong></span>
              </div>
              <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{plan.conceptSummary}</p>
            </motion.div>
          )}

          {validation && !validation.allValid && (
            <motion.div className="studio__cost-warning" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 12 }}>
              <strong>Prompt Policy Warnings:</strong>
              {validation.results?.filter((r) => !r.valid).map((r, i) => (
                <div key={i}>Shot {r.shotId}: {r.results?.filter((x) => !x.valid).map((v) => v.violations?.map((vi) => vi.reason).join(", ")).join("; ")}</div>
              ))}
            </motion.div>
          )}

          <LayoutGroup>
            {plan?.shots?.map((shot, i) => (
              <motion.div
                key={shot.id}
                layoutId={shot.id}
                className="studio__glass"
                onClick={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: EASE }}
                whileHover={{ borderColor: "var(--color-hairline-strong)" }}
                style={{ borderRadius: 14, cursor: "pointer", overflow: "hidden", ...(expandedShot === shot.id ? { background: "rgba(255,255,255,0.05)" } : {}) }}
              >
                <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, background: "var(--studio-grad-brand-flat)", color: "#fff", boxShadow: "0 6px 18px -6px rgba(255,27,107,0.6)" }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>{shot.title}</h3>
                      <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 100, background: "rgba(124,58,237,0.14)", color: "var(--color-accent)", border: "1px solid rgba(124,58,237,0.22)" }}>{shot.section}</span>
                    </div>
                    <p style={{ fontSize: 11, marginTop: 3, color: "var(--color-text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shot.durationSec}s • {shot.camera?.framing} • {shot.camera?.lens}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100, background: "rgba(74,222,128,0.1)", color: "#4ADE80", fontWeight: 600 }}>{shot.imageStrategy?.mode}</span>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100, background: "rgba(96,165,250,0.1)", color: "#60A5FA", fontWeight: 600 }}>{shot.videoStrategy?.mode}</span>
                    {costEstimate?.shotCosts?.[i] && <span style={{ fontSize: 11, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)" }}>{costEstimate.shotCosts[i].total} cr</span>}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedShot === shot.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} style={{ overflow: "hidden" }}>
                      <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-hairline)", display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", marginBottom: 4 }}>Scene Goal</div><p style={{ fontSize: 13, lineHeight: 1.5 }}>{shot.sceneGoal}</p></div>
                          <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", marginBottom: 4 }}>Narrative Role</div><p style={{ fontSize: 13, lineHeight: 1.5 }}>{shot.narrativeRole}</p></div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                          <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", marginBottom: 4 }}>Environment</div><p style={{ fontSize: 11, lineHeight: 1.5 }}>{shot.environment}</p></div>
                          <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", marginBottom: 4 }}>Lighting</div><p style={{ fontSize: 11, lineHeight: 1.5 }}>{shot.lighting}</p></div>
                          <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", marginBottom: 4 }}>Mood</div><p style={{ fontSize: 11, lineHeight: 1.5 }}>{shot.mood}</p></div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div style={{ padding: 10, borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid var(--color-hairline)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#4ADE80", marginBottom: 4 }}>Image Strategy</div>
                            <p style={{ fontSize: 11, color: "var(--color-text-dim)", marginBottom: 4 }}>Mode: {shot.imageStrategy?.mode}</p>
                            <p style={{ fontSize: 11, lineHeight: 1.5 }}>{shot.imageStrategy?.prompt?.slice(0, 200)}</p>
                          </div>
                          <div style={{ padding: 10, borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid var(--color-hairline)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#60A5FA", marginBottom: 4 }}>Video Strategy</div>
                            <p style={{ fontSize: 11, color: "var(--color-text-dim)", marginBottom: 4 }}>Mode: {shot.videoStrategy?.mode} • Model: {shot.videoStrategy?.modelRoute}</p>
                            <p style={{ fontSize: 11, lineHeight: 1.5 }}>{shot.videoStrategy?.prompt?.slice(0, 200)}</p>
                          </div>
                        </div>
                        <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", marginBottom: 4 }}>Camera</div><p style={{ fontSize: 11 }}>{shot.camera?.framing} • {shot.camera?.angle} • {shot.camera?.lens} • {shot.camera?.movement} ({shot.camera?.intensity})</p></div>
                        {shot.subjects?.length > 0 && (
                          <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", marginBottom: 4 }}>Subjects</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{shot.subjects.map((s, j) => (<span key={j} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 100, background: "rgba(255,255,255,0.06)" }}>{s.role}: {s.description}</span>))}</div></div>
                        )}
                        {shot.continuityTracker && (
                          <div style={{ padding: 10, borderRadius: 10, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.18)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", marginBottom: 6 }}>Continuity Tracking</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, lineHeight: 1.4 }}>
                              <div><span style={{ color: "var(--color-text-dim)" }}>Identity:</span> {shot.continuityTracker.characterIdentity}</div>
                              <div><span style={{ color: "var(--color-text-dim)" }}>Outfit:</span> {shot.continuityTracker.outfit}</div>
                              <div><span style={{ color: "var(--color-text-dim)" }}>Environment:</span> {shot.continuityTracker.environment}</div>
                              <div><span style={{ color: "var(--color-text-dim)" }}>Lighting:</span> {shot.continuityTracker.lighting}</div>
                              <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--color-text-dim)" }}>Previous end frame:</span> {shot.continuityTracker.previousEndingFrame}</div>
                              <div><span style={{ color: "var(--color-text-dim)" }}>Screen direction:</span> {shot.continuityTracker.screenDirection}</div>
                              <div><span style={{ color: "var(--color-text-dim)" }}>Camera lang:</span> {shot.continuityTracker.cameraLanguage}</div>
                            </div>
                          </div>
                        )}
                        {(() => {
                          const shotVal = validation?.results?.find((r) => r.shotId === shot.id);
                          if (!shotVal || shotVal.valid) return null;
                          const fails = shotVal.results?.filter((x) => !x.valid) || [];
                          if (fails.length === 0) return null;
                          return (
                            <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,77,77,0.06)", border: "1px solid rgba(255,77,77,0.18)" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#FF4D4D", marginBottom: 6 }}>Policy Violations</div>
                              {fails.map((f, k) => (
                                <div key={k} style={{ fontSize: 11, color: "var(--color-text-dim)", marginBottom: 3 }}>
                                  <strong style={{ color: "#FF4D4D" }}>{f.field}:</strong> {f.reason}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </LayoutGroup>
        </div>
      </div>
    </motion.div>
  );

  const renderExecutionView = () => (
    <motion.div className="flex flex-col h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: EASE }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>{brief.title || "Production"}</h1>
          <p style={{ fontSize: 12, color: "var(--color-text-dim)", marginTop: 2 }}>{pipelineStatus ? PIPELINE_STAGE_LABELS[pipelineStatus] || pipelineStatus : "Executing…"}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {costEstimate && <span style={{ fontSize: 13, color: "var(--color-text-dim)", fontFamily: "var(--font-mono)" }}>{formatCredits(costEstimate.totalCredits)}</span>}
          {pipelineStatus === "completed" && (
            <motion.button onClick={() => setMode("brief")} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="studio__glass" style={{ padding: "7px 14px", borderRadius: 100, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", color: "var(--color-text)" }}>New Production</motion.button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}><PipelineStage status={pipelineStatus} /></div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shots.map((shot, i) => (
            <motion.div key={shot.id || i} className="studio__glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.4, ease: EASE }} style={{ padding: 14, borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 96, height: 56, borderRadius: 10, flexShrink: 0, overflow: "hidden", background: "rgba(0,0,0,0.3)", border: "1px solid var(--color-hairline)" }}>
                  {shot.imageResult?.url ? <img src={shot.imageResult.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : shot.videoResult?.url ? <video src={shot.videoResult.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--color-text-faint)" }}>{shot.status || "pending"}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700 }}>{shot.title || `Shot ${i + 1}`}</h4>
                    <StatusBadge status={shot.status || "pending"} />
                  </div>
                  {shot.imageResult?.prompt && <p style={{ fontSize: 11, marginTop: 4, color: "var(--color-text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shot.imageResult.prompt.slice(0, 60)}…</p>}
                  {shot.error && <p style={{ fontSize: 11, marginTop: 4, color: "#FF4D4D" }}>{shot.error.slice(0, 100)}</p>}
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  {(shot.status === "completed" || shot.status === "failed") && (
                    <>
                      <RerunButton label="Img" onClick={() => handleRerunShot(shot.id, "image")} tooltip="Rerun image only" />
                      <RerunButton label="Vid" onClick={() => handleRerunShot(shot.id, "video")} tooltip="Rerun video only" />
                      <RerunButton label="Audio" onClick={() => handleRerunShot(shot.id, "audio")} tooltip="Rerun audio only" />
                      <RerunButton label="All" primary onClick={() => handleRerunShot(shot.id, "full")} tooltip="Full rerun" />
                    </>
                  )}
                </div>
              </div>
              {shot.videoResult?.url && <div style={{ marginTop: 12 }}><video src={shot.videoResult.url} controls muted style={{ width: "100%", borderRadius: 10, maxHeight: 200, background: "#000" }} /></div>}
            </motion.div>
          ))}

          {pipelineStatus === "completed" && activePipeline && (
            <motion.div className="studio__glass" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ padding: 14, borderRadius: 14, marginTop: 8, background: "rgba(74,222,128,0.05)", borderColor: "rgba(74,222,128,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#4ADE80" }}>Production Complete</span>
                <span style={{ fontSize: 12, color: "var(--color-text-dim)" }}>{shots.filter((s) => s.status === "completed").length}/{shots.length} shots rendered</span>
              </div>
              {costEstimate && <div style={{ fontSize: 11, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)" }}>Total: {formatCredits(costEstimate.totalCredits)} • Shots: {costEstimate.shotCount} • Assembly: {formatCredits(costEstimate.assemblyCost)}</div>}
            </motion.div>
          )}

          <AnimatePresence>{error && (
            <motion.div className="studio__error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 8 }}>{error}</motion.div>
          )}</AnimatePresence>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div style={{ height: "100%", padding: 24, overflow: "hidden", background: "var(--color-void)" }}>
      <AnimatePresence mode="wait">
        {mode === "brief" && <motion.div key="brief" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{renderBriefForm()}</motion.div>}
        {mode === "plan" && <motion.div key="plan" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{renderPlanView()}</motion.div>}
        {(mode === "executing" || mode === "complete") && <motion.div key="executing" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{renderExecutionView()}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    draft: { bg: "rgba(255,255,255,0.06)", color: "var(--color-text-faint)" },
    pending: { bg: "rgba(255,255,255,0.06)", color: "var(--color-text-faint)" },
    planning: { bg: "rgba(96,165,250,0.1)", color: "#60A5FA" },
    quoted: { bg: "rgba(96,165,250,0.1)", color: "#60A5FA" },
    generating_image: { bg: "rgba(250,204,21,0.12)", color: "#FACC15" },
    generating_video: { bg: "rgba(250,204,21,0.12)", color: "#FACC15" },
    generating_audio: { bg: "rgba(250,204,21,0.12)", color: "#FACC15" },
    quality_check: { bg: "rgba(168,85,247,0.12)", color: "#A855F7" },
    completed: { bg: "rgba(74,222,128,0.1)", color: "#4ADE80" },
    failed: { bg: "rgba(239,68,68,0.1)", color: "#EF4444" },
    skipped: { bg: "rgba(255,255,255,0.04)", color: "var(--color-text-faint)" },
  };
  const c = colors[status] || colors.pending;
  return <span style={{ fontSize: "0.6rem", padding: "2px 7px", borderRadius: 100, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", background: c.bg, color: c.color }}>{status.replace(/_/g, " ")}</span>;
}

function RerunButton({ label, onClick, primary, tooltip }) {
  return (
    <motion.button onClick={(e) => { e.stopPropagation(); onClick(); }} title={tooltip} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} style={{ fontSize: "0.6rem", padding: "4px 8px", borderRadius: 100, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", border: "none", cursor: "pointer", background: primary ? "var(--studio-grad-brand-flat)" : "rgba(255,255,255,0.06)", color: primary ? "#fff" : "var(--color-text-dim)" }}>
      {label}
    </motion.button>
  );
}