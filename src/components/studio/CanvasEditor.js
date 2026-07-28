"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconClose, IconEye, IconEyeOff, IconChevron, IconSparkle } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

/* ── Semantic Roles ─────────────────────────────────────── */
const SEMANTIC_ROLES = [
  "layout_reference",
  "identity_reference",
  "style_reference",
  "product_reference",
  "logo",
  "background_reference",
  "preserve_exactly",
  "edit_target",
  "remove_target",
  "inpaint_region",
  "text_content",
  "color_reference",
  "composition_anchor",
];

/* ── Tool Modes ──────────────────────────────────────────── */
const TOOLS = {
  SELECT: "select",
  ADD_IMAGE: "add_image",
  ADD_TEXT: "add_text",
  ADD_SHAPE: "add_shape",
  FREE_DRAW: "free_draw",
  MASK_INCLUDE: "mask_include",
  MASK_EXCLUDE: "mask_exclude",
};

const OBJECT_TYPES = {
  IMAGE: "image",
  TEXT: "text",
  SHAPE: "shape",
  FREE_DRAW: "free_draw",
  MASK_INCLUDE: "mask_include",
  MASK_EXCLUDE: "mask_exclude",
};

/* ── Helpers ────────────────────────────────────────────── */
const STORAGE_KEY = "helmies_canvas_autosave";
const HISTORY_LIMIT = 50;

function getObjectType(obj) {
  if (!obj) return null;
  if (obj._helmiesType) return obj._helmiesType;
  if (obj.type === "image" || obj.type === "Image") return OBJECT_TYPES.IMAGE;
  if (obj.type === "text" || obj.type === "IText" || obj.type === "Textbox") return OBJECT_TYPES.TEXT;
  return OBJECT_TYPES.SHAPE;
}

