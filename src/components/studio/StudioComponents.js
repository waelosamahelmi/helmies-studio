"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconSparkle, IconBolt, IconClose, IconImage, IconDownload,
  IconArrowUpRight, IconChevron,
} from "@/components/Icons";

const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
const EASE = [0.32, 0.72, 0, 1];

const TIER_LABEL = { fast: "Fast", premium: "Premium", standard: "Standard" };
const TIER_BARS = { fast: 1, premium: 3, standard: 2 };

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
  const idx = Math.max(0, STAGES.indexOf(stage));
  const activeIdx = idx === -1 ? 0 : idx;

  return (
    <div className="studio__progress-premium">
      <div className="studio__progress-stages-premium">
        {PROGRESS_STAGES.map((s, i) => {
          const StageIcon = s.icon;
          const mappedIdx = activeIdx <= 1 ? 0 : activeIdx <= 4 ? 1 : 2;
          const state = i < mappedIdx ? "done" : i === mappedIdx ? "active" : "idle";
          return (
            <div className="studio__progress-stage-premium" key={s.key}>
              <span
                className={`studio__progress-stage-icon ${
                  state === "done"
                    ? "studio__progress-stage-icon--done"
                    : state === "active"
                      ? "studio__progress-stage-icon--active"
                      : ""
                }`}
              >
                {state === "done" ? "✓" : <StageIcon />}
              </span>
              {i < PROGRESS_STAGES.length - 1 && (
                <span
                  className={`studio__progress-stage-connector ${
                    i < mappedIdx
                      ? "studio__progress-stage-connector--done"
                      : i === mappedIdx
                        ? "studio__progress-stage-connector--active"
                        : ""
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {progress !== undefined && (
        <div className="studio__progress-bar-premium">
          <div
            className="studio__progress-fill-premium"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      <div className="studio__progress-meta">
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