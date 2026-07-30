"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileChipScroller } from "@/components/studio/mobile";
import { matchesGroup } from "@/lib/capability-groups";

/* ── Inline SVG Icons (v6 style: 24×24, strokeWidth 1.7) ── */
const IconPrompt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
  </svg>
);
const IconImageGen = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
const IconVideoGen = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);
const IconAudioGen = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);
const IconQualityGate = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);
const IconBrand = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);
const IconSave = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const IconTemplate = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);
const IconPublish = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
    <line x1="9" y1="19" x2="15" y2="22" />
  </svg>
);
const IconRun = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const IconTrash = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const IconRefresh = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);
const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10" />
  </svg>
);
const IconCheck = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconClose = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconMove = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);
const IconPlus = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconUpload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

/* ── Step type palette ── */
const STEP_TYPES = [
  { id: "prompt_compile", label: "Prompt Compiler", desc: "Craft and optimize generation prompts", icon: IconPrompt, color: "#A855F7" },
  { id: "image_gen", label: "Image Generation", desc: "Create images with AI models", icon: IconImageGen, color: "#4ADE80" },
  { id: "video_gen", label: "Video Generation", desc: "Generate video clips from text or frames", icon: IconVideoGen, color: "#60A5FA" },
  { id: "audio_gen", label: "Audio Generation", desc: "Synthesize voice, music, and sound effects", icon: IconAudioGen, color: "#FACC15" },
  { id: "quality_gate", label: "Quality Gate", desc: "Validate outputs against quality thresholds", icon: IconQualityGate, color: "#FB923C" },
  { id: "brand_compliance", label: "Brand Compliance", desc: "Ensure outputs match brand guidelines", icon: IconBrand, color: "#F472B6" },
  { id: "save_project", label: "Save to Project", desc: "Persist outputs to project memory", icon: IconSave, color: "#34D399" },
];

/* ── Helpers ── */
function createStep(typeId) {
  const type = STEP_TYPES.find((t) => t.id === typeId) || STEP_TYPES[0];
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: typeId, name: type.label,
    config: { model: "", prompt: "", inputSource: "previous", onFailure: "stop", params: {} },
    position: { x: 60, y: 60 + Math.random() * 200 },
  };
}

const FAILURE_BEHAVIORS = [
  { value: "stop", label: "Stop workflow" },
  { value: "skip", label: "Skip step" },
  { value: "retry", label: "Retry once" },
];
const INPUT_SOURCES = [
  { value: "previous", label: "Previous step" },
  { value: "workflow", label: "Workflow input" },
  { value: "none", label: "None" },
];

