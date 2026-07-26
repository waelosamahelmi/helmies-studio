"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import { PRODUCTION_TYPE_PRESETS } from "@/lib/director-constants";

// ── Transition config ──
const EASE = [0.32, 0.72, 0, 1];
const spring = { type: "spring", stiffness: 400, damping: 30 };

// ── Helpers ──
const PLATFORMS = [
  { id: "instagram", label: "Instagram", aspect: "9:16" },
  { id: "tiktok", label: "TikTok", aspect: "9:16" },
  { id: "youtube", label: "YouTube", aspect: "16:9" },
  { id: "youtube_shorts", label: "Shorts", aspect: "9:16" },
  { id: "twitter", label: "X / Twitter", aspect: "16:9" },
  { id: "linkedin", label: "LinkedIn", aspect: "1:1" },
  { id: "facebook", label: "Facebook", aspect: "1:1" },
];

const PRODUCTION_TYPES = Object.entries(PRODUCTION_TYPE_PRESETS).map(([id, p]) => ({
  id, label: p.label
}));

const PIPELINE_STAGE_LABELS = {
  draft: "Draft",
  planning: "Planning",
  awaiting_approval: "Awaiting Approval",
  quoted: "Quoted",
  queued: "Queued",
  generating_images: "Generating Images",
  generating_video: "Generating Video",
  generating_audio: "Generating Audio",
  quality_check: "Quality Check",
  assembling: "Assembling",
  completed: "Completed",
  paused: "Paused",
  failed: "Failed",
  cancelled: "Cancelled"
};

const PIPELINE_STAGE_ORDER = [
  "draft", "planning", "awaiting_approval", "quoted", "queued",
  "generating_images", "generating_video", "generating_audio",
  "quality_check", "assembling", "completed"
];

function stageIndex(status) {
  return PIPELINE_STAGE_ORDER.indexOf(status);
}

function isStageComplete(actualStatus, stage) {
  return stageIndex(actualStatus) >= stageIndex(stage);
}

function isStageActive(actualStatus, stage) {
  return actualStatus === stage;
}

function isStageFailed(actualStatus) {
  return actualStatus === "failed" || actualStatus === "cancelled";
}

