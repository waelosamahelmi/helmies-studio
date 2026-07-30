"use client";

/* ══════════════════════════════════════════════════════════════════════════
   CANVAS — compositional editor
   ──────────────────────────────────────────────────────────────────────────
   A real editor: direct manipulation on an infinite surface, a tool palette,
   a context bar that follows the tool, a layer stack with per-layer
   visibility, role and z-order, and a zoom readout in mono.

   One renderer. The surface and the export are painted by the SAME function
   (`paintComposition`), so what you see is what downloads. The previous build
   drew the preview with DOM nodes and the export with Canvas 2D, and the two
   disagreed about text size, image fit and text alignment.

   Layout comes from the `.st-canvas` archetype in studio.css. One component
   tree at every width — the layer stack is hidden by CSS below 1024px and the
   same markup is reachable through a sheet.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brief, ModelPicker, Sheet, Modal, Confirm,
  Field, Segmented,
  IcCursor, IcHand, IcText, IcImage,
  IcZoomIn, IcZoomOut, IcFit, IcUndo, IcRedo,
  IcEye, IcEyeOff, IcLock, IcTrash, IcCopy, IcLayers, IcArchive,
  IcDownload, IcUpload, IcAlert, IcHistory, IcChevron,
  IcPlus, IcRefresh, IcCheck, IcExternal, IcSpark,
  useUpload,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";
import { apiFetch } from "@/lib/client-fetch";
import { compileCanvas } from "@/lib/canvas-compiler";

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/* The 13 semantic roles the compiler understands. Every one of them is
   selectable per layer, and every one of them reaches compileCanvas(). */
const ROLES = [
  { value: "layout_reference", label: "Layout reference" },
  { value: "identity_reference", label: "Identity reference" },
  { value: "style_reference", label: "Style reference" },
  { value: "product_reference", label: "Product reference" },
  { value: "background_reference", label: "Background reference" },
  { value: "color_reference", label: "Colour reference" },
  { value: "composition_anchor", label: "Composition anchor" },
  { value: "logo", label: "Logo" },
  { value: "preserve_exactly", label: "Preserve exactly" },
  { value: "edit_target", label: "Edit target" },
  { value: "remove_target", label: "Remove target" },
  { value: "inpaint_region", label: "Inpaint region" },
  { value: "text_content", label: "Text content" },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

const BLENDS = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
];

const FONTS = ["Inter", "Manrope", "DM Sans", "Space Grotesk", "Newsreader", "Playfair Display", "Georgia", "JetBrains Mono", "system-ui"];

const SIZE_PRESETS = [
  { label: "Square 1080", w: 1080, h: 1080 },
  { label: "Portrait 1080×1350", w: 1080, h: 1350 },
  { label: "Story 1080×1920", w: 1080, h: 1920 },
  { label: "Landscape 1920×1080", w: 1920, h: 1080 },
  { label: "Wide 2048×878", w: 2048, h: 878 },
];

const BACKGROUNDS = ["transparent", "#000000", "#FFFFFF", "#0B0B10", "#F2EFE9", "#12233A"];

const EXAMPLES = [
  "Keep the product exactly as placed, replace the background with wet slate",
  "Match the light in the reference and hold the logo where it sits",
  "Remove the marked region and rebuild the wall behind it",
  "Same layout, softer key from the left, cooler cast",
];

const MAX_HISTORY = 60;
const MAX_BACKING = 4096;      // px per side of the preview backing store
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

/* ══════════════════════════════════════════════════════════════════════════
   ICONS — two shapes the kit does not carry, drawn to the same spec
   ══════════════════════════════════════════════════════════════════════════ */
const stroke = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
};
const IcRect = ({ className = "hs-icon", ...rest }) => (
  <svg {...stroke} className={className} aria-hidden="true" {...rest}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /></svg>
);
const IcEllipse = ({ className = "hs-icon", ...rest }) => (
  <svg {...stroke} className={className} aria-hidden="true" {...rest}><ellipse cx="12" cy="12" rx="8.6" ry="7" /></svg>
);

const TOOLS = [
  { id: "select", label: "Select", key: "V", icon: IcCursor },
  { id: "hand", label: "Pan", key: "H", icon: IcHand },
  { id: "image", label: "Place image", key: "I", icon: IcImage },
  { id: "text", label: "Text", key: "T", icon: IcText },
  { id: "rect", label: "Rectangle", key: "R", icon: IcRect },
  { id: "ellipse", label: "Ellipse", key: "O", icon: IcEllipse },
];

/* ══════════════════════════════════════════════════════════════════════════
   PURE HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

let seq = 0;
const uid = () => `l${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n) => Math.round(n * 100) / 100;

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/** Exact reduced ratio of the document, e.g. 1080×1350 → "4:5". */
function exactRatio(w, h) {
  const a = Math.max(1, Math.round(w)), b = Math.max(1, Math.round(h));
  const g = gcd(a, b) || 1;
  const rw = a / g, rh = b / g;
  if (rw > 64 || rh > 64) return `${(a / b).toFixed(2)}:1`;
  return `${rw}:${rh}`;
}

/** The closest ratio the model actually offers. Falls back to the exact one. */
function nearestRatio(w, h, options) {
  const exact = exactRatio(w, h);
  const list = (options || []).filter((r) => /^\d+:\d+$/.test(String(r)));
  if (!list.length) return exact;
  if (list.includes(exact)) return exact;
  const target = w / h;
  let best = list[0], bestD = Infinity;
  for (const r of list) {
    const [a, b] = String(r).split(":").map(Number);
    if (!a || !b) continue;
    const d = Math.abs(a / b - target);
    if (d < bestD) { best = r; bestD = d; }
  }
  return best;
}

/** Axis-aligned bounding box of a possibly rotated layer. */
function aabb(l) {
  const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
  const r = ((l.rotation || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
  const w = l.width * cos + l.height * sin;
  const h = l.width * sin + l.height * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function newLayer(type, over = {}) {
  const base = {
    id: uid(), type, name: "", x: 0, y: 0, width: 400, height: 400,
    rotation: 0, opacity: 1, blend: "normal", visible: true, locked: false,
    role: "layout_reference", mask: "none",
  };
  if (type === "image") return { ...base, name: "Image", src: "", fit: "cover", width: 640, height: 640, ...over };
  if (type === "text") return { ...base, name: "Text", role: "text_content", text: "Double-click to edit", fontFamily: "Inter", fontSize: 72, fontWeight: 700, lineHeight: 1.2, color: "#FFFFFF", align: "center", width: 720, height: 160, ...over };
  if (type === "rect") return { ...base, name: "Rectangle", role: "composition_anchor", fill: "#FF1B6B", stroke: "transparent", strokeWidth: 0, radius: 0, width: 480, height: 320, ...over };
  return { ...base, name: "Ellipse", role: "composition_anchor", fill: "#FF1B6B", stroke: "transparent", strokeWidth: 0, width: 360, height: 360, ...over };
}

/** Documents saved by the previous build used other type and field names. */
function migrate(raw) {
  const type = raw?.type === "rectangle" ? "rect" : raw?.type === "circle" ? "ellipse" : raw?.type || "image";
  const out = { ...newLayer(type), ...raw, type };
  if (raw?.blendMode) out.blend = raw.blendMode;
  if (raw?.textColor) out.color = raw.textColor;
  if (raw?.textAlign) out.align = raw.textAlign;
  if (!ROLE_LABEL[out.role]) out.role = type === "text" ? "text_content" : type === "image" ? "layout_reference" : "composition_anchor";
  if (out.mask !== "include" && out.mask !== "exclude") out.mask = "none";
  return out;
}

/* ── Image loading ──────────────────────────────────────────────────────────
   `crossOrigin="anonymous"` against a provider that sends no CORS header does
   not "taint" — the image simply fails to load, which is why the old export
   silently produced nothing. Remote images go through /api/media/proxy, which
   replies with `Access-Control-Allow-Origin: *`. If every CORS route fails we
   still load the image so the composition is visible, and mark it unclean so
   export can explain itself instead of throwing into a bare catch.          */

function sameOrigin(src) {
  if (!src) return false;
  if (src.startsWith("data:") || src.startsWith("blob:")) return true;
  if (src.startsWith("/")) return true;
  try { return new URL(src, window.location.href).origin === window.location.origin; }
  catch { return false; }
}

function loadTag(url, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

async function loadCanvasImage(src) {
  if (sameOrigin(src)) return { img: await loadTag(src, false), clean: true };
  const proxied = `/api/media/proxy?url=${encodeURIComponent(src)}`;
  try { return { img: await loadTag(proxied, true), clean: true }; } catch { /* not an allowed host */ }
  try { return { img: await loadTag(src, true), clean: true }; } catch { /* provider sends no CORS */ }
  return { img: await loadTag(src, false), clean: false };
}

/* ── Painting ─────────────────────────────────────────────────────────────
   The single source of truth for what the composition looks like.          */

function fontOf(l) {
  const family = l.fontFamily && l.fontFamily !== "system-ui" ? `"${l.fontFamily}", ` : "";
  return `${l.fontWeight || 600} ${l.fontSize || 48}px ${family}system-ui, sans-serif`;
}

function wrapLines(ctx, text, maxWidth) {
  const out = [];
  /* contentEditable hands back a trailing newline; it would offset the block */
  for (const para of String(text ?? "").replace(/\s+$/, "").split("\n")) {
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) { out.push(line); line = word; }
      else line = test;
    }
    out.push(line);
  }
  return out;
}

function drawFitted(ctx, img, w, h, fit) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  if (fit === "fill") { ctx.drawImage(img, 0, 0, w, h); return; }
  const sr = iw / ih, dr = w / h;
  if (fit === "contain") {
    let dw = w, dh = h;
    if (sr > dr) dh = w / sr; else dw = h * sr;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }
  let sw = iw, sh = ih;
  if (sr > dr) sw = ih * dr; else sh = iw / dr;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
}

function roundedPath(ctx, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  if (rad <= 0) { ctx.rect(0, 0, w, h); return; }
  if (typeof ctx.roundRect === "function") { ctx.roundRect(0, 0, w, h, rad); return; }
  ctx.moveTo(rad, 0);
  ctx.lineTo(w - rad, 0); ctx.quadraticCurveTo(w, 0, w, rad);
  ctx.lineTo(w, h - rad); ctx.quadraticCurveTo(w, h, w - rad, h);
  ctx.lineTo(rad, h); ctx.quadraticCurveTo(0, h, 0, h - rad);
  ctx.lineTo(0, rad); ctx.quadraticCurveTo(0, 0, rad, 0);
}

function paintLayer(ctx, l, images, preview) {
  const w = l.width, h = l.height;

  if (l.type === "image") {
    const entry = l.src ? images.get(l.src) : null;
    if (entry?.img) { drawFitted(ctx, entry.img, w, h, l.fit || "cover"); return; }
    if (!preview) return;                       // never bake chrome into an export
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.strokeRect(1, 1, Math.max(0, w - 2), Math.max(0, h - 2));
    ctx.restore();
    return;
  }

  if (l.type === "text") {
    ctx.font = fontOf(l);
    ctx.fillStyle = l.color || "#FFFFFF";
    ctx.textBaseline = "middle";
    const align = l.align || "center";
    ctx.textAlign = align;
    const lh = (l.fontSize || 48) * (l.lineHeight || 1.2);
    const lines = wrapLines(ctx, l.text, w);
    const x = align === "left" ? 0 : align === "right" ? w : w / 2;
    let y = h / 2 - (lines.length * lh) / 2 + lh / 2;
    for (const line of lines) { ctx.fillText(line, x, y); y += lh; }
    return;
  }

  ctx.beginPath();
  if (l.type === "ellipse") ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else roundedPath(ctx, w, h, l.radius || 0);
  if (l.fill && l.fill !== "transparent") { ctx.fillStyle = l.fill; ctx.fill(); }
  if (l.stroke && l.stroke !== "transparent" && l.strokeWidth > 0) {
    ctx.strokeStyle = l.stroke;
    ctx.lineWidth = l.strokeWidth;
    ctx.stroke();
  }
}

/**
 * Paint a composition. `scale` maps document units to device pixels, so the
 * same call serves a 0.4× preview and a 3× export.
 */
function paintComposition(ctx, { layers, width, height, background, scale = 1, images, preview = false, skipId = null, only = null }) {
  const bw = width * scale, bh = height * scale;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, bw, bh);
  if (background && background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, bw, bh);
  }
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (const l of layers) {
    if (l.visible === false) continue;
    if (skipId && l.id === skipId) continue;
    if (only && !only.has(l.id)) continue;
    ctx.save();
    ctx.globalAlpha = clamp(l.opacity ?? 1, 0, 1);
    if (l.blend && l.blend !== "normal") ctx.globalCompositeOperation = l.blend;
    ctx.translate(l.x + l.width / 2, l.y + l.height / 2);
    if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.translate(-l.width / 2, -l.height / 2);
    try { paintLayer(ctx, l, images, preview); } catch { /* one bad layer must not kill the frame */ }
    ctx.restore();
  }
  ctx.restore();
}