/* ══════════════════════════════════════════════════════════════ */
export default function WorkflowStudio() {
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [steps, setSteps] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runStatus, setRunStatus] = useState({});
  const [workspaceName, setWorkspaceName] = useState("Untitled Workflow");
  const [execProgress, setExecProgress] = useState(null); // { current, total }
  const [undoStack, setUndoStack] = useState([]);
  const [connectingFrom, setConnectingFrom] = useState(null);

  const { models: catalogModels } = useModelCatalog({});
  // Image/video-gen step model picker: merge tti + iti capability groups.
  const imageModels = useMemo(() => catalogModels.filter((m) => matchesGroup(m, "tti") || matchesGroup(m, "iti")), [catalogModels]);
  const isMobile = useIsMobile();
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ── Load workflows ── */
  const loadWorkflows = useCallback(async () => {
    try { const res = await fetch("/api/workflows"); const data = await res.json(); if (Array.isArray(data)) setWorkflows(data); } catch {}
  }, []);
  const loadTemplates = useCallback(async () => {
    try { const res = await fetch("/api/workflows?type=templates"); const data = await res.json(); if (Array.isArray(data)) setTemplates(data); } catch {}
  }, []);
  useEffect(() => { loadWorkflows(); loadTemplates(); }, [loadWorkflows, loadTemplates]);

  /* ── Step management ── */
  const pushUndo = useCallback((snapshot) => { setUndoStack(prev => [...prev.slice(-19), snapshot]); }, []);
  const addStep = useCallback((typeId) => {
    pushUndo({ steps, connections });
    setSteps(prev => [...prev, createStep(typeId)]);
  }, [steps, connections, pushUndo]);
  const removeStep = useCallback((id) => {
    pushUndo({ steps, connections });
    setSteps(prev => prev.filter(s => s.id !== id));
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    if (selectedStepId === id) setSelectedStepId(null);
  }, [selectedStepId, steps, connections, pushUndo]);
  const updateStep = useCallback((id, patch) => { setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)); }, []);
  const updateStepConfig = useCallback((id, key, value) => { setSteps(prev => prev.map(s => s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)); }, []);

  /* ── Connections ── */
  const addConnection = useCallback((from, to) => {
    if (from === to) return;
    pushUndo({ steps, connections });
    setConnections(prev => { if (prev.find(c => c.from === from && c.to === to)) return prev; return [...prev.filter(c => c.from !== from), { from, to }]; });
  }, [steps, connections, pushUndo]);

  /* ── Drag & drop nodes ── */
  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation(); const nodeEl = e.currentTarget; const rect = nodeEl.getBoundingClientRect();
    setDraggingNodeId(nodeId); setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);
  useEffect(() => {
    if (!draggingNodeId) return;
    const handleMove = (e) => { const canvas = canvasRef.current; if (!canvas) return; const cr = canvas.getBoundingClientRect(); setSteps(prev => prev.map(s => s.id === draggingNodeId ? { ...s, position: { x: Math.max(0, e.clientX - cr.left - dragOffset.x), y: Math.max(0, e.clientY - cr.top - dragOffset.y) } } : s)); };
    const handleUp = () => setDraggingNodeId(null);
    window.addEventListener("mousemove", handleMove); window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [draggingNodeId, dragOffset]);

  /* ── Connection clicking ── */
  const handlePortClick = useCallback((e, nodeId) => {
    e.stopPropagation();
    if (connectingFrom === null) setConnectingFrom(nodeId);
    else { addConnection(connectingFrom, nodeId); setConnectingFrom(null); }
  }, [connectingFrom, addConnection]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveWorkflow(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.key === "Delete" || e.key === "Backspace") { if (selectedStepId) { e.preventDefault(); removeStep(selectedStepId); } }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [selectedStepId]);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => { if (!prev.length) return prev; const snapshot = prev[prev.length - 1]; setSteps(snapshot.steps); setConnections(snapshot.connections); return prev.slice(0, -1); });
  }, []);

  /* ── JSON Export / Import ── */
  const handleExportJSON = useCallback(() => {
    const data = { name: workspaceName, steps: steps.map(s => ({ id: s.id, type: s.type, name: s.name, config: s.config, position: s.position })), connections };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${workspaceName.replace(/\s+/g,"_")}.workflow.json`; a.click(); URL.revokeObjectURL(a.href);
  }, [workspaceName, steps, connections]);
  const handleImportJSON = useCallback(() => { fileInputRef.current?.click(); }, []);
  const handleFileImport = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (ev) => { try { const data = JSON.parse(ev.target.result); if (data.name) setWorkspaceName(data.name); if (Array.isArray(data.steps)) setSteps(data.steps.map((s, i) => ({ ...s, id: s.id || `step-${Date.now()}-${i}`, position: s.position || { x: 60, y: 60 + i * 130 } }))); if (Array.isArray(data.connections)) setConnections(data.connections); } catch {} }; reader.readAsText(file); e.target.value = "";
  }, []);

  /* ── Save / Load / Execute (preserved) ── */
  const saveWorkflow = useCallback(async () => {
    if (!workspaceName || steps.length === 0) return;
    const stepData = steps.map(s => ({ agent: s.type, task: s.name, params: { model: s.config.model || "", prompt: s.config.prompt || "", inputSource: s.config.inputSource, onFailure: s.config.onFailure, ...s.config.params } }));
    try { const res = await apiFetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: workspaceName, description: "", steps: stepData }) }); const data = await res.json(); if (data.workflow) setCurrentWorkflow(data.workflow); await loadWorkflows(); } catch {}
  }, [workspaceName, steps, loadWorkflows]);
  const loadWorkflow = useCallback((wf) => {
    setCurrentWorkflow(wf); setWorkspaceName(wf.name || "Untitled");
    const loadedSteps = (wf.steps || []).map((s, i) => ({ id: s.id || `step-${Date.now()}-${i}`, type: s.agent || "image_gen", name: s.task || `Step ${i+1}`, config: { model: s.params?.model || "", prompt: s.params?.prompt || "", inputSource: s.params?.inputSource || "previous", onFailure: s.params?.onFailure || "stop", params: s.params || {} }, position: { x: 60, y: 60 + i * 130 } }));
    setSteps(loadedSteps); setConnections(loadedSteps.slice(0,-1).map((_, i) => ({ from: loadedSteps[i].id, to: loadedSteps[i+1].id }))); setSelectedStepId(null); setRunResult(null);
  }, []);
  const executeWorkflow = useCallback(async () => {
    if (!currentWorkflow?.id) return; setExecuting(true); setRunResult(null); setRunStatus({}); setExecProgress({ current: 0, total: steps.length });
    try { const res = await apiFetch(`/api/workflows/${currentWorkflow.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs: { prompt: steps[0]?.config?.prompt || "" } }) }); const data = await res.json(); setRunResult(data); if (data.stepResults) { const statuses = {}; data.stepResults.forEach((sr, i) => { statuses[i] = sr.status === "completed" ? "done" : sr.status === "failed" ? "error" : "running"; }); setRunStatus(statuses); } setExecProgress(null); } catch (e) { setRunResult({ success: false, error: e.message }); } finally { setExecuting(false); }
  }, [currentWorkflow, steps]);
  const regenerateStep = useCallback(async () => {
    if (!currentWorkflow?.id || selectedStepId == null) return; const stepIdx = steps.findIndex(s => s.id === selectedStepId); if (stepIdx < 0) return;
    try { const res = await apiFetch(`/api/workflows/${currentWorkflow.id}/regen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepIndex: stepIdx }) }); const data = await res.json(); setRunResult(prev => ({ ...prev, regenResult: data })); } catch {}
  }, [currentWorkflow, selectedStepId, steps]);
  const publishWorkflow = useCallback(async () => {
    if (!currentWorkflow?.id) return;
    try { await apiFetch(`/api/workflows/${currentWorkflow.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" } }); await loadWorkflows(); } catch {}
  }, [currentWorkflow, loadWorkflows]);

  const selectedStep = steps.find(s => s.id === selectedStepId);
  const selectedStepType = STEP_TYPES.find(t => t.id === selectedStep?.type);
  const costEstimate = steps.reduce((sum, s) => { if (s.type === "video_gen") return sum + 8; if (s.type === "audio_gen") return sum + 3; return sum + 4; }, 0);

  /* ── Mini-map dimensions ── */
  const mmW = 140, mmH = 90;
  const maxX = Math.max(...steps.map(s => s.position.x + 155), 300);
  const maxY = Math.max(...steps.map(s => s.position.y + 60), 300);
  const scale = Math.min(mmW / maxX, mmH / maxY, 0.4);

  return (
    <div className="v6-builder-grid" style={{ height: "100%" }}>
      {/* ── Left: Step Palette + saved ── */}
      <div className="v6-builder-panel">
        <div className="v6-eyebrow" style={{ marginBottom: 8 }}>Step Palette</div>
        {isMobile ? (
          <MobileChipScroller
            items={STEP_TYPES.map(st => ({ label: st.label, value: st.id }))}
            selectedValue={null}
            onSelect={(id) => addStep(id)}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {STEP_TYPES.map((st) => (
              <button key={st.id} className="v6-btn ghost" onClick={() => addStep(st.id)} style={{ justifyContent: "flex-start", gap: 9, width: "100%", borderColor: `${st.color}30`, padding: "8px 10px", textAlign: "left" }}>
                <span style={{ color: st.color, display: "flex", flexShrink: 0 }}><st.icon /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{st.label}</div>
                  <div style={{ fontSize: 8, color: "var(--v6-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--v6-line)" }}>
          <div className="v6-eyebrow" style={{ marginBottom: 8 }}>Your Workflows</div>
          {workflows.map(wf => (
            <button key={wf.id} onClick={() => loadWorkflow(wf)} style={{ width: "100%", border: currentWorkflow?.id === wf.id ? "1px solid var(--v6-accent)" : "1px solid transparent", background: currentWorkflow?.id === wf.id ? "var(--v6-surface2)" : "transparent", color: "var(--v6-text)", padding: "8px 10px", borderRadius: 9, marginBottom: 4, fontSize: 11, textAlign: "left", cursor: "pointer", display: "block" }}>
              <strong style={{ display: "block", fontSize: 11 }}>{wf.name}</strong>
              <span style={{ fontSize: 9, color: "var(--v6-muted)" }}>{wf.steps?.length || 0} steps</span>
            </button>
          ))}
          {workflows.length === 0 && <p style={{ fontSize: 10, color: "var(--v6-muted)", textAlign: "center", padding: 12 }}>No saved workflows.</p>}
        </div>
        {templates.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--v6-line)" }}>
            <div className="v6-eyebrow" style={{ marginBottom: 8 }}>Templates</div>
            {templates.map(tmpl => (
              <button key={tmpl.id} onClick={() => loadWorkflow(tmpl)} style={{ width: "100%", border: "1px solid transparent", background: "transparent", color: "var(--v6-text)", padding: "8px 10px", borderRadius: 9, marginBottom: 4, fontSize: 11, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <IconTemplate /> {tmpl.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Center: Canvas ── */}
      <div className="v6-builder-panel" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Progress bar */}
        {execProgress && (
          <div style={{ height: 3, background: "var(--v6-surface2)", flexShrink: 0 }}>
            <div style={{ height: "100%", width: `${(execProgress.current / Math.max(execProgress.total, 1)) * 100}%`, background: "linear-gradient(90deg, var(--v6-accent), var(--v6-good))", transition: "width 0.4s ease", borderRadius: "0 3px 3px 0" }} />
          </div>
        )}
        {/* Toolbar */}
        <div className="v6-workflow-toolbar">
          <input className="v6-input" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="Workflow name..." style={{ flex: 1, fontSize: 13, fontWeight: 600, background: "transparent", border: "1px solid var(--v6-line)", padding: "6px 10px", borderRadius: 7 }} />
          <button onClick={executeWorkflow} disabled={executing || !currentWorkflow?.id}><IconRun /> {!isMobile && (executing ? "Running..." : "Run")}</button>
          <button onClick={saveWorkflow} disabled={!workspaceName || steps.length === 0}><IconSave /> {!isMobile && "Save"}</button>
          <button onClick={handleExportJSON} title="Export JSON"><IconUpload /> {!isMobile && "Export"}</button>
          <button onClick={handleImportJSON} title="Import JSON"><IconTemplate /> {!isMobile && "Import"}</button>
          <button onClick={publishWorkflow} disabled={!currentWorkflow?.id}><IconPublish /> {!isMobile && "Publish"}</button>
          <input ref={fileInputRef} type="file" accept=".json" hidden onChange={handleFileImport} />
        </div>
        {/* Node canvas */}
        <div ref={canvasRef} className="v6-node-canvas" style={{ flex: 1, position: "relative" }} onClick={() => { setSelectedStepId(null); setConnectingFrom(null); }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--v6-accent)" opacity="0.7" />
              </marker>
            </defs>
            {connections.map(conn => {
              const fromNode = steps.find(s => s.id === conn.from);
              const toNode = steps.find(s => s.id === conn.to);
              if (!fromNode || !toNode) return null;
              const x1 = fromNode.position.x + 155, y1 = fromNode.position.y + 30;
              const x2 = toNode.position.x, y2 = toNode.position.y + 30;
              const midX = (x1 + x2) / 2;
              return (
                <g key={`${conn.from}-${conn.to}`}>
                  <path d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`} fill="none" stroke="var(--v6-accent)" strokeWidth="2.5" strokeOpacity="0.45" strokeDasharray="6 4" markerEnd="url(#arrowhead)">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.2s" repeatCount="indefinite" />
                  </path>
                </g>
              );
            })}
            {connectingFrom && (() => { const fn = steps.find(s => s.id === connectingFrom); if (!fn) return null; return <line x1={fn.position.x + 155} y1={fn.position.y + 30} x2={fn.position.x + 250} y2={fn.position.y + 30} stroke="var(--v6-accent)" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />; })()}
          </svg>

          {steps.map((step, i) => {
            const st = STEP_TYPES.find(t => t.id === step.type);
            const status = runStatus[i];
            const isSelected = selectedStepId === step.id;
            const isConnecting = connectingFrom === step.id;
            const statusColor = status === "done" ? "var(--v6-good)" : status === "error" ? "var(--v6-bad)" : status === "running" ? "var(--v6-warn)" : st?.color;
            return (
              <div key={step.id} className="v6-node" style={{
                left: step.position.x, top: step.position.y,
                borderColor: isSelected ? "var(--v6-accent)" : isConnecting ? "var(--v6-accent)" : `${st?.color || "var(--v6-line)"}40`,
                borderLeft: `3px solid ${st?.color || "var(--v6-accent)"}`,
                zIndex: isSelected ? 5 : 1, cursor: draggingNodeId === step.id ? "grabbing" : "grab",
                opacity: draggingNodeId === step.id ? 0.85 : 1,
                transition: draggingNodeId ? "none" : "border-color 0.18s, box-shadow 0.18s",
                boxShadow: isSelected ? `0 0 24px ${st?.color || "var(--v6-accent)"}33` : isConnecting ? "0 0 16px rgba(255,65,111,0.15)" : draggingNodeId ? "0 8px 24px rgba(0,0,0,0.3)" : undefined,
              }} onMouseDown={e => { setSelectedStepId(step.id); handleNodeMouseDown(e, step.id); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `${st?.color || "var(--v6-accent)"}1f`, color: st?.color || "var(--v6-text)", border: `1px solid ${st?.color || "var(--v6-line)"}44`, flexShrink: 0 }}>{st?.icon && <st.icon />}</span>
                  <strong>{step.name || `Step ${i+1}`}</strong>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0, boxShadow: status ? `0 0 8px ${statusColor}` : "none", marginLeft: "auto" }} title={status || "idle"} />
                  <button onClick={e => { e.stopPropagation(); removeStep(step.id); }} style={{ border: 0, background: "transparent", color: "var(--v6-muted)", cursor: "pointer", padding: 2, display: "flex" }} title="Remove step"><IconTrash /></button>
                </div>
                <p>{step.config?.prompt?.slice(0, 60) || step.config?.model || "Configure step..."}</p>
                <div style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, borderRadius: "50%", border: `2.5px solid ${isConnecting ? "var(--v6-accent)" : "var(--v6-line)"}`, background: isConnecting ? "var(--v6-accent)" : "var(--v6-surface)", cursor: "pointer", zIndex: 6, transition: "all 0.18s", boxShadow: isConnecting ? "0 0 12px var(--v6-accent)" : "none" }} onClick={e => handlePortClick(e, step.id)} title="Connect output" />
              </div>
            );
          })}

          {/* Empty canvas state */}
          {steps.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--v6-muted)", fontSize: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 64, height: 64, borderRadius: 14, border: "2px dashed var(--v6-line)", margin: "0 auto 16px", display: "grid", placeItems: "center", opacity: 0.5, animation: "v6-float 3s ease-in-out infinite" }}><IconPlus /></div>
                <p style={{ fontWeight: 600 }}>Drag steps here to build your workflow</p>
                <p style={{ fontSize: 10, marginTop: 4 }}>Add steps from the left palette and connect them by clicking output ports</p>
              </div>
            </div>
          )}

          {/* Connection hint */}
          {connectingFrom && (
            <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, fontSize: 10, color: "var(--v6-muted)", background: "var(--v6-surface)", padding: "6px 14px", borderRadius: 99, border: "1px solid var(--v6-line)" }}>
              Click a node's output port to connect · <button onClick={e => { e.stopPropagation(); setConnectingFrom(null); }} style={{ border: 0, background: "transparent", color: "var(--v6-accent)", cursor: "pointer", fontWeight: 700 }}>Cancel</button>
            </div>
          )}

          {/* Mini-map */}
          {steps.length > 0 && (
            <div style={{ position: "absolute", bottom: 8, right: 8, width: mmW, height: mmH, borderRadius: 8, border: "1px solid var(--v6-line)", background: "var(--v6-surface2)", opacity: 0.7, overflow: "hidden", pointerEvents: "none", zIndex: 8 }}>
              {steps.map(s => { const st2 = STEP_TYPES.find(t => t.id === s.type); return <div key={s.id} style={{ position: "absolute", left: s.position.x * scale, top: s.position.y * scale, width: 155 * scale, height: 60 * scale, background: st2?.color || "var(--v6-line)", borderRadius: 3, opacity: 0.5 }} />; })}
            </div>
          )}
        </div>

        {/* Run result */}
        {runResult && (
          <div style={{ borderTop: "1px solid var(--v6-line)", padding: "10px 14px", background: "var(--v6-surface)", fontSize: 11, maxHeight: 120, overflow: "auto" }}>
            {runResult.success ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "var(--v6-good)", display: "flex" }}><IconCheck /></span><span>Workflow completed · {runResult.outputs?.length || 0} outputs</span>{runResult.creditsUsed != null && <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--v6-accent)", marginLeft: "auto" }}><IconBolt /> {runResult.creditsUsed}c</span>}</div> : <div style={{ color: "var(--v6-bad)" }}><IconClose /> {runResult.error || "Execution failed"}</div>}
          </div>
        )}
      </div>

      {/* ── Right: Step inspector ── */}
      <div className="v6-builder-panel">
        <div className="v6-eyebrow" style={{ marginBottom: 10 }}>Step Inspector</div>
        {selectedStep ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="v6-field"><span className="v6-field-label">Step name</span><input className="v6-input" value={selectedStep.name} onChange={e => updateStep(selectedStep.id, { name: e.target.value })} placeholder="Step name..." style={{ fontSize: 11 }} /></div>
            <div className="v6-quote"><div className="v6-quote-row"><span className="v6-muted">Type</span><strong style={{ color: selectedStepType?.color }}>{selectedStepType?.label || selectedStep.type}</strong></div><div className="v6-quote-row"><span className="v6-muted">ID</span><strong className="v6-tiny v6-mono">{selectedStep.id.slice(0, 12)}...</strong></div></div>
            {(selectedStep.type === "image_gen" || selectedStep.type === "video_gen") && <div className="v6-field"><span className="v6-field-label">Model</span><select className="v6-input" value={selectedStep.config.model} onChange={e => updateStepConfig(selectedStep.id, "model", e.target.value)} style={{ fontSize: 11 }}><option value="">Select model...</option>{imageModels.map(m => <option key={m.id} value={m.id}>{m.name} — {m.provider}</option>)}</select></div>}
            <div className="v6-field"><span className="v6-field-label">Prompt <span className="v6-tiny" style={{ color: "var(--v6-muted)", fontWeight: 400 }}>($INPUT_, $STEP_ supported)</span></span><textarea className="v6-textarea" value={selectedStep.config.prompt} onChange={e => updateStepConfig(selectedStep.id, "prompt", e.target.value)} placeholder="Describe what to generate..." rows={3} style={{ minHeight: 72 }} /></div>
            <div className="v6-field"><span className="v6-field-label">Input source</span><select className="v6-input" value={selectedStep.config.inputSource} onChange={e => updateStepConfig(selectedStep.id, "inputSource", e.target.value)} style={{ fontSize: 11 }}>{INPUT_SOURCES.map(src => <option key={src.value} value={src.value}>{src.label}</option>)}</select></div>
            <div className="v6-field"><span className="v6-field-label">On failure</span><select className="v6-input" value={selectedStep.config.onFailure} onChange={e => updateStepConfig(selectedStep.id, "onFailure", e.target.value)} style={{ fontSize: 11 }}>{FAILURE_BEHAVIORS.map(fb => <option key={fb.value} value={fb.value}>{fb.label}</option>)}</select></div>
            <details style={{ fontSize: 10 }}><summary style={{ cursor: "pointer", color: "var(--v6-muted)", fontWeight: 700, marginBottom: 6 }}>Generation params</summary><div className="v6-field" style={{ marginTop: 6 }}><span className="v6-field-label">Aspect ratio</span><input className="v6-input" value={selectedStep.config.params?.aspect_ratio || ""} onChange={e => updateStepConfig(selectedStep.id, "params", { ...selectedStep.config.params, aspect_ratio: e.target.value })} placeholder="e.g. 16:9, 1:1" style={{ fontSize: 11 }} /></div><div className="v6-field" style={{ marginTop: 6 }}><span className="v6-field-label">Negative prompt</span><input className="v6-input" value={selectedStep.config.params?.negative_prompt || ""} onChange={e => updateStepConfig(selectedStep.id, "params", { ...selectedStep.config.params, negative_prompt: e.target.value })} placeholder="Things to avoid..." style={{ fontSize: 11 }} /></div></details>
            {currentWorkflow?.id && <button className="v6-btn v6-ghost" onClick={regenerateStep} style={{ width: "100%" }}><IconRefresh /> Regenerate this step</button>}
            <button className="v6-btn v6-ghost" onClick={() => removeStep(selectedStep.id)} style={{ width: "100%", color: "var(--v6-bad)" }}><IconTrash /> Remove step</button>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 8px", fontSize: 10, color: "var(--v6-muted)" }}>
            <div style={{ marginBottom: 10, opacity: 0.25 }}><IconMove /></div>
            <p>Select a node on the canvas to configure it</p>
            {steps.length > 0 && <p style={{ marginTop: 6 }}>{steps.length} step{steps.length !== 1 ? "s" : ""} in workflow</p>}
          </div>
        )}
        <div className="v6-quote" style={{ marginTop: 12 }}>
          <div className="v6-eyebrow" style={{ marginBottom: 4 }}>Run Estimate</div>
          <div className="v6-quote-row"><span className="v6-muted">Steps</span><strong>{steps.length}</strong></div>
          <div className="v6-quote-row"><span className="v6-muted">Connections</span><strong>{connections.length}</strong></div>
          <div className="v6-quote-row"><span className="v6-muted">Est. cost</span><strong style={{ color: "var(--v6-good)" }}><IconBolt /> {costEstimate}c</strong></div>
        </div>
        {undoStack.length > 0 && <button className="v6-btn v6-ghost v6-sm" onClick={handleUndo} style={{ width: "100%", marginTop: 8 }}><IconRefresh /> Undo (Ctrl+Z)</button>}
      </div>

      <style>{`@keyframes v6-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }`}</style>
    </div>
  );
}