function generateId() {
  return `obj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ══════════════════════════════════════════════════════════════
   CanvasEditor — Core Fabric.js Canvas Component
   ══════════════════════════════════════════════════════════════ */
export default function CanvasEditor({
  mode = TOOLS.SELECT,
  onModeChange,
  zoomRef,
  onLayerSelect,
  selectedLayerId,
}) {
  const canvasEl = useRef(null);
  const containerRef = useRef(null);
  const fabricRef = useRef(null);
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const onModeChangeRef = useRef(onModeChange);
  const onLayerSelectRef = useRef(onLayerSelect);
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);
  const saveTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [compiledJson, setCompiledJson] = useState(null);

  /* ── Expose zoom ref ──────────────────────────────────── */
  useEffect(() => {
    if (zoomRef) zoomRef.current = { zoom, setZoom: (z) => setZoom(clampZoom(z)) };
  }, [zoom]);

  /* ── Initialize Fabric ──────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fabric = await import("fabric");
      if (cancelled) return;
      fabricRef.current = fabric;

      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;

      const canvas = new fabric.Canvas(canvasEl.current, {
        width: w,
        height: h,
        backgroundColor: "#0A0A0F",
        selection: true,
        preserveObjectStacking: true,
        fireRightClick: true,
        stopContextMenu: true,
      });

      canvasRef.current = canvas;

      /* ── Selection events ─────────────────────────────── */
      canvas.on("selection:created", (e) => {
        const obj = e.selected?.[0];
        if (obj) {
          const id = obj._helmiesId;
          setSelectedId(id);
          onLayerSelectRef.current?.(id);
        }
      });
      canvas.on("selection:updated", (e) => {
        const obj = e.selected?.[0];
        if (obj) {
          const id = obj._helmiesId;
          setSelectedId(id);
          onLayerSelectRef.current?.(id);
        }
      });
      canvas.on("selection:cleared", () => {
        setSelectedId(null);
        onLayerSelectRef.current?.(null);
      });

      /* ── Object modified — push history ─────────────── */
      canvas.on("object:modified", () => {
        syncLayers(canvas);
        pushHistory(canvas);
        scheduleAutosave(canvas);
      });

      canvas.on("object:added", () => {
        syncLayers(canvas);
        pushHistory(canvas);
        scheduleAutosave(canvas);
      });

      canvas.on("object:removed", () => {
        syncLayers(canvas);
        pushHistory(canvas);
        scheduleAutosave(canvas);
      });

      /* ── Mouse:down for tool modes ──────────────────── */
      canvas.on("mouse:down", (opt) => {
        const tool = modeRef.current;
        if (tool === TOOLS.SELECT) return;

        const pointer = canvas.getScenePoint(opt.e);
        const fabric = fabricRef.current;

        if (tool === TOOLS.ADD_TEXT) {
          const text = new fabric.IText("Double-click to edit", {
            left: pointer.x,
            top: pointer.y,
            fontSize: 24,
            fontFamily: "Plus Jakarta Sans",
            fill: "#F2F2F7",
            _helmiesId: generateId(),
            _helmiesType: OBJECT_TYPES.TEXT,
            _helmiesRole: "text_content",
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          text.selectAll();
          return;
        }

        if (tool === TOOLS.ADD_SHAPE) {
          const rect = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 150,
            height: 150,
            fill: "rgba(255, 27, 107, 0.15)",
            stroke: "#FF1B6B",
            strokeWidth: 2,
            rx: 8,
            ry: 8,
            _helmiesId: generateId(),
            _helmiesType: OBJECT_TYPES.SHAPE,
            _helmiesRole: "layout_reference",
          });
          canvas.add(rect);
          canvas.setActiveObject(rect);
          return;
        }

      });

      /* ── Path created (for drawing tools) ──────────────── */
      canvas.on("path:created", (e) => {
        const tool = modeRef.current;
        if (tool === TOOLS.FREE_DRAW || tool === TOOLS.MASK_INCLUDE || tool === TOOLS.MASK_EXCLUDE) {
          e.path.set({
            _helmiesId: generateId(),
            _helmiesType:
              tool === TOOLS.FREE_DRAW
                ? OBJECT_TYPES.FREE_DRAW
                : tool === TOOLS.MASK_INCLUDE
                ? OBJECT_TYPES.MASK_INCLUDE
                : OBJECT_TYPES.MASK_EXCLUDE,
            _helmiesRole: "inpaint_region",
            opacity: tool === TOOLS.FREE_DRAW ? 1 : 0.5,
          });
          onModeChangeRef.current?.(TOOLS.SELECT);
        }
      });

      /* ── Load saved state ───────────────────────────── */
      loadSavedState(canvas, fabric);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (canvasRef.current) {
        canvasRef.current.dispose();
        canvasRef.current = null;
      }
    };
  }, []);

  /* ── Keep modeRef in sync ───────────────────────────── */
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
  useEffect(() => { onLayerSelectRef.current = onLayerSelect; }, [onLayerSelect]);

  /* ── Mode changes ─────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fabric = fabricRef.current;

    if (mode === TOOLS.SELECT) {
      canvas.isDrawingMode = false;
      canvas.selection = true;
    } else if (mode === TOOLS.FREE_DRAW || mode === TOOLS.MASK_INCLUDE || mode === TOOLS.MASK_EXCLUDE) {
      canvas.isDrawingMode = true;
      canvas.selection = false;
      if (fabric) {
        const brush = new fabric.PencilBrush(canvas);
        if (mode === TOOLS.FREE_DRAW) {
          brush.color = "#FF1B6B";
          brush.width = 4;
        } else {
          brush.color = mode === TOOLS.MASK_INCLUDE ? "#FFFFFF" : "#000000";
          brush.width = 8;
        }
        canvas.freeDrawingBrush = brush;
      }
    } else {
      canvas.isDrawingMode = false;
      canvas.selection = false;
    }
  }, [mode, fabricRef]);

  /* ── Image upload handler ──────────────────────────────── */
  const handleImageUpload = useCallback(
    (e) => {
      const files = e.target.files;
      if (!files?.length) return;
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;

      Array.from(files).forEach((file) => {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          fabric.Image.fromURL(ev.target.result).then((img) => {
            const maxDim = 400;
            if (img.width > maxDim || img.height > maxDim) {
              const scale = maxDim / Math.max(img.width, img.height);
              img.scale(scale);
            }
            img.set({
              left: 50 + Math.random() * 200,
              top: 50 + Math.random() * 200,
              _helmiesId: generateId(),
              _helmiesType: OBJECT_TYPES.IMAGE,
              _helmiesRole: "product_reference",
            });
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.renderAll();
          });
        };
        reader.readAsDataURL(file);
      });
    },
    []
  );

  /* ── Sync layers state ─────────────────────────────────── */
  function syncLayers(canvas) {
    const objs = canvas.getObjects().map((o, i) => ({
      id: o._helmiesId || generateId(),
      type: getObjectType(o),
      role: o._helmiesRole || "layout_reference",
      visible: o.visible !== false,
      locked: !!o.lockMovementX,
      opacity: o.opacity ?? 1,
      name: o.text || o._helmiesType || o.type,
      index: i,
    }));
    setLayers(objs.reverse());
  }

  /* ── History stack ──────────────────────────────────────── */
  function pushHistory(canvas) {
    const json = canvas.toJSON(["_helmiesId", "_helmiesType", "_helmiesRole"]);
    const h = historyRef.current;
    while (h.length > historyIdxRef.current + 1) h.pop();
    h.push(json);
    if (h.length > HISTORY_LIMIT) h.shift();
    historyIdxRef.current = h.length - 1;
  }

  function undo() {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const h = historyRef.current;
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    loadFromJSON(canvas, fabric, h[historyIdxRef.current]);
  }

  function redo() {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const h = historyRef.current;
    if (historyIdxRef.current >= h.length - 1) return;
    historyIdxRef.current++;
    loadFromJSON(canvas, fabric, h[historyIdxRef.current]);
  }

  function loadFromJSON(canvas, fabric, json) {
    canvas.loadFromJSON(json, () => {
      canvas.renderAll();
      syncLayers(canvas);
    });
  }

  /* ── Autosave ──────────────────────────────────────────── */
  function scheduleAutosave(canvas) {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        const json = canvas.toJSON(["_helmiesId", "_helmiesType", "_helmiesRole"]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
      } catch {}
    }, 800);
  }

  function loadSavedState(canvas, fabric) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const json = JSON.parse(raw);
      // validate it's fabric JSON
      if (!json.objects) return;
      loadFromJSON(canvas, fabric, json);
      historyRef.current = [json];
      historyIdxRef.current = 0;
    } catch {}
  }

  /* ── Zoom ──────────────────────────────────────────────── */
  function clampZoom(z) {
    return Math.min(200, Math.max(10, z));
  }

  const applyZoom = useCallback(
    (z) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const clamped = clampZoom(z);
      setZoom(clamped);
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      const scale = clamped / 100;
      vpt[0] = scale;
      vpt[3] = scale;
      canvas.setViewportTransform(vpt);
      canvas.renderAll();
    },
    []
  );

  /* ── Layer Actions ──────────────────────────────────────── */
  const toggleVisibility = useCallback((id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o._helmiesId === id);
    if (obj) {
      obj.visible = !obj.visible;
      canvas.renderAll();
      syncLayers(canvas);
      pushHistory(canvas);
    }
  }, []);

  const toggleLock = useCallback((id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o._helmiesId === id);
    if (obj) {
      const locked = !obj.lockMovementX;
      obj.set({
        lockMovementX: locked,
        lockMovementY: locked,
        lockRotation: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        selectable: !locked,
        evented: !locked,
      });
      canvas.renderAll();
      syncLayers(canvas);
      pushHistory(canvas);
    }
  }, []);

  const deleteLayer = useCallback((id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o._helmiesId === id);
    if (obj) {
      canvas.remove(obj);
      canvas.renderAll();
      syncLayers(canvas);
      pushHistory(canvas);
    }
  }, []);

  const setLayerRole = useCallback((id, role) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o._helmiesId === id);
    if (obj) {
      obj._helmiesRole = role;
      syncLayers(canvas);
      pushHistory(canvas);
      scheduleAutosave(canvas);
    }
  }, []);

  const selectLayer = useCallback((id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o._helmiesId === id);
    if (obj) {
      canvas.setActiveObject(obj);
      canvas.renderAll();
      setSelectedId(id);
      onLayerSelect?.(id);
    }
  }, [onLayerSelect]);

  const moveLayerUp = useCallback((id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o._helmiesId === id);
    if (obj) {
      const idx = canvas.getObjects().indexOf(obj);
      if (idx < canvas.getObjects().length - 1) {
        canvas.moveObjectTo(obj, idx + 1);
        canvas.renderAll();
        syncLayers(canvas);
        pushHistory(canvas);
      }
    }
  }, []);

  const moveLayerDown = useCallback((id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => o._helmiesId === id);
    if (obj) {
      const idx = canvas.getObjects().indexOf(obj);
      if (idx > 0) {
        canvas.moveObjectTo(obj, idx - 1);
        canvas.renderAll();
        syncLayers(canvas);
        pushHistory(canvas);
      }
    }
  }, []);

  /* ── Compile ────────────────────────────────────────────── */
  const compile = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects();
    const compiled = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      canvas: {
        width: canvas.width,
        height: canvas.height,
      },
      objects: objects.map((obj) => ({
        id: obj._helmiesId,
        type: getObjectType(obj),
        role: obj._helmiesRole || "layout_reference",
        bounds: {
          left: obj.left,
          top: obj.top,
          width: obj.width * (obj.scaleX || 1),
          height: obj.height * (obj.scaleY || 1),
        },
        opacity: obj.opacity ?? 1,
        visible: obj.visible !== false,
        locked: !!obj.lockMovementX,
        ...(obj.type === "text" ||
        obj.type === "IText" ||
        obj.type === "Textbox"
          ? { text: obj.text, fontSize: obj.fontSize, fontFamily: obj.fontFamily }
          : {}),
        ...(obj.type === "image" || obj.type === "Image"
          ? { src: obj._element?.src || obj.src || null }
          : {}),
      })),
      masks: {
        include: objects
          .filter((o) => o._helmiesType === OBJECT_TYPES.MASK_INCLUDE)
          .map((o) => ({ id: o._helmiesId, bounds: { left: o.left, top: o.top, width: o.width, height: o.height } })),
        exclude: objects
          .filter((o) => o._helmiesType === OBJECT_TYPES.MASK_EXCLUDE)
          .map((o) => ({ id: o._helmiesId, bounds: { left: o.left, top: o.top, width: o.width, height: o.height } })),
      },
      generatedAt: Date.now(),
    };

    setCompiledJson(compiled);
    console.log("🎨 Canvas Compiled:", JSON.stringify(compiled, null, 2));
    return compiled;
  }, []);

  /* ── Expose imperative API to parent ──────────────────── */
  useEffect(() => {
    if (window.__helmiesCanvasAPI) return;
    window.__helmiesCanvasAPI = {
      undo,
      redo,
      compile,
      applyZoom,
      getZoom: () => zoom,
      addImage: () => document.getElementById("canvas-image-upload")?.click(),
      addImageFromUrl: async (url) => {
        const canvas = canvasRef.current;
        const fabric = fabricRef.current;
        if (!canvas || !fabric) return;
        try {
          const img = await fabric.Image.fromURL(url);
          const maxDim = 400;
          if (img.width > maxDim || img.height > maxDim) {
            const scale = maxDim / Math.max(img.width, img.height);
            img.scale(scale);
          }
          img.set({
            left: 50 + Math.random() * 200,
            top: 50 + Math.random() * 200,
            _helmiesId: generateId(),
            _helmiesType: OBJECT_TYPES.IMAGE,
            _helmiesRole: "edit_target",
          });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
          syncLayers(canvas);
          pushHistory(canvas);
        } catch (e) {
          console.error("addImageFromUrl error:", e);
        }
      },
      getCanvas: () => canvasRef.current,
      getFabric: () => fabricRef.current,
    };
  }, [zoom, compile, applyZoom]);

  /* ── Resize ──────────────────────────────────────────────── */
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      canvas.renderAll();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="studio__canvas-editor">
      {/* Hidden file input for image uploads */}
      <input
        id="canvas-image-upload"
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        hidden
      />

      {/* Canvas container */}
      <div ref={containerRef} className="studio__canvas-container">
        {loading && (
          <div className="studio__canvas-loading">
            <span className="studio__spinner" />
            Loading canvas...
          </div>
        )}
        <canvas ref={canvasEl} />
      </div>

      {/* Layer Panel */}
      <LayerPanel
        layers={layers}
        selectedId={selectedId}
        onSelect={selectLayer}
        onToggleVisibility={toggleVisibility}
        onToggleLock={toggleLock}
        onDelete={deleteLayer}
        onSetRole={setLayerRole}
        onMoveUp={moveLayerUp}
        onMoveDown={moveLayerDown}
      />

      {/* Compile Modal */}
      <AnimatePresence>
        {compiledJson && (
          <motion.div
            className="studio__canvas-compile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={() => setCompiledJson(null)}
          >
            <motion.div
              className="studio__canvas-compile-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.4, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="studio__canvas-compile-header">
                <h3>Canvas Compiled</h3>
                <button
                  onClick={() => setCompiledJson(null)}
                  className="studio__canvas-compile-close"
                >
                  <IconClose />
                </button>
              </div>
              <pre className="studio__canvas-compile-json">
                {JSON.stringify(compiledJson, null, 2)}
              </pre>
              <div className="studio__canvas-compile-actions">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      JSON.stringify(compiledJson, null, 2)
                    );
                  }}
                  className="studio__btn studio__btn--ghost"
                >
                  Copy JSON
                </button>
                <button
                  onClick={() => setCompiledJson(null)}
                  className="studio__btn studio__btn--primary"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   LayerPanel — Right-side layer management
   ══════════════════════════════════════════════════════════════ */
function LayerPanel({
  layers,
  selectedId,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onSetRole,
  onMoveUp,
  onMoveDown,
}) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div className="studio__canvas-layers">
      <div className="studio__canvas-layers-header">
        <span>Layers ({layers.length})</span>
      </div>
      <div className="studio__canvas-layers-list">
        {layers.length === 0 && (
          <div className="studio__canvas-layers-empty">
            No objects on canvas
          </div>
        )}
        <AnimatePresence>
          {layers.map((layer) => (
            <motion.div
              key={layer.id}
              className={`studio__canvas-layer ${selectedId === layer.id ? "studio__canvas-layer--active" : ""}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25, ease: EASE }}
              onMouseEnter={() => setHoveredId(layer.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(layer.id)}
            >
              <div className="studio__canvas-layer-main">
                <span className="studio__canvas-layer-icon">
                  {layerTypeIcon(layer.type)}
                </span>
                <div className="studio__canvas-layer-info">
                  <span className="studio__canvas-layer-name">
                    {layerTypeLabel(layer.type)} {layer.text ? `"${layer.text.slice(0, 20)}${layer.text.length > 20 ? "…" : ""}"` : ""}
                  </span>
                  <select
                    value={layer.role}
                    onChange={(e) => {
                      e.stopPropagation();
                      onSetRole(layer.id, e.target.value);
                    }}
                    className="studio__canvas-layer-role"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {SEMANTIC_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hover controls */}
              {hoveredId === layer.id && (
                <motion.div
                  className="studio__canvas-layer-controls"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveUp(layer.id); }}
                    title="Bring forward"
                    className="studio__canvas-layer-btn"
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveDown(layer.id); }}
                    title="Send backward"
                    className="studio__canvas-layer-btn"
                  >
                    ↓
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                    title={layer.visible ? "Hide" : "Show"}
                    className="studio__canvas-layer-btn"
                  >
                    {layer.visible ? <IconEye /> : <IconEyeOff />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
                    title={layer.locked ? "Unlock" : "Lock"}
                    className="studio__canvas-layer-btn"
                  >
                    {layer.locked ? "🔒" : "🔓"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
                    title="Delete"
                    className="studio__canvas-layer-btn studio__canvas-layer-btn--danger"
                  >
                    <IconClose />
                  </button>
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Layer type helpers ──────────────────────────────────── */
function layerTypeIcon(type) {
  const map = {
    image: "🖼",
    text: "T",
    shape: "◻",
    free_draw: "✏",
    mask_include: "⊕",
    mask_exclude: "⊖",
  };
  return map[type] || "◻";
}

function layerTypeLabel(type) {
  const map = {
    image: "Image",
    text: "Text",
    shape: "Shape",
    free_draw: "Drawing",
    mask_include: "Mask (Include)",
    mask_exclude: "Mask (Exclude)",
  };
  return map[type] || type;
}

export { TOOLS, OBJECT_TYPES, SEMANTIC_ROLES };
