"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CanvasEditor, {
  TOOLS,
  OBJECT_TYPES,
  SEMANTIC_ROLES,
} from "./CanvasEditor";
import { IconSparkle, IconClose, IconImage, IconChevron, IconBolt, IconArrowUpRight, IconDownload } from "@/components/Icons";
import { IMAGE_MODELS, I2I_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { apiFetch } from "@/lib/client-fetch";
import GenerationField from "./universe/GenerationField";

const EASE = [0.32, 0.72, 0, 1];

const TOOL_DEFS = [
  { id: TOOLS.SELECT, label: "Select", icon: "V", shortcut: "V" },
  { id: TOOLS.ADD_IMAGE, label: "Image", icon: "IMG", shortcut: "I" },
  { id: TOOLS.ADD_TEXT, label: "Text", icon: "T", shortcut: "T" },
  { id: TOOLS.ADD_SHAPE, label: "Shape", icon: "SH", shortcut: "S" },
  { id: TOOLS.FREE_DRAW, label: "Draw", icon: "DR", shortcut: "D" },
  { id: TOOLS.MASK_INCLUDE, label: "Mask +", icon: "+M", shortcut: "M" },
  { id: TOOLS.MASK_EXCLUDE, label: "Mask −", icon: "-M", shortcut: "N" },
];

// Canvas-capable models: edit models (multi-reference + masks) first, then
// high-quality T2I models that accept custom dimensions. Filtered by capability,
// not by an arbitrary index slice, so new models in the registry just work.
const CANVAS_MODELS = [
  ...I2I_MODELS,
  ...IMAGE_MODELS.filter((m) => m.hasDimensions || m.aspectRatios),
]
  .map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    endpoint: m.endpoint || m.id,
    aspectRatios: m.aspectRatios,
    resolutions: m.resolutions,
    maxImages: m.maxImages,
    speedTier: m.speedTier,
  }))
  // de-dupe by id (I2I + T2I overlap on some endpoints)
  .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

/* ══════════════════════════════════════════════════════════════
   CanvasWorkspace — Full canvas editor workspace layout
   ══════════════════════════════════════════════════════════════ */