export default function DirectorWorkspace() {
  // ── State ──
  const [mode, setMode] = useState("brief"); // brief | plan | executing | complete
  const [pipelines, setPipelines] = useState([]);
  const [activePipeline, setActivePipeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Brief form
  const [brief, setBrief] = useState({
    title: "",
    type: "music_video",
    duration: 60,
    platform: "instagram",
    concept: "",
    style: "",
    mood: "",
    characters: [],
    references: [],
    modelImage: "",
    modelVideo: ""
  });

  // Plan state
  const [plan, setPlan] = useState(null);
  const [costEstimate, setCostEstimate] = useState(null);
  const [validation, setValidation] = useState(null);
  const [expandedShot, setExpandedShot] = useState(null);
  const [selectedShot, setSelectedShot] = useState(null);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [shots, setShots] = useState([]);
  const pollRef = useRef(null);

  // ── Load pipelines on mount ──
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

  // ── Create a new plan ──
  const handleCreatePlan = async () => {
    if (!brief.concept && !brief.title) {
      setError("Please provide a title or concept");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/director/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create plan");
      }

      const data = await res.json();
      setPlan(data.plan);
      setCostEstimate(data.costEstimate);
      setValidation(data.validation);
      setActivePipeline(data.pipelineId);
      setMode("plan");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Execute pipeline ──
  const handleExecute = async () => {
    if (!activePipeline) return;
    setExecuting(true);
    setError(null);
    setMode("executing");

    try {
      const res = await apiFetch("/api/director/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: activePipeline })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Execution failed");
      }

      const data = await res.json();
      if (data.success) {
        setMode("complete");
        setPipelineStatus("completed");
        setShots(data.results || []);
      } else {
        setPipelineStatus("failed");
        setError(data.error || "Execution failed");
      }
    } catch (e) {
      setError(e.message);
      setPipelineStatus("failed");
    } finally {
      setExecuting(false);
    }
  };

  // ── Poll pipeline status ──
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
          clearInterval(pollRef.current);
          pollRef.current = null;
          setExecuting(false);
          if (data.pipeline.status === "completed") setMode("complete");
        }
      } catch {}
    };

    pollRef.current = setInterval(poll, 3000);
    poll(); // Immediate first poll
  }, []);

  // ── Rerun a specific shot ──
  const handleRerunShot = async (shotId, rerunType = "full") => {
    setError(null);
    try {
      const res = await apiFetch("/api/director/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: activePipeline, shotId, rerunType })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Rerun failed");
      }

      const data = await res.json();
      // Refresh shot data
      if (activePipeline) {
        const statusRes = await apiFetch(`/api/director/status?pipelineId=${activePipeline}`);
        const statusData = await statusRes.json();
        if (statusData.pipeline) {
          setShots(statusData.pipeline.shots || []);
        }
      }
      return data;
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Load an existing pipeline ──
  const handleLoadPipeline = async (pipelineId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/director/status?pipelineId=${pipelineId}`);
      const data = await res.json();
      if (!data.pipeline) throw new Error("Pipeline not found");

      setActivePipeline(pipelineId);
      setPlan(data.pipeline.plan);
      setCostEstimate(data.pipeline.costEstimate);
      setPipelineStatus(data.pipeline.status);
      setShots(data.pipeline.shots || []);

      if (data.pipeline.status === "completed") {
        setMode("complete");
      } else if (["generating_images", "generating_video", "generating_audio", "assembling"].includes(data.pipeline.status)) {
        setMode("executing");
        setExecuting(true);
        startPolling(pipelineId);
      } else {
        setMode("plan");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Update brief field ──
  const updateBrief = (field, value) => {
    setBrief(prev => {
      const next = { ...prev, [field]: value };
      if (field === "platform") {
        const platform = PLATFORMS.find(p => p.id === value);
        if (platform) next.aspectRatio = platform.aspect;
      }
      return next;
    });
  };

  // ── Cost formatting ──
  const formatCredits = (n) => `${n || 0} credits`;

  // ── Platform selector ──
  const preset = PRODUCTION_TYPE_PRESETS[brief.type] || PRODUCTION_TYPE_PRESETS.music_video;

  // ──────────────────────────────────────
  // RENDER: Brief Form
  // ──────────────────────────────────────
  const renderBriefForm = () => (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>
            Director — Production Planner
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-dim)" }}>
            Create a multi-shot video production with AI
          </p>
        </div>
        {pipelines.length > 0 && (
          <div className="flex gap-2">
            <select
              className="px-3 py-1.5 rounded-lg text-sm border-0"
              style={{ background: "rgba(255,255,255,0.04)", color: "var(--color-text)", border: "1px solid var(--color-hairline)" }}
              onChange={(e) => e.target.value && handleLoadPipeline(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>Load pipeline...</option>
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <motion.div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{ background: "rgba(255, 27, 107, 0.1)", border: "1px solid rgba(255, 27, 107, 0.2)", color: "#FF1B6B" }}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          {error}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        {/* Left column — Basic info */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Production Title
            </label>
            <input
              type="text"
              value={brief.title}
              onChange={(e) => updateBrief("title", e.target.value)}
              placeholder="e.g. Midnight Drive — Official Music Video"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-hairline)", color: "var(--color-text)", outline: "none" }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Type
              </label>
              <select
                value={brief.type}
                onChange={(e) => updateBrief("type", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-hairline)", color: "var(--color-text)", outline: "none" }}
              >
                {PRODUCTION_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Duration (sec)
              </label>
              <input
                type="number"
                value={brief.duration}
                onChange={(e) => updateBrief("duration", parseInt(e.target.value) || 60)}
                min={5}
                max={600}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-hairline)", color: "var(--color-text)", outline: "none" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Platform
              </label>
              <select
                value={brief.platform}
                onChange={(e) => updateBrief("platform", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-hairline)", color: "var(--color-text)", outline: "none" }}
              >
                {PLATFORMS.map(p => (
                  <option key={p.id} value={p.id}>{p.label} ({p.aspect})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Visual Style
            </label>
            <input
              type="text"
              value={brief.style}
              onChange={(e) => updateBrief("style", e.target.value)}
              placeholder="e.g. Cyberpunk anime, noir thriller, warm analog film..."
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-hairline)", color: "var(--color-text)", outline: "none" }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Mood / Tone
            </label>
            <input
              type="text"
              value={brief.mood}
              onChange={(e) => updateBrief("mood", e.target.value)}
              placeholder="e.g. Dark, atmospheric, hopeful, energetic..."
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-hairline)", color: "var(--color-text)", outline: "none" }}
            />
          </div>
        </div>

        {/* Right column — Concept */}
        <div className="flex flex-col gap-4">
          <div className="flex-1 flex flex-col">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Creative Concept
            </label>
            <textarea
              value={brief.concept}
              onChange={(e) => updateBrief("concept", e.target.value)}
              placeholder="Describe your vision...&#10;&#10;e.g. A lone traveler walks through neon-lit streets at midnight. The camera follows their journey through rain-slicked alleys, reflecting lights, and pulsing beats. Each chorus explodes with color and motion..."
              rows={8}
              className="w-full px-3 py-2 rounded-lg text-sm flex-1 resize-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-hairline)", color: "var(--color-text)", outline: "none", minHeight: "140px" }}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>
                Estimated shots: ~{Math.ceil(brief.duration / 5)}
              </div>
              <div className="text-xs" style={{ color: "var(--color-text-faint)" }}>
                {preset.label} • {brief.aspectRatio || preset.defaultAspectRatio} • {PLATFORMS.find(p => p.id === brief.platform)?.label || brief.platform}
              </div>
            </div>
            <button
              onClick={handleCreatePlan}
              disabled={loading}
              className="px-6 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all duration-300"
              style={{
                background: "var(--color-brand)",
                color: "#fff",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Planning...
                </>
              ) : (
                "Create Plan"
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  // ──────────────────────────────────────
  // RENDER: Shot Plan View
  // ──────────────────────────────────────
  const renderPlanView = () => (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode("brief")}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-text-dim)" }}
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {brief.title || "Production Plan"}
            </h1>
            <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
              {plan?.shots?.length || 0} shots • ~{plan?.estimatedDuration || brief.duration}s • {preset.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {costEstimate && (
            <div className="text-right">
              <div className="text-sm font-semibold" style={{ color: costEstimate.totalCredits > 100 ? "#FFD166" : "#4ADE80" }}>
                {formatCredits(costEstimate.totalCredits)}
              </div>
              <div className="text-xs" style={{ color: "var(--color-text-faint)" }}>
                {costEstimate.shotCount} shots + assembly
              </div>
            </div>
          )}
          <button
            onClick={handleExecute}
            disabled={!plan}
            className="px-5 py-2 rounded-lg font-semibold text-sm transition-all duration-300"
            style={{
              background: plan ? "var(--color-brand)" : "rgba(255,255,255,0.06)",
              color: plan ? "#fff" : "var(--color-text-dim)",
            }}
          >
            Execute Pipeline
          </button>
        </div>
      </div>

      {/* Shot Timeline */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="space-y-3">
          {/* Global style card */}
          {plan?.globalStyle && (
            <motion.div
              className="p-4 rounded-xl mb-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-hairline)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex gap-4 text-xs" style={{ color: "var(--color-text-dim)" }}>
                <span>Style: {plan.globalStyle.visualStyle}</span>
                <span>Palette: {plan.globalStyle.colorPalette}</span>
                <span>Pace: {plan.globalStyle.pace}</span>
                <span>Transition: {plan.globalStyle.transition}</span>
              </div>
              <p className="text-sm mt-2">{plan.conceptSummary}</p>
            </motion.div>
          )}

          {/* Validation warnings */}
          {validation && !validation.allValid && (
            <motion.div
              className="p-3 rounded-lg mb-4 text-xs space-y-1"
              style={{ background: "rgba(255, 209, 102, 0.08)", border: "1px solid rgba(255, 209, 102, 0.2)", color: "#FFD166" }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <strong>Prompt Policy Warnings:</strong>
              {validation.results?.filter(r => !r.valid).map((r, i) => (
                <div key={i}>
                  Shot {r.shotId}: {r.results?.filter(x => !x.valid).map(v => v.violations?.map(vi => vi.reason).join(", ")).join("; ")}
                </div>
              ))}
            </motion.div>
          )}

          {/* Shot cards */}
          <LayoutGroup>
            {plan?.shots?.map((shot, i) => (
              <motion.div
                key={shot.id}
                layoutId={shot.id}
                className="rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
                style={{
                  background: expandedShot === shot.id ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${expandedShot === shot.id ? "var(--color-hairline-strong)" : "var(--color-hairline)"}`
                }}
                onClick={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: EASE }}
              >
                {/* Shot header */}
                <div className="p-4 flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: "var(--color-brand)", color: "#fff", opacity: 0.9 }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{shot.title}</h3>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: "rgba(124, 58, 237, 0.15)",
                          color: "var(--color-accent)",
                          textTransform: "uppercase",
                          fontSize: "0.6rem",
                          letterSpacing: "0.05em"
                        }}
                      >
                        {shot.section}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-dim)" }}>
                      {shot.durationSec}s • {shot.camera?.framing} • {shot.camera?.lens}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs flex-shrink-0">
                    <span className="px-2 py-0.5 rounded" style={{ background: "rgba(74, 222, 128, 0.1)", color: "#4ADE80" }}>
                      {shot.imageStrategy?.mode}
                    </span>
                    <span className="px-2 py-0.5 rounded" style={{ background: "rgba(96, 165, 250, 0.1)", color: "#60A5FA" }}>
                      {shot.videoStrategy?.mode}
                    </span>
                    {costEstimate?.shotCosts?.[i] && (
                      <span className="text-xs" style={{ color: "var(--color-text-faint)" }}>
                        {costEstimate.shotCosts[i].total} cr
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {expandedShot === shot.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--color-hairline)" }}>
                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <div>
                            <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>Scene Goal</div>
                            <p className="text-sm">{shot.sceneGoal}</p>
                          </div>
                          <div>
                            <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>Narrative Role</div>
                            <p className="text-sm">{shot.narrativeRole}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>Environment</div>
                            <p className="text-xs">{shot.environment}</p>
                          </div>
                          <div>
                            <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>Lighting</div>
                            <p className="text-xs">{shot.lighting}</p>
                          </div>
                          <div>
                            <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>Mood</div>
                            <p className="text-xs">{shot.mood}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <div className="text-xs font-semibold mb-1" style={{ color: "#4ADE80" }}>Image Strategy</div>
                            <p className="text-xs mb-1" style={{ color: "var(--color-text-dim)" }}>
                              Mode: {shot.imageStrategy?.mode}
                            </p>
                            <p className="text-xs" style={{ lineHeight: 1.5 }}>{shot.imageStrategy?.prompt?.slice(0, 200)}</p>
                          </div>
                          <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <div className="text-xs font-semibold mb-1" style={{ color: "#60A5FA" }}>Video Strategy</div>
                            <p className="text-xs mb-1" style={{ color: "var(--color-text-dim)" }}>
                              Mode: {shot.videoStrategy?.mode} | Model: {shot.videoStrategy?.modelRoute}
                            </p>
                            <p className="text-xs" style={{ lineHeight: 1.5 }}>{shot.videoStrategy?.prompt?.slice(0, 200)}</p>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>Camera</div>
                          <p className="text-xs">
                            {shot.camera?.framing} • {shot.camera?.angle} • {shot.camera?.lens} • {shot.camera?.movement} ({shot.camera?.intensity})
                          </p>
                        </div>

                        {shot.subjects?.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-dim)" }}>Subjects</div>
                            <div className="flex flex-wrap gap-1">
                              {shot.subjects.map((s, j) => (
                                <span key={j} className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  {s.role}: {s.description}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
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

  // ──────────────────────────────────────
  // RENDER: Execution / Complete View
  // ──────────────────────────────────────
  const renderExecutionView = () => (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {brief.title || "Production"}
          </h1>
          <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
            {pipelineStatus ? PIPELINE_STAGE_LABELS[pipelineStatus] || pipelineStatus : "Executing..."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {costEstimate && (
            <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
              {formatCredits(costEstimate.totalCredits)}
            </span>
          )}
          {pipelineStatus === "completed" && (
            <button
              onClick={() => setMode("brief")}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--color-text)" }}
            >
              New Production
            </button>
          )}
        </div>
      </div>

      {/* Pipeline progress bar */}
      <div className="mb-6">
        <div className="flex gap-1">
          {PIPELINE_STAGE_ORDER.map((stage, i) => {
            const complete = isStageComplete(pipelineStatus, stage);
            const active = isStageActive(pipelineStatus, stage);
            const failed = isStageFailed(pipelineStatus);

            let bg = "rgba(255,255,255,0.06)";
            if (complete) bg = "#4ADE80";
            if (active && !complete) bg = "var(--color-brand)";
            if (failed && complete && i === stageIndex(pipelineStatus)) bg = "#EF4444";

            return (
              <div key={stage} className="flex-1 relative">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{ background: bg }}
                />
                {active && !complete && (
                  <motion.div
                    className="absolute top-0 left-0 h-1.5 rounded-full"
                    style={{ background: "var(--color-brand)", width: "60%" }}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          {PIPELINE_STAGE_ORDER.slice(0, 7).map((stage) => (
            <span key={stage} className="text-[0.55rem]" style={{ color: "var(--color-text-faint)" }}>
              {stage.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      {/* Shot results */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="space-y-3">
          {shots.map((shot, i) => (
            <motion.div
              key={shot.id || i}
              className="p-4 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--color-hairline)"
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: EASE }}
            >
              <div className="flex items-start gap-4">
                {/* Thumbnail */}
                <div
                  className="w-24 h-14 rounded-lg flex-shrink-0 overflow-hidden"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--color-hairline)" }}
                >
                  {shot.imageResult?.url ? (
                    <img src={shot.imageResult.url} alt="" className="w-full h-full object-cover" />
                  ) : shot.videoResult?.url ? (
                    <video src={shot.videoResult.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--color-text-faint)" }}>
                      {shot.status || "pending"}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">{shot.title || `Shot ${i + 1}`}</h4>
                    <StatusBadge status={shot.status || "pending"} />
                  </div>
                  {shot.imageResult?.prompt && (
                    <p className="text-xs mt-1 truncate" style={{ color: "var(--color-text-faint)" }}>
                      {shot.imageResult.prompt.slice(0, 60)}...
                    </p>
                  )}
                  {shot.error && (
                    <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{shot.error.slice(0, 100)}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 flex-shrink-0">
                  {(shot.status === "completed" || shot.status === "failed") && (
                    <>
                      <RerunButton
                        label="Img"
                        onClick={() => handleRerunShot(shot.id, "image")}
                        tooltip="Rerun image only"
                      />
                      <RerunButton
                        label="Vid"
                        onClick={() => handleRerunShot(shot.id, "video")}
                        tooltip="Rerun video only"
                      />
                      <RerunButton
                        label="Audio"
                        onClick={() => handleRerunShot(shot.id, "audio")}
                        tooltip="Rerun audio only"
                      />
                      <RerunButton
                        label="All"
                        primary
                        onClick={() => handleRerunShot(shot.id, "full")}
                        tooltip="Full rerun"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Expanded media */}
              {shot.videoResult?.url && (
                <div className="mt-3">
                  <video
                    src={shot.videoResult.url}
                    controls
                    muted
                    className="w-full rounded-lg"
                    style={{ maxHeight: "200px", background: "#000" }}
                  />
                </div>
              )}
            </motion.div>
          ))}

          {/* Assembly result */}
          {pipelineStatus === "completed" && activePipeline && (
            <motion.div
              className="p-4 rounded-xl mt-4"
              style={{ background: "rgba(74, 222, 128, 0.05)", border: "1px solid rgba(74, 222, 128, 0.15)" }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold" style={{ color: "#4ADE80" }}>Production Complete</span>
                <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                  {shots.filter(s => s.status === "completed").length}/{shots.length} shots rendered
                </span>
              </div>
              {/* Assembled video would be here */}
              {costEstimate && (
                <div className="text-xs" style={{ color: "var(--color-text-faint)" }}>
                  Total: {formatCredits(costEstimate.totalCredits)} • Shots: {costEstimate.shotCount} • Assembly: {formatCredits(costEstimate.assemblyCost)}
                </div>
              )}
            </motion.div>
          )}

          {error && (
            <motion.div
              className="p-3 rounded-lg text-sm"
              style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#EF4444" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );

  // ──────────────────────────────────────
  // RENDER: Main
  // ──────────────────────────────────────
  return (
    <div className="h-full p-6 overflow-hidden" style={{ background: "var(--color-void)" }}>
      <AnimatePresence mode="wait">
        {mode === "brief" && (
          <motion.div
            key="brief"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {renderBriefForm()}
          </motion.div>
        )}

        {mode === "plan" && (
          <motion.div
            key="plan"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {renderPlanView()}
          </motion.div>
        )}

        {(mode === "executing" || mode === "complete") && (
          <motion.div
            key="executing"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {renderExecutionView()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function StatusBadge({ status }) {
  const colors = {
    draft: { bg: "rgba(255,255,255,0.06)", color: "var(--color-text-faint)" },
    pending: { bg: "rgba(255,255,255,0.06)", color: "var(--color-text-faint)" },
    planning: { bg: "rgba(96, 165, 250, 0.1)", color: "#60A5FA" },
    quoted: { bg: "rgba(96, 165, 250, 0.1)", color: "#60A5FA" },
    generating_image: { bg: "rgba(250, 204, 21, 0.12)", color: "#FACC15" },
    generating_video: { bg: "rgba(250, 204, 21, 0.12)", color: "#FACC15" },
    generating_audio: { bg: "rgba(250, 204, 21, 0.12)", color: "#FACC15" },
    quality_check: { bg: "rgba(168, 85, 247, 0.12)", color: "#A855F7" },
    completed: { bg: "rgba(74, 222, 128, 0.1)", color: "#4ADE80" },
    failed: { bg: "rgba(239, 68, 68, 0.1)", color: "#EF4444" },
    skipped: { bg: "rgba(255,255,255,0.04)", color: "var(--color-text-faint)" }
  };

  const c = colors[status] || colors.pending;

  return (
    <span
      className="text-[0.6rem] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
      style={{ background: c.bg, color: c.color }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RerunButton({ label, onClick, primary, tooltip }) {
  return (
    <motion.button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={tooltip}
      className="text-[0.6rem] px-2 py-1 rounded font-semibold uppercase tracking-wider transition-colors"
      style={{
        background: primary ? "var(--color-brand)" : "rgba(255,255,255,0.06)",
        color: primary ? "#fff" : "var(--color-text-dim)"
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {label}
    </motion.button>
  );
}
