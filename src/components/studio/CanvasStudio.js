"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import PromptDock from "./v6/PromptDock";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";
import { matchesGroup } from "@/lib/capability-groups";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const BLEND_MODES = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
];

const FONTS = [
  "Inter", "Manrope", "DM Sans", "Space Grotesk", "Newsreader",
  "Georgia", "JetBrains Mono", "Playfair Display", "system-ui",
];

const TOOLS = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "circle", label: "Circle", shortcut: "C" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "hand", label: "Hand", shortcut: "H" },
  { id: "image", label: "Image", shortcut: "I" },
];

const MAX_HISTORY = 50;

/* ═══════════════════════════════════════════════════════════
   SVG ICONS — 24×24, stroke currentColor, strokeWidth 1.7
   ═══════════════════════════════════════════════════════════ */

const IconSelect = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>);
const IconRect = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>);
const IconCircle = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>);
const IconType = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/><line x1="4" y1="20" x2="20" y2="20"/></svg>);
const IconHand = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 00-4 0v4"/><path d="M14 10V4a2 2 0 00-4 0v6"/><path d="M10 10.5V6a2 2 0 00-4 0v8"/><path d="M18 8a2 2 0 011 1.73V18a4 4 0 01-4 4H8.5a4 4 0 01-4-4v-6"/></svg>);
const IconImage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>);
const IconPlus = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
const IconTrash = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>);
const IconUpload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>);
const IconDownload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>);
const IconSave = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>);
const IconFolder = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>);
const IconEye = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>);
const IconEyeOff = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>);
const IconLock = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>);
const IconCopy = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>);
const IconGrip = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>);
const IconZoomIn = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>);
const IconZoomOut = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>);
const IconFit = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>);
const IconUndo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>);
const IconRedo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>);
const IconMerge = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>);
const IconMove = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>);
const IconChevronUp = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>);
const IconChevronDown = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>);

const toolIcons = { select: IconSelect, rectangle: IconRect, circle: IconCircle, text: IconType, hand: IconHand, image: IconImage };

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

let _layerCounter = 1;
function generateLayerId() { return `l-${Date.now().toString(36)}-${_layerCounter++}-${Math.random().toString(36).slice(2, 7)}`; }

function createLayer(type, overrides = {}) {
  const base = { id: generateLayerId(), type, name: `${type[0].toUpperCase() + type.slice(1)} ${_layerCounter}`, x: 0, y: 0, width: 400, height: 400, rotation: 0, opacity: 1, blendMode: "normal", visible: true, locked: false };
  if (type === "image") return { ...base, src: "", width: 500, height: 500, ...overrides };
  if (type === "text") return { ...base, text: "Text layer", fontFamily: "Inter", fontSize: 48, fontWeight: 700, textColor: "#ffffff", textAlign: "center", width: 600, height: 120, ...overrides };
  if (type === "rectangle") return { ...base, fill: "#ff416f", stroke: "transparent", strokeWidth: 0, width: 300, height: 200, ...overrides };
  if (type === "circle") return { ...base, fill: "#ff416f", stroke: "transparent", strokeWidth: 0, width: 200, height: 200, ...overrides };
  return { ...base, ...overrides };
}

function cloneLayer(layer) {
  return { ...layer, id: generateLayerId(), name: `${layer.name} copy` };
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ═══════════════════════════════════════════════════════════
   CANVAS STUDIO
   ═══════════════════════════════════════════════════════════ */

export default function CanvasStudio() {
  /* ── Canvas ── */
  const [canvasWidth, setCanvasWidth] = useState(1080);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [canvasBg, setCanvasBg] = useState("transparent");
  const [layers, setLayers] = useState([]);
  const [activeLayerId, setActiveLayerId] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  /* ── Tool ── */
  const [activeTool, setActiveTool] = useState("select");

  /* ── Generation ── */
  const [selectedModelId, setSelectedModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const isMobile = useIsMobile();
  const { models: catalogModels } = useModelCatalog({});
  // Canvas generation supports both text-to-image and image-to-image models;
  // merge both capability groups from the full catalog.
  const canvasModels = useMemo(() => catalogModels.filter((m) => matchesGroup(m, "tti") || matchesGroup(m, "iti")), [catalogModels]);
  useEffect(() => { if (canvasModels.length > 0 && !selectedModelId) setSelectedModelId(canvasModels[0].id); }, [canvasModels, selectedModelId]);
  const { loading: generationLoading, result: genResult, error: genError, elapsed, submit } = useAsyncGeneration();
  useEffect(() => { setGenerating(generationLoading); }, [generationLoading]);
  useEffect(() => { if (genResult?.url && !generating) { addLayer("image", { src: genResult.url, name: `Generated ${layers.length + 1}`, x: (canvasWidth - 500) / 2, y: (canvasHeight - 500) / 2 }); } }, [genResult?.url, generating]);

  const currentModel = canvasModels.find(m => m.id === selectedModelId) || canvasModels[0];

  /* ── Documents ── */
  const [document, setDocument] = useState(null);
  const [docName, setDocName] = useState("Untitled");
  const [loadedDocs, setLoadedDocs] = useState([]);
  const [showDocList, setShowDocList] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState("png");
  const [exportQuality, setExportQuality] = useState(0.9);
  const [exportScale, setExportScale] = useState(1);
  const [exporting, setExporting] = useState(false);

  /* ── Refs ── */
  const uploadRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const canvasInnerRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const [historyVersion, setHistoryVersion] = useState(0);

  /* ── Interaction state ── */
  const [isDrawing, setIsDrawing] = useState(false); // shape drawing
  const [drawStart, setDrawStart] = useState(null); // shape start coords
  const [drawPreview, setDrawPreview] = useState(null); // shape preview rect
  const [editingTextId, setEditingTextId] = useState(null); // text layer being edited

  /* ── Derived ── */
  const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId), [layers, activeLayerId]);
  const visibleLayers = useMemo(() => layers.filter(l => l.visible), [layers]);
  // eslint-disable-next-line no-unused-vars
  const _hv = historyVersion; // force re-render when history changes
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const scale = zoom / 100;

  /* ═══════════════════════════════════════════════════════════
     HISTORY
     ═══════════════════════════════════════════════════════════ */

  const captureLayers = useCallback(() => layers.map(l => ({ ...l })), [layers]);

  const pushUndo = useCallback(() => {
    const snap = { layers: captureLayers(), canvasWidth, canvasHeight, canvasBg };
    historyRef.current.past.push(snap);
    historyRef.current.future = [];
    if (historyRef.current.past.length > MAX_HISTORY) historyRef.current.past.shift();
    setHistoryVersion(v => v + 1);
  }, [captureLayers, canvasWidth, canvasHeight, canvasBg]);

  const handleUndo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (!past.length) return;
    const current = { layers: captureLayers(), canvasWidth, canvasHeight, canvasBg };
    future.push(current);
    const prev = past.pop();
    setLayers(prev.layers);
    setCanvasWidth(prev.canvasWidth);
    setCanvasHeight(prev.canvasHeight);
    setCanvasBg(prev.canvasBg);
    setActiveLayerId(null);
    setHistoryVersion(v => v + 1);
  }, [captureLayers, canvasWidth, canvasHeight, canvasBg]);

  const handleRedo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (!future.length) return;
    const current = { layers: captureLayers(), canvasWidth, canvasHeight, canvasBg };
    past.push(current);
    const next = future.pop();
    setLayers(next.layers);
    setCanvasWidth(next.canvasWidth);
    setCanvasHeight(next.canvasHeight);
    setCanvasBg(next.canvasBg);
    setActiveLayerId(null);
    setHistoryVersion(v => v + 1);
  }, [captureLayers, canvasWidth, canvasHeight, canvasBg]);

  /* ═══════════════════════════════════════════════════════════
     LAYER CRUD
     ═══════════════════════════════════════════════════════════ */

  const addLayer = useCallback((type = "image", overrides = {}) => {
    pushUndo();
    const layer = createLayer(type, overrides);
    setLayers(prev => [...prev, layer]);
    setActiveLayerId(layer.id);
    return layer.id;
  }, [pushUndo]);

  const updateLayer = useCallback((id, patch) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }, []);

  const removeLayer = useCallback((id) => {
    pushUndo();
    setLayers(prev => prev.filter(l => l.id !== id));
    setActiveLayerId(prev => prev === id ? null : prev);
    setEditingTextId(prev => prev === id ? null : prev);
  }, [pushUndo]);

  const duplicateLayer = useCallback((id) => {
    const src = layers.find(l => l.id === id);
    if (!src) return;
    pushUndo();
    const cloned = cloneLayer(src);
    setLayers(prev => [...prev, cloned]);
    setActiveLayerId(cloned.id);
  }, [layers, pushUndo]);

  const moveLayerIndex = useCallback((id, newIndex) => {
    pushUndo();
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const arr = [...prev];
      const [item] = arr.splice(idx, 1);
      arr.splice(newIndex, 0, item);
      return arr;
    });
  }, [pushUndo]);

  const mergeDown = useCallback((id) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx <= 0) return;
    pushUndo();
    setLayers(prev => {
      const arr = [...prev];
      const upper = arr[idx];
      const lower = arr[idx - 1];
      arr.splice(idx, 1);
      arr[idx - 1] = { ...lower, name: `${lower.name} + ${upper.name}` };
      return arr;
    });
    setActiveLayerId(null);
  }, [layers, pushUndo]);

  const flattenAll = useCallback(() => {
    if (layers.length < 2) return;
    pushUndo();
    setLayers(prev => [{ type: "image", id: generateLayerId(), name: "Flattened", x: 0, y: 0, width: canvasWidth, height: canvasHeight, rotation: 0, opacity: 1, blendMode: "normal", visible: true, locked: false, src: "" }]);
    setActiveLayerId(null);
  }, [layers.length, pushUndo, canvasWidth, canvasHeight]);

  /* ═══════════════════════════════════════════════════════════
     LAYER TRANSFORM HANDLERS (move / resize / rotate)
     ═══════════════════════════════════════════════════════════ */

  const screenToCanvas = useCallback((clientX, clientY) => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const rect = wrap.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / scale,
      y: (clientY - rect.top - panY) / scale,
    };
  }, [scale, panX, panY]);

  const startMove = useCallback((e, layerId) => {
    if (activeTool !== "select") return;
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.locked) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveLayerId(layerId);
    const start = screenToCanvas(e.clientX, e.clientY);
    const startX = layer.x;
    const startY = layer.y;
    pushUndo();

    const onMove = (ev) => {
      const pos = screenToCanvas(ev.clientX, ev.clientY);
      updateLayer(layerId, { x: startX + (pos.x - start.x), y: startY + (pos.y - start.y) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [activeTool, layers, screenToCanvas, pushUndo, updateLayer]);

  const startResize = useCallback((e, layerId, corner) => {
    if (activeTool !== "select") return;
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.locked) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveLayerId(layerId);
    const start = screenToCanvas(e.clientX, e.clientY);
    const startX = layer.x, startY = layer.y, startW = layer.width, startH = layer.height;
    pushUndo();

    const onMove = (ev) => {
      const pos = screenToCanvas(ev.clientX, ev.clientY);
      const dx = pos.x - start.x, dy = pos.y - start.y;
      let nx = startX, ny = startY, nw = startW, nh = startH;
      const maintainAspect = ev.shiftKey;

      if (corner.includes("br") || corner.includes("tr") || corner.includes("right")) nw = Math.max(10, startW + dx);
      if (corner.includes("br") || corner.includes("bl") || corner.includes("bottom")) nh = Math.max(10, startH + dy);
      if (corner.includes("tl") || corner.includes("bl") || corner.includes("left")) { nw = Math.max(10, startW - dx); nx = startX + dx; }
      if (corner.includes("tl") || corner.includes("tr") || corner.includes("top")) { nh = Math.max(10, startH - dy); ny = startY + dy; }

      if (maintainAspect) {
        const ratio = startW / startH;
        if (Math.abs(dx) > Math.abs(dy)) { nh = nw / ratio; if (corner.includes("top")) ny = startY + startH - nh; }
        else { nw = nh * ratio; if (corner.includes("left")) nx = startX + startW - nw; }
      }

      if (nw < 10) nw = 10;
      if (nh < 10) nh = 10;

      updateLayer(layerId, { x: nx, y: ny, width: nw, height: nh });
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [activeTool, layers, screenToCanvas, pushUndo, updateLayer]);

  const startRotate = useCallback((e, layerId) => {
    if (activeTool !== "select") return;
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.locked) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveLayerId(layerId);
    const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
    const startAngle = Math.atan2(screenToCanvas(e.clientX, e.clientY).y - cy, screenToCanvas(e.clientX, e.clientY).x - cx) * 180 / Math.PI;
    const startRot = layer.rotation;
    pushUndo();

    const onMove = (ev) => {
      const pos = screenToCanvas(ev.clientX, ev.clientY);
      const angle = Math.atan2(pos.y - cy, pos.x - cx) * 180 / Math.PI;
      let rot = startRot + (angle - startAngle);
      rot = rot % 360;
      if (ev.shiftKey) rot = Math.round(rot / 15) * 15;
      updateLayer(layerId, { rotation: rot });
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [activeTool, layers, screenToCanvas, pushUndo, updateLayer]);

  /* ═══════════════════════════════════════════════════════════
     CANVAS CLICK — tool actions
     ═══════════════════════════════════════════════════════════ */

  const handleCanvasPointerDown = useCallback((e) => {
    // Only respond to clicks on the canvas area itself (not the empty state overlay)
    if (!canvasInnerRef.current?.contains(e.target) && e.target !== canvasWrapRef.current) return;
    setActiveLayerId(null);
    if (activeTool === "rectangle" || activeTool === "circle") {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDrawStart(pos);
      setDrawPreview({ ...pos, w: 0, h: 0 });
      setIsDrawing(true);
      e.preventDefault();
    }
    if (activeTool === "text") {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const layerId = addLayer("text", { x: pos.x - 300, y: pos.y - 60 });
      setActiveTool("select");
    }
  }, [activeTool, screenToCanvas, addLayer]);

  const handleCanvasPointerMove = useCallback((e) => {
    if (!isDrawing || !drawStart) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    if (activeTool === "rectangle") {
      setDrawPreview({ x: Math.min(drawStart.x, pos.x), y: Math.min(drawStart.y, pos.y), w: Math.abs(pos.x - drawStart.x), h: Math.abs(pos.y - drawStart.y) });
    } else if (activeTool === "circle") {
      const r = Math.max(Math.abs(pos.x - drawStart.x), Math.abs(pos.y - drawStart.y));
      setDrawPreview({ x: drawStart.x - r, y: drawStart.y - r, w: r * 2, h: r * 2 });
    }
  }, [isDrawing, drawStart, activeTool, screenToCanvas]);

  const handleCanvasPointerUp = useCallback((e) => {
    if (!isDrawing || !drawStart) { setIsDrawing(false); setDrawStart(null); setDrawPreview(null); return; }
    const pos = screenToCanvas(e.clientX, e.clientY);
    const type = activeTool;
    setIsDrawing(false);
    setDrawStart(null);
    setDrawPreview(null);
    if (type === "rectangle" && Math.abs(pos.x - drawStart.x) > 5 && Math.abs(pos.y - drawStart.y) > 5) {
      addLayer("rectangle", { x: Math.min(drawStart.x, pos.x), y: Math.min(drawStart.y, pos.y), width: Math.abs(pos.x - drawStart.x), height: Math.abs(pos.y - drawStart.y) });
      setActiveTool("select");
    }
    if (type === "circle" && Math.abs(pos.x - drawStart.x) > 5) {
      const r = Math.max(Math.abs(pos.x - drawStart.x), Math.abs(pos.y - drawStart.y));
      addLayer("circle", { x: drawStart.x - r, y: drawStart.y - r, width: r * 2, height: r * 2 });
      setActiveTool("select");
    }
  }, [isDrawing, drawStart, activeTool, screenToCanvas, addLayer]);

  /* ═══════════════════════════════════════════════════════════
     PAN / ZOOM — native wheel listener (React onWheel is passive)
     ═══════════════════════════════════════════════════════════ */

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const s = zoom / 100;
      const delta = e.deltaY > 0 ? -10 : 10;
      const newZ = Math.max(25, Math.min(400, zoom + delta));
      const newS = newZ / 100;
      const cx = (mouseX - panX) / s;
      const cy = (mouseY - panY) / s;
      setZoom(newZ);
      setPanX(mouseX - cx * newS);
      setPanY(mouseY - cy * newS);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [zoom, panX, panY]);

  const startPan = useCallback((e) => {
    if (activeTool !== "hand" && e.button !== 1) return;
    e.preventDefault();
    const startX = e.clientX - panX;
    const startY = e.clientY - panY;
    const onMove = (ev) => { setPanX(ev.clientX - startX); setPanY(ev.clientY - startY); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [activeTool, panX, panY]);

  const fitToScreen = useCallback(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const pad = 40;
    const availW = rect.width - pad * 2, availH = rect.height - pad * 2;
    const fit = Math.min(availW / canvasWidth, availH / canvasHeight, 4);
    setZoom(Math.round(fit * 100));
    setPanX(0);
    setPanY(0);
  }, [canvasWidth, canvasHeight]);

  /* ═══════════════════════════════════════════════════════════
     DROP / UPLOAD
     ═══════════════════════════════════════════════════════════ */

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const fd = new FormData(); fd.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (data.url) {
          const centerX = (canvasWidth - 500) / 2;
          const centerY = (canvasHeight - 500) / 2;
          addLayer("image", { src: data.url, name: file.name, x: centerX, y: centerY, width: 500, height: 500 });
        }
      } catch { /* ignore */ }
    }
  }, [canvasWidth, canvasHeight, addLayer]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }, []);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) {
        const centerX = (canvasWidth - 500) / 2;
        const centerY = (canvasHeight - 500) / 2;
        addLayer("image", { src: data.url, name: file.name, x: centerX, y: centerY, width: 500, height: 500 });
      }
    } catch { /* ignore */ }
    e.target.value = "";
  }, [canvasWidth, canvasHeight, addLayer]);

  const handleUpload = useCallback(() => uploadRef.current?.click(), []);

  /* ═══════════════════════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════════════════════ */

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const w = Math.round(canvasWidth * exportScale);
      const h = Math.round(canvasHeight * exportScale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      // Background
      if (canvasBg === "transparent") {
        // leave transparent
      } else if (canvasBg.startsWith("#") || canvasBg.startsWith("rgb")) {
        ctx.fillStyle = canvasBg;
        ctx.fillRect(0, 0, w, h);
      }

      // Draw layers bottom-to-top
      const ordered = [...layers].filter(l => l.visible);
      for (const layer of ordered) {
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        if (layer.blendMode !== "normal") ctx.globalCompositeOperation = layer.blendMode;

        const sx = layer.x * exportScale;
        const sy = layer.y * exportScale;
        const sw = layer.width * exportScale;
        const sh = layer.height * exportScale;
        const cx = sx + sw / 2, cy = sy + sh / 2;

        ctx.translate(cx, cy);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.translate(-sw / 2, -sh / 2);

        if (layer.type === "image" && layer.src) {
          try {
            const img = await loadImageElement(layer.src);
            ctx.drawImage(img, 0, 0, sw, sh);
          } catch { /* skip failed images */ }
        } else if (layer.type === "text") {
          ctx.fillStyle = layer.textColor || "#ffffff";
          const fs = (layer.fontSize || 48) * exportScale;
          ctx.font = `${layer.fontWeight || 700} ${fs}px ${layer.fontFamily || "Inter"}, system-ui, sans-serif`;
          ctx.textAlign = layer.textAlign || "center";
          ctx.textBaseline = "middle";
          ctx.fillText(layer.text || "", sw / 2, sh / 2);
        } else if (layer.type === "rectangle") {
          if (layer.fill && layer.fill !== "transparent") { ctx.fillStyle = layer.fill; ctx.fillRect(0, 0, sw, sh); }
          if (layer.stroke && layer.stroke !== "transparent" && layer.strokeWidth > 0) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth * exportScale; ctx.strokeRect(0, 0, sw, sh); }
        } else if (layer.type === "circle") {
          ctx.beginPath();
          ctx.ellipse(sw / 2, sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
          if (layer.fill && layer.fill !== "transparent") { ctx.fillStyle = layer.fill; ctx.fill(); }
          if (layer.stroke && layer.stroke !== "transparent" && layer.strokeWidth > 0) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth * exportScale; ctx.stroke(); }
        }
        ctx.restore();
      }

      const mime = exportFormat === "jpg" ? "image/jpeg" : exportFormat === "webp" ? "image/webp" : "image/png";
      const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, exportFormat === "png" ? undefined : exportQuality));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${docName.replace(/\s+/g, "_")}.${exportFormat}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* ignore */ }
    setExporting(false);
    setShowExport(false);
  }, [canvasWidth, canvasHeight, canvasBg, layers, exportScale, exportFormat, exportQuality, docName]);

  /* ═══════════════════════════════════════════════════════════
     DOCUMENT SAVE / LOAD
     ═══════════════════════════════════════════════════════════ */

  useEffect(() => { fetch("/api/canvas").then(r => r.json()).then(docs => { if (Array.isArray(docs)) setLoadedDocs(docs); }).catch(() => {}); }, []);

  const saveDocument = useCallback(async () => {
    const content = { width: canvasWidth, height: canvasHeight, background: canvasBg, layers };
    try {
      if (document?.id) {
        const res = await fetch("/api/canvas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: document.id, name: docName, content }) });
        setDocument(await res.json());
      } else {
        const res = await fetch("/api/canvas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: docName, content }) });
        const doc = await res.json();
        setDocument(doc);
        setLoadedDocs(prev => [doc, ...prev]);
      }
    } catch { /* ignore */ }
  }, [document, docName, canvasWidth, canvasHeight, canvasBg, layers]);

  const loadDocument = useCallback((doc) => {
    setDocument(doc);
    setDocName(doc.name || "Untitled");
    const c = doc.content || {};
    setLayers(c.layers || []);
    if (c.width) setCanvasWidth(c.width);
    if (c.height) setCanvasHeight(c.height);
    if (c.background) setCanvasBg(c.background);
    setActiveLayerId(null);
    setEditingTextId(null);
    setShowDocList(false);
    setPanX(0); setPanY(0);
  }, []);

  const newDocument = useCallback(() => {
    setDocument(null); setDocName("Untitled"); setLayers([]); setActiveLayerId(null);
    setCanvasWidth(1080); setCanvasHeight(1080); setCanvasBg("transparent");
    setShowDocList(false); setPanX(0); setPanY(0); setZoom(100);
    historyRef.current = { past: [], future: [] };
    setHistoryVersion(v => v + 1);
    setEditingTextId(null);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     GENERATION
     ═══════════════════════════════════════════════════════════ */

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    try {
      const { compileCanvas } = await import("@/lib/canvas-compiler");
      const canvasContext = { canvas: { width: canvasWidth, height: canvasHeight }, objects: layers.filter(l => l.type === "image" && l.src).map(l => ({ id: l.id, type: "image", src: l.src, role: "layout_reference", bounds: { left: l.x, top: l.y, width: l.width, height: l.height } })) };
      const compiled = compileCanvas(canvasContext, { modelId: selectedModelId, prompt, aspectRatio: "1:1" });
      const params = compiled?.request ? { ...compiled.request, canvas_context: canvasContext, canvas_compiled: compiled } : { endpoint: currentModel?.endpoint || selectedModelId, prompt, aspect_ratio: "1:1" };
      submit("image", selectedModelId, params);
    } catch { submit("image", selectedModelId, { endpoint: currentModel?.endpoint || selectedModelId, prompt, aspect_ratio: "1:1" }); }
  }, [prompt, selectedModelId, currentModel, layers, canvasWidth, canvasHeight, submit]);

  /* ═══════════════════════════════════════════════════════════
     KEYBOARD SHORTCUTS
     ═══════════════════════════════════════════════════════════ */

  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;

      // Undo / Redo
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if (mod && (e.key === "z" && e.shiftKey) || (mod && e.key === "Z")) { e.preventDefault(); handleRedo(); return; }
      if (mod && e.key === "s") { e.preventDefault(); saveDocument(); return; }
      if (mod && e.key === "d") { e.preventDefault(); if (activeLayerId) duplicateLayer(activeLayerId); return; }
      if (mod && e.key === "a") { e.preventDefault(); /* select all - visual only */ return; }

      // Tool shortcuts (no modifier)
      if (!mod) {
        if (e.key === "v" || e.key === "V") { setActiveTool("select"); return; }
        if (e.key === "r" || e.key === "R") { setActiveTool("rectangle"); return; }
        if (e.key === "c" || e.key === "C") { setActiveTool("circle"); return; }
        if (e.key === "t" || e.key === "T") { setActiveTool("text"); return; }
        if (e.key === "h" || e.key === "H") { setActiveTool("hand"); return; }
        if (e.key === "i" || e.key === "I") { setActiveTool("image"); return; }
        if (e.key === "Delete" || e.key === "Backspace") { if (activeLayerId) removeLayer(activeLayerId); return; }
        if (e.key === "Escape") { if (editingTextId) { setEditingTextId(null); return; } setActiveLayerId(null); setActiveTool("select"); return; }

        // Nudge with arrow keys
        if (activeLayerId && activeLayer) {
          const nudge = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowLeft") { e.preventDefault(); pushUndo(); updateLayer(activeLayerId, { x: activeLayer.x - nudge }); }
          if (e.key === "ArrowRight") { e.preventDefault(); pushUndo(); updateLayer(activeLayerId, { x: activeLayer.x + nudge }); }
          if (e.key === "ArrowUp") { e.preventDefault(); pushUndo(); updateLayer(activeLayerId, { y: activeLayer.y - nudge }); }
          if (e.key === "ArrowDown") { e.preventDefault(); pushUndo(); updateLayer(activeLayerId, { y: activeLayer.y + nudge }); }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeLayerId, activeLayer, editingTextId, handleUndo, handleRedo, saveDocument, duplicateLayer, removeLayer, pushUndo, updateLayer]);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  const canvasBgStyle = useMemo(() => {
    if (canvasBg === "transparent") return {
      backgroundImage: `
        linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.03) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.03) 75%)
      `,
      backgroundSize: "20px 20px",
      backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
    };
    if (canvasBg.startsWith("#") || canvasBg.startsWith("rgb")) return { backgroundColor: canvasBg };
    return {};
  }, [canvasBg]);

  // Layer panel drag reorder
  const [dragLayerId, setDragLayerId] = useState(null);
  const [dragOverLayerId, setDragOverLayerId] = useState(null);

  const handleLayerDragStart = useCallback((e, layerId) => {
    setDragLayerId(layerId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", layerId);
  }, []);

  const handleLayerDragOver = useCallback((e, layerId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverLayerId(layerId);
  }, []);

  const handleLayerDrop = useCallback((e, targetId) => {
    e.preventDefault();
    setDragLayerId(null);
    setDragOverLayerId(null);
    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) return;
    const targetIdx = layers.findIndex(l => l.id === targetId);
    if (targetIdx < 0) return;
    moveLayerIndex(sourceId, targetIdx);
  }, [layers, moveLayerIndex]);

  const handleLayerDragEnd = useCallback(() => {
    setDragLayerId(null);
    setDragOverLayerId(null);
  }, []);

  return (
    <div className="v6-canvas-board">
      {/* ═══ TOOLS PALETTE (left) ═══ */}
      <div className="v6-canvas-tools">
        {isMobile ? (
          <MobileChipScroller
            items={TOOLS.map(t => ({ label: t.label, value: t.id }))}
            selectedValue={activeTool}
            onSelect={setActiveTool}
          />
        ) : (
          TOOLS.map(tool => {
            const Icon = toolIcons[tool.id];
            return (
              <button
                key={tool.id}
                className={`v6-tooltip ${activeTool === tool.id ? "v6-active" : ""}`}
                onClick={() => setActiveTool(tool.id)}
                data-tooltip={`${tool.label} (${tool.shortcut})`}
                style={activeTool === tool.id ? { boxShadow: "0 0 16px var(--v6-accent)44" } : {}}
              >
                {Icon ? <Icon /> : null}
              </button>
            );
          })
        )}
        <div className="v6-section-rule" style={{ width: "60%", margin: "4px auto" }} />
        <button className={`v6-tooltip ${!canUndo ? "v6-disabled" : ""}`} onClick={handleUndo} data-tooltip="Undo (Ctrl+Z)" disabled={!canUndo}><IconUndo /></button>
        <button className={`v6-tooltip ${!canRedo ? "v6-disabled" : ""}`} onClick={handleRedo} data-tooltip="Redo (Ctrl+Shift+Z)" disabled={!canRedo}><IconRedo /></button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowDocList(v => !v)} className="v6-tooltip" data-tooltip="Documents"><IconFolder /></button>
        <button onClick={handleUpload} className="v6-tooltip" data-tooltip="Upload image"><IconUpload /></button>
        <button onClick={saveDocument} className="v6-tooltip" data-tooltip="Save (Ctrl+S)"><IconSave /></button>
        <button onClick={() => setShowExport(v => !v)} className="v6-tooltip" data-tooltip="Export"><IconDownload /></button>
      </div>

      {/* ═══ CANVAS AREA (center) ═══ */}
      <div className="v6-artboard-wrap">
        {/* Document list overlay */}
        <AnimatePresence>
          {showDocList && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
              style={{ position: "absolute", top: 12, left: 12, zIndex: 20, minWidth: 260, maxWidth: 340, background: "var(--v6-surface)", border: "1px solid var(--v6-line)", borderRadius: 14, padding: 10, boxShadow: "var(--v6-shadow)", maxHeight: "50vh", overflow: "auto" }}>
              <div className="v6-eyebrow" style={{ padding: "4px 8px 6px" }}>Documents</div>
              <button onClick={newDocument} style={{ width: "100%", border: "1px dashed var(--v6-line)", background: "transparent", color: "var(--v6-muted)", padding: "8px 12px", borderRadius: 9, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><IconPlus /> New Document</button>
              {loadedDocs.map(doc => (
                <motion.button key={doc.id} onClick={() => loadDocument(doc)}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }}
                  style={{ width: "100%", border: 0, background: document?.id === doc.id ? "var(--v6-surface2)" : "transparent", color: "var(--v6-text)", padding: "8px 12px", borderRadius: 9, fontSize: 11, cursor: "pointer", textAlign: "left", display: "block" }}>
                  {doc.name || "Untitled"}<span style={{ display: "block", fontSize: 9, color: "var(--v6-muted)" }}>{doc.content?.layers?.length || 0} layers &middot; {doc.content?.width || 1080}&times;{doc.content?.height || 1080}</span>
                </motion.button>
              ))}
              {loadedDocs.length === 0 && <p style={{ fontSize: 10, color: "var(--v6-muted)", textAlign: "center", padding: 12 }}>No saved documents.</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Export modal */}
        <AnimatePresence>
          {showExport && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }}
              style={{ position: "absolute", top: 12, left: 12, zIndex: 20, minWidth: 260, background: "var(--v6-surface)", border: "1px solid var(--v6-line)", borderRadius: 14, padding: 16, boxShadow: "var(--v6-shadow)" }}>
              <div className="v6-panel-title"><h3>Export</h3><button onClick={() => setShowExport(false)} className="v6-btn v6-ghost v6-sm v6-icon-only" style={{ fontSize: 14 }}>&times;</button></div>
              <div className="v6-field" style={{ marginTop: 8 }}><span className="v6-field-label">Format</span>
                <select className="v6-input" value={exportFormat} onChange={e => setExportFormat(e.target.value)} style={{ fontSize: 11 }}>
                  <option value="png">PNG</option>
                  <option value="jpg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
              {exportFormat !== "png" && (
                <div className="v6-range-row" style={{ marginTop: 10 }}>
                  <span className="v6-tiny v6-muted" style={{ minWidth: 28 }}>Quality</span>
                  <input type="range" min="0.1" max="1" step="0.05" value={exportQuality} onChange={e => setExportQuality(Number(e.target.value))} />
                  <span className="v6-tiny v6-mono" style={{ minWidth: 24, textAlign: "right" }}>{Math.round(exportQuality * 100)}%</span>
                </div>
              )}
              <div className="v6-range-row" style={{ marginTop: 8 }}>
                <span className="v6-tiny v6-muted" style={{ minWidth: 28 }}>Scale</span>
                <input type="range" min="0.25" max="3" step="0.25" value={exportScale} onChange={e => setExportScale(Number(e.target.value))} />
                <span className="v6-tiny v6-mono" style={{ minWidth: 24, textAlign: "right" }}>{exportScale}&times;</span>
              </div>
              <div style={{ fontSize: 9, color: "var(--v6-muted)", marginTop: 6, textAlign: "right" }}>
                {Math.round(canvasWidth * exportScale)}&times;{Math.round(canvasHeight * exportScale)}px
              </div>
              <button className="v6-btn v6-primary" onClick={handleExport} disabled={exporting} style={{ width: "100%", marginTop: 12 }}>
                {exporting ? "Exporting..." : <><IconDownload /> Export {exportFormat.toUpperCase()}</>}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Canvas viewport */}
        <div
          ref={canvasWrapRef}
          onPointerDown={(e) => { if (activeTool === "hand" || e.button === 1) startPan(e); else handleCanvasPointerDown(e); }}
          onPointerMove={(e) => { if (activeTool === "hand" && e.buttons === 1) return; handleCanvasPointerMove(e); }}
          onPointerUp={handleCanvasPointerUp}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          style={{
            flex: 1, width: "100%", position: "relative", overflow: "hidden",
            cursor: activeTool === "hand" ? "grab" : activeTool === "rectangle" || activeTool === "circle" ? "crosshair" : "default",
            background: "radial-gradient(circle at center, rgba(255,65,111,0.03), transparent 70%), var(--v6-bg)",
            touchAction: "none",
          }}
        >
          {/* Drop zone indicator */}
          <div className="v6-drop-zone" />

          {/* Canvas inner — scaled & panned */}
          <div
            ref={canvasInnerRef}
            style={{
              position: "absolute",
              width: canvasWidth,
              height: canvasHeight,
              transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
              transformOrigin: "0 0",
              ...canvasBgStyle,
              boxShadow: "0 20px 80px rgba(0,0,0,0.6), 0 0 0 1px var(--v6-line)",
            }}
          >
            {/* Layers */}
            {visibleLayers.map(layer => {
              const isSelected = activeLayerId === layer.id;
              return (
                <div
                  key={layer.id}
                  onPointerDown={(e) => startMove(e, layer.id)}
                  style={{
                    position: "absolute",
                    left: layer.x,
                    top: layer.y,
                    width: layer.width,
                    height: layer.height,
                    transform: `rotate(${layer.rotation}deg)`,
                    transformOrigin: "center center",
                    opacity: layer.opacity,
                    mixBlendMode: layer.blendMode !== "normal" ? layer.blendMode : undefined,
                    cursor: activeTool === "select" && !layer.locked ? "move" : "default",
                    outline: isSelected ? "2px solid var(--v6-accent)" : "none",
                    outlineOffset: isSelected ? 1 : 0,
                    zIndex: 1,
                  }}
                >
                  {/* Layer content */}
                  {layer.type === "image" && layer.src ? (
                    <img src={layer.src} alt={layer.name} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} draggable={false} />
                  ) : layer.type === "text" ? (
                    <div
                      contentEditable={editingTextId === layer.id && !layer.locked}
                      suppressContentEditableWarning
                      onBlur={(e) => { updateLayer(layer.id, { text: e.target.textContent }); setEditingTextId(null); }}
                      onPointerDown={(e) => { if (editingTextId === layer.id) e.stopPropagation(); }}
                      onDoubleClick={(e) => { if (!layer.locked) { e.stopPropagation(); setEditingTextId(layer.id); } }}
                      style={{
                        width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: layer.textAlign === "center" ? "center" : layer.textAlign === "right" ? "flex-end" : "flex-start",
                        fontFamily: `${layer.fontFamily || "Inter"}, system-ui, sans-serif`,
                        fontSize: `${(layer.fontSize || 48) / scale}px`,
                        fontWeight: layer.fontWeight || 700,
                        color: layer.textColor || "#ffffff",
                        textAlign: layer.textAlign || "center",
                        pointerEvents: editingTextId === layer.id ? "auto" : "none",
                        overflow: "hidden",
                        outline: editingTextId === layer.id ? "1px dashed var(--v6-accent)" : "none",
                        outlineOffset: 2,
                        padding: "4px 8px",
                        lineHeight: 1.2,
                        cursor: editingTextId === layer.id ? "text" : undefined,
                      }}
                    >
                      {layer.text || "Text"}
                    </div>
                  ) : layer.type === "rectangle" ? (
                    <div style={{ width: "100%", height: "100%", backgroundColor: layer.fill || "transparent", border: layer.stroke && layer.stroke !== "transparent" ? `${layer.strokeWidth}px solid ${layer.stroke}` : "none", pointerEvents: "none" }} />
                  ) : layer.type === "circle" ? (
                    <div style={{ width: "100%", height: "100%", borderRadius: "50%", backgroundColor: layer.fill || "transparent", border: layer.stroke && layer.stroke !== "transparent" ? `${layer.strokeWidth}px solid ${layer.stroke}` : "none", pointerEvents: "none" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "repeating-conic-gradient(rgba(255,255,255,0.02) 0% 25%, transparent 0% 50%) 50% / 12px 12px", color: "var(--v6-muted)", fontSize: 10, pointerEvents: "none" }}><IconImage /> Empty</div>
                  )}

                  {/* Selection handles */}
                  {isSelected && !layer.locked && activeTool === "select" && (
                    <>
                      {/* Corner resize handles */}
                      <div onPointerDown={(e) => startResize(e, layer.id, "tl")} style={cornerHandleStyle({ left: -5, top: -5, cursor: "nwse-resize" })} />
                      <div onPointerDown={(e) => startResize(e, layer.id, "tr")} style={cornerHandleStyle({ right: -5, top: -5, cursor: "nesw-resize" })} />
                      <div onPointerDown={(e) => startResize(e, layer.id, "bl")} style={cornerHandleStyle({ left: -5, bottom: -5, cursor: "nesw-resize" })} />
                      <div onPointerDown={(e) => startResize(e, layer.id, "br")} style={cornerHandleStyle({ right: -5, bottom: -5, cursor: "nwse-resize" })} />
                      {/* Edge resize handles */}
                      <div onPointerDown={(e) => startResize(e, layer.id, "top")} style={cornerHandleStyle({ left: "50%", top: -5, cursor: "ns-resize", marginLeft: -5 })} />
                      <div onPointerDown={(e) => startResize(e, layer.id, "bottom")} style={cornerHandleStyle({ left: "50%", bottom: -5, cursor: "ns-resize", marginLeft: -5 })} />
                      <div onPointerDown={(e) => startResize(e, layer.id, "left")} style={cornerHandleStyle({ left: -5, top: "50%", cursor: "ew-resize", marginTop: -5 })} />
                      <div onPointerDown={(e) => startResize(e, layer.id, "right")} style={cornerHandleStyle({ right: -5, top: "50%", cursor: "ew-resize", marginTop: -5 })} />
                      {/* Rotation handle */}
                      <div onPointerDown={(e) => startRotate(e, layer.id)} style={{
                        position: "absolute", left: "50%", top: -28, transform: "translateX(-50%)",
                        width: 18, height: 18, borderRadius: "50%",
                        background: "var(--v6-accent)", border: "2px solid var(--v6-bg)",
                        cursor: "grab", zIndex: 10, boxShadow: "0 0 12px rgba(255,65,111,0.5)",
                      }} />
                      {/* Rotation line */}
                      <div style={{ position: "absolute", left: "50%", top: -12, width: 1, height: 12, background: "var(--v6-accent)", transform: "translateX(-50%)", pointerEvents: "none" }} />
                      {/* Center crosshair */}
                      <div style={{ position: "absolute", left: "50%", top: "50%", width: 8, height: 8, borderRadius: "50%", background: "var(--v6-accent)", transform: "translate(-50%, -50%)", pointerEvents: "none", opacity: 0.7 }} />
                    </>
                  )}
                </div>
              );
            })}

            {/* Shape draw preview */}
            {drawPreview && (
              <div style={{ position: "absolute", left: drawPreview.x, top: drawPreview.y, width: drawPreview.w, height: drawPreview.h, border: "1px dashed var(--v6-accent)", background: "rgba(255,65,111,0.07)", pointerEvents: "none", zIndex: 5, borderRadius: activeTool === "circle" ? "50%" : 0 }} />
            )}
          </div>

          {/* Empty state */}
          {layers.length === 0 && !isDrawing && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--v6-muted)", pointerEvents: "none", zIndex: 3 }}>
              <div className="v6-empty-orbit"><IconMove /></div>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--v6-text)", margin: "0 0 6px", letterSpacing: "-0.03em" }}>Drop images or start creating</h2>
                <p style={{ fontSize: 11, margin: 0, maxWidth: 300, lineHeight: 1.5 }}>Drag images here, use a shape tool, or type text to start composing. Select a tool from the left palette.</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar — zoom + prompt */}
        <div style={{ padding: "6px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Zoom + Fit + Canvas size */}
          {isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <button className="v6-btn v6-icon-only v6-sm" onClick={() => setZoom(z => Math.max(25, z - 25))} disabled={zoom <= 25}><IconZoomOut /></button>
              <span className="v6-tiny v6-mono" style={{ minWidth: 36, textAlign: "center", color: "var(--v6-muted)" }}>{zoom}%</span>
              <button className="v6-btn v6-icon-only v6-sm" onClick={() => setZoom(z => Math.min(400, z + 25))} disabled={zoom >= 400}><IconZoomIn /></button>
              <button className="v6-btn v6-icon-only v6-sm v6-tooltip" onClick={fitToScreen} data-tooltip="Fit to screen"><IconFit /></button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <button className="v6-btn v6-icon-only v6-sm" onClick={() => setZoom(z => Math.max(25, z - 25))} disabled={zoom <= 25}><IconZoomOut /></button>
              <input type="range" min="25" max="400" step="5" value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ width: 100, accentColor: "var(--v6-accent)", height: 4, cursor: "pointer" }} />
              <button className="v6-btn v6-icon-only v6-sm" onClick={() => setZoom(z => Math.min(400, z + 25))} disabled={zoom >= 400}><IconZoomIn /></button>
              <span className="v6-tiny v6-mono" style={{ minWidth: 36, textAlign: "center", color: "var(--v6-muted)" }}>{zoom}%</span>
              <button className="v6-btn v6-icon-only v6-sm v6-tooltip" onClick={fitToScreen} data-tooltip="Fit to screen"><IconFit /></button>
              <div style={{ width: 1, height: 16, background: "var(--v6-line)", margin: "0 4px" }} />
              <input type="number" value={canvasWidth} onChange={e => { pushUndo(); setCanvasWidth(Number(e.target.value) || 1); }} min={1} max={8000} style={{ width: 52, fontSize: 10, padding: "4px 6px", border: "1px solid var(--v6-line)", borderRadius: 6, background: "var(--v6-surface2)", color: "var(--v6-text)", textAlign: "center", fontFamily: "var(--v6-mono)" }} />
              <span className="v6-tiny v6-muted">&times;</span>
              <input type="number" value={canvasHeight} onChange={e => { pushUndo(); setCanvasHeight(Number(e.target.value) || 1); }} min={1} max={8000} style={{ width: 52, fontSize: 10, padding: "4px 6px", border: "1px solid var(--v6-line)", borderRadius: 6, background: "var(--v6-surface2)", color: "var(--v6-text)", textAlign: "center", fontFamily: "var(--v6-mono)" }} />
              <span className="v6-tiny v6-muted">px</span>
            </div>
          )}

          {/* Prompt dock for generation */}
          <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="v6-eyebrow" style={{ flexShrink: 0 }}>Model</span>
              {isMobile ? (
                <MobileModelCarousel models={canvasModels} selectedModelId={selectedModelId} onSelect={setSelectedModelId} />
              ) : (
                <select className="v6-input" value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)} style={{ flex: 1, fontSize: 11, padding: "6px 8px" }}>
                  {canvasModels.map(m => <option key={m.id} value={m.id}>{m.name} &mdash; {m.provider}</option>)}
                </select>
              )}
            </div>
            <PromptDock value={prompt} onChange={setPrompt} onSubmit={generating ? () => {} : handleGenerate} generating={generating} stage={generating ? "compositing" : null} cost={currentModel?.speedTier === "premium" ? "8c" : "4c"} />
            {genResult?.url && !generating && (
              <div style={{ marginTop: 8, padding: 10, border: "1px solid var(--v6-line)", borderRadius: 12, background: "var(--v6-surface2)", display: "flex", alignItems: "center", gap: 10, fontSize: 10 }}>
                <img src={genResult.url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
                <span style={{ flex: 1, color: "var(--v6-muted)" }}>Generated in {elapsed}s</span>
                {genResult.creditsUsed && <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--v6-accent)" }}><IconBolt /> {genResult.creditsUsed}c</span>}
                <button className="v6-btn v6-ghost v6-sm" onClick={() => { if (genResult.url) addLayer("image", { src: genResult.url, name: `Generated ${layers.length + 1}`, x: (canvasWidth - 500) / 2, y: (canvasHeight - 500) / 2, width: 500, height: 500 }); }}><IconPlus /> Add layer</button>
              </div>
            )}
            {genError && <div style={{ marginTop: 8, fontSize: 10, color: "var(--v6-bad)", padding: "6px 10px", borderRadius: 8, background: "rgba(255,107,107,0.08)" }}>{genError}</div>}
          </div>
        </div>
      </div>

      {/* ═══ LAYERS PANEL (right) ═══ */}
      <div className="v6-layers" style={{ display: "flex", flexDirection: "column" }}>
        <div className="v6-panel-title">
          <h3>Layers</h3>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="v6-btn v6-ghost v6-sm v6-icon-only v6-tooltip" onClick={() => addLayer("image")} data-tooltip="Add image layer"><IconImage /></button>
            <button className="v6-btn v6-ghost v6-sm v6-icon-only v6-tooltip" onClick={() => addLayer("text")} data-tooltip="Add text layer"><IconType /></button>
            <button className="v6-btn v6-ghost v6-sm v6-icon-only v6-tooltip" onClick={() => addLayer("rectangle")} data-tooltip="Add rectangle"><IconRect /></button>
            <button className="v6-btn v6-ghost v6-sm v6-icon-only v6-tooltip" onClick={() => addLayer("circle")} data-tooltip="Add circle"><IconCircle /></button>
          </div>
        </div>

        {/* Canvas background selector */}
        <div className="v6-field" style={{ marginBottom: 10 }}>
          <span className="v6-field-label">Background</span>
          <div style={{ display: "flex", gap: 4 }}>
            {["transparent", "#000000", "#ffffff", "#1a1a2e", "#16213e", "#0f3460"].map(c => (
              <button key={c} onClick={() => setCanvasBg(c)} style={{
                width: 24, height: 24, borderRadius: 6, border: canvasBg === c ? "2px solid var(--v6-accent)" : "1px solid var(--v6-line)",
                background: c === "transparent" ? "repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%) 50% / 6px 6px" : c,
                cursor: "pointer", flexShrink: 0,
              }} />
            ))}
          </div>
        </div>

        <div className="v6-section-rule" style={{ marginBottom: 10 }} />

        {/* Layer list */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {layers.length === 0 && (
            <div style={{ padding: "16px 8px", textAlign: "center", fontSize: 10, color: "var(--v6-muted)" }}>
              No layers yet. Drag images here or use a tool to add one.
            </div>
          )}
          <AnimatePresence>
            {[...layers].reverse().map((layer, reversedIdx) => {
              const i = layers.length - 1 - reversedIdx;
              const isActive = activeLayerId === layer.id;
              const isDragOver = dragOverLayerId === layer.id;
              const isDragging = dragLayerId === layer.id;
              return (
                <motion.div
                  key={layer.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  draggable
                  onDragStart={(e) => handleLayerDragStart(e, layer.id)}
                  onDragOver={(e) => handleLayerDragOver(e, layer.id)}
                  onDrop={(e) => handleLayerDrop(e, layer.id)}
                  onDragEnd={handleLayerDragEnd}
                  onClick={() => setActiveLayerId(layer.id)}
                  className={`v6-layer${isActive ? " v6-active" : ""}`}
                  style={{
                    flexDirection: "column", alignItems: "stretch", gap: 6,
                    borderLeft: isActive ? "3px solid var(--v6-accent)" : "3px solid transparent",
                    paddingLeft: isActive ? 7 : 10,
                    opacity: isDragging ? 0.4 : 1,
                    background: isDragOver ? "rgba(255,65,111,0.1)" : undefined,
                    marginBottom: 4,
                  }}
                >
                  {/* Layer row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ cursor: "grab", color: "var(--v6-muted)", display: "flex", opacity: 0.4 }}><IconGrip /></span>
                    <button onClick={e => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }} style={{ border: 0, background: "transparent", color: layer.visible ? "var(--v6-text)" : "var(--v6-muted)", cursor: "pointer", padding: 2, opacity: layer.visible ? 1 : 0.4 }}>{layer.visible ? <IconEye /> : <IconEyeOff />}</button>
                    <button onClick={e => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }); }} style={{ border: 0, background: "transparent", color: layer.locked ? "var(--v6-accent)" : "var(--v6-muted)", cursor: "pointer", padding: 2, opacity: layer.locked ? 1 : 0.4 }}><IconLock /></button>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: layer.locked ? "none" : undefined }}>{layer.name}</span>
                    <span className="v6-tiny v6-muted" style={{ minWidth: 28, textAlign: "right" }}>{Math.round(layer.opacity * 100)}%</span>
                  </div>

                  {/* Thumbnail */}
                  {layer.type === "image" && layer.src && (
                    <div style={{ width: "100%", height: 40, borderRadius: 6, overflow: "hidden", background: "repeating-conic-gradient(rgba(255,255,255,0.015) 0% 25%, transparent 0% 50%) 50% / 8px 8px, var(--v6-bg)" }}>
                      <img src={layer.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: layer.opacity }} />
                    </div>
                  )}

                  {/* Expanded controls */}
                  {isActive && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.2 }} style={{ display: "grid", gap: 7, paddingTop: 4, overflow: "hidden" }}>
                      {/* Opacity */}
                      <div className="v6-range-row">
                        <span className="v6-tiny v6-muted" style={{ minWidth: 28 }}>Opacity</span>
                        <input type="range" min="0" max="100" value={Math.round(layer.opacity * 100)} onChange={e => updateLayer(layer.id, { opacity: Number(e.target.value) / 100 })} onClick={e => e.stopPropagation()} />
                        <span className="v6-tiny v6-mono" style={{ minWidth: 24, textAlign: "right" }}>{Math.round(layer.opacity * 100)}%</span>
                      </div>

                      {/* Blend mode */}
                      <div className="v6-field">
                        <span className="v6-field-label">Blend</span>
                        <select className="v6-input" value={layer.blendMode} onChange={e => updateLayer(layer.id, { blendMode: e.target.value })} onClick={e => e.stopPropagation()} style={{ fontSize: 11, padding: "6px 8px" }}>
                          {BLEND_MODES.map(bm => <option key={bm} value={bm}>{bm.charAt(0).toUpperCase() + bm.slice(1).replace(/-/g, " ")}</option>)}
                        </select>
                      </div>

                      {/* Text-specific */}
                      {layer.type === "text" && (
                        <>
                          <div className="v6-field"><span className="v6-field-label">Font</span>
                            <select className="v6-input" value={layer.fontFamily || "Inter"} onChange={e => updateLayer(layer.id, { fontFamily: e.target.value })} style={{ fontSize: 11 }}>{FONTS.map(f => <option key={f} value={f}>{f}</option>)}</select>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <div className="v6-field" style={{ flex: 1 }}><span className="v6-field-label">Size</span><input type="number" className="v6-input" value={layer.fontSize || 48} onChange={e => updateLayer(layer.id, { fontSize: Number(e.target.value) })} min={8} max={500} style={{ fontSize: 11, padding: "6px 8px" }} /></div>
                            <div className="v6-field" style={{ flex: 1 }}><span className="v6-field-label">Weight</span>
                              <select className="v6-input" value={layer.fontWeight || 700} onChange={e => updateLayer(layer.id, { fontWeight: Number(e.target.value) })} style={{ fontSize: 11 }}>{[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}</select>
                            </div>
                          </div>
                          <div className="v6-field"><span className="v6-field-label">Color</span><input type="color" value={layer.textColor || "#ffffff"} onChange={e => updateLayer(layer.id, { textColor: e.target.value })} style={{ width: "100%", height: 34, border: "1px solid var(--v6-line)", borderRadius: 8, background: "transparent", cursor: "pointer" }} /></div>
                          <div className="v6-segmented">
                            {["left", "center", "right"].map(a => (
                              <button key={a} className={(layer.textAlign || "center") === a ? "v6-active" : ""} onClick={e => { e.stopPropagation(); updateLayer(layer.id, { textAlign: a }); }} style={{ fontSize: 9 }}>{a}</button>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Shape-specific */}
                      {(layer.type === "rectangle" || layer.type === "circle") && (
                        <>
                          <div className="v6-field"><span className="v6-field-label">Fill</span><div style={{ display: "flex", gap: 6 }}><input type="color" value={layer.fill || "#ff416f"} onChange={e => updateLayer(layer.id, { fill: e.target.value })} style={{ width: 34, height: 30, border: "1px solid var(--v6-line)", borderRadius: 6 }} /><input type="text" className="v6-input" value={layer.fill || "#ff416f"} onChange={e => updateLayer(layer.id, { fill: e.target.value })} style={{ flex: 1, fontSize: 10, padding: "4px 8px" }} /></div></div>
                          <div className="v6-field"><span className="v6-field-label">Stroke</span><div style={{ display: "flex", gap: 6 }}><input type="color" value={layer.stroke || "#000000"} onChange={e => updateLayer(layer.id, { stroke: e.target.value })} style={{ width: 34, height: 30, border: "1px solid var(--v6-line)", borderRadius: 6 }} /><input type="number" className="v6-input" value={layer.strokeWidth || 0} onChange={e => updateLayer(layer.id, { strokeWidth: Number(e.target.value) })} min={0} max={50} placeholder="Width" style={{ flex: 1, fontSize: 10, padding: "4px 8px", width: 50 }} /></div></div>
                        </>
                      )}

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button className="v6-btn v6-ghost v6-sm" onClick={e => { e.stopPropagation(); duplicateLayer(layer.id); }}><IconCopy /> Duplicate</button>
                        {i > 0 && <button className="v6-btn v6-ghost v6-sm" onClick={e => { e.stopPropagation(); mergeDown(layer.id); }}><IconMerge /> Merge</button>}
                        <button className="v6-btn v6-ghost v6-sm" onClick={e => { e.stopPropagation(); removeLayer(layer.id); }} style={{ color: "var(--v6-bad)" }}><IconTrash /> Delete</button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--v6-line)" }}>
          {layers.length > 1 && (
            <button className="v6-btn v6-ghost v6-sm" onClick={flattenAll} style={{ width: "100%", marginBottom: 8, fontSize: 10 }}><IconMerge /> Flatten all layers</button>
          )}
          <div className="v6-field"><span className="v6-field-label">Document name</span><input className="v6-input" value={docName} onChange={e => setDocName(e.target.value)} placeholder="Untitled" style={{ fontSize: 11 }} /></div>
          <button className="v6-btn v6-primary" onClick={saveDocument} style={{ width: "100%", marginTop: 8 }}><IconSave /> Save</button>
        </div>
      </div>

      {/* Hidden upload input */}
      <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STYLE HELPERS
   ═══════════════════════════════════════════════════════════ */

function cornerHandleStyle({ left, right, top, bottom, cursor, marginLeft, marginTop }) {
  return {
    position: "absolute",
    ...(left !== undefined ? { left } : {}),
    ...(right !== undefined ? { right } : {}),
    ...(top !== undefined ? { top } : {}),
    ...(bottom !== undefined ? { bottom } : {}),
    ...(marginLeft !== undefined ? { marginLeft } : {}),
    ...(marginTop !== undefined ? { marginTop } : {}),
    width: 10, height: 10,
    background: "var(--v6-accent)",
    border: "1.5px solid var(--v6-bg)",
    cursor,
    zIndex: 10,
    borderRadius: 2,
    boxShadow: "0 0 6px rgba(255,65,111,0.4)",
  };
}
