"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconSparkle, IconBolt, IconClose, IconImage, IconDownload,
  IconArrowUpRight, IconChevron,
} from "@/components/Icons";

const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
const EASE = [0.32, 0.72, 0, 1];

// Shared hook: respect prefers-reduced-motion (spec §5.6).
// Returns true when the user has requested reduced motion.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

const TIER_LABEL = { fast: "Fast", premium: "Premium", standard: "Standard" };
const TIER_BARS = { fast: 1, premium: 3, standard: 2 };
const MODEL_ART = [
  "/assets/warrior_girl_e29532086b-40.webp",
  "/assets/photo-1620121692029-d088224ddc74-11.webp",
  "/assets/photo-1506905925346-21bda4d32df4-6.webp",
  "/assets/photo-1502920917128-1aa500764cbd-8.webp",
  "/assets/J6-BrUzggQUXdbktr9GcH_ZYLM1F22-13.webp",
  "/assets/ai_cinematic_video_generator_hero_image_0f96f59168-41.webp",
];

const STAGES = ["preparing", "submitting", "generating", "processing", "quality_check", "finalizing"];
const STAGE_LABELS = {
  preparing: "Preparing",
  submitting: "Submitting",
  generating: "Generating",
  processing: "Processing",
  quality_check: "Quality Check",
  finalizing: "Finalizing",
};

function formatTimer(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const PROGRESS_STAGES = [
  { key: "preparing", label: "Preparing", icon: IconSparkle },
  { key: "generating", label: "Generating", icon: IconBolt },
  { key: "finalizing", label: "Finalizing", icon: IconImage },
];

// ── PromptComposer ──────────────────────────────────────────
export function PromptComposer({
  value,
  onChange,
  placeholder = "Describe what you want to create…",
  showNegative = false,
  negativeValue = "",
  onNegativeChange,
  charCount,
  charLimit = 2000,
  children,
}) {
  const count = charCount ?? value.length;
  const charClass =
    count > charLimit
      ? "studio__composer-count--limit"
      : count > charLimit * 0.85
        ? "studio__composer-count--warn"
        : "";

  return (
    <div className="studio__composer-premium" style={{ flex: 1 }}>
      <div className="studio__composer-premium-inner">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="studio__composer-premium-textarea"
        />
        <div className="studio__composer-premium-foot">
          <span className={`studio__composer-count ${charClass}`}>
            <span className="studio__composer-count-dot" />
            {count} / {charLimit}
          </span>
          <div className="studio__composer-foot-actions">{children}</div>
        </div>
      </div>
      {showNegative && (
        <motion.div
          className="studio__neg-wrap"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING}
        >
          <textarea
            value={negativeValue}
            onChange={(e) => onNegativeChange?.(e.target.value)}
            placeholder="What to avoid: text, watermark, blur…"
            className="studio__composer-premium-textarea studio__neg-textarea"
            rows={2}
          />
        </motion.div>
      )}
    </div>
  );
}