export default function CanvasWorkspace() {
  const [mode, setMode] = useState(TOOLS.SELECT);
  const [zoom, setZoomState] = useState(100);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const zoomRef = useRef(null);

  // Prompt + generation state
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(CANVAS_MODELS[0].id);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();

  const currentModel = CANVAS_MODELS.find((m) => m.id === selectedModel) || CANVAS_MODELS[0];

  /* ── Keyboard shortcuts ────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        window.__helmiesCanvasAPI?.undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        window.__helmiesCanvasAPI?.redo();
      }

      if (e.key === "v" || e.key === "V") { setMode(TOOLS.SELECT); return; }
      if (e.key === "i" || e.key === "I") { setMode(TOOLS.ADD_IMAGE); triggerImageUpload(); return; }
      if (e.key === "t" || e.key === "T") { setMode(TOOLS.ADD_TEXT); return; }
      if (e.key === "s" || e.key === "S") { setMode(TOOLS.ADD_SHAPE); return; }
      if (e.key === "d" || e.key === "D") { setMode(TOOLS.FREE_DRAW); return; }
      if (e.key === "m" || e.key === "M") { setMode(TOOLS.MASK_INCLUDE); return; }
      if (e.key === "n" || e.key === "N") { setMode(TOOLS.MASK_EXCLUDE); return; }

      if ((e.metaKey || e.ctrlKey) && e.key === "=") {
        e.preventDefault();
        const api = window.__helmiesCanvasAPI;
        if (api) api.applyZoom(api.getZoom() + 10);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        const api = window.__helmiesCanvasAPI;
        if (api) api.applyZoom(api.getZoom() - 10);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        window.__helmiesCanvasAPI?.applyZoom(100);
      }

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [selectedLayerId]
  );

  function triggerImageUpload() {
    document.getElementById("canvas-image-upload")?.click();
  }

  /* ── When mode is ADD_IMAGE, trigger file picker ────────── */
  const handleToolSelect = useCallback(
    (toolId) => {
      setMode(toolId);
      if (toolId === TOOLS.ADD_IMAGE) {
        triggerImageUpload();
      }
    },
    []
  );

  /* ── Zoom handlers ─────────────────────────────────────── */
  const zoomIn = () => window.__helmiesCanvasAPI?.applyZoom((window.__helmiesCanvasAPI?.getZoom() || 100) + 10);
  const zoomOut = () => window.__helmiesCanvasAPI?.applyZoom((window.__helmiesCanvasAPI?.getZoom() || 100) - 10);
  const zoomFit = () => window.__helmiesCanvasAPI?.applyZoom(100);

  /* ── Generate: compile canvas + send with prompt ─────── */
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !window.__helmiesCanvasAPI?.getCanvas?.()?.getObjects()?.length) return;

    const canvasContext = window.__helmiesCanvasAPI?.compile?.() || null;
    const fabricCanvas = window.__helmiesCanvasAPI?.getCanvas?.() || null;

    // Run the Canvas Compiler (spec §6.4) to translate visual intent into
    // model-ready instructions, with warnings for incompatible combos.
    let compiled = null;
    let warnings = [];
    try {
      const { compileCanvas, flattenToGuideImage } = await import("@/lib/canvas-compiler");
      compiled = compileCanvas(canvasContext, {
        modelId: selectedModel,
        prompt,
        aspectRatio: canvasContext?.canvas
          ? `${canvasContext.canvas.width}:${canvasContext.canvas.height}`
          : "1:1",
      });
      warnings = compiled.warnings || [];

      // If the model can't take multi-ref, flatten to a guide image.
      if (compiled.strategy === "flatten_guide" && fabricCanvas) {
        const guide = await flattenToGuideImage(fabricCanvas, 1024, 1024);
        if (guide) compiled.request.image_url = guide;
      }
    } catch {}

    const aspectRatio = canvasContext?.canvas
      ? `${canvasContext.canvas.width}:${canvasContext.canvas.height}`
      : "1:1";

    // Use the compiled request when available; fall back to raw params.
    const params = compiled
      ? { ...compiled.request, canvas_context: canvasContext, canvas_compiled: compiled }
      : { endpoint: currentModel.endpoint || selectedModel, prompt, canvas_context: canvasContext, aspect_ratio: aspectRatio };

    submit("image", selectedModel, params);
    setShowResult(true);

    // Surface warnings in the UI (stored on window for the inspector to read)
    window.__helmiesCanvasWarnings = warnings;
  }, [prompt, selectedModel, currentModel, submit]);

  /* ── Sync zoom display ─────────────────────────────────── */
  const refreshZoom = useCallback(() => {
    if (zoomRef.current) {
      setZoomState(zoomRef.current.zoom);
    }
  }, []);

  /* ── Close model menu on outside click ────────────────── */
  useEffect(() => {
    if (!showModelMenu) return;
    const handler = () => setShowModelMenu(false);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [showModelMenu]);

  return (
    <div
      className="canvas-universe studio__canvas-workspace"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ── Top Toolbar ────────────────────────────────── */}
      <div className="canvas-universe__tools"><Toolbar
        tools={TOOL_DEFS}
        activeTool={mode}
        onSelectTool={handleToolSelect}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        onRefreshZoom={refreshZoom}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
      /></div>

      {/* ── Main Content ───────────────────────────────── */}
      <div className="studio__canvas-main">
        {/* Center: Canvas */}
        <div className="canvas-universe__artboard studio__canvas-center">
          <CanvasEditor
            mode={mode}
            onModeChange={setMode}
            zoomRef={zoomRef}
            selectedLayerId={selectedLayerId}
            onLayerSelect={setSelectedLayerId}
          />

          {/* Generation result overlay */}
          <AnimatePresence>
            {showResult && (generating || result?.url || error) && (
              <motion.div
                className="studio__canvas-result-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <div className="studio__canvas-result-card">
                  <div className="studio__canvas-result-header">
                    <span className="studio__canvas-result-title">
                      {generating ? "Generating..." : error ? "Failed" : "Result"}
                    </span>
                    <button onClick={() => setShowResult(false)} className="studio__canvas-result-close">
                      <IconClose />
                    </button>
                  </div>
                  <div className="studio__canvas-result-body">
                    {generating && <GenerationField phase="generating" elapsed={elapsed} model={currentModel.name} />}
                    {error && <div className="studio__error">{error}</div>}
                    {result?.url && !generating && (
                      <>
                        <img src={result.url} alt="Generated" className="studio__canvas-result-img" />
                        <div className="studio__canvas-result-actions">
                          <a href={result.url} download className="studio__chip">
                            <IconDownload style={{ width: 14, height: 14 }} /> Download
                          </a>
                          <button
                            className="studio__chip"
                            onClick={() => {
                              const api = window.__helmiesCanvasAPI;
                              if (api && result.url) api.addImageFromUrl?.(result.url);
                              setShowResult(false);
                            }}
                          >
                            <IconImage style={{ width: 14, height: 14 }} /> Add to canvas
                          </button>
                          {result.creditsUsed && (
                            <span className="studio__chip">
                              <IconBolt style={{ width: 14, height: 14 }} /> {result.creditsUsed} cr
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel: Layers + Properties */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.aside
              className="canvas-universe__inspector studio__canvas-right-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <div className="studio__canvas-right-inner">
                <RightPanelContent
                  selectedLayerId={selectedLayerId}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom Prompt Bar ──────────────────────────────── */}
      <div className="canvas-universe__dock studio__canvas-promptbar">
        <div className="studio__canvas-promptbar-inner">
          {/* Model selector */}
          <div className="studio__canvas-model-select" onClick={(e) => { e.stopPropagation(); setShowModelMenu(!showModelMenu); }}>
            <span className="studio__canvas-model-name">{currentModel.name}</span>
            <IconChevron style={{ width: 12, height: 12, transform: showModelMenu ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            <AnimatePresence>
              {showModelMenu && (
                <motion.div
                  className="studio__canvas-model-menu"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {CANVAS_MODELS.map((m) => (
                    <button
                      key={m.id}
                      className={`studio__canvas-model-item ${selectedModel === m.id ? "studio__canvas-model-item--active" : ""}`}
                      onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
                    >
                      <span>{m.name}</span>
                      <span className="studio__canvas-model-provider">{m.provider}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Prompt input */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to generate from your canvas... (Ctrl+Enter to generate)"
            rows={1}
            className="studio__canvas-prompt-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={(!prompt.trim() && !window.__helmiesCanvasAPI?.getCanvas?.()?.getObjects()?.length) || generating}
            className="studio__canvas-generate-btn"
          >
            <IconSparkle style={{ width: 16, height: 16 }} />
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
        <div className="studio__canvas-promptbar-hint">
          Canvas objects are automatically included as context · {currentModel.provider}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Toolbar — Top tool selection bar
   ══════════════════════════════════════════════════════════════ */
function Toolbar({
  tools,
  activeTool,
  onSelectTool,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onRefreshZoom,
  rightPanelOpen,
  onToggleRightPanel,
}) {
  return (
    <div className="studio__canvas-toolbar">
      <div className="studio__canvas-toolbar-group">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onSelectTool(tool.id)}
            className={`studio__canvas-tool-btn ${activeTool === tool.id ? "studio__canvas-tool-btn--active" : ""}`}
            title={`${tool.label} (${tool.shortcut})`}
          >
            <span className="studio__canvas-tool-icon">{tool.icon}</span>
            <span className="studio__canvas-tool-label">{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="studio__canvas-toolbar-spacer" />

      <div className="studio__canvas-toolbar-group">
        <button
          onClick={() => window.__helmiesCanvasAPI?.undo()}
          className="studio__canvas-tool-btn"
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          onClick={() => window.__helmiesCanvasAPI?.redo()}
          className="studio__canvas-tool-btn"
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪
        </button>
      </div>

      <div className="studio__canvas-toolbar-group">
        <button onClick={onZoomOut} className="studio__canvas-tool-btn" title="Zoom out">
          −
        </button>
        <span className="studio__canvas-zoom-value">{zoom}%</span>
        <button onClick={onZoomIn} className="studio__canvas-tool-btn" title="Zoom in">
          +
        </button>
        <button onClick={onZoomFit} className="studio__canvas-tool-btn" title="Fit (Ctrl+0)">
          Fit
        </button>
      </div>

      <div className="studio__canvas-toolbar-group">
        <button
          onClick={onToggleRightPanel}
          className={`studio__canvas-tool-btn ${rightPanelOpen ? "studio__canvas-tool-btn--active" : ""}`}
          title="Toggle layers panel"
        >
          <IconChevron
            style={{
              transform: rightPanelOpen ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform 0.3s",
              width: 14,
              height: 14,
            }}
          />
          Layers
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   RightPanelContent — Properties for selected layer
   ══════════════════════════════════════════════════════════════ */
function RightPanelContent({ selectedLayerId }) {
  return (
    <div className="studio__canvas-properties">
      <div className="studio__canvas-properties-header">
        <h4>Properties</h4>
      </div>

      {selectedLayerId ? (
        <div className="studio__canvas-properties-body">
          <div className="studio__canvas-property">
            <span className="studio__canvas-property-label">Selected</span>
            <span className="studio__canvas-property-value">
              {selectedLayerId}
            </span>
          </div>

          <div className="studio__canvas-property">
            <span className="studio__canvas-property-label">Role</span>
            <span className="studio__canvas-property-value">
              Use the dropdown in the Layers panel
            </span>
          </div>

          <div className="studio__canvas-property-help">
            <p>Click an object on the canvas to select it. Use the Layers panel to manage visibility, lock, role assignment, and z-order.</p>
          </div>
        </div>
      ) : (
        <div className="studio__canvas-properties-empty">
          <p>Select an object on the canvas to view properties</p>
        </div>
      )}
    </div>
  );
}
