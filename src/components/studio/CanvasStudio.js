"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import PromptDock from "./v6/PromptDock";

const EASE = [0.32, 0.72, 0, 1];

const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn"];

/* ── Inline SVG Icons (v6 style: 24×24, strokeWidth 1.7) ── */
const IconSelect = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  </svg>
);
const IconImage = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
const IconType = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="4" x2="9" y2="20" />
    <line x1="15" y1="4" x2="15" y2="20" />
    <line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);
const IconMask = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);
const IconMotion = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const IconMore = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);
const IconPlus = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconTrash = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const IconUpload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconDownload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconSave = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const IconFolder = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);
const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10" />
  </svg>
);
const IconChevronDown = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconChevronUp = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const IconEye = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const IconCopy = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const TOOLS = [
  { id: "select", label: "Select", icon: IconSelect },
  { id: "image", label: "Image", icon: IconImage },
  { id: "text", label: "Text", icon: IconType },
  { id: "mask", label: "Mask", icon: IconMask },
  { id: "motion", label: "Motion", icon: IconMotion },
  { id: "more", label: "More", icon: IconMore },
];

/* ══════════════════════════════════════════════════════════════
   CanvasStudio — v6 Visual composition canvas
   ══════════════════════════════════════════════════════════════ */
export default function CanvasStudio() {
  /* ── State ── */
  const [document, setDocument] = useState(null); // { id, name, content: { layers, ... } }
  const [layers, setLayers] = useState([]);
  const [activeLayerId, setActiveLayerId] = useState(null);
  const [activeTool, setActiveTool] = useState("select");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [loadedDocs, setLoadedDocs] = useState([]);
  const [showDocList, setShowDocList] = useState(false);
  const [docName, setDocName] = useState("Untitled");
  const uploadRef = useRef(null);

  const { models: canvasModels } = useModelCatalog({ modelType: "image" });

  /* ── Auto-select first model when catalog loads ── */
  useEffect(() => {
    if (canvasModels.length > 0 && !selectedModelId) {
      setSelectedModelId(canvasModels[0].id);
    }
  }, [canvasModels, selectedModelId]);

  const { loading: generationLoading, result: genResult, error: genError, elapsed, submit } = useAsyncGeneration();
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const currentModel = canvasModels.find((m) => m.id === selectedModelId) || canvasModels[0];

  /* ── Load saved documents on mount ── */
  useEffect(() => {
    fetch("/api/canvas")
      .then((r) => r.json())
      .then((docs) => {
        if (Array.isArray(docs)) setLoadedDocs(docs);
      })
      .catch(() => {});
  }, []);

  /* ── Sync generation loading ── */
  useEffect(() => {
    setGenerating(generationLoading);
  }, [generationLoading]);

  /* ── Auto-add result image as a layer ── */
  useEffect(() => {
    if (genResult?.url && !generating) {
      addLayer("image", genResult.url, `Generated ${layers.length + 1}`);
    }
  }, [genResult?.url, generating]);

  /* ── Layer CRUD ── */
  const addLayer = useCallback(
    (type = "image", src = "", name = `Layer ${layers.length + 1}`) => {
      const id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setLayers((prev) => [
        ...prev,
        { id, name, type, content: src, position: { x: 0, y: 0 }, opacity: 100, blendMode: "normal", visible: true },
      ]);
      setActiveLayerId(id);
      return id;
    },
    [layers.length],
  );

  const updateLayer = useCallback((id, patch) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const removeLayer = useCallback((id) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(null);
  }, [activeLayerId]);

  const duplicateLayer = useCallback((id) => {
    const src = layers.find((l) => l.id === id);
    if (!src) return;
    addLayer(src.type, src.content, `${src.name} copy`);
  }, [layers, addLayer]);

  const moveLayerUp = useCallback((id) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx <= 0) return prev;
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  }, []);

  const moveLayerDown = useCallback((id) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  }, []);

  /* ── Upload ── */
  const handleUpload = useCallback(async () => {
    uploadRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) addLayer("image", data.url, file.name);
      } catch {}
      e.target.value = "";
    },
    [addLayer],
  );

  /* ── Document CRUD ── */
  const saveDocument = useCallback(async () => {
    const content = { layers, artboardSize: { width: 1024, height: 1024 } };
    try {
      if (document?.id) {
        const res = await fetch("/api/canvas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: document.id, name: docName, content }),
        });
        const updated = await res.json();
        setDocument(updated);
      } else {
        const res = await fetch("/api/canvas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: docName, content }),
        });
        const doc = await res.json();
        setDocument(doc);
        setLoadedDocs((prev) => [doc, ...prev]);
      }
    } catch {}
  }, [document, docName, layers]);

  const loadDocument = useCallback(async (doc) => {
    setDocument(doc);
    setDocName(doc.name || "Untitled");
    const content = doc.content || {};
    setLayers(content.layers || []);
    setActiveLayerId(null);
    setShowDocList(false);
  }, []);

  const newDocument = useCallback(() => {
    setDocument(null);
    setDocName("Untitled");
    setLayers([]);
    setActiveLayerId(null);
    setShowDocList(false);
  }, []);

  /* ── Generate ── */
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setShowPrompt(true);
    try {
      const { compileCanvas } = await import("@/lib/canvas-compiler");
      const canvasContext = {
        canvas: { width: 1024, height: 1024 },
        objects: layers
          .filter((l) => l.type === "image" && l.content)
          .map((l) => ({
            id: l.id,
            type: "image",
            src: l.content,
            role: "layout_reference",
            bounds: { left: l.position.x * 1024, top: l.position.y * 1024, width: 1024, height: 1024 },
          })),
      };
      const compiled = compileCanvas(canvasContext, {
        modelId: selectedModelId,
        prompt,
        aspectRatio: "1:1",
      });
      const params = compiled?.request
        ? { ...compiled.request, canvas_context: canvasContext, canvas_compiled: compiled }
        : { endpoint: currentModel?.endpoint || selectedModelId, prompt, aspect_ratio: "1:1" };
      submit("image", selectedModelId, params);
    } catch {
      submit("image", selectedModelId, { endpoint: currentModel?.endpoint || selectedModelId, prompt, aspect_ratio: "1:1" });
    }
  }, [prompt, selectedModelId, currentModel, layers, submit]);

  /* ── Export compiled result ── */
  const handleExport = useCallback(() => {
    // Canvas layers -> compose into exportable representation
    const exportData = {
      layers: layers.map((l) => ({
        name: l.name,
        type: l.type,
        content: l.content,
        opacity: l.opacity,
        blendMode: l.blendMode,
      })),
      artboard: { width: 1024, height: 1024 },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docName.replace(/\s+/g, "_")}.canvas.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [layers, docName]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveDocument();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveDocument]);

  return (
    <div className="v6-canvas-board">
      {/* ── Tools panel ── */}
      <div className="v6-canvas-tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={activeTool === tool.id ? "v6-active" : ""}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
          >
            <tool.icon />
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Document actions */}
        <button onClick={() => setShowDocList((v) => !v)} title="Documents" style={showDocList ? { color: "var(--v6-accent)" } : {}}>
          <IconFolder />
        </button>
        <button onClick={handleUpload} title="Upload image">
          <IconUpload />
        </button>
        <button onClick={saveDocument} title="Save (Ctrl+S)">
          <IconSave />
        </button>
        <button onClick={handleExport} title="Export">
          <IconDownload />
        </button>
      </div>

      {/* ── Artboard area ── */}
      <div className="v6-artboard-wrap">
        {/* Document list dropdown */}
        {showDocList && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 20,
              minWidth: 240,
              maxWidth: 320,
              background: "var(--v6-surface)",
              border: "1px solid var(--v6-line)",
              borderRadius: 14,
              padding: 10,
              boxShadow: "var(--v6-shadow)",
              maxHeight: "50vh",
              overflow: "auto",
            }}
          >
            <div className="v6-eyebrow" style={{ padding: "4px 8px 6px" }}>
              Documents
            </div>
            <button
              onClick={newDocument}
              style={{
                width: "100%",
                border: "1px dashed var(--v6-line)",
                background: "transparent",
                color: "var(--v6-muted)",
                padding: "8px 12px",
                borderRadius: 9,
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <IconPlus /> New Document
            </button>
            {loadedDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => loadDocument(doc)}
                style={{
                  width: "100%",
                  border: 0,
                  background: document?.id === doc.id ? "var(--v6-surface2)" : "transparent",
                  color: "var(--v6-text)",
                  padding: "8px 12px",
                  borderRadius: 9,
                  fontSize: 11,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "block",
                }}
              >
                {doc.name || "Untitled"}
                <span style={{ display: "block", fontSize: 9, color: "var(--v6-muted)" }}>
                  {doc.content?.layers?.length || 0} layers
                </span>
              </button>
            ))}
            {loadedDocs.length === 0 && (
              <p style={{ fontSize: 10, color: "var(--v6-muted)", textAlign: "center", padding: 12 }}>
                No saved documents.
              </p>
            )}
          </div>
        )}

        {/* Composition preview */}
        <div
          className="v6-artboard"
          style={{
            position: "relative",
            width: "min(90%, 640px)",
            aspectRatio: "1/1",
            border: "1px solid var(--v6-line)",
            borderRadius: 12,
            overflow: "hidden",
            background: `
              repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 50% / 20px 20px
            `,
          }}
        >
          {layers
            .filter((l) => l.visible)
            .map((layer) => (
              <div
                key={layer.id}
                onClick={() => setActiveLayerId(layer.id)}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: layer.opacity / 100,
                  mixBlendMode: layer.blendMode === "normal" ? undefined : layer.blendMode,
                  border: activeLayerId === layer.id ? "2px solid var(--v6-accent)" : "2px solid transparent",
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "border-color 0.18s",
                }}
              >
                {layer.type === "image" && layer.content ? (
                  <img
                    src={layer.content}
                    alt={layer.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
                    draggable={false}
                  />
                ) : layer.type === "text" ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 32,
                      fontWeight: 700,
                      color: "var(--v6-text)",
                    }}
                  >
                    {layer.content || "Text layer"}
                  </div>
                ) : null}
              </div>
            ))}
          {layers.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 12,
                color: "var(--v6-muted)",
                fontSize: 12,
              }}
            >
              <div style={{ opacity: 0.4 }}>
                <IconImage />
              </div>
              <span>Upload an image or generate one to start</span>
            </div>
          )}
        </div>

        {/* Generation prompt dock at bottom of artboard */}
        <div style={{ width: "min(90%, 640px)", marginTop: 8 }}>
          {/* Model selector inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div className="v6-eyebrow" style={{ flexShrink: 0 }}>
              Model
            </div>
            <select
              className="v6-input"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              style={{ flex: 1, fontSize: 11, padding: "6px 8px" }}
            >
              {canvasModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.provider}
                </option>
              ))}
            </select>
          </div>
          <PromptDock
            value={prompt}
            onChange={setPrompt}
            onSubmit={generating ? () => {} : handleGenerate}
            generating={generating}
            stage={generating ? "compositing" : null}
            cost={currentModel?.speedTier === "premium" ? "8c" : "4c"}
          />
          {/* Generation result */}
          {genResult?.url && !generating && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                border: "1px solid var(--v6-line)",
                borderRadius: 12,
                background: "var(--v6-surface2)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 10,
              }}
            >
              <img src={genResult.url} alt="Generated" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
              <span style={{ flex: 1, color: "var(--v6-muted)" }}>Generated in {elapsed}s</span>
              {genResult.creditsUsed && (
                <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--v6-accent)" }}>
                  <IconBolt /> {genResult.creditsUsed}c
                </span>
              )}
              <button
                className="v6-btn v6-ghost v6-sm"
                onClick={() => {
                  if (genResult.url) addLayer("image", genResult.url, `Generated ${layers.length + 1}`);
                }}
              >
                <IconPlus /> Add layer
              </button>
            </div>
          )}
          {genError && (
            <div style={{ marginTop: 8, fontSize: 10, color: "var(--v6-bad)", padding: "6px 10px", borderRadius: 8, background: "rgba(255,107,107,0.08)" }}>
              {genError}
            </div>
          )}
        </div>
      </div>

      {/* ── Layers panel ── */}
      <div className="v6-layers">
        <div className="v6-panel-title">
          <h3>Layers</h3>
          <button
            className="v6-btn v6-ghost v6-sm v6-icon-only"
            onClick={() => addLayer()}
            title="Add layer"
          >
            <IconPlus />
          </button>
        </div>

        {layers.length === 0 && (
          <div style={{ padding: "16px 8px", textAlign: "center", fontSize: 10, color: "var(--v6-muted)" }}>
            No layers. Upload or generate an image.
          </div>
        )}

        {layers.map((layer, i) => (
          <div
            key={layer.id}
            className={`v6-layer${activeLayerId === layer.id ? " v6-active" : ""}`}
            style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}
            onClick={() => setActiveLayerId(layer.id)}
          >
            {/* Layer header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayer(layer.id, { visible: !layer.visible });
                }}
                style={{
                  border: 0,
                  background: "transparent",
                  color: layer.visible ? "var(--v6-text)" : "var(--v6-muted)",
                  cursor: "pointer",
                  padding: 2,
                  opacity: layer.visible ? 1 : 0.4,
                }}
                title={layer.visible ? "Hide" : "Show"}
              >
                {layer.visible ? <IconEye /> : <IconEyeOff />}
              </button>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {layer.name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); moveLayerUp(layer.id); }}
                disabled={i === 0}
                style={{ border: 0, background: "transparent", color: "var(--v6-muted)", cursor: "pointer", padding: 2, opacity: i === 0 ? 0.3 : 1 }}
                title="Move up"
              >
                <IconChevronUp />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveLayerDown(layer.id); }}
                disabled={i === layers.length - 1}
                style={{ border: 0, background: "transparent", color: "var(--v6-muted)", cursor: "pointer", padding: 2, opacity: i === layers.length - 1 ? 0.3 : 1 }}
                title="Move down"
              >
                <IconChevronDown />
              </button>
            </div>

            {/* Layer preview thumbnail */}
            {layer.type === "image" && layer.content && (
              <div style={{ width: "100%", height: 40, borderRadius: 6, overflow: "hidden", background: "var(--v6-bg)" }}>
                <img src={layer.content} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: layer.opacity / 100 }} />
              </div>
            )}

            {/* Expanded controls for active layer */}
            {activeLayerId === layer.id && (
              <div style={{ display: "grid", gap: 7, paddingTop: 4 }}>
                {/* Opacity */}
                <div className="v6-range-row">
                  <span className="v6-tiny v6-muted" style={{ minWidth: 32 }}>Opacity</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={layer.opacity}
                    onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) })}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="v6-tiny v6-mono" style={{ minWidth: 24, textAlign: "right" }}>{layer.opacity}%</span>
                </div>

                {/* Blend mode */}
                <div className="v6-field">
                  <span className="v6-field-label">Blend</span>
                  <select
                    className="v6-input"
                    value={layer.blendMode}
                    onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 11, padding: "6px 8px" }}
                  >
                    {BLEND_MODES.map((bm) => (
                      <option key={bm} value={bm}>
                        {bm.charAt(0).toUpperCase() + bm.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Layer actions */}
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="v6-btn v6-ghost v6-sm"
                    onClick={(e) => { e.stopPropagation(); duplicateLayer(layer.id); }}
                  >
                    <IconCopy /> Dup
                  </button>
                  <button
                    className="v6-btn v6-ghost v6-sm"
                    onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                    style={{ color: "var(--v6-bad)" }}
                  >
                    <IconTrash /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Document name input */}
        <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--v6-line)" }}>
          <div className="v6-field">
            <span className="v6-field-label">Document name</span>
            <input
              className="v6-input"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="Untitled"
              style={{ fontSize: 11 }}
            />
          </div>
          <button
            className="v6-btn v6-primary"
            onClick={saveDocument}
            style={{ width: "100%", marginTop: 8 }}
          >
            <IconSave /> Save
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}
