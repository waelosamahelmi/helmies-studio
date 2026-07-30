"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import PromptDock from "./v6/PromptDock";

const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn"];

/* ── Inline SVG Icons ── */
const IconSelect = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></svg>);
const IconImage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);
const IconType = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" /><line x1="4" y1="20" x2="20" y2="20" /></svg>);
const IconMask = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><circle cx="12" cy="12" r="4" /></svg>);
const IconMotion = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>);
const IconMore = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>);
const IconPlus = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const IconTrash = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>);
const IconUpload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const IconDownload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>);
const IconSave = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>);
const IconFolder = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10" /></svg>);
const IconChevronUp = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>);
const IconChevronDown = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>);
const IconEye = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const IconEyeOff = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
const IconCopy = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>);
const IconGrip = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="5" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="19" r="1" /></svg>);
const IconZoomIn = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>);
const IconZoomOut = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>);

const TOOLS = [
  { id: "select", label: "Select", icon: IconSelect },
  { id: "image", label: "Image", icon: IconImage },
  { id: "text", label: "Text", icon: IconType },
  { id: "mask", label: "Mask", icon: IconMask },
  { id: "motion", label: "Motion", icon: IconMotion },
];

/* ══════════════════════════════════════════════════════════════ */
export default function CanvasStudio() {
  const [document, setDocument] = useState(null);
  const [layers, setLayers] = useState([]);
  const [activeLayerId, setActiveLayerId] = useState(null);
  const [activeTool, setActiveTool] = useState("select");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loadedDocs, setLoadedDocs] = useState([]);
  const [showDocList, setShowDocList] = useState(false);
  const [docName, setDocName] = useState("Untitled");
  const [zoom, setZoom] = useState(100);
  const [undoStack, setUndoStack] = useState([]);
  const uploadRef = useRef(null);

  const { models: canvasModels } = useModelCatalog({ modelType: "image" });
  useEffect(() => { if (canvasModels.length > 0 && !selectedModelId) setSelectedModelId(canvasModels[0].id); }, [canvasModels, selectedModelId]);
  const { loading: generationLoading, result: genResult, error: genError, elapsed, submit } = useAsyncGeneration();
  const activeLayer = layers.find(l => l.id === activeLayerId);
  const currentModel = canvasModels.find(m => m.id === selectedModelId) || canvasModels[0];

  useEffect(() => { fetch("/api/canvas").then(r => r.json()).then(docs => { if (Array.isArray(docs)) setLoadedDocs(docs); }).catch(() => {}); }, []);
  useEffect(() => { setGenerating(generationLoading); }, [generationLoading]);
  useEffect(() => { if (genResult?.url && !generating) addLayer("image", genResult.url, `Generated ${layers.length + 1}`); }, [genResult?.url, generating]);

  /* ── Undo helper ── */
  const pushUndo = useCallback(() => setUndoStack(prev => [...prev.slice(-29), layers.map(l => ({ ...l }))]), [layers]);

  /* ── Layer CRUD ── */
  const addLayer = useCallback((type = "image", src = "", name = `Layer ${layers.length + 1}`) => {
    pushUndo();
    const id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLayers(prev => [...prev, { id, name, type, content: src, position: { x: 0, y: 0 }, opacity: 100, blendMode: "normal", visible: true }]);
    setActiveLayerId(id); return id;
  }, [layers.length, pushUndo]);

  const updateLayer = useCallback((id, patch) => { setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l)); }, []);
  const removeLayer = useCallback((id) => { pushUndo(); setLayers(prev => prev.filter(l => l.id !== id)); if (activeLayerId === id) setActiveLayerId(null); }, [activeLayerId, pushUndo]);
  const duplicateLayer = useCallback((id) => { const src = layers.find(l => l.id === id); if (!src) return; addLayer(src.type, src.content, `${src.name} copy`); }, [layers, addLayer]);
  const moveLayerUp = useCallback((id) => { pushUndo(); setLayers(prev => { const idx = prev.findIndex(l => l.id === id); if (idx <= 0) return prev; const arr = [...prev]; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; return arr; }); }, [pushUndo]);
  const moveLayerDown = useCallback((id) => { pushUndo(); setLayers(prev => { const idx = prev.findIndex(l => l.id === id); if (idx < 0 || idx >= prev.length - 1) return prev; const arr = [...prev]; [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]]; return arr; }); }, [pushUndo]);

  /* ── Upload ── */
  const handleUpload = useCallback(() => uploadRef.current?.click(), []);
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try { const res = await fetch("/api/upload", { method: "POST", body: fd }); const data = await res.json(); if (data.url) addLayer("image", data.url, file.name); } catch {}
    e.target.value = "";
  }, [addLayer]);

  /* ── Document CRUD ── */
  const saveDocument = useCallback(async () => {
    const content = { layers, artboardSize: { width: 1024, height: 1024 } };
    try {
      if (document?.id) { const res = await fetch("/api/canvas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: document.id, name: docName, content }) }); const updated = await res.json(); setDocument(updated); }
      else { const res = await fetch("/api/canvas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: docName, content }) }); const doc = await res.json(); setDocument(doc); setLoadedDocs(prev => [doc, ...prev]); }
    } catch {}
  }, [document, docName, layers]);

  const loadDocument = useCallback(async (doc) => { setDocument(doc); setDocName(doc.name || "Untitled"); const content = doc.content || {}; setLayers(content.layers || []); setActiveLayerId(null); setShowDocList(false); }, []);
  const newDocument = useCallback(() => { setDocument(null); setDocName("Untitled"); setLayers([]); setActiveLayerId(null); setShowDocList(false); setUndoStack([]); }, []);

  /* ── Generate ── */
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    try {
      const { compileCanvas } = await import("@/lib/canvas-compiler");
      const canvasContext = { canvas: { width: 1024, height: 1024 }, objects: layers.filter(l => l.type === "image" && l.content).map(l => ({ id: l.id, type: "image", src: l.content, role: "layout_reference", bounds: { left: l.position.x * 1024, top: l.position.y * 1024, width: 1024, height: 1024 } })) };
      const compiled = compileCanvas(canvasContext, { modelId: selectedModelId, prompt, aspectRatio: "1:1" });
      const params = compiled?.request ? { ...compiled.request, canvas_context: canvasContext, canvas_compiled: compiled } : { endpoint: currentModel?.endpoint || selectedModelId, prompt, aspect_ratio: "1:1" };
      submit("image", selectedModelId, params);
    } catch { submit("image", selectedModelId, { endpoint: currentModel?.endpoint || selectedModelId, prompt, aspect_ratio: "1:1" }); }
  }, [prompt, selectedModelId, currentModel, layers, submit]);

  /* ── Export ── */
  const handleExport = useCallback(() => {
    const exportData = { layers: layers.map(l => ({ name: l.name, type: l.type, content: l.content, opacity: l.opacity, blendMode: l.blendMode })), artboard: { width: 1024, height: 1024 } };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${docName.replace(/\s+/g,"_")}.canvas.json`; a.click(); URL.revokeObjectURL(a.href);
  }, [layers, docName]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveDocument(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); setUndoStack(prev => { if (!prev.length) return prev; const snap = prev[prev.length-1]; setLayers(snap); return prev.slice(0, -1); }); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) { /* redo placeholder */ }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [saveDocument]);

  return (
    <div className="v6-canvas-board">
      {/* ── Tools ── */}
      <div className="v6-canvas-tools">
        {TOOLS.map(tool => (
          <button key={tool.id} className={`v6-tooltip ${activeTool === tool.id ? "v6-active" : ""}`} onClick={() => setActiveTool(tool.id)} data-tooltip={tool.label} style={activeTool === tool.id ? { boxShadow: "0 0 16px var(--v6-accent)44" } : {}}>
            <tool.icon />
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowDocList(v => !v)} title="Documents" className="v6-tooltip" data-tooltip="Documents"><IconFolder /></button>
        <button onClick={handleUpload} title="Upload image" className="v6-tooltip" data-tooltip="Upload image"><IconUpload /></button>
        <button onClick={saveDocument} title="Save (Ctrl+S)" className="v6-tooltip" data-tooltip="Save (Ctrl+S)"><IconSave /></button>
        <button onClick={handleExport} title="Export" className="v6-tooltip" data-tooltip="Export canvas"><IconDownload /></button>
      </div>

      {/* ── Artboard ── */}
      <div className="v6-artboard-wrap">
        {showDocList && (
          <div style={{ position: "absolute", top: 12, left: 12, zIndex: 20, minWidth: 240, maxWidth: 320, background: "var(--v6-surface)", border: "1px solid var(--v6-line)", borderRadius: 14, padding: 10, boxShadow: "var(--v6-shadow)", maxHeight: "50vh", overflow: "auto" }}>
            <div className="v6-eyebrow" style={{ padding: "4px 8px 6px" }}>Documents</div>
            <button onClick={newDocument} style={{ width: "100%", border: "1px dashed var(--v6-line)", background: "transparent", color: "var(--v6-muted)", padding: "8px 12px", borderRadius: 9, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><IconPlus /> New Document</button>
            {loadedDocs.map(doc => (<button key={doc.id} onClick={() => loadDocument(doc)} style={{ width: "100%", border: 0, background: document?.id === doc.id ? "var(--v6-surface2)" : "transparent", color: "var(--v6-text)", padding: "8px 12px", borderRadius: 9, fontSize: 11, cursor: "pointer", textAlign: "left", display: "block" }}>{doc.name || "Untitled"}<span style={{ display: "block", fontSize: 9, color: "var(--v6-muted)" }}>{doc.content?.layers?.length || 0} layers</span></button>))}
            {loadedDocs.length === 0 && <p style={{ fontSize: 10, color: "var(--v6-muted)", textAlign: "center", padding: 12 }}>No saved documents.</p>}
          </div>
        )}

        <div className="v6-artboard" style={{ position: "relative", width: `${Math.min(90, zoom * 0.64)}%`, aspectRatio: "1/1", border: "1px solid var(--v6-line)", borderRadius: 12, overflow: "hidden", background: "repeating-conic-gradient(rgba(255,255,255,0.025) 0% 25%, transparent 0% 50%) 50% / 20px 20px, var(--v6-bg)" }}>
          {layers.filter(l => l.visible).map(layer => (
            <div key={layer.id} onClick={() => setActiveLayerId(layer.id)} style={{ position: "absolute", inset: 0, opacity: layer.opacity / 100, mixBlendMode: layer.blendMode === "normal" ? undefined : layer.blendMode, border: activeLayerId === layer.id ? "2px solid var(--v6-accent)" : "2px solid transparent", borderRadius: 10, cursor: "pointer", transition: "border-color 0.18s" }}>
              {layer.type === "image" && layer.content ? <img src={layer.content} alt={layer.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} draggable={false} />
              : layer.type === "text" ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 700, color: "var(--v6-text)" }}>{layer.content || "Text layer"}</div>
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "repeating-conic-gradient(rgba(255,255,255,0.02) 0% 25%, transparent 0% 50%) 50% / 12px 12px", color: "var(--v6-muted)", fontSize: 10 }}><IconUpload /> Drop image</div>}
            </div>
          ))}
          {layers.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, color: "var(--v6-muted)", fontSize: 12 }}>
              <div style={{ opacity: 0.3 }}><IconImage /></div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 4px" }}>Create your first layer</p>
                <p style={{ fontSize: 10, margin: 0 }}>Upload an image or generate one to get started</p>
              </div>
              <button className="v6-btn v6-primary" onClick={() => addLayer()}><IconPlus /> Add layer</button>
            </div>
          )}
        </div>

        {/* Zoom controls */}
        <div style={{ position: "absolute", bottom: 12, right: 12, display: "flex", alignItems: "center", gap: 4, zIndex: 6 }}>
          <button className="v6-btn v6-icon-only v6-sm" onClick={() => setZoom(z => Math.max(25, z - 25))} disabled={zoom <= 25}><IconZoomOut /></button>
          <span style={{ fontSize: 10, fontFamily: "var(--v6-mono)", color: "var(--v6-muted)", minWidth: 32, textAlign: "center" }}>{zoom}%</span>
          <button className="v6-btn v6-icon-only v6-sm" onClick={() => setZoom(z => Math.min(200, z + 25))} disabled={zoom >= 200}><IconZoomIn /></button>
        </div>

        {/* Prompt dock */}
        <div style={{ width: `min(90%, ${Math.min(640, zoom * 6.4)}px)`, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div className="v6-eyebrow" style={{ flexShrink: 0 }}>Model</div>
            <select className="v6-input" value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)} style={{ flex: 1, fontSize: 11, padding: "6px 8px" }}>
              {canvasModels.map(m => <option key={m.id} value={m.id}>{m.name} — {m.provider}</option>)}
            </select>
          </div>
          <PromptDock value={prompt} onChange={setPrompt} onSubmit={generating ? () => {} : handleGenerate} generating={generating} stage={generating ? "compositing" : null} cost={currentModel?.speedTier === "premium" ? "8c" : "4c"} />
          {genResult?.url && !generating && (
            <div style={{ marginTop: 8, padding: 10, border: "1px solid var(--v6-line)", borderRadius: 12, background: "var(--v6-surface2)", display: "flex", alignItems: "center", gap: 10, fontSize: 10 }}>
              <img src={genResult.url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
              <span style={{ flex: 1, color: "var(--v6-muted)" }}>Generated in {elapsed}s</span>
              {genResult.creditsUsed && <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--v6-accent)" }}><IconBolt /> {genResult.creditsUsed}c</span>}
              <button className="v6-btn v6-ghost v6-sm" onClick={() => { if (genResult.url) addLayer("image", genResult.url, `Generated ${layers.length + 1}`); }}><IconPlus /> Add layer</button>
            </div>
          )}
          {genError && <div style={{ marginTop: 8, fontSize: 10, color: "var(--v6-bad)", padding: "6px 10px", borderRadius: 8, background: "rgba(255,107,107,0.08)" }}>{genError}</div>}
        </div>
      </div>

      {/* ── Layers panel ── */}
      <div className="v6-layers">
        <div className="v6-panel-title"><h3>Layers</h3><button className="v6-btn v6-ghost v6-sm v6-icon-only" onClick={() => addLayer()} title="Add layer" style={{ animation: layers.length === 0 ? "v6-float 2s ease-in-out infinite" : "none" }}><IconPlus /></button></div>
        {layers.length === 0 && <div style={{ padding: "16px 8px", textAlign: "center", fontSize: 10, color: "var(--v6-muted)" }}>No layers. Upload or generate an image.</div>}
        {layers.map((layer, i) => (
          <div key={layer.id} className={`v6-layer${activeLayerId === layer.id ? " v6-active" : ""}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 6, borderLeft: activeLayerId === layer.id ? "3px solid var(--v6-accent)" : "3px solid transparent", paddingLeft: activeLayerId === layer.id ? 7 : 10 }} onClick={() => setActiveLayerId(layer.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ cursor: "grab", color: "var(--v6-muted)", display: "flex", opacity: 0.4 }} title="Drag to reorder"><IconGrip /></span>
              <button onClick={e => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }} style={{ border: 0, background: "transparent", color: layer.visible ? "var(--v6-text)" : "var(--v6-muted)", cursor: "pointer", padding: 2, opacity: layer.visible ? 1 : 0.4 }} title={layer.visible ? "Hide" : "Show"}>{layer.visible ? <IconEye /> : <IconEyeOff />}</button>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{layer.name}</span>
              <button onClick={e => { e.stopPropagation(); moveLayerUp(layer.id); }} disabled={i === 0} style={{ border: 0, background: "transparent", color: "var(--v6-muted)", cursor: "pointer", padding: 2, opacity: i === 0 ? 0.3 : 1 }} title="Move up"><IconChevronUp /></button>
              <button onClick={e => { e.stopPropagation(); moveLayerDown(layer.id); }} disabled={i === layers.length - 1} style={{ border: 0, background: "transparent", color: "var(--v6-muted)", cursor: "pointer", padding: 2, opacity: i === layers.length - 1 ? 0.3 : 1 }} title="Move down"><IconChevronDown /></button>
            </div>
            {layer.type === "image" && layer.content && <div style={{ width: "100%", height: 40, borderRadius: 6, overflow: "hidden", background: "repeating-conic-gradient(rgba(255,255,255,0.015) 0% 25%, transparent 0% 50%) 50% / 8px 8px, var(--v6-bg)" }}><img src={layer.content} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: layer.opacity / 100 }} /></div>}
            {activeLayerId === layer.id && (
              <div style={{ display: "grid", gap: 7, paddingTop: 4 }}>
                <div className="v6-range-row"><span className="v6-tiny v6-muted" style={{ minWidth: 36 }}>Opacity</span><input type="range" min="0" max="100" value={layer.opacity} onChange={e => updateLayer(layer.id, { opacity: Number(e.target.value) })} onClick={e => e.stopPropagation()} /><span className="v6-tiny v6-mono" style={{ minWidth: 28, textAlign: "right" }}>{layer.opacity}%</span></div>
                <div className="v6-field"><span className="v6-field-label">Blend</span><select className="v6-input" value={layer.blendMode} onChange={e => updateLayer(layer.id, { blendMode: e.target.value })} onClick={e => e.stopPropagation()} style={{ fontSize: 11, padding: "6px 8px" }}>{BLEND_MODES.map(bm => <option key={bm} value={bm}>{bm.charAt(0).toUpperCase() + bm.slice(1)}</option>)}</select></div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="v6-btn v6-ghost v6-sm" onClick={e => { e.stopPropagation(); duplicateLayer(layer.id); }}><IconCopy /> Dup</button>
                  <button className="v6-btn v6-ghost v6-sm" onClick={e => { e.stopPropagation(); removeLayer(layer.id); }} style={{ color: "var(--v6-bad)" }}><IconTrash /> Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--v6-line)" }}>
          <div className="v6-field"><span className="v6-field-label">Document name</span><input className="v6-input" value={docName} onChange={e => setDocName(e.target.value)} placeholder="Untitled" style={{ fontSize: 11 }} /></div>
          <button className="v6-btn v6-primary" onClick={saveDocument} style={{ width: "100%", marginTop: 8 }}><IconSave /> Save</button>
        </div>
      </div>

      <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
      <style>{`@keyframes v6-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }`}</style>
    </div>
  );
}
