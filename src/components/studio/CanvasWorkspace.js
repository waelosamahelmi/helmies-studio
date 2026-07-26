"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CanvasEditor, {
  TOOLS,
  OBJECT_TYPES,
  SEMANTIC_ROLES,
} from "./CanvasEditor";
import { IconSparkle, IconClose, IconImage, IconChevron } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

/* ── Tool definitions ──────────────────────────────────────── */
const TOOL_DEFS = [
  { id: TOOLS.SELECT, label: "Select", icon: "↖", shortcut: "V" },
  { id: TOOLS.ADD_IMAGE, label: "Image", icon: "🖼", shortcut: "I" },
  { id: TOOLS.ADD_TEXT, label: "Text", icon: "T", shortcut: "T" },
  { id: TOOLS.ADD_SHAPE, label: "Shape", icon: "◻", shortcut: "S" },
  { id: TOOLS.FREE_DRAW, label: "Draw", icon: "✏", shortcut: "D" },
  { id: TOOLS.MASK_INCLUDE, label: "Mask +", icon: "⊕", shortcut: "M" },
  { id: TOOLS.MASK_EXCLUDE, label: "Mask −", icon: "⊖", shortcut: "N" },
];

/* ══════════════════════════════════════════════════════════════
   CanvasWorkspace — Full canvas editor workspace layout
   ══════════════════════════════════════════════════════════════ */
export default function CanvasWorkspace() {
  const [mode, setMode] = useState(TOOLS.SELECT);
  const [zoom, setZoomState] = useState(100);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const zoomRef = useRef(null);

  /* ── Keyboard shortcuts ────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        window.__helmiesCanvasAPI?.undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        window.__helmiesCanvasAPI?.redo();
      }

      // Tool shortcuts
      if (e.key === "v" || e.key === "V") { setMode(TOOLS.SELECT); return; }
      if (e.key === "i" || e.key === "I") { setMode(TOOLS.ADD_IMAGE); triggerImageUpload(); return; }
      if (e.key === "t" || e.key === "T") { setMode(TOOLS.ADD_TEXT); return; }
      if (e.key === "s" || e.key === "S") { setMode(TOOLS.ADD_SHAPE); return; }
      if (e.key === "d" || e.key === "D") { setMode(TOOLS.FREE_DRAW); return; }
      if (e.key === "m" || e.key === "M") { setMode(TOOLS.MASK_INCLUDE); return; }
      if (e.key === "n" || e.key === "N") { setMode(TOOLS.MASK_EXCLUDE); return; }

      // Zoom
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

      // Delete selected
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedLayerId) {
          // handled inside CanvasEditor
        }
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
  const compile = () => window.__helmiesCanvasAPI?.compile();

  /* ── Sync zoom display ─────────────────────────────────── */
  const refreshZoom = useCallback(() => {
    if (zoomRef.current) {
      setZoomState(zoomRef.current.zoom);
    }
  }, []);

  return (
    <div
      className="studio__canvas-workspace"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ── Top Toolbar ────────────────────────────────── */}
      <Toolbar
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
      />

      {/* ── Main Content ───────────────────────────────── */}
      <div className="studio__canvas-main">
        {/* Center: Canvas */}
        <div className="studio__canvas-center">
          <CanvasEditor
            mode={mode}
            onModeChange={setMode}
            zoomRef={zoomRef}
            selectedLayerId={selectedLayerId}
            onLayerSelect={setSelectedLayerId}
          />
        </div>

        {/* Right Panel: Layers + Properties */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.aside
              className="studio__canvas-right-panel"
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

      {/* ── Bottom Bar ─────────────────────────────────── */}
      <BottomBar
        onCompile={compile}
        mode={mode}
      />
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
      {/* Tool buttons */}
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

      {/* Spacer */}
      <div className="studio__canvas-toolbar-spacer" />

      {/* Undo / Redo */}
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

      {/* Zoom controls */}
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

      {/* Right panel toggle */}
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

/* ══════════════════════════════════════════════════════════════
   BottomBar — Compile & Generate actions
   ══════════════════════════════════════════════════════════════ */
function BottomBar({ onCompile, mode }) {
  return (
    <div className="studio__canvas-bottombar">
      <div className="studio__canvas-bottombar-left">
        <span className="studio__canvas-bottombar-hint">
          Tip: Use keyboard shortcuts — V (select), I (image), T (text), S (shape), D (draw), M/N (mask)
        </span>
      </div>
      <div className="studio__canvas-bottombar-actions">
        <button
          onClick={onCompile}
          className="studio__btn studio__btn--primary"
          title="Compile the canvas into a structured JSON document"
        >
          <IconSparkle />
          Compile & Generate
        </button>
      </div>
    </div>
  );
}