// ── ModelSelector ───────────────────────────────────────────
export function ModelSelector({ models = [], selected, onSelect, recommended, search: searchProp }) {
  const [internalSearch, setInternalSearch] = useState("");
  const search = searchProp ?? internalSearch;
  const setSearch = searchProp ? searchProp[1] : setInternalSearch;

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );
  })();

  return (
    <div className="studio__models-list" style={{ paddingTop: 12 }}>
      {searchProp && (
        <div className="studio__models-search" style={{ marginBottom: 10 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            className="studio__models-search-input"
          />
        </div>
      )}
      {filtered.map((m) => {
        const bars = TIER_BARS[m.speedTier] || 2;
        const active = m.id === selected;
        const artIndex = [...String(m.id)].reduce((total, char) => total + char.charCodeAt(0), 0) % MODEL_ART.length;
        const backgroundImage = m.backgroundImage || m.image || m.thumbnailUrl || MODEL_ART[artIndex];
        const aspectRatios = m.aspectRatios || [];
        const resolutions = m.resolutions || [];
        const durations = m.durations || [];
        return (
          <motion.button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.99 }}
            transition={SPRING}
            className={`studio__model-card ${active ? "studio__model-card--active" : ""} ${m.incompatible ? "studio__model-card--disabled" : ""}`}
            disabled={m.incompatible}
            aria-pressed={active}
            style={{ backgroundImage: `linear-gradient(180deg, rgba(9,7,12,.12), rgba(9,7,12,.96)), url("${backgroundImage}")` }}
          >
            <div className="studio__model-card-head">
              <span className="studio__model-card-title">
                <span className="studio__provider-dot" style={{ background: m.providerColor || "#FF1B6B" }} />
                {m.displayName}
                {m.id === recommended && <span className="studio__badge studio__badge--rec">Rec</span>}
              </span>
              {m.speedTier && (
                <span className={`studio__model-card-tier studio__model-card-tier--${m.speedTier}`}>
                  {TIER_LABEL[m.speedTier]}
                </span>
              )}
            </div>
            <div className="studio__model-card-speed" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`studio__model-card-speed-bar ${i < bars ? "studio__model-card-speed-bar--on" : ""}`}
                />
              ))}
            </div>
            <div className="studio__model-card-foot">
              <span className="studio__model-card-provider">{m.provider}</span>
              <span className="studio__model-card-cost">
                {active && m.credits ? (
                  <>
                    <IconBolt className="studio__model-card-cost-icon" />
                    <span className="studio__model-card-cost-value">{m.credits}</span>
                    <span className="studio__model-card-cost-unit">cr</span>
                  </>
                ) : (
                  <span className="studio__model-card-cost-unit">{
                    m.incompatible ? (m.reason || "N/A") : "— cr"
                  }</span>
                )}
              </span>
            </div>
            <div className="studio__model-card-capabilities">
              {resolutions.slice(0, 2).map((value) => <span key={value}>{value}</span>)}
              {durations.slice(0, 2).map((value) => <span key={value}>{value}s</span>)}
              {aspectRatios.slice(0, 2).map((value) => <span key={value}>{value}</span>)}
            </div>
            {m.incompatible && m.reason && (
              <div style={{ fontSize: 10, color: "#ff4444" }}>{m.reason}</div>
            )}
          </motion.button>
        );
      })}
      {filtered.length === 0 && (
        <p className="studio__models-empty">No models match “{search}”.</p>
      )}
    </div>
  );
}

// ── CostQuote ───────────────────────────────────────────────
export function CostQuote({ estimated, maximum, balance, onGenerate, onCancel, generating, topUpPacks = [], shortfall = 0 }) {
  const after = (balance || 0) - estimated;
  const canAfford = after >= 0;
  return (
    <motion.div
      className="studio__quote studio__glass"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div className="studio__quote-row">
        <span>Estimated cost</span>
        <span className="studio__quote-value">{estimated.toLocaleString()} credits</span>
      </div>
      {maximum && maximum !== estimated && (
        <div className="studio__quote-row studio__quote-row--sub">
          <span>Maximum</span>
          <span>{maximum.toLocaleString()} credits</span>
        </div>
      )}
      <div className="studio__quote-divider" />
      <div className="studio__quote-row">
        <span>Balance</span>
        <span className={canAfford ? "studio__text-green" : "studio__text-red"}>
          {(balance || 0).toLocaleString()} → {after.toLocaleString()}
        </span>
      </div>
      {!canAfford && (
        <div className="studio__quote-warning">
          Insufficient credits. Need {Math.abs(after).toLocaleString()} more.
        </div>
      )}
      <div className="studio__quote-actions">
        <button type="button" onClick={onCancel} disabled={generating} className="studio__btn studio__btn--ghost">
          Cancel
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canAfford || generating}
          className="studio__btn studio__btn--primary"
        >
          {generating ? "Generating…" : `Generate — ${estimated.toLocaleString()}`}
        </button>
      </div>
    </motion.div>
  );
}

// ── GenerateButton ──────────────────────────────────────────
export function GenerateButton({ onClick, disabled, generating, stage, credits }) {
  const stages = {
    preparing: "Preparing…",
    submitting: "Submitting…",
    generating: "Generating…",
    processing: "Processing…",
    quality_check: "Quality check…",
    finalizing: "Finalizing…",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled || generating} className="studio__generate">
      {generating ? (
        <>
          <span className="studio__spinner" style={{ width: 16, height: 16 }} />
          {stages[stage] || stage || "Working…"}
        </>
      ) : (
        <>
          <IconSparkle className="studio__generate-icon" />
          Generate
          {credits > 0 && (
            <span className="studio__generate-cost">
              <IconBolt style={{ width: 11, height: 11 }} /> {credits} cr
            </span>
          )}
        </>
      )}
    </button>
  );
}

// ── AssetPicker ─────────────────────────────────────────────
export function AssetPicker({ assets = [], max = 4, onAdd, onRemove, onSetRole }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const roles = ["reference", "product", "style", "identity", "background", "first_frame", "last_frame"];

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files);
    },
    [onAdd],
  );

  return (
    <div className="studio__asset-picker">
      <div className="studio__asset-picker-header">
        <span>References ({assets.length}/{max})</span>
        {assets.length < max && (
          <button type="button" onClick={() => inputRef.current?.click()} className="studio__link">
            + Add
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => e.target.files && onAdd(e.target.files)}
        hidden
      />

      {assets.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="studio__asset-dropzone"
          style={dragOver ? { borderColor: "var(--color-brand)", background: "rgba(255,27,107,0.06)" } : undefined}
        >
          <IconImage style={{ width: 24, height: 24 }} />
          <span>Drop images or click to upload</span>
        </button>
      ) : (
        <div className="studio__asset-grid">
          {assets.map((a) => (
            <div key={a.id} className="studio__asset-thumb">
              {a.url ? (
                <img src={a.url} alt="" />
              ) : (
                <div className="studio__asset-placeholder">{a.file?.name || "Asset"}</div>
              )}
              <button type="button" onClick={() => onRemove(a.id)} className="studio__asset-remove">
                <IconClose style={{ width: 10, height: 10 }} />
              </button>
              {onSetRole && (
                <select
                  value={a.role || "reference"}
                  onChange={(e) => onSetRole(a.id, e.target.value)}
                  className="studio__asset-role"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── StagedProgress ──────────────────────────────────────────
export function StagedProgress({ stage, progress, message, elapsed }) {
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    let frame;
    let time = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height / 2;
      context.clearRect(0, 0, width, height);
      const halo = context.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.48);
      halo.addColorStop(0, "rgba(255,65,111,.24)");
      halo.addColorStop(.42, "rgba(255,27,107,.08)");
      halo.addColorStop(1, "rgba(255,27,107,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);
      for (let ring = 0; ring < 4; ring++) {
        const radius = 34 + ring * 28 + Math.sin(time * .018 + ring) * 5;
        context.beginPath();
        context.strokeStyle = `rgba(255, ${72 + ring * 24}, ${126 + ring * 16}, ${.4 - ring * .065})`;
        context.lineWidth = ring === 0 ? 1.6 : .8;
        context.setLineDash(ring % 2 ? [3, 9] : []);
        context.arc(cx, cy, radius, time * .008 * (ring % 2 ? -1 : 1), Math.PI * 2 + time * .008);
        context.stroke();
      }
      context.setLineDash([]);
      for (let point = 0; point < 22; point++) {
        const angle = point * .83 + time * .006 * (point % 3 + 1);
        const radius = 25 + (point * 17) % Math.max(48, Math.min(width, height) * .42);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * .54;
        context.beginPath();
        context.fillStyle = `rgba(255, ${110 + point * 4}, ${155 + point * 3}, ${.25 + (point % 4) * .12})`;
        context.arc(x, y, 1 + point % 3, 0, Math.PI * 2);
        context.fill();
      }
      time += reduced ? 0 : 1;
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div className="studio__synthesis">
      <canvas ref={canvasRef} className="studio__synthesis-canvas" aria-hidden="true" />
      <div className="studio__synthesis-core" aria-hidden="true"><span /><span /></div>
      <div className="studio__synthesis-meta">
        <span className="studio__progress-stage-label">
          {STAGE_LABELS[stage] || stage}…
        </span>
        {elapsed !== undefined && (
          <span className="studio__progress-timer">
            <span className="studio__progress-timer-dot" />
            {formatTimer(elapsed)}
          </span>
        )}
      </div>
      {message && <p className="studio__progress-msg-premium">{message}</p>}
      <p className="studio__synthesis-note">The generation engine is resolving composition, motion and output quality.</p>
    </div>
  );
}

// ── BasicAdvancedToggle ─────────────────────────────────────
export function BasicAdvancedToggle({ mode, onChange }) {
  return (
    <div className="studio__toggle">
      {["basic", "advanced"].map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`studio__toggle-btn ${mode === m ? "studio__toggle-btn--active" : ""}`}
        >
          {m === "basic" ? "Basic" : "Advanced"}
        </button>
      ))}
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────
// Consistent idle/empty state for every workspace center pane.
export function EmptyState({ Icon, title, description, tips = [], children }) {
  const reduced = useReducedMotion();
  return (
    <div className="studio__empty" style={{ maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
      {Icon && (
        <motion.div
          className="studio__empty-glyph"
          animate={reduced ? {} : { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
          transition={reduced ? { duration: 0 } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon className="studio__empty-glyph-icon" />
        </motion.div>
      )}
      <h3 className="studio__empty-title">{title}</h3>
      <p className="studio__empty-desc">{description}</p>
      {tips.length > 0 && (
        <motion.p
          className="studio__empty-tip"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          {tips[0]}
        </motion.p>
      )}
      {children}
    </div>
  );
}

// ── ResultCard ──────────────────────────────────────────────
// Unified result card for image/video/audio outputs. Provides download,
// send-to-tool, save-to-project, and reuse actions (spec §40 actions).
const TOOL_ROUTES = {
  image: "/studio/image",
  video: "/studio/video",
  audio: "/studio/audio",
  canvas: "/studio/canvas",
  director: "/studio/director",
  lipsync: "/studio/lipsync",
  recast: "/studio/body-swap",
  "body-swap": "/studio/body-swap",
  influencer: "/studio/influencer",
};

export function ResultCard({ result, type = "image", credits, model, actions = [], onAction }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;

  const url = result.url || result.outputs?.[0] || result;
  const isVideo = type === "video" || /\.(mp4|webm|mov)$/i.test(url);
  const isAudio = type === "audio" || /\.(mp3|wav|ogg)$/i.test(url);

  const defaultActions = [
    { id: "download", label: "Download", icon: "↓" },
    { id: "canvas", label: "Add to Canvas", icon: "CA" },
    { id: "reference", label: "Use as reference", icon: "↻" },
    ...(isVideo || isVideo === false && !isAudio ? [{ id: "animate", label: "Animate", icon: "AN" }] : []),
    ...(type === "image" ? [{ id: "lipsync", label: "Lip Sync", icon: "LS" }, { id: "recast", label: "Recast", icon: "RC" }] : []),
    { id: "analyze", label: "Analyze", icon: "AN" },
    { id: "brand", label: "Add to Brand Kit", icon: "BK" },
  ];
  const allActions = actions.length ? actions : defaultActions;

  return (
    <motion.div
      className="studio__result-card studio__glass"
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING }}
    >
      <div className="studio__result-preview">
        {isVideo ? (
          <video src={url} controls loop muted playsInline />
        ) : isAudio ? (
          <audio src={url} controls />
        ) : (
          <img src={url} alt="generation result" />
        )}
      </div>
      <div className="studio__result-meta">
        {model && <span className="studio__result-model">{model}</span>}
        {credits != null && (
          <span className="studio__result-cost">
            <IconBolt style={{ width: 11, height: 11 }} /> {credits} cr
          </span>
        )}
        <button
          className="studio__link"
          onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
      <div className="studio__result-actions">
        {allActions.map((a) => (
          <button
            key={a.id}
            className="studio__chip studio__chip--action"
            onClick={() => onAction?.(a.id, url)}
            title={a.label}
          >
            <span aria-hidden>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── WorkspaceShell ──────────────────────────────────────────
// The canonical three-pane layout every Studio workspace composes.
// Desktop: Inputs (240px) · Center (flex) · Inspector (240px) + bottom bar.
// Mobile: Inputs → bottom sheet, Inspector → drawer, bottom bar stays.
export function WorkspaceShell({
  title,
  Icon,
  mode,
  onModeChange,
  inputs,
  inspector,
  children,
  bottomBar,
  sheetTitle = "Settings",
  drawerTitle = "Inspector",
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="studio__workspace">
      {/* Desktop left — inputs */}
      <aside className="studio__pane studio__pane--inputs">
        <div className="studio__pane-head">
          <span className="studio__pane-title">{title}</span>
          {onModeChange && <BasicAdvancedToggle mode={mode} onChange={onModeChange} />}
        </div>
        <div className="studio__pane-body">{inputs}</div>
      </aside>

      {/* Center — canvas/preview + bottom bar */}
      <main className="studio__pane studio__pane--center">
        <div className="studio__pane-center-topbar">
          {/* Mobile controls */}
          <button className="studio__pane-mobile-btn md:hidden" onClick={() => setSheetOpen(true)}>
            <IconImage style={{ width: 16, height: 16 }} /> Settings
          </button>
          <button className="studio__pane-mobile-btn md:hidden" onClick={() => setDrawerOpen(true)}>
            <IconSparkle style={{ width: 16, height: 16 }} /> Inspector
          </button>
        </div>
        <div className="studio__pane-canvas">{children}</div>
        {bottomBar && <div className="studio__pane-bottom">{bottomBar}</div>}
      </main>

      {/* Desktop right — inspector */}
      <aside className="studio__pane studio__pane--inspector">
        <div className="studio__pane-head">
          <span className="studio__pane-title">Inspector</span>
        </div>
        <div className="studio__pane-body">{inspector}</div>
      </aside>

      {/* Mobile bottom sheet for inputs */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div className="studio__sheet-backdrop md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheetOpen(false)} />
            <motion.div
              className="studio__sheet md:hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ ...SPRING }}
            >
              <div className="studio__sheet-handle" onClick={() => setSheetOpen(false)} />
              <div className="studio__sheet-title">{sheetTitle}</div>
              {onModeChange && <div style={{ marginBottom: 12 }}><BasicAdvancedToggle mode={mode} onChange={onModeChange} /></div>}
              <div className="studio__sheet-body">{inputs}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile drawer for inspector */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div className="studio__sheet-backdrop md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)} />
            <motion.div
              className="studio__drawer md:hidden"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ ...SPRING }}
            >
              <div className="studio__drawer-head">
                <span>{drawerTitle}</span>
                <button onClick={() => setDrawerOpen(false)}><IconClose style={{ width: 16, height: 16 }} /></button>
              </div>
              <div className="studio__sheet-body">{inspector}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── KeyboardHint ────────────────────────────────────────────
export function KeyboardHint({ keys, label }) {
  return (
    <span className="studio__kbd-hint">
      {keys.map((k, i) => (
        <kbd key={i} className="studio__kbd">{k}</kbd>
      ))}
      <span className="studio__kbd-label">{label}</span>
    </span>
  );
}