function rasterize({ layers, width, height, background, images, scale = 1, only = null, origin = { x: 0, y: 0 } }) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  const shifted = origin.x || origin.y
    ? layers.map((l) => ({ ...l, x: l.x - origin.x, y: l.y - origin.y }))
    : layers;
  paintComposition(ctx, { layers: shifted, width, height, background, scale, images, preview: false, only });
  return canvas;
}

function toBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser could not encode this image."))), mime, quality);
    } catch (e) { reject(e); }
  });
}

const isTaint = (e) => e?.name === "SecurityError" || /taint|cross-origin/i.test(e?.message || "");
const TAINT_MSG = "One of the images is served without cross-origin permission, so the browser will not let this canvas be read. Re-upload that image, or replace it with one generated here.";

/* ══════════════════════════════════════════════════════════════════════════
   CANVAS STUDIO
   ══════════════════════════════════════════════════════════════════════════ */

export default function CanvasStudio({ initialModel, templateConfig, onCreditsChanged }) {
  /* ── Scene: one object so history is one snapshot ─────────────────────── */
  const [scene, setScene] = useState({ w: 1080, h: 1080, bg: "transparent", layers: [] });
  const sceneRef = useRef(scene);
  const past = useRef([]);
  const future = useRef([]);
  const coalesce = useRef(null);
  const [histTick, setHistTick] = useState(0);

  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [tool, setTool] = useState("select");
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState(null);        // shape being dragged out

  /* ── Document ─────────────────────────────────────────────────────────── */
  const [docId, setDocId] = useState(null);
  const [docName, setDocName] = useState("Untitled");
  const [docs, setDocs] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("idle");   // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const saving = useRef(false);

  /* ── Overlays ─────────────────────────────────────────────────────────── */
  const [panel, setPanel] = useState(null);        // null | layers | models | files | export
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmFlatten, setConfirmFlatten] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(null);
  const [versions, setVersions] = useState(null);  // { docId, name, list } | null
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  /* ── Export ───────────────────────────────────────────────────────────── */
  const [format, setFormat] = useState("png");
  const [quality, setQuality] = useState(0.92);
  const [exportScale, setExportScale] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  /* ── Generation ───────────────────────────────────────────────────────── */
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [modelId, setModelId] = useState(initialModel || null);
  const [useGuide, setUseGuide] = useState(true);
  const [genNotice, setGenNotice] = useState("");

  /* ── Tool defaults (used when nothing is selected) ────────────────────── */
  const [textDefaults, setTextDefaults] = useState({ fontFamily: "Inter", fontSize: 72, fontWeight: 700, color: "#FFFFFF", align: "center" });
  const [shapeDefaults, setShapeDefaults] = useState({ fill: "#FF1B6B", stroke: "transparent", strokeWidth: 0, radius: 0 });

  /* ── Refs ─────────────────────────────────────────────────────────────── */
  const surfaceRef = useRef(null);
  const paperRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const images = useRef(new Map());
  const [imgTick, setImgTick] = useState(0);
  const alive = useRef(true);
  const placed = useRef(null);
  const zoomRef = useRef(zoom);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const { upload } = useUpload();
  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error: genError, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Canvas can drive both text-to-image and edit models */
  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "tti") || matchesGroup(m, "iti")),
    [models],
  );
  const model = available.find((m) => m.id === modelId) || available[0] || null;
  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);

  const layers = scene.layers;
  const selected = useMemo(() => layers.find((l) => l.id === selectedId) || null, [layers, selectedId]);
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  void histTick;

  /* ══════════════════════════════════════════════════════════════════════
     HISTORY — one entry per gesture
     ══════════════════════════════════════════════════════════════════════ */

  const commit = useCallback((updater, key) => {
    const prev = sceneRef.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    if (!next || next === prev) return;
    if (!key || key !== coalesce.current) {
      past.current.push(prev);
      if (past.current.length > MAX_HISTORY) past.current.shift();
      future.current = [];
    }
    coalesce.current = key || null;
    sceneRef.current = next;
    setScene(next);
    setDirty(true);
    setSaveState((s) => (s === "saved" ? "idle" : s));
    setHistTick((t) => t + 1);
  }, []);

  const endGesture = useCallback(() => { coalesce.current = null; }, []);

  const load = useCallback((next) => {          // replace the scene without history
    past.current = [];
    future.current = [];
    coalesce.current = null;
    sceneRef.current = next;
    setScene(next);
    setSelectedId(null);
    setEditingId(null);
    setHistTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(sceneRef.current);
    coalesce.current = null;
    sceneRef.current = prev;
    setScene(prev);
    setDirty(true);
    setHistTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(sceneRef.current);
    coalesce.current = null;
    sceneRef.current = next;
    setScene(next);
    setDirty(true);
    setHistTick((t) => t + 1);
  }, []);

  /* ══════════════════════════════════════════════════════════════════════
     LAYER OPERATIONS
     ══════════════════════════════════════════════════════════════════════ */

  const patch = useCallback((id, delta, key) => {
    commit((s) => ({ ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, ...delta } : l)) }), key);
  }, [commit]);

  const addLayer = useCallback((type, over = {}) => {
    const s = sceneRef.current;
    const count = s.layers.filter((l) => l.type === type).length + 1;
    const layer = newLayer(type, { name: `${newLayer(type).name} ${count}`, ...over });
    commit({ ...s, layers: [...s.layers, layer] });
    setSelectedId(layer.id);
    return layer;
  }, [commit]);

  const removeLayer = useCallback((id) => {
    commit((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== id) }));
    setSelectedId((v) => (v === id ? null : v));
    setEditingId((v) => (v === id ? null : v));
  }, [commit]);

  const duplicateLayer = useCallback((id) => {
    const s = sceneRef.current;
    const i = s.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    const copy = { ...s.layers[i], id: uid(), name: `${s.layers[i].name} copy`, x: s.layers[i].x + 24, y: s.layers[i].y + 24 };
    const next = [...s.layers];
    next.splice(i + 1, 0, copy);
    commit({ ...s, layers: next });
    setSelectedId(copy.id);
  }, [commit]);

  /** Move a layer to an absolute index in the bottom-to-top array. */
  const moveTo = useCallback((id, index) => {
    commit((s) => {
      const from = s.layers.findIndex((l) => l.id === id);
      if (from < 0) return s;
      const to = clamp(index, 0, s.layers.length - 1);
      if (to === from) return s;
      const next = [...s.layers];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...s, layers: next };
    });
  }, [commit]);

  const moveBy = useCallback((id, step) => {
    const i = sceneRef.current.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    moveTo(id, i + step);
  }, [moveTo]);

  /* ══════════════════════════════════════════════════════════════════════
     IMAGES — load everything the scene references, once
     ══════════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const wanted = new Set(layers.filter((l) => l.type === "image" && l.src).map((l) => l.src));
    for (const src of wanted) {
      if (images.current.has(src)) continue;
      images.current.set(src, { status: "loading" });
      loadCanvasImage(src)
        .then(({ img, clean }) => { images.current.set(src, { status: "ready", img, clean }); })
        .catch(() => { images.current.set(src, { status: "error" }); })
        .finally(() => { if (alive.current) setImgTick((t) => t + 1); });
    }
  }, [layers]);

  /* Webfonts settle after first paint — repaint so text metrics are right */
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    document.fonts.ready.then(() => { if (alive.current) setImgTick((t) => t + 1); }).catch(() => {});
  }, []);

  const unclean = useMemo(() => {
    for (const l of layers) {
      if (l.type !== "image" || !l.src) continue;
      const e = images.current.get(l.src);
      if (e?.status === "ready" && e.clean === false) return true;
    }
    return false;
  }, [layers, imgTick]);

  const failedImages = useMemo(
    () => layers.filter((l) => l.type === "image" && l.src && images.current.get(l.src)?.status === "error").length,
    [layers, imgTick],
  );

  /* ══════════════════════════════════════════════════════════════════════
     PAINT — the surface uses the same painter the export does
     ══════════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const s = Math.min(zoom * dpr, MAX_BACKING / scene.w, MAX_BACKING / scene.h);
    const bw = Math.max(1, Math.round(scene.w * s));
    const bh = Math.max(1, Math.round(scene.h * s));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    canvas.style.width = `${scene.w * zoom}px`;
    canvas.style.height = `${scene.h * zoom}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintComposition(ctx, {
      layers: scene.layers,
      width: scene.w,
      height: scene.h,
      background: scene.bg,
      scale: bw / scene.w,
      images: images.current,
      preview: true,
      skipId: editingId,
    });
  }, [scene, zoom, imgTick, editingId]);

  /* ══════════════════════════════════════════════════════════════════════
     VIEWPORT — pan, zoom, fit
     ══════════════════════════════════════════════════════════════════════ */

  const toDoc = useCallback((clientX, clientY) => {
    const r = paperRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const z = zoomRef.current;
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z };
  }, []);

  const zoomAt = useCallback((nextZoom, clientX, clientY) => {
    const surface = surfaceRef.current;
    const paper = paperRef.current;
    if (!surface || !paper) { setZoom(nextZoom); return; }
    const sr = surface.getBoundingClientRect();
    const pr = paper.getBoundingClientRect();
    const cx = clientX ?? sr.left + sr.width / 2;
    const cy = clientY ?? sr.top + sr.height / 2;
    const z0 = zoomRef.current;
    const dx = (cx - pr.left) / z0;
    const dy = (cy - pr.top) / z0;
    const { w, h } = sceneRef.current;
    setPan({
      x: cx - dx * nextZoom - sr.left - (sr.width - w * nextZoom) / 2,
      y: cy - dy * nextZoom - sr.top - (sr.height - h * nextZoom) / 2,
    });
    setZoom(nextZoom);
  }, []);

  const stepZoom = useCallback((factor) => {
    zoomAt(clamp(zoomRef.current * factor, MIN_ZOOM, MAX_ZOOM), null, null);
  }, [zoomAt]);

  const fit = useCallback(() => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r) return;
    const { w, h } = sceneRef.current;
    const z = clamp(Math.min((r.width - 72) / w, (r.height - 72) / h), MIN_ZOOM, MAX_ZOOM);
    setPan({ x: 0, y: 0 });
    setZoom(z);
  }, []);

  useEffect(() => { fit(); /* once, on mount */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* React attaches wheel passively, so the listener is native */
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY / 340);
        zoomAt(clamp(zoomRef.current * factor, MIN_ZOOM, MAX_ZOOM), e.clientX, e.clientY);
        return;
      }
      const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
      const dy = e.shiftKey ? 0 : -e.deltaY;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const startPan = useCallback((e) => {
    e.preventDefault();
    const ox = e.clientX, oy = e.clientY;
    const start = pan;
    const move = (ev) => setPan({ x: start.x + (ev.clientX - ox), y: start.y + (ev.clientY - oy) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [pan]);

  /* ══════════════════════════════════════════════════════════════════════
     DIRECT MANIPULATION
     ══════════════════════════════════════════════════════════════════════ */

  const hitTest = useCallback((p) => {
    const ls = sceneRef.current.layers;
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      if (l.visible === false) continue;
      const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
      const r = -((l.rotation || 0) * Math.PI) / 180;
      const dx = p.x - cx, dy = p.y - cy;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= l.width / 2 && Math.abs(ly) <= l.height / 2) return l;
    }
    return null;
  }, []);

  const startMove = useCallback((e, id) => {
    const layer = sceneRef.current.layers.find((l) => l.id === id);
    if (!layer || layer.locked) return;
    const start = toDoc(e.clientX, e.clientY);
    const ox = layer.x, oy = layer.y;
    const key = `move:${id}:${Date.now()}`;
    const move = (ev) => {
      const p = toDoc(ev.clientX, ev.clientY);
      let nx = ox + (p.x - start.x);
      let ny = oy + (p.y - start.y);
      if (ev.shiftKey) {
        if (Math.abs(p.x - start.x) > Math.abs(p.y - start.y)) ny = oy; else nx = ox;
      }
      patch(id, { x: Math.round(nx), y: Math.round(ny) }, key);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [toDoc, patch, endGesture]);

  const startResize = useCallback((e, id, corner) => {
    e.stopPropagation();
    e.preventDefault();
    const layer = sceneRef.current.layers.find((l) => l.id === id);
    if (!layer || layer.locked) return;
    const start = toDoc(e.clientX, e.clientY);
    const { x: ox, y: oy, width: ow, height: oh } = layer;
    const rot = ((layer.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const c0 = { x: ox + ow / 2, y: oy + oh / 2 };
    const west = corner.includes("w"), east = corner.includes("e");
    const north = corner.includes("n"), south = corner.includes("s");
    const key = `size:${id}:${Date.now()}`;

    const move = (ev) => {
      const p = toDoc(ev.clientX, ev.clientY);
      const dx = p.x - start.x, dy = p.y - start.y;
      /* Work in the layer's own axes so a rotated box resizes sensibly */
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;

      let left = 0, top = 0, w = ow, h = oh;
      if (east) w = ow + lx;
      if (west) { w = ow - lx; left = lx; }
      if (south) h = oh + ly;
      if (north) { h = oh - ly; top = ly; }

      if (ev.shiftKey && (east || west) && (north || south)) {
        const ratio = ow / oh;
        if (Math.abs(w / ratio) > Math.abs(h)) h = w / ratio; else w = h * ratio;
        if (north) top = oh - h;
        if (west) left = ow - w;
      }

      w = Math.max(8, w); h = Math.max(8, h);
      const localCx = -ow / 2 + left + w / 2;
      const localCy = -oh / 2 + top + h / 2;
      const cx = c0.x + localCx * cos - localCy * sin;
      const cy = c0.y + localCx * sin + localCy * cos;
      patch(id, {
        x: Math.round(cx - w / 2), y: Math.round(cy - h / 2),
        width: Math.round(w), height: Math.round(h),
      }, key);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [toDoc, patch, endGesture]);

  const startRotate = useCallback((e, id) => {
    e.stopPropagation();
    e.preventDefault();
    const layer = sceneRef.current.layers.find((l) => l.id === id);
    if (!layer || layer.locked) return;
    const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
    const p0 = toDoc(e.clientX, e.clientY);
    const a0 = (Math.atan2(p0.y - cy, p0.x - cx) * 180) / Math.PI;
    const r0 = layer.rotation || 0;
    const key = `spin:${id}:${Date.now()}`;
    const move = (ev) => {
      const p = toDoc(ev.clientX, ev.clientY);
      const a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
      let rot = (r0 + (a - a0)) % 360;
      if (ev.shiftKey) rot = Math.round(rot / 15) * 15;
      patch(id, { rotation: round(rot) }, key);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [toDoc, patch, endGesture]);

  const startDraw = useCallback((e) => {
    const start = toDoc(e.clientX, e.clientY);
    const kind = tool;
    setDraft({ x: start.x, y: start.y, w: 0, h: 0 });
    const move = (ev) => {
      const p = toDoc(ev.clientX, ev.clientY);
      let w = p.x - start.x, h = p.y - start.y;
      if (ev.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      setDraft({ x: Math.min(start.x, start.x + w), y: Math.min(start.y, start.y + h), w: Math.abs(w), h: Math.abs(h) });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const p = toDoc(ev.clientX, ev.clientY);
      const w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
      setDraft(null);
      const x = Math.round(Math.min(start.x, p.x));
      const y = Math.round(Math.min(start.y, p.y));
      if (kind === "text") {
        const box = w > 24 && h > 24
          ? { x, y, width: Math.round(w), height: Math.round(h) }
          : { x: Math.round(start.x - 360), y: Math.round(start.y - 80), width: 720, height: 160 };
        const layer = addLayer("text", { ...box, ...textDefaults, text: "New text" });
        setEditingId(layer.id);
        setTool("select");
      } else if (w > 6 && h > 6) {
        addLayer(kind, { x, y, width: Math.round(w), height: Math.round(h), ...shapeDefaults });
        setTool("select");
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [toDoc, tool, addLayer, textDefaults, shapeDefaults]);

  const onSurfacePointerDown = useCallback((e) => {
    if (e.button === 1 || tool === "hand") { startPan(e); return; }
    if (e.button !== 0) return;
    if (editingId) { setEditingId(null); return; }
    if (tool === "image") { fileRef.current?.click(); return; }
    if (tool === "text" || tool === "rect" || tool === "ellipse") { e.preventDefault(); startDraw(e); return; }
    const hit = hitTest(toDoc(e.clientX, e.clientY));
    if (!hit) { setSelectedId(null); return; }
    setSelectedId(hit.id);
    if (!hit.locked) startMove(e, hit.id);
  }, [tool, editingId, startPan, startDraw, hitTest, toDoc, startMove]);

  const onSurfaceDoubleClick = useCallback((e) => {
    const hit = hitTest(toDoc(e.clientX, e.clientY));
    if (hit?.type === "text" && !hit.locked) { setSelectedId(hit.id); setEditingId(hit.id); }
  }, [hitTest, toDoc]);

  /* ══════════════════════════════════════════════════════════════════════
     PLACING IMAGES
     ══════════════════════════════════════════════════════════════════════ */

  const placeImage = useCallback((url, name) => {
    const { w, h } = sceneRef.current;
    const side = Math.round(Math.min(w, h) * 0.7);
    return addLayer("image", {
      src: url, name: name || "Image",
      x: Math.round((w - side) / 2), y: Math.round((h - side) / 2),
      width: side, height: side,
    });
  }, [addLayer]);

  const takeFiles = useCallback(async (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setBusy(`Uploading ${list.length} image${list.length > 1 ? "s" : ""}…`);
    setNotice("");
    for (const file of list) {
      const up = await upload(file);
      if (up?.url) placeImage(up.url, file.name);
      else setNotice("An image did not upload. Check the file size and try again.");
    }
    setBusy("");
    setTool("select");
  }, [upload, placeImage]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    takeFiles(e.dataTransfer?.files);
  }, [takeFiles]);

  /* ══════════════════════════════════════════════════════════════════════
     RASTERISING — merge down and flatten actually composite pixels
     ══════════════════════════════════════════════════════════════════════ */

  /** Rasterise a set of layers to a hosted URL, falling back to a data URL. */
  const bake = useCallback(async (opts, filename) => {
    const canvas = rasterize({ ...opts, images: images.current });
    let blob;
    try {
      blob = await toBlob(canvas, "image/png");
    } catch (e) {
      throw new Error(isTaint(e) ? TAINT_MSG : e.message || "Could not rasterise this composition.");
    }
    const file = new File([blob], filename, { type: "image/png" });
    const up = await upload(file);
    if (up?.url) return up.url;
    return canvas.toDataURL("image/png");   // still usable locally
  }, [upload]);

  const mergeDown = useCallback(async (id) => {
    const s = sceneRef.current;
    const i = s.layers.findIndex((l) => l.id === id);
    if (i <= 0) return;
    const upper = s.layers[i], lower = s.layers[i - 1];
    const a = aabb(upper), b = aabb(lower);
    const x = Math.floor(Math.min(a.x, b.x));
    const y = Math.floor(Math.min(a.y, b.y));
    const w = Math.ceil(Math.max(a.x + a.w, b.x + b.w) - x);
    const h = Math.ceil(Math.max(a.y + a.h, b.y + b.h) - y);
    if (w < 1 || h < 1) return;

    setBusy("Merging layers…");
    setNotice("");
    try {
      const url = await bake({
        layers: [lower, upper], width: w, height: h,
        background: "transparent", origin: { x, y },
        only: new Set([lower.id, upper.id]),
      }, "merged.png");
      const merged = {
        ...newLayer("image"),
        id: uid(),
        name: `${lower.name} + ${upper.name}`,
        src: url, fit: "fill",
        x, y, width: w, height: h,
        role: lower.role, opacity: 1, blend: "normal",
      };
      const next = [...s.layers];
      next.splice(i - 1, 2, merged);
      commit({ ...s, layers: next });
      setSelectedId(merged.id);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy("");
    }
  }, [bake, commit]);

  const flatten = useCallback(async () => {
    const s = sceneRef.current;
    const visible = s.layers.filter((l) => l.visible !== false);
    if (visible.length < 2) return;
    setBusy("Flattening…");
    setNotice("");
    try {
      const url = await bake({
        layers: visible, width: s.w, height: s.h,
        background: "transparent",
        only: new Set(visible.map((l) => l.id)),
      }, "flattened.png");
      const flat = {
        ...newLayer("image"),
        id: uid(), name: "Flattened", src: url, fit: "fill",
        x: 0, y: 0, width: s.w, height: s.h,
      };
      const hidden = s.layers.filter((l) => l.visible === false);
      commit({ ...s, layers: [flat, ...hidden] });
      setSelectedId(flat.id);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy("");
    }
  }, [bake, commit]);

  /* ══════════════════════════════════════════════════════════════════════
     EXPORT
     ══════════════════════════════════════════════════════════════════════ */

  const doExport = useCallback(async () => {
    setExporting(true);
    setExportError("");
    try {
      const canvas = rasterize({
        layers: scene.layers, width: scene.w, height: scene.h,
        background: format === "png" || format === "webp" ? scene.bg : (scene.bg === "transparent" ? "#FFFFFF" : scene.bg),
        images: images.current, scale: exportScale,
      });
      const mime = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
      const blob = await toBlob(canvas, mime, format === "png" ? undefined : quality);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(docName || "canvas").replace(/[^\w.-]+/g, "_")}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setPanel(null);
    } catch (e) {
      setExportError(isTaint(e) ? TAINT_MSG : e?.message || "The export did not complete.");
    } finally {
      setExporting(false);
    }
  }, [scene, format, quality, exportScale, docName]);

  /* ══════════════════════════════════════════════════════════════════════
     DOCUMENTS — apiFetch everywhere, dirty flag, autosave, version history
     ══════════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    apiFetch("/api/canvas")
      .then((r) => r.json())
      .then((list) => { if (alive.current && Array.isArray(list)) setDocs(list); })
      .catch(() => { /* signed out — the save button will say so */ });
  }, []);

  const save = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setSaveState("saving");
    setSaveError("");
    const s = sceneRef.current;
    const content = { width: s.w, height: s.h, background: s.bg, layers: s.layers };
    try {
      const res = docId
        ? await apiFetch("/api/canvas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: docId, name: docName, content }),
          })
        : await apiFetch("/api/canvas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: docName, content }),
          });
      const saved = await res.json();
      if (!alive.current) return;
      if (saved?.id) setDocId(saved.id);
      setDocs((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
      setDirty(false);
      setSavedAt(new Date());
      setSaveState("saved");
    } catch (e) {
      if (!alive.current) return;
      setSaveState("error");
      setSaveError(e?.status === 401 ? "Sign in to save this document." : e?.message || "Could not save. Try again.");
    } finally {
      saving.current = false;
    }
  }, [docId, docName]);

  /* Autosave, but only for a document that already exists. Creating a
     document behind the user's back on their first stroke is not autosave. */
  useEffect(() => {
    if (!dirty || !docId || saving.current) return;
    const t = setTimeout(() => { save(); }, 5000);
    return () => clearTimeout(t);
  }, [dirty, docId, scene, docName, save]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const openDoc = useCallback((doc) => {
    const c = doc?.content || {};
    load({
      w: c.width || 1080,
      h: c.height || 1080,
      bg: c.background || "transparent",
      layers: (c.layers || []).map(migrate),
    });
    setDocId(doc.id);
    setDocName(doc.name || "Untitled");
    setDirty(false);
    setSaveState("idle");
    setPanel(null);
    setVersions(null);
    setPan({ x: 0, y: 0 });
    requestAnimationFrame(fit);
  }, [load, fit]);

  const newDoc = useCallback(() => {
    load({ w: 1080, h: 1080, bg: "transparent", layers: [] });
    setDocId(null);
    setDocName("Untitled");
    setDirty(false);
    setSaveState("idle");
    setSavedAt(null);
    setPanel(null);
    setVersions(null);
    setPan({ x: 0, y: 0 });
    reset();
    placed.current = null;
    requestAnimationFrame(fit);
  }, [load, fit, reset]);

  const requestNew = useCallback(() => {
    if (dirty) setConfirmNew(true); else newDoc();
  }, [dirty, newDoc]);

  const requestOpen = useCallback((doc) => {
    if (dirty) setPendingOpen(doc); else openDoc(doc);
  }, [dirty, openDoc]);

  const deleteDoc = useCallback(async (id) => {
    try {
      await apiFetch(`/api/canvas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (id === docId) { setDocId(null); setDirty(true); }
    } catch (e) {
      setNotice(e?.message || "Could not delete that document.");
    }
  }, [docId]);

  const openVersions = useCallback(async (doc) => {
    setVersions({ docId: doc.id, name: doc.name || "Untitled", list: null });
    try {
      const res = await apiFetch(`/api/canvas/versions?documentId=${encodeURIComponent(doc.id)}`);
      const list = await res.json();
      if (alive.current) setVersions({ docId: doc.id, name: doc.name || "Untitled", list: Array.isArray(list) ? list : [] });
    } catch (e) {
      if (alive.current) setVersions({ docId: doc.id, name: doc.name || "Untitled", list: [], error: e?.message || "Could not load versions." });
    }
  }, []);

  const restoreVersion = useCallback((v) => {
    const c = v?.content || {};
    load({
      w: c.width || 1080,
      h: c.height || 1080,
      bg: c.background || "transparent",
      layers: (c.layers || []).map(migrate),
    });
    setDirty(true);                    // saving writes a new version; nothing is overwritten
    setSaveState("idle");
    setPanel(null);
    setVersions(null);
    requestAnimationFrame(fit);
  }, [load, fit]);

  /* ══════════════════════════════════════════════════════════════════════
     GENERATION — real roles, real ratio, real cost, real cancel
     ══════════════════════════════════════════════════════════════════════ */

  const ratio = useMemo(() => nearestRatio(scene.w, scene.h, model?.aspectRatios), [scene.w, scene.h, model]);
  const trueRatio = useMemo(() => exactRatio(scene.w, scene.h), [scene.w, scene.h]);

  /** The document in the shape compileCanvas() expects. */
  const canvasDoc = useMemo(() => {
    const objects = [];
    const masks = { include: [], exclude: [] };
    for (const l of scene.layers) {
      if (l.visible === false) continue;
      const bounds = { left: l.x, top: l.y, width: l.width, height: l.height };
      if (l.mask === "include") { masks.include.push({ id: l.id, bounds }); continue; }
      if (l.mask === "exclude") { masks.exclude.push({ id: l.id, bounds }); continue; }
      if (l.type === "image") {
        if (l.src) objects.push({ id: l.id, type: "image", src: l.src, role: l.role || "layout_reference", bounds });
      } else if (l.type === "text") {
        objects.push({ id: l.id, type: "text", text: l.text, fontSize: l.fontSize, fontFamily: l.fontFamily, role: l.role || "text_content", bounds });
      } else {
        objects.push({ id: l.id, type: "shape", role: l.role || "composition_anchor", bounds });
      }
    }
    return { canvas: { width: scene.w, height: scene.h }, aspectRatio: ratio, objects, masks, instructions: [] };
  }, [scene, ratio]);

  const compiled = useMemo(
    () => compileCanvas(canvasDoc, { modelId: model?.id, prompt, negativePrompt: negative, aspectRatio: ratio }),
    [canvasDoc, model, prompt, negative, ratio],
  );

  /* The compiler resolves models against the STATIC lib/models.js list while
     the studio picks from the live DB catalog, so `model` is always undefined
     inside it and every strategy collapsed to flatten_guide/t2i. Routing is
     therefore re-derived here from the live model's real capability fields.
     Its "Unknown model" warning is dropped — it fires on every live id. */
  const route = useMemo(() => {
    const refs = compiled.references || [];
    const urls = refs.map((r) => r.url).filter(Boolean);
    const edit = model ? matchesGroup(model, "iti") : false;
    const slots = model?.maxImages || 0;
    const hasMasks = !!compiled.masks?.hasMasks;
    if (edit && urls.length) return { strategy: hasMasks ? "inpaint" : "i2i", urls, edit, slots };
    if (slots > 1 && urls.length > 1) return { strategy: "multi_ref", urls: urls.slice(0, slots), edit, slots };
    if (slots >= 1 && urls.length) return { strategy: "single_ref", urls: urls.slice(0, 1), edit, slots };
    if (urls.length) return { strategy: "described", urls: [], edit, slots };
    return { strategy: "t2i", urls: [], edit, slots };
  }, [compiled, model]);

  const warnings = useMemo(() => {
    const out = (compiled.warnings || []).filter((w) => !/^Unknown model/.test(w));
    const name = model?.displayName || model?.name || "This model";
    const refCount = (compiled.references || []).length;
    if (route.strategy === "described" && refCount) {
      out.push(`${name} does not accept reference images. The ${refCount} image layer${refCount > 1 ? "s are" : " is"} described by position in the prompt instead — pick an edit model to use the pixels.`);
    }
    if (route.strategy === "multi_ref" && refCount > route.slots) {
      out.push(`${name} takes ${route.slots} references; the canvas has ${refCount}. The rest are described in the prompt.`);
    }
    if (compiled.masks?.hasMasks && !route.edit) {
      out.push(`${name} cannot read masks. Mask regions are described in the prompt only. Choose an edit model for real inpainting.`);
    }
    if ((compiled.textRegions || []).length && !/gpt-image|ideogram/i.test(model?.id || "")) {
      out.push(`${name} rarely renders exact lettering. The text layers are passed as content requirements — check the result, or generate the type here and place it on top.`);
    }
    if (failedImages) out.push(`${failedImages} image layer${failedImages > 1 ? "s" : ""} could not be loaded and will not be sent.`);
    if (ratio !== trueRatio) out.push(`The canvas is ${trueRatio}; ${name} renders the nearest supported ratio, ${ratio}.`);
    return out;
  }, [compiled, route, model, failedImages, ratio, trueRatio]);

  const { cost, affordable, balance, shortfall } = useCreditCost("image", model?.id || "", {
    aspect_ratio: ratio,
    image_url: route.urls[0],
    images_list: route.strategy === "multi_ref" ? route.urls : undefined,
  });

  const guideEligible = useGuide && route.edit && scene.layers.some((l) => l.visible !== false);

  const generate = useCallback(async () => {
    if (!model || !prompt.trim() || generating) return;
    setGenNotice("");
    const params = {
      endpoint: model.endpoint || model.id,
      prompt: compiled.compiledPrompt || prompt,
      negative_prompt: compiled.compiledNegative,
      aspect_ratio: ratio,
    };

    /* An edit model deserves to see the actual composition, not the first
       reference. compileCanvas asks the caller to do exactly this. */
    if (guideEligible) {
      setBusy("Flattening the composition guide…");
      try {
        params.image_url = await bake({
          layers: scene.layers, width: scene.w, height: scene.h,
          background: scene.bg === "transparent" ? "#000000" : scene.bg,
          only: new Set(scene.layers.filter((l) => l.visible !== false).map((l) => l.id)),
        }, "composition-guide.png");
      } catch (e) {
        setGenNotice(`${e.message} Sending the first reference instead.`);
        if (route.urls[0]) params.image_url = route.urls[0];
      } finally {
        setBusy("");
      }
    } else if (route.strategy === "multi_ref") {
      params.images_list = route.urls;
    } else if (route.urls[0]) {
      params.image_url = route.urls[0];
    }

    placed.current = null;
    submit("image", model.id, params);
  }, [model, prompt, generating, compiled, ratio, guideEligible, bake, scene, route, submit]);

  /* One placement path. The old build auto-added the result AND offered an
     "Add layer" button, so every generation landed on the canvas twice. */
  useEffect(() => {
    if (!result?.url || generating) return;
    if (placed.current === result.url) return;
    placed.current = result.url;
    placeImage(result.url, "Generated");
    onCreditsChanged?.();
  }, [result, generating, placeImage, onCreditsChanged]);

  /* A template may arrive after mount */
  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setPrompt(templateConfig.prompt);
    if (templateConfig.negative_prompt) setNegative(templateConfig.negative_prompt);
    if (templateConfig.model) setModelId(templateConfig.model);
  }, [templateConfig]);

  /* ══════════════════════════════════════════════════════════════════════
     KEYBOARD
     ══════════════════════════════════════════════════════════════════════ */

  const overlayOpen = panel !== null || confirmNew || confirmFlatten || !!pendingOpen;

  useEffect(() => {
    const onKey = (e) => {
      if (!e.key) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); if (selectedId) duplicateLayer(selectedId); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); stepZoom(1.25); return; }
      if (mod && e.key === "-") { e.preventDefault(); stepZoom(0.8); return; }
      if (mod && e.key === "0") { e.preventDefault(); fit(); return; }
      if (mod) return;
      if (overlayOpen) return;

      const key = e.key.toLowerCase();
      const byKey = TOOLS.find((x) => x.key.toLowerCase() === key);
      if (byKey) { setTool(byKey.id); return; }

      if (e.key === "Escape") { setEditingId(null); setSelectedId(null); setTool("select"); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); removeLayer(selectedId); return; }

      if (selectedId && e.key.startsWith("Arrow")) {
        const layer = sceneRef.current.layers.find((l) => l.id === selectedId);
        if (!layer || layer.locked) return;
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        const d = e.key === "ArrowLeft" ? { x: layer.x - n } : e.key === "ArrowRight" ? { x: layer.x + n }
          : e.key === "ArrowUp" ? { y: layer.y - n } : { y: layer.y + n };
        patch(selectedId, d, `nudge:${selectedId}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, save, duplicateLayer, removeLayer, patch, selectedId, stepZoom, fit, overlayOpen]);

  /* ══════════════════════════════════════════════════════════════════════
     CONTEXT BAR — follows the tool
     ══════════════════════════════════════════════════════════════════════ */

  const num = { width: 62, height: 28, padding: "0 6px", fontSize: 11 };
  const swatch = { width: 28, height: 26, padding: 0, border: "1px solid var(--line)", borderRadius: "var(--r-xs)", background: "transparent", cursor: "pointer" };

  const textLayer = selected?.type === "text" ? selected : null;
  const textVals = textLayer || textDefaults;
  const setText = (delta) => {
    if (textLayer) patch(textLayer.id, delta, `text:${textLayer.id}`);
    else setTextDefaults((d) => ({ ...d, ...delta }));
  };
  const shapeLayer = selected && (selected.type === "rect" || selected.type === "ellipse") ? selected : null;
  const shapeVals = shapeLayer || shapeDefaults;
  const setShape = (delta) => {
    if (shapeLayer) patch(shapeLayer.id, delta, `shape:${shapeLayer.id}`);
    else setShapeDefaults((d) => ({ ...d, ...delta }));
  };

  const contextBar = (() => {
    if (tool === "hand") {
      return <span className="hs-hint">Drag to pan. Ctrl and scroll to zoom. Scroll to move.</span>;
    }
    if (tool === "image") {
      return (
        <>
          <span className="hs-hint">Click the surface to browse, or drop images straight on it.</span>
          <button type="button" className="hs-btn hs-btn--sm" onClick={() => fileRef.current?.click()}>
            <IcUpload className="hs-icon-sm" /> Browse
          </button>
        </>
      );
    }
    if (tool === "text") {
      return (
        <>
          <span className="hs-label" style={{ margin: 0 }}>{textLayer ? "Text layer" : "New text"}</span>
          <select className="hs-select" style={{ height: 28, fontSize: 11, width: 132 }} aria-label="Font"
            value={textVals.fontFamily} onChange={(e) => setText({ fontFamily: e.target.value })}>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input className="hs-input" type="number" style={num} min={8} max={800} aria-label="Font size"
            value={textVals.fontSize} onChange={(e) => setText({ fontSize: clamp(Number(e.target.value) || 8, 8, 800) })} />
          <select className="hs-select" style={{ height: 28, fontSize: 11, width: 78 }} aria-label="Font weight"
            value={textVals.fontWeight} onChange={(e) => setText({ fontWeight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <input type="color" style={swatch} aria-label="Text colour"
            value={textVals.color} onChange={(e) => setText({ color: e.target.value })} />
          <Segmented label="Alignment" value={textVals.align} onChange={(v) => setText({ align: v })}
            options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} />
        </>
      );
    }
    if (tool === "rect" || tool === "ellipse") {
      return (
        <>
          <span className="hs-label" style={{ margin: 0 }}>{shapeLayer ? "Shape layer" : "New shape"}</span>
          <span className="hs-hint">Fill</span>
          <input type="color" style={swatch} aria-label="Fill colour"
            value={shapeVals.fill === "transparent" ? "#000000" : shapeVals.fill}
            onChange={(e) => setShape({ fill: e.target.value })} />
          <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost" onClick={() => setShape({ fill: "transparent" })}>No fill</button>
          <span className="hs-hint">Stroke</span>
          <input type="color" style={swatch} aria-label="Stroke colour"
            value={shapeVals.stroke === "transparent" ? "#000000" : shapeVals.stroke}
            onChange={(e) => setShape({ stroke: e.target.value })} />
          <input className="hs-input" type="number" style={num} min={0} max={200} aria-label="Stroke width"
            value={shapeVals.strokeWidth} onChange={(e) => setShape({ strokeWidth: clamp(Number(e.target.value) || 0, 0, 200) })} />
          {(shapeLayer?.type ?? tool) === "rect" && (
            <>
              <span className="hs-hint">Radius</span>
              <input className="hs-input" type="number" style={num} min={0} max={400} aria-label="Corner radius"
                value={shapeVals.radius || 0} onChange={(e) => setShape({ radius: clamp(Number(e.target.value) || 0, 0, 400) })} />
            </>
          )}
        </>
      );
    }
    /* select — the document itself */
    return (
      <>
        <span className="hs-label" style={{ margin: 0 }}>Canvas</span>
        <input className="hs-input" type="number" style={num} min={16} max={8000} aria-label="Canvas width"
          value={scene.w} onChange={(e) => commit((s) => ({ ...s, w: clamp(Number(e.target.value) || 16, 16, 8000) }), "canvas-size")} />
        <span className="hs-mute" style={{ fontSize: 11 }}>×</span>
        <input className="hs-input" type="number" style={num} min={16} max={8000} aria-label="Canvas height"
          value={scene.h} onChange={(e) => commit((s) => ({ ...s, h: clamp(Number(e.target.value) || 16, 16, 8000) }), "canvas-size")} />
        <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>{trueRatio}</span>
        <select className="hs-select" style={{ height: 28, fontSize: 11, width: 150 }} aria-label="Size preset" value=""
          onChange={(e) => {
            const p = SIZE_PRESETS[Number(e.target.value)];
            if (!p) return;
            commit((s) => ({ ...s, w: p.w, h: p.h }));
            requestAnimationFrame(fit);
          }}>
          <option value="">Preset…</option>
          {SIZE_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
        </select>
        <span className="st-canvas__sep" style={{ width: 1, height: 20, margin: "0 2px" }} />
        <span className="hs-hint">Background</span>
        {BACKGROUNDS.map((c) => (
          <button key={c} type="button" aria-label={`Background ${c}`} aria-pressed={scene.bg === c}
            onClick={() => commit((s) => ({ ...s, bg: c }))}
            style={{
              width: 22, height: 22, borderRadius: "var(--r-xs)", flex: "none",
              border: scene.bg === c ? "2px solid var(--filament)" : "1px solid var(--line)",
              background: c === "transparent"
                ? "repeating-conic-gradient(rgba(255,255,255,0.14) 0% 25%, transparent 0% 50%) 50% / 8px 8px"
                : c,
            }} />
        ))}
      </>
    );
  })();

  /* ══════════════════════════════════════════════════════════════════════
     LAYER STACK — rendered once, placed in the aside and in the sheet
     ══════════════════════════════════════════════════════════════════════ */

  const [dragId, setDragId] = useState(null);
  const [dropId, setDropId] = useState(null);

  /* The row is a plain element on purpose. The previous build put `draggable`
     on a motion.div; framer-motion consumes `onDragStart` as a gesture prop,
     so it never reached the DOM, dataTransfer was never set and the drop
     handler bailed out — z-order could not be changed at all. */
  const onRowDragStart = (e, id) => {
    if (e.target.closest("button, select, input")) { e.preventDefault(); return; }
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onRowDragOver = (e, id) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropId(id);
  };
  const onRowDrop = (e, id) => {
    e.preventDefault();
    const source = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setDropId(null);
    if (!source || source === id) return;
    const target = sceneRef.current.layers.findIndex((l) => l.id === id);
    if (target < 0) return;
    moveTo(source, target);
  };

  const layerRow = (l, index) => {
    const active = l.id === selectedId;
    const entry = l.src ? images.current.get(l.src) : null;
    return (
      <div
        key={l.id}
        className={`st-layer${active ? " is-active" : ""}${l.visible === false ? " is-hidden" : ""}${dropId === l.id ? " is-drop" : ""}`}
        style={dragId === l.id ? { opacity: 0.4 } : undefined}
        role="option"
        aria-selected={active}
        tabIndex={0}
        draggable
        onDragStart={(e) => onRowDragStart(e, l.id)}
        onDragOver={(e) => onRowDragOver(e, l.id)}
        onDrop={(e) => onRowDrop(e, l.id)}
        onDragEnd={() => { setDragId(null); setDropId(null); }}
        onClick={() => setSelectedId(l.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(l.id); } }}
      >
        <button
          type="button"
          className="st-layer__eye"
          aria-label={l.visible === false ? `Show ${l.name}` : `Hide ${l.name}`}
          onClick={(e) => { e.stopPropagation(); patch(l.id, { visible: l.visible === false }); }}
        >
          {l.visible === false ? <IcEyeOff className="hs-icon-sm" /> : <IcEye className="hs-icon-sm" />}
        </button>

        {l.type === "image" && entry?.img
          ? <img className="st-layer__thumb" src={l.src} alt="" />
          : (
            <span className="st-layer__thumb" style={{ display: "grid", placeItems: "center", color: "var(--tx-mute)" }}>
              {l.type === "text" ? <IcText style={{ width: 13, height: 13 }} />
                : l.type === "ellipse" ? <IcEllipse style={{ width: 13, height: 13 }} />
                : l.type === "rect" ? <IcRect style={{ width: 13, height: 13 }} />
                : <IcImage style={{ width: 13, height: 13 }} />}
            </span>
          )}

        <span className="st-layer__body">
          <span className="st-layer__name">{l.name}{l.locked ? " · locked" : ""}</span>
          <select
            className="st-layer__role"
            aria-label={`Role for ${l.name}`}
            value={l.mask && l.mask !== "none" ? `mask:${l.mask}` : (l.role || "layout_reference")}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("mask:")) patch(l.id, { mask: v.slice(5) });
              else patch(l.id, { role: v, mask: "none" });
            }}
          >
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            {(l.type === "rect" || l.type === "ellipse") && (
              <>
                <option value="mask:include">Mask · include</option>
                <option value="mask:exclude">Mask · exclude</option>
              </>
            )}
          </select>
        </span>

        <span className="st-layer__acts">
          <button type="button" className="st-layer__act" aria-label={`Move ${l.name} up`} disabled={index === layers.length - 1}
            onClick={(e) => { e.stopPropagation(); moveBy(l.id, 1); }}>
            <IcChevron style={{ transform: "rotate(180deg)" }} />
          </button>
          <button type="button" className="st-layer__act" aria-label={`Move ${l.name} down`} disabled={index === 0}
            onClick={(e) => { e.stopPropagation(); moveBy(l.id, -1); }}>
            <IcChevron />
          </button>
        </span>
      </div>
    );
  };

  const layerProps = selected && (
    <div className="st-canvas__props">
      <div className="hs-row hs-row--between">
        <input
          className="hs-input"
          style={{ height: 30, fontSize: 12, flex: 1, minWidth: 0 }}
          aria-label="Layer name"
          value={selected.name}
          onChange={(e) => patch(selected.id, { name: e.target.value }, `name:${selected.id}`)}
        />
        <button type="button" className={`hs-btn hs-btn--sm hs-btn--icon${selected.locked ? " hs-btn--primary" : " hs-btn--ghost"}`}
          aria-label={selected.locked ? "Unlock layer" : "Lock layer"} aria-pressed={!!selected.locked}
          onClick={() => patch(selected.id, { locked: !selected.locked })}>
          <IcLock className="hs-icon-sm" />
        </button>
      </div>

      <div>
        <div className="hs-row hs-row--between">
          <span className="hs-label" style={{ margin: 0 }}>Opacity</span>
          <output className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>{Math.round((selected.opacity ?? 1) * 100)}%</output>
        </div>
        <input className="hs-range" type="range" min={0} max={100} value={Math.round((selected.opacity ?? 1) * 100)}
          aria-label="Layer opacity"
          onChange={(e) => patch(selected.id, { opacity: Number(e.target.value) / 100 }, `op:${selected.id}`)}
          onPointerUp={endGesture} />
      </div>

      <div className="hs-row" style={{ gap: "var(--s-2)" }}>
        <select className="hs-select" style={{ height: 30, fontSize: 11, flex: 1 }} aria-label="Blend mode"
          value={selected.blend || "normal"} onChange={(e) => patch(selected.id, { blend: e.target.value })}>
          {BLENDS.map((b) => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1).replace(/-/g, " ")}</option>)}
        </select>
        {selected.type === "image" && (
          <select className="hs-select" style={{ height: 30, fontSize: 11, width: 96 }} aria-label="Image fit"
            value={selected.fit || "cover"} onChange={(e) => patch(selected.id, { fit: e.target.value })}>
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="fill">Stretch</option>
          </select>
        )}
      </div>

      {selected.type === "text" && (
        <textarea
          className="hs-input hs-textarea"
          style={{ minHeight: 60, fontSize: 12 }}
          aria-label="Text content"
          value={selected.text || ""}
          onChange={(e) => patch(selected.id, { text: e.target.value }, `content:${selected.id}`)}
        />
      )}

      <div className="hs-row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
        <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
          {Math.round(selected.width)}×{Math.round(selected.height)} · {Math.round(selected.x)},{Math.round(selected.y)} · {Math.round(selected.rotation || 0)}°
        </span>
      </div>

      <div className="hs-row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
        <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost" onClick={() => duplicateLayer(selected.id)}>
          <IcCopy className="hs-icon-sm" /> Duplicate
        </button>
        <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost"
          disabled={layers.findIndex((l) => l.id === selected.id) <= 0 || !!busy}
          onClick={() => mergeDown(selected.id)}>
          <IcLayers className="hs-icon-sm" /> Merge down
        </button>
        <button type="button" className="hs-btn hs-btn--sm hs-btn--danger" onClick={() => removeLayer(selected.id)}>
          <IcTrash className="hs-icon-sm" /> Delete
        </button>
      </div>
    </div>
  );

  const layerStack = (
    <>
      <div className="st-canvas__layers-head">
        <span className="hs-label" style={{ margin: 0 }}>Layers</span>
        <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>{layers.length}</span>
      </div>

      <div className="st-canvas__layers-list" role="listbox" aria-label="Layers, top of the stack first">
        {layers.length === 0 && (
          <p className="hs-hint" style={{ padding: "var(--s-4)", textAlign: "center" }}>
            No layers yet. Drop an image on the surface, or draw one with a tool.
          </p>
        )}
        {layers.map((l, i) => layerRow(l, i))}
      </div>

      {layerProps}

      <div className="st-canvas__foot">
        <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost hs-btn--block"
          disabled={layers.filter((l) => l.visible !== false).length < 2 || !!busy}
          onClick={() => setConfirmFlatten(true)}>
          <IcLayers className="hs-icon-sm" /> Flatten visible
        </button>
      </div>
    </>
  );

  /* ══════════════════════════════════════════════════════════════════════
     SELECTION OVERLAY
     ══════════════════════════════════════════════════════════════════════ */

  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handlePos = {
    nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
    n: { left: "50%", top: "0%", cursor: "ns-resize" },
    ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
    e: { left: "100%", top: "50%", cursor: "ew-resize" },
    se: { left: "100%", top: "100%", cursor: "nwse-resize" },
    s: { left: "50%", top: "100%", cursor: "ns-resize" },
    sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
    w: { left: "0%", top: "50%", cursor: "ew-resize" },
  };

  const showFrame = selected && selected.visible !== false && tool === "select" && !editingId;

  /* Stable ref so React focuses the text box once, not on every repaint */
  const focusEditor = useCallback((el) => {
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════ */

  const cursor = tool === "hand" ? "grab"
    : tool === "select" ? "default"
    : tool === "image" ? "copy"
    : "crosshair";

  const saveLabel = saveState === "saving" ? "Saving…"
    : saveState === "error" ? saveError
    : dirty ? "Unsaved changes"
    : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Not saved yet";

  const editing = editingId ? layers.find((l) => l.id === editingId) : null;

  return (
    <div className="st-canvas">
      {/* ── Tool palette ─────────────────────────────────────────────── */}
      <div className="st-canvas__tools" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical">
        {TOOLS.map(({ id, label, key, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`st-canvas__tool${tool === id ? " is-active" : ""}`}
            aria-pressed={tool === id}
            title={`${label} (${key})`}
            aria-label={`${label} (${key})`}
            onClick={() => setTool(id)}
          >
            <Icon />
          </button>
        ))}

        <span className="st-canvas__sep" />

        <button type="button" className="st-canvas__tool" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <IcUndo />
        </button>
        <button type="button" className="st-canvas__tool" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <IcRedo />
        </button>
      </div>

      {/* ── Context bar ──────────────────────────────────────────────── */}
      <div className="st-canvas__topbar">
        {contextBar}

        <span className="hs-spread" />

        {busy && <span className="hs-row" style={{ gap: 6 }}><span className="hs-spin" style={{ width: 12, height: 12 }} /><span className="hs-hint">{busy}</span></span>}

        <input
          className="hs-input"
          style={{ height: 28, fontSize: 11, width: 150 }}
          aria-label="Document name"
          value={docName}
          onChange={(e) => { setDocName(e.target.value); setDirty(true); }}
          placeholder="Untitled"
        />
        <span className={saveState === "error" ? "hs-error" : "hs-mono"} style={{ fontSize: 10, color: saveState === "error" ? undefined : "var(--tx-mute)" }}>
          {saveLabel}
        </span>

        <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost st-canvas__layers-btn" onClick={() => setPanel("layers")}>
          <IcLayers className="hs-icon-sm" /> Layers
        </button>
        <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost" onClick={() => { setVersions(null); setPanel("files"); }}>
          <IcArchive className="hs-icon-sm" /> Documents
        </button>
        <button type="button" className="hs-btn hs-btn--sm" onClick={save} disabled={saveState === "saving"}>
          {saveState === "saving" ? <span className="hs-spin" style={{ width: 12, height: 12 }} /> : <IcCheck className="hs-icon-sm" />} Save
        </button>
        <button type="button" className="hs-btn hs-btn--sm" onClick={() => { setExportError(""); setPanel("export"); }} disabled={!layers.length}>
          <IcDownload className="hs-icon-sm" /> Export
        </button>
      </div>

      {/* ── Surface ──────────────────────────────────────────────────── */}
      <div
        ref={surfaceRef}
        className="st-canvas__surface"
        style={{ cursor }}
        onPointerDown={onSurfacePointerDown}
        onDoubleClick={onSurfaceDoubleClick}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      >
        <div
          ref={paperRef}
          className="st-canvas__paper is-zoomable"
          style={{
            width: scene.w * zoom,
            height: scene.h * zoom,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            background: scene.bg === "transparent" ? "transparent" : scene.bg,
          }}
        >
          <canvas ref={canvasRef} aria-label="Canvas composition" />

          {/* Shape being dragged out */}
          {draft && (
            <div className="st-canvas__marquee" style={{
              left: (draft.x) * zoom, top: (draft.y) * zoom,
              width: draft.w * zoom, height: draft.h * zoom,
              borderRadius: tool === "ellipse" ? "50%" : 2,
            }} />
          )}

          {/* Selection frame + handles, constant size at any zoom */}
          {showFrame && (
            <div
              className="st-canvas__frame"
              style={{
                left: selected.x * zoom, top: selected.y * zoom,
                width: selected.width * zoom, height: selected.height * zoom,
                transform: `rotate(${selected.rotation || 0}deg)`,
              }}
            >
              {!selected.locked && (
                <>
                  {handles.map((h) => (
                    <span
                      key={h}
                      className="st-canvas__handle"
                      style={handlePos[h]}
                      onPointerDown={(e) => startResize(e, selected.id, h)}
                    />
                  ))}
                  <span className="st-canvas__spin" onPointerDown={(e) => startRotate(e, selected.id)} />
                </>
              )}
            </div>
          )}

          {/* Text editing happens in the DOM at the same scale the canvas draws */}
          {editing && (
            <div
              ref={focusEditor}
              contentEditable
              suppressContentEditableWarning
              className="st-canvas__textedit"
              style={{
                position: "absolute",
                left: editing.x * zoom, top: editing.y * zoom,
                width: editing.width * zoom, height: editing.height * zoom,
                transform: `rotate(${editing.rotation || 0}deg)`,
                display: "flex", alignItems: "center",
                justifyContent: editing.align === "left" ? "flex-start" : editing.align === "right" ? "flex-end" : "center",
                textAlign: editing.align || "center",
                fontFamily: `"${editing.fontFamily || "Inter"}", system-ui, sans-serif`,
                fontSize: (editing.fontSize || 48) * zoom,
                fontWeight: editing.fontWeight || 700,
                lineHeight: editing.lineHeight || 1.2,
                color: editing.color || "#FFFFFF",
                outline: "1px dashed var(--filament)",
                overflow: "hidden",
                cursor: "text",
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                patch(editing.id, { text: e.currentTarget.innerText.replace(/ /g, " ") });
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") e.currentTarget.blur();
              }}
            >
              {editing.text}
            </div>
          )}
        </div>

        {/* Empty state */}
        {layers.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", padding: "var(--s-6)" }}>
            <div
              className="hs-empty"
              style={{ background: "rgba(8,8,12,0.78)", borderRadius: "var(--r-lg)", padding: "var(--s-6)", pointerEvents: "auto", maxWidth: 440 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="hs-empty__mark"><IcLayers /></span>
              <h3>Compose, then generate</h3>
              <p>Drop images on the surface, draw a region, or set a headline. Give every layer a role and the model is told what each one is for.</p>
              <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
                {EXAMPLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="hs-chip"
                    style={{ fontFamily: "var(--ff-ui)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}
                    title={e}
                    onClick={() => setPrompt(e)}
                  >
                    {e.length > 44 ? `${e.slice(0, 44)}…` : e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Zoom */}
        <div className="st-canvas__zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--ghost" aria-label="Zoom out" onClick={() => stepZoom(0.8)} disabled={zoom <= MIN_ZOOM}>
            <IcZoomOut className="hs-icon-sm" />
          </button>
          <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
          <button type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--ghost" aria-label="Zoom in" onClick={() => stepZoom(1.25)} disabled={zoom >= MAX_ZOOM}>
            <IcZoomIn className="hs-icon-sm" />
          </button>
          <button type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--ghost" aria-label="Fit to screen" title="Fit (Ctrl+0)" onClick={fit}>
            <IcFit className="hs-icon-sm" />
          </button>
        </div>
      </div>

      {/* ── Layer stack ──────────────────────────────────────────────── */}
      <aside className="st-canvas__layers" aria-label="Layer stack">
        {layerStack}
      </aside>

      {/* ── Dock ─────────────────────────────────────────────────────── */}
      <div className="st-canvas__dock st-canvas__dock--flush">
        <div className="st-canvas__dockhead">
          <button type="button" className="hs-btn hs-btn--sm" onClick={() => setPanel("models")}>
            <IcSpark className="hs-icon-sm" />
            {model ? (model.displayName || model.name) : loadingModels ? "Loading models…" : "Choose a model"}
          </button>
          <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
            {ratio} · {route.strategy.replace(/_/g, " ")}
          </span>
          <span className="hs-spread" />
          {unclean && (
            <span className="hs-badge hs-badge--caution" title={TAINT_MSG}>
              <IcAlert style={{ width: 11, height: 11 }} /> Export blocked
            </span>
          )}
        </div>

        {(notice || genNotice || warnings.length > 0 || genError) && (
          <div className="st-canvas__notices">
            {genError && <div className="hs-notice hs-notice--fault"><IcAlert className="hs-icon-sm" /><span>{genError}</span></div>}
            {notice && <div className="hs-notice hs-notice--fault"><IcAlert className="hs-icon-sm" /><span>{notice}</span></div>}
            {genNotice && <div className="hs-notice hs-notice--caution"><IcAlert className="hs-icon-sm" /><span>{genNotice}</span></div>}
            {warnings.map((w) => (
              <div key={w} className="hs-notice hs-notice--caution"><IcAlert className="hs-icon-sm" /><span>{w}</span></div>
            ))}
          </div>
        )}

        {result?.url && !generating && (
          <div className="st-canvas__result">
            <img src={result.url} alt="" />
            <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
              Placed on canvas · {elapsed}s{result.creditsUsed != null ? ` · ${result.creditsUsed}cr` : ""}
            </span>
            <span className="hs-spread" />
            <a className="hs-btn hs-btn--sm hs-btn--ghost" href={result.url} target="_blank" rel="noopener noreferrer">
              <IcExternal className="hs-icon-sm" /> Open
            </a>
            <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost" onClick={reset}>
              <IcRefresh className="hs-icon-sm" /> Clear
            </button>
          </div>
        )}

        <Brief
          value={prompt}
          onChange={setPrompt}
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          disabled={!model}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          submitLabel="Generate"
          placeholder={
            layers.length
              ? "Say what should change and what must stay. Layer roles carry the rest."
              : "Describe the image. Add layers to direct the composition."
          }
          onUpload={() => fileRef.current?.click()}
        />
      </div>

      {/* ── Hidden file input ────────────────────────────────────────── */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { takeFiles(e.target.files); e.target.value = ""; }}
      />

      {/* ── Layer stack, where the aside is hidden ───────────────────── */}
      <Sheet open={panel === "layers"} onClose={() => setPanel(null)} title="Layers">
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>{layerStack}</div>
      </Sheet>

      {/* ── Model ────────────────────────────────────────────────────── */}
      <Sheet open={panel === "models"} onClose={() => setPanel(null)} title="Model">
        <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
          <ModelPicker
            models={available}
            value={model?.id}
            onSelect={(id) => { setModelId(id); setPanel(null); }}
            loading={loadingModels}
            emptyHint="No image models in the catalog yet."
          />
          <Field label="Avoid" hint="Passed to the model as the negative prompt.">
            {(id) => (
              <textarea id={id} className="hs-input hs-textarea" style={{ minHeight: 64 }}
                value={negative} onChange={(e) => setNegative(e.target.value)}
                placeholder="text, watermark, extra fingers" />
            )}
          </Field>
          <label className="hs-row" style={{ gap: "var(--s-3)", cursor: "pointer" }}>
            <button type="button" role="switch" aria-checked={useGuide} className="hs-switch" onClick={() => setUseGuide((v) => !v)} />
            <span>
              <span style={{ fontSize: "var(--t-sm)" }}>Send the composition as a guide</span>
              <span className="hs-hint" style={{ display: "block" }}>
                Flattens every visible layer to one image and sends it to the edit model. Off means only the first reference is sent.
              </span>
            </span>
          </label>
        </div>
      </Sheet>

      {/* ── Documents + version history ──────────────────────────────── */}
      <Modal open={panel === "files"} onClose={() => { setPanel(null); setVersions(null); }} title={versions ? `History · ${versions.name}` : "Documents"}>
        {versions ? (
          <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
            <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost" style={{ alignSelf: "flex-start" }} onClick={() => setVersions(null)}>
              <IcChevron style={{ transform: "rotate(90deg)", width: 14, height: 14 }} /> All documents
            </button>
            {versions.list === null && <div className="hs-skel" style={{ height: 44 }} />}
            {versions.error && <div className="hs-notice hs-notice--fault"><IcAlert className="hs-icon-sm" /><span>{versions.error}</span></div>}
            {versions.list?.length === 0 && <p className="hs-hint">No saved versions yet. Every save writes one.</p>}
            {versions.list?.map((v) => (
              <div key={v.id} className="hs-card" style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-3)" }}>
                <span className="hs-mono" style={{ fontSize: 11, color: "var(--filament-lit)" }}>v{v.version}</span>
                <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
                  {v.createdAt ? new Date(v.createdAt).toLocaleString() : ""}
                </span>
                <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
                  {v.content?.layers?.length ?? 0} layers
                </span>
                <span className="hs-spread" />
                <button type="button" className="hs-btn hs-btn--sm" onClick={() => restoreVersion(v)}>Restore</button>
              </div>
            ))}
            <p className="hs-hint">Restoring loads that version into the editor. Nothing is overwritten until you save, and saving writes a new version.</p>
          </div>
        ) : (
          <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
            <button type="button" className="hs-btn hs-btn--sm" style={{ alignSelf: "flex-start" }} onClick={requestNew}>
              <IcPlus className="hs-icon-sm" /> New document
            </button>
            {docs.length === 0 && <p className="hs-hint">No saved documents yet. Save this one to start a history.</p>}
            {docs.map((d) => (
              <div key={d.id} className={`hs-card${d.id === docId ? " hs-card--active" : ""}`} style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-3)" }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: "var(--t-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.name || "Untitled"}
                  </span>
                  <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
                    {d.content?.layers?.length ?? 0} layers · {d.content?.width ?? 1080}×{d.content?.height ?? 1080}
                    {d.updatedAt ? ` · ${new Date(d.updatedAt).toLocaleDateString()}` : ""}
                  </span>
                </span>
                <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost" onClick={() => openVersions(d)}>
                  <IcHistory className="hs-icon-sm" /> History
                </button>
                <button type="button" className="hs-btn hs-btn--sm" onClick={() => requestOpen(d)}>Open</button>
                <button type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger" aria-label={`Delete ${d.name || "Untitled"}`} onClick={() => deleteDoc(d.id)}>
                  <IcTrash className="hs-icon-sm" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ── Export ───────────────────────────────────────────────────── */}
      <Modal
        open={panel === "export"}
        onClose={() => setPanel(null)}
        title="Export"
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setPanel(null)}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary" onClick={doExport} disabled={exporting}>
              {exporting ? <span className="hs-spin" style={{ width: 12, height: 12 }} /> : <IcDownload className="hs-icon-sm" />}
              {exporting ? "Exporting" : `Export ${format.toUpperCase()}`}
            </button>
          </>
        }
      >
        <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
          {exportError && <div className="hs-notice hs-notice--fault"><IcAlert className="hs-icon-sm" /><span>{exportError}</span></div>}
          {unclean && !exportError && (
            <div className="hs-notice hs-notice--caution"><IcAlert className="hs-icon-sm" /><span>{TAINT_MSG}</span></div>
          )}

          <Field label="Format">
            <Segmented value={format} onChange={setFormat} label="Format"
              options={[{ value: "png", label: "PNG" }, { value: "jpg", label: "JPEG" }, { value: "webp", label: "WebP" }]} />
          </Field>

          {format !== "png" && (
            <div className="hs-field">
              <div className="hs-row hs-row--between">
                <span className="hs-label" style={{ margin: 0 }}>Quality</span>
                <output className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>{Math.round(quality * 100)}%</output>
              </div>
              <input className="hs-range" type="range" min={0.1} max={1} step={0.02} value={quality} aria-label="Quality"
                onChange={(e) => setQuality(Number(e.target.value))} />
            </div>
          )}

          <div className="hs-field">
            <div className="hs-row hs-row--between">
              <span className="hs-label" style={{ margin: 0 }}>Scale</span>
              <output className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>{exportScale}×</output>
            </div>
            <input className="hs-range" type="range" min={0.25} max={4} step={0.25} value={exportScale} aria-label="Scale"
              onChange={(e) => setExportScale(Number(e.target.value))} />
          </div>

          <p className="hs-mono" style={{ fontSize: 11, color: "var(--tx-mute)" }}>
            {Math.round(scene.w * exportScale)}×{Math.round(scene.h * exportScale)} px
            {format === "jpg" && scene.bg === "transparent" ? " · JPEG has no alpha, so transparency exports white" : ""}
          </p>
        </div>
      </Modal>

      {/* ── Destructive confirmations ────────────────────────────────── */}
      <Confirm
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        onConfirm={newDoc}
        title="Start a new document?"
        body={`"${docName}" has changes that are not saved. Starting a new document discards them.`}
        confirmLabel="Discard and start"
      />
      <Confirm
        open={!!pendingOpen}
        onClose={() => setPendingOpen(null)}
        onConfirm={() => { if (pendingOpen) openDoc(pendingOpen); setPendingOpen(null); }}
        title="Open another document?"
        body={`"${docName}" has changes that are not saved. Opening another document discards them.`}
        confirmLabel="Discard and open"
      />
      <Confirm
        open={confirmFlatten}
        onClose={() => setConfirmFlatten(false)}
        onConfirm={flatten}
        title="Flatten the visible layers?"
        body="Every visible layer is composited into one image layer. Hidden layers are kept. Undo reverses it."
        confirmLabel="Flatten"
        danger={false}
      />
    </div>
  );
}
