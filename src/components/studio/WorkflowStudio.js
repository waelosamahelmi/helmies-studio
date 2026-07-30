"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { useModelCatalog } from "@/components/studio/useModelCatalog";

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
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);
const IconPlus = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* ── Step type palette ── */
const STEP_TYPES = [
  { id: "prompt_compile", label: "Prompt Compiler", icon: IconPrompt, color: "#A855F7" },
  { id: "image_gen", label: "Image Generation", icon: IconImageGen, color: "#4ADE80" },
  { id: "video_gen", label: "Video Generation", icon: IconVideoGen, color: "#60A5FA" },
  { id: "audio_gen", label: "Audio Generation", icon: IconAudioGen, color: "#FACC15" },
  { id: "quality_gate", label: "Quality Gate", icon: IconQualityGate, color: "#FB923C" },
  { id: "brand_compliance", label: "Brand Compliance", icon: IconBrand, color: "#F472B6" },
  { id: "save_project", label: "Save to Project", icon: IconSave, color: "#34D399" },
];

/* ── Helpers ── */
function createStep(typeId) {
  const type = STEP_TYPES.find((t) => t.id === typeId) || STEP_TYPES[0];
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: typeId,
    name: type.label,
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

/* ══════════════════════════════════════════════════════════════
   WorkflowStudio — v6 n8n-style visual workflow builder
   ══════════════════════════════════════════════════════════════ */
export default function WorkflowStudio() {
  /* ── State ── */
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([]);
  const [connections, setConnections] = useState([]); // { from: stepId, to: stepId }
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runStatus, setRunStatus] = useState({}); // stepIndex → status
  const [workspaceName, setWorkspaceName] = useState("Untitled Workflow");

  const { models: imageModels } = useModelCatalog({ modelType: "image" });

  /* ── Drag state ── */
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  /* ── Load workflows ── */
  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      const data = await res.json();
      if (Array.isArray(data)) setWorkflows(data);
    } catch {}
  }, []);

  /* ── Load templates ── */
  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows?type=templates");
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data);
    } catch {}
  }, []);

  useEffect(() => { loadWorkflows(); loadTemplates(); }, [loadWorkflows, loadTemplates]);

  /* ── Step management ── */
  const addStep = useCallback((typeId) => {
    const step = createStep(typeId);
    setSteps((prev) => [...prev, step]);
    setSelectedStepId(step.id);
  }, []);

  const removeStep = useCallback((id) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setConnections((prev) => prev.filter((c) => c.from !== id && c.to !== id));
    if (selectedStepId === id) setSelectedStepId(null);
  }, [selectedStepId]);

  const updateStep = useCallback((id, patch) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const updateStepConfig = useCallback((id, key, value) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)),
    );
  }, []);

  /* ── Connections ── */
  const addConnection = useCallback((from, to) => {
    if (from === to) return;
    setConnections((prev) => {
      if (prev.find((c) => c.from === from && c.to === to)) return prev;
      // Remove existing connection from the same source
      const filtered = prev.filter((c) => c.from !== from);
      return [...filtered, { from, to }];
    });
  }, []);

  const removeConnection = useCallback((from, to) => {
    setConnections((prev) => prev.filter((c) => !(c.from === from && c.to === to)));
  }, []);

  /* ── Drag & drop nodes on canvas ── */
  const handleNodeMouseDown = useCallback(
    (e, nodeId) => {
      e.stopPropagation();
      const nodeEl = e.currentTarget;
      const rect = nodeEl.getBoundingClientRect();
      setDraggingNodeId(nodeId);
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [],
  );

  useEffect(() => {
    if (!draggingNodeId) return;

    const handleMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const x = e.clientX - canvasRect.left - dragOffset.x;
      const y = e.clientY - canvasRect.top - dragOffset.y;
      setSteps((prev) =>
        prev.map((s) =>
          s.id === draggingNodeId ? { ...s, position: { x: Math.max(0, x), y: Math.max(0, y) } } : s,
        ),
      );
    };

    const handleUp = () => {
      setDraggingNodeId(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingNodeId, dragOffset]);

  /* ── Connection clicking ── */
  const [connectingFrom, setConnectingFrom] = useState(null);
  const handlePortClick = useCallback(
    (e, nodeId) => {
      e.stopPropagation();
      if (connectingFrom === null) {
        setConnectingFrom(nodeId);
      } else {
        addConnection(connectingFrom, nodeId);
        setConnectingFrom(null);
      }
    },
    [connectingFrom, addConnection],
  );

  /* ── Save workflow ── */
  const saveWorkflow = useCallback(async () => {
    if (!workspaceName || steps.length === 0) return;
    const stepData = steps.map((s) => ({
      agent: s.type,
      task: s.name,
      params: {
        model: s.config.model || "",
        prompt: s.config.prompt || "",
        inputSource: s.config.inputSource,
        onFailure: s.config.onFailure,
        ...s.config.params,
      },
    }));
    try {
      const res = await apiFetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName, description: "", steps: stepData }),
      });
      const data = await res.json();
      if (data.workflow) setCurrentWorkflow(data.workflow);
      await loadWorkflows();
    } catch {}
  }, [workspaceName, steps, loadWorkflows]);

  /* ── Load a workflow into editor ── */
  const loadWorkflow = useCallback((wf) => {
    setCurrentWorkflow(wf);
    setWorkspaceName(wf.name || "Untitled");
    const loadedSteps = (wf.steps || []).map((s, i) => ({
      id: s.id || `step-${Date.now()}-${i}`,
      type: s.agent || "image_gen",
      name: s.task || `Step ${i + 1}`,
      config: {
        model: s.params?.model || "",
        prompt: s.params?.prompt || "",
        inputSource: s.params?.inputSource || "previous",
        onFailure: s.params?.onFailure || "stop",
        params: s.params || {},
      },
      position: { x: 60, y: 60 + i * 130 },
    }));
    setSteps(loadedSteps);
    // Auto-connect sequential steps
    const conns = [];
    for (let i = 0; i < loadedSteps.length - 1; i++) {
      conns.push({ from: loadedSteps[i].id, to: loadedSteps[i + 1].id });
    }
    setConnections(conns);
    setSelectedStepId(null);
    setRunResult(null);
  }, []);

  /* ── Execute workflow ── */
  const executeWorkflow = useCallback(async () => {
    if (!currentWorkflow?.id) return;
    setExecuting(true);
    setRunResult(null);
    setRunStatus({});
    try {
      const res = await apiFetch(`/api/workflows/${currentWorkflow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: {
            prompt: steps[0]?.config?.prompt || "",
          },
        }),
      });
      const data = await res.json();
      setRunResult(data);
      if (data.stepResults) {
        const statuses = {};
        data.stepResults.forEach((sr, i) => {
          statuses[i] = sr.status === "completed" ? "done" : sr.status === "failed" ? "error" : "running";
        });
        setRunStatus(statuses);
      }
    } catch (e) {
      setRunResult({ success: false, error: e.message });
    } finally {
      setExecuting(false);
    }
  }, [currentWorkflow, steps]);

  /* ── Regenerate step ── */
  const regenerateStep = useCallback(async () => {
    if (!currentWorkflow?.id || selectedStepId == null) return;
    const stepIdx = steps.findIndex((s) => s.id === selectedStepId);
    if (stepIdx < 0) return;
    try {
      const res = await apiFetch(`/api/workflows/${currentWorkflow.id}/regen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepIndex: stepIdx }),
      });
      const data = await res.json();
      setRunResult((prev) => ({ ...prev, regenResult: data }));
    } catch {}
  }, [currentWorkflow, selectedStepId, steps]);

  /* ── Publish ── */
  const publishWorkflow = useCallback(async () => {
    if (!currentWorkflow?.id) return;
    try {
      await apiFetch(`/api/workflows/${currentWorkflow.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await loadWorkflows();
    } catch {
      // Publish endpoint pending — workflow saved but not yet public
    }
  }, [currentWorkflow, loadWorkflows]);

  /* ── Derive selected step ── */
  const selectedStep = steps.find((s) => s.id === selectedStepId);
  const selectedStepType = STEP_TYPES.find((t) => t.id === selectedStep?.type);

  /* ── Cost estimate ── */
  const costEstimate = steps.reduce((sum, s) => {
    if (s.type === "video_gen") return sum + 8;
    if (s.type === "audio_gen") return sum + 3;
    return sum + 4;
  }, 0);

  return (
    <div className="v6-builder-grid" style={{ height: "100%" }}>
      {/* ── Left panel: Step palette + saved workflows ── */}
      <div className="v6-builder-panel">
        <div className="v6-eyebrow" style={{ marginBottom: 8 }}>Step Palette</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {STEP_TYPES.map((st) => (
            <button
              key={st.id}
              className="v6-btn ghost"
              onClick={() => addStep(st.id)}
              style={{
                justifyContent: "flex-start",
                gap: 9,
                width: "100%",
                borderColor: `${st.color}40`,
                background: connectingFrom ? "transparent" : undefined,
              }}
            >
              <span style={{ color: st.color, display: "flex" }}>
                <st.icon />
              </span>
              {st.label}
            </button>
          ))}
        </div>

        {/* Saved workflows */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--v6-line)" }}>
          <div className="v6-eyebrow" style={{ marginBottom: 8 }}>Your Workflows</div>
          {workflows.map((wf) => (
            <button
              key={wf.id}
              onClick={() => loadWorkflow(wf)}
              style={{
                width: "100%",
                border: currentWorkflow?.id === wf.id ? "1px solid var(--v6-accent)" : "1px solid transparent",
                background: currentWorkflow?.id === wf.id ? "var(--v6-surface2)" : "transparent",
                color: "var(--v6-text)",
                padding: "8px 10px",
                borderRadius: 9,
                marginBottom: 4,
                fontSize: 11,
                textAlign: "left",
                cursor: "pointer",
                display: "block",
              }}
            >
              <strong style={{ display: "block", fontSize: 11 }}>{wf.name}</strong>
              <span style={{ fontSize: 9, color: "var(--v6-muted)" }}>
                {wf.steps?.length || 0} steps
              </span>
            </button>
          ))}
          {workflows.length === 0 && (
            <p style={{ fontSize: 10, color: "var(--v6-muted)", textAlign: "center", padding: 12 }}>
              No saved workflows.
            </p>
          )}
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--v6-line)" }}>
            <div className="v6-eyebrow" style={{ marginBottom: 8 }}>Templates</div>
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => loadWorkflow(tmpl)}
                style={{
                  width: "100%",
                  border: "1px solid transparent",
                  background: "transparent",
                  color: "var(--v6-text)",
                  padding: "8px 10px",
                  borderRadius: 9,
                  marginBottom: 4,
                  fontSize: 11,
                  textAlign: "left",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                <IconTemplate />
                <span style={{ marginLeft: 8 }}>{tmpl.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Center panel: Node canvas ── */}
      <div className="v6-builder-panel" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div className="v6-workflow-toolbar">
          <input
            className="v6-input"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Workflow name..."
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              background: "transparent",
              border: "1px solid var(--v6-line)",
              padding: "6px 10px",
              borderRadius: 7,
            }}
          />
          <button onClick={executeWorkflow} disabled={executing || !currentWorkflow?.id}>
            <IconRun /> {executing ? "Running..." : "Run"}
          </button>
          <button onClick={saveWorkflow} disabled={!workspaceName || steps.length === 0}>
            <IconSave /> Save
          </button>
          <button onClick={() => loadTemplates()}>
            <IconTemplate /> Templates
          </button>
          <button onClick={publishWorkflow} disabled={!currentWorkflow?.id}>
            <IconPublish /> Publish
          </button>
        </div>

        {/* Node canvas */}
        <div
          ref={canvasRef}
          className="v6-node-canvas"
          style={{ flex: 1, position: "relative" }}
          onClick={() => { setSelectedStepId(null); setConnectingFrom(null); }}
        >
          {/* Connection lines */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 0,
            }}
          >
            {connections.map((conn) => {
              const fromNode = steps.find((s) => s.id === conn.from);
              const toNode = steps.find((s) => s.id === conn.to);
              if (!fromNode || !toNode) return null;
              const x1 = fromNode.position.x + 155;
              const y1 = fromNode.position.y + 30;
              const x2 = toNode.position.x;
              const y2 = toNode.position.y + 30;
              const midX = (x1 + x2) / 2;
              return (
                <g key={`${conn.from}-${conn.to}`}>
                  <path
                    d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke="var(--v6-accent)"
                    strokeWidth="1.5"
                    strokeOpacity="0.5"
                    strokeDasharray={connectingFrom === conn.from ? "none" : "4 3"}
                  />
                  {/* Arrow head */}
                  <polygon
                    points={`${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`}
                    fill="var(--v6-accent)"
                    fillOpacity="0.5"
                  />
                </g>
              );
            })}
            {/* Pending connection line */}
            {connectingFrom && (() => {
              const fromNode = steps.find((s) => s.id === connectingFrom);
              if (!fromNode) return null;
              return (
                <line
                  x1={fromNode.position.x + 155}
                  y1={fromNode.position.y + 30}
                  x2={fromNode.position.x + 250}
                  y2={fromNode.position.y + 30}
                  stroke="var(--v6-accent)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.6"
                />
              );
            })()}
          </svg>

          {/* Step nodes */}
          {steps.map((step, i) => {
            const st = STEP_TYPES.find((t) => t.id === step.type);
            const status = runStatus[i];
            const isSelected = selectedStepId === step.id;
            const isConnecting = connectingFrom === step.id;

            return (
              <div
                key={step.id}
                className={`v6-node${isSelected ? "" : ""}`}
                style={{
                  left: step.position.x,
                  top: step.position.y,
                  borderColor: isSelected
                    ? "var(--v6-accent)"
                    : isConnecting
                      ? "var(--v6-accent)"
                      : `${st?.color || "var(--v6-line)"}40`,
                  zIndex: isSelected ? 5 : 1,
                  cursor: draggingNodeId === step.id ? "grabbing" : "grab",
                  opacity: draggingNodeId === step.id ? 0.85 : 1,
                  transition: draggingNodeId ? "none" : "border-color 0.18s, box-shadow 0.18s",
                  boxShadow: isSelected
                    ? "0 0 20px rgba(255,65,111,0.2)"
                    : isConnecting
                      ? "0 0 16px rgba(255,65,111,0.15)"
                      : undefined,
                }}
                onMouseDown={(e) => {
                  setSelectedStepId(step.id);
                  handleNodeMouseDown(e, step.id);
                }}
              >
                {/* Node header */}
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${st?.color || "var(--v6-accent)"}1f`,
                      color: st?.color || "var(--v6-text)",
                      border: `1px solid ${st?.color || "var(--v6-line)"}44`,
                      flexShrink: 0,
                    }}
                  >
                    {st?.icon && <st.icon />}
                  </span>
                  <strong>{step.name || `Step ${i + 1}`}</strong>
                  <div style={{ flex: 1 }} />
                  {status && (
                    <span
                      className={`v6-status${status === "running" ? " v6-processing" : status === "error" ? " v6-failed" : ""}`}
                    >
                      {status}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "var(--v6-muted)",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                    }}
                    title="Remove step"
                  >
                    <IconTrash />
                  </button>
                </div>

                {/* Config summary */}
                <p>{step.config?.prompt || step.config?.model || "Configure step..."}</p>

                {/* Output connection port */}
                <div
                  style={{
                    position: "absolute",
                    right: -7,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: `2px solid ${connectingFrom === step.id ? "var(--v6-accent)" : "var(--v6-line)"}`,
                    background: connectingFrom === step.id ? "var(--v6-accent)" : "var(--v6-surface)",
                    cursor: "pointer",
                    zIndex: 6,
                    transition: "all 0.18s",
                  }}
                  onClick={(e) => handlePortClick(e, step.id)}
                  title="Connect output"
                />
              </div>
            );
          })}

          {/* Empty state */}
          {steps.length === 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "var(--v6-muted)",
                fontSize: 12,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: 12, opacity: 0.3 }}>
                  <IconMove />
                </div>
                <p>Click a step type in the left panel to begin</p>
                <p style={{ fontSize: 10, marginTop: 4 }}>Connect steps by clicking their output ports</p>
              </div>
            </div>
          )}

          {/* Connection hint */}
          {connectingFrom && (
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                fontSize: 10,
                color: "var(--v6-muted)",
                background: "var(--v6-surface)",
                padding: "6px 14px",
                borderRadius: 99,
                border: "1px solid var(--v6-line)",
              }}
            >
              Click a node's output port to connect ·{" "}
              <button
                onClick={(e) => { e.stopPropagation(); setConnectingFrom(null); }}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "var(--v6-accent)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Run result */}
        {runResult && (
          <div
            style={{
              borderTop: "1px solid var(--v6-line)",
              padding: "10px 14px",
              background: "var(--v6-surface)",
              fontSize: 11,
              maxHeight: 120,
              overflow: "auto",
            }}
          >
            {runResult.success ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--v6-good)", display: "flex" }}>
                  <IconCheck />
                </span>
                <span>Workflow completed · {runResult.outputs?.length || 0} outputs</span>
                {runResult.creditsUsed != null && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--v6-accent)", marginLeft: "auto" }}>
                    <IconBolt /> {runResult.creditsUsed}c
                  </span>
                )}
              </div>
            ) : (
              <div style={{ color: "var(--v6-bad)" }}>
                <IconClose /> {runResult.error || "Execution failed"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel: Step inspector ── */}
      <div className="v6-builder-panel">
        <div className="v6-eyebrow" style={{ marginBottom: 10 }}>Step Inspector</div>

        {selectedStep ? (
          <div style={{ display: "grid", gap: 10 }}>
            {/* Step name */}
            <div className="v6-field">
              <span className="v6-field-label">Step name</span>
              <input
                className="v6-input"
                value={selectedStep.name}
                onChange={(e) => updateStep(selectedStep.id, { name: e.target.value })}
                placeholder="Step name..."
                style={{ fontSize: 11 }}
              />
            </div>

            {/* Type display */}
            <div className="v6-quote">
              <div className="v6-quote-row">
                <span className="v6-muted">Type</span>
                <strong style={{ color: selectedStepType?.color }}>
                  {selectedStepType?.label || selectedStep.type}
                </strong>
              </div>
              <div className="v6-quote-row">
                <span className="v6-muted">ID</span>
                <strong className="v6-tiny v6-mono">{selectedStep.id.slice(0, 12)}...</strong>
              </div>
            </div>

            {/* Model selector (for generation steps) */}
            {(selectedStep.type === "image_gen" || selectedStep.type === "video_gen") && (
              <div className="v6-field">
                <span className="v6-field-label">Model</span>
                <select
                  className="v6-input"
                  value={selectedStep.config.model}
                  onChange={(e) => updateStepConfig(selectedStep.id, "model", e.target.value)}
                  style={{ fontSize: 11 }}
                >
                  <option value="">Select model...</option>
                  {imageModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.provider}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Prompt */}
            <div className="v6-field">
              <span className="v6-field-label">
                Prompt{" "}
                <span className="v6-tiny" style={{ color: "var(--v6-muted)", fontWeight: 400 }}>
                  ($INPUT_, $STEP_ supported)
                </span>
              </span>
              <textarea
                className="v6-textarea"
                value={selectedStep.config.prompt}
                onChange={(e) => updateStepConfig(selectedStep.id, "prompt", e.target.value)}
                placeholder="Describe what to generate..."
                rows={3}
                style={{ minHeight: 72 }}
              />
            </div>

            {/* Input source */}
            <div className="v6-field">
              <span className="v6-field-label">Input source</span>
              <select
                className="v6-input"
                value={selectedStep.config.inputSource}
                onChange={(e) => updateStepConfig(selectedStep.id, "inputSource", e.target.value)}
                style={{ fontSize: 11 }}
              >
                {INPUT_SOURCES.map((src) => (
                  <option key={src.value} value={src.value}>
                    {src.label}
                  </option>
                ))}
              </select>
            </div>

            {/* On-failure behavior */}
            <div className="v6-field">
              <span className="v6-field-label">On failure</span>
              <select
                className="v6-input"
                value={selectedStep.config.onFailure}
                onChange={(e) => updateStepConfig(selectedStep.id, "onFailure", e.target.value)}
                style={{ fontSize: 11 }}
              >
                {FAILURE_BEHAVIORS.map((fb) => (
                  <option key={fb.value} value={fb.value}>
                    {fb.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Generation params (expandable) */}
            <details style={{ fontSize: 10 }}>
              <summary style={{ cursor: "pointer", color: "var(--v6-muted)", fontWeight: 700, marginBottom: 6 }}>
                Generation params
              </summary>
              <div className="v6-field" style={{ marginTop: 6 }}>
                <span className="v6-field-label">Aspect ratio</span>
                <input
                  className="v6-input"
                  value={selectedStep.config.params?.aspect_ratio || ""}
                  onChange={(e) =>
                    updateStepConfig(selectedStep.id, "params", {
                      ...selectedStep.config.params,
                      aspect_ratio: e.target.value,
                    })
                  }
                  placeholder="e.g. 16:9, 1:1"
                  style={{ fontSize: 11 }}
                />
              </div>
              <div className="v6-field" style={{ marginTop: 6 }}>
                <span className="v6-field-label">Negative prompt</span>
                <input
                  className="v6-input"
                  value={selectedStep.config.params?.negative_prompt || ""}
                  onChange={(e) =>
                    updateStepConfig(selectedStep.id, "params", {
                      ...selectedStep.config.params,
                      negative_prompt: e.target.value,
                    })
                  }
                  placeholder="Things to avoid..."
                  style={{ fontSize: 11 }}
                />
              </div>
            </details>

            {/* Regenerate button */}
            {currentWorkflow?.id && (
              <button className="v6-btn v6-ghost" onClick={regenerateStep} style={{ width: "100%" }}>
                <IconRefresh /> Regenerate this step
              </button>
            )}

            {/* Remove button */}
            <button
              className="v6-btn v6-ghost"
              onClick={() => removeStep(selectedStep.id)}
              style={{ width: "100%", color: "var(--v6-bad)" }}
            >
              <IconTrash /> Remove step
            </button>
          </div>
        ) : (
          /* No selection */
          <div style={{ textAlign: "center", padding: "20px 8px", fontSize: 10, color: "var(--v6-muted)" }}>
            <div style={{ marginBottom: 10, opacity: 0.25 }}>
              <IconMove />
            </div>
            <p>Select a node on the canvas to configure it</p>
            {steps.length > 0 && (
              <p style={{ marginTop: 6 }}>{steps.length} step{steps.length !== 1 ? "s" : ""} in workflow</p>
            )}
          </div>
        )}

        {/* Cost estimate */}
        <div className="v6-quote" style={{ marginTop: 12 }}>
          <div className="v6-eyebrow" style={{ marginBottom: 4 }}>Run Estimate</div>
          <div className="v6-quote-row">
            <span className="v6-muted">Steps</span>
            <strong>{steps.length}</strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Connections</span>
            <strong>{connections.length}</strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Est. cost</span>
            <strong style={{ color: "var(--v6-good)" }}>
              <IconBolt /> {costEstimate}c
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
