"use client";

// Helmies Studio — Shared Studio Components
// Reusable: PromptComposer, ModelSelector, CostQuote, GenerateButton, AssetPicker, StagedProgress
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconSparkle, IconBolt, IconClose, IconImage } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

// ── PromptComposer ──────────────────────────────────────────
export function PromptComposer({ value, onChange, placeholder = "Describe what you want to create...", showNegative = false, negativeValue = "", onNegativeChange, children }) {
  return (
    <div className="studio__composer">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="studio__composer-input"
      />
      {showNegative && (
        <input
          type="text"
          value={negativeValue}
          onChange={(e) => onNegativeChange?.(e.target.value)}
          placeholder="Negative prompt — what to avoid..."
          className="studio__composer-negative"
        />
      )}
      <div className="studio__composer-actions">
        {children}
      </div>
    </div>
  );
}

// ── ModelSelector ───────────────────────────────────────────
export function ModelSelector({ models = [], selected, onSelect, recommended }) {
  const [open, setOpen] = useState(false);

  const current = models.find((m) => m.id === selected);

  return (
    <div className="studio__model-select">
      <button
        onClick={() => setOpen(!open)}
        className="studio__model-select-btn"
      >
        <span className="studio__model-select-label">
          {current ? current.displayName : "Select model"}
        </span>
        {current?.speedTier && (
          <span className={`studio__badge studio__badge--${current.speedTier}`}>
            {current.speedTier}
          </span>
        )}
        <IconBolt className="studio__model-select-chevron" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="studio__model-dropdown"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => { onSelect(m.id); setOpen(false); }}
                disabled={m.incompatible}
                className={`studio__model-option ${m.id === selected ? "studio__model-option--active" : ""} ${m.incompatible ? "studio__model-option--disabled" : ""}`}
              >
                <div className="studio__model-option-info">
                  <span className="studio__model-option-name">
                    {m.displayName}
                    {m.id === recommended && <span className="studio__badge studio__badge--rec">Rec</span>}
                  </span>
                  <span className="studio__model-option-provider">{m.provider}</span>
                </div>
                <div className="studio__model-option-meta">
                  {m.speedTier && <span className={`studio__badge studio__badge--${m.speedTier}`}>{m.speedTier}</span>}
                  <span className="studio__model-option-cost">{m.credits} cr</span>
                </div>
                {m.incompatible && m.reason && (
                  <div className="studio__model-option-reason">{m.reason}</div>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {open && <div className="studio__overlay" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ── CostQuote ───────────────────────────────────────────────
export function CostQuote({ estimated, maximum, balance, onGenerate, onCancel, generating }) {
  const after = balance - estimated;
  const canAfford = after >= 0;

  return (
    <motion.div
      className="studio__quote"
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
          {balance.toLocaleString()} → {after.toLocaleString()}
        </span>
      </div>
      {!canAfford && (
        <div className="studio__quote-warning">
          Insufficient credits. Need {Math.abs(after).toLocaleString()} more.
        </div>
      )}
      <div className="studio__quote-actions">
        <button onClick={onCancel} disabled={generating} className="studio__btn studio__btn--ghost">Cancel</button>
        <button onClick={onGenerate} disabled={!canAfford || generating} className="studio__btn studio__btn--primary">
          {generating ? "Generating..." : `Generate — ${estimated.toLocaleString()}`}
        </button>
      </div>
    </motion.div>
  );
}

// ── GenerateButton ──────────────────────────────────────────
export function GenerateButton({ onClick, disabled, generating, stage, credits }) {
  const stages = { preparing: "Preparing...", submitting: "Submitting...", generating: "Generating...", processing: "Processing...", quality_check: "Quality check...", finalizing: "Finalizing..." };

  return (
    <button
      onClick={onClick}
      disabled={disabled || generating}
      className="studio__btn studio__btn--primary studio__btn--generate"
    >
      {generating ? (
        <>
          <span className="studio__spinner" />
          {stages[stage] || stage || "Working..."}
        </>
      ) : (
        <>
          <IconSparkle />
          Generate
          {credits > 0 && <span className="studio__btn-cost">{credits} cr</span>}
        </>
      )}
    </button>
  );
}

// ── AssetPicker ─────────────────────────────────────────────
export function AssetPicker({ assets = [], max = 4, onAdd, onRemove, onSetRole }) {
  const inputRef = useRef(null);
  const roles = ["reference", "product", "style", "identity", "background", "first_frame", "last_frame"];

  return (
    <div className="studio__asset-picker">
      <div className="studio__asset-picker-header">
        <span>References ({assets.length}/{max})</span>
        {assets.length < max && (
          <button onClick={() => inputRef.current?.click()} className="studio__link">+ Add</button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple onChange={(e) => e.target.files && onAdd(e.target.files)} hidden />

      {assets.length === 0 ? (
        <button onClick={() => inputRef.current?.click()} className="studio__asset-dropzone">
          <IconImage />
          <span>Drop images or click</span>
        </button>
      ) : (
        <div className="studio__asset-grid">
          {assets.map((a) => (
            <div key={a.id} className="studio__asset-thumb">
              {a.url ? <img src={a.url} alt="" /> : <div className="studio__asset-placeholder">{a.file?.name || "Asset"}</div>}
              <button onClick={() => onRemove(a.id)} className="studio__asset-remove"><IconClose /></button>
              {onSetRole && (
                <select value={a.role || "reference"} onChange={(e) => onSetRole(a.id, e.target.value)} className="studio__asset-role">
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
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
const STAGES = ["preparing", "submitting", "generating", "processing", "quality_check", "finalizing"];
const STAGE_LABELS = { preparing: "Preparing", submitting: "Submitting", generating: "Generating", processing: "Processing", quality_check: "Quality Check", finalizing: "Finalizing" };

export function StagedProgress({ stage, progress, message }) {
  const idx = STAGES.indexOf(stage);

  return (
    <div className="studio__progress">
      <div className="studio__progress-stages">
        {STAGES.map((s, i) => (
          <div key={s} className="studio__progress-stage-wrap">
            <div className={`studio__progress-dot ${i < idx ? "studio__progress-dot--done" : i === idx ? "studio__progress-dot--active" : ""}`} />
            {i < STAGES.length - 1 && <div className={`studio__progress-line ${i < idx ? "studio__progress-line--done" : ""}`} />}
          </div>
        ))}
      </div>
      <div className="studio__progress-label">
        {STAGE_LABELS[stage] || stage}
        {progress !== undefined && <span>{Math.round(progress * 100)}%</span>}
      </div>
      {progress !== undefined && (
        <div className="studio__progress-bar">
          <motion.div className="studio__progress-fill" initial={{ width: 0 }} animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ duration: 0.5, ease: EASE }} />
        </div>
      )}
      {message && <p className="studio__progress-msg">{message}</p>}
    </div>
  );
}

// ── BasicAdvancedToggle ─────────────────────────────────────
export function BasicAdvancedToggle({ mode, onChange }) {
  return (
    <div className="studio__toggle">
      <button onClick={() => onChange("basic")} className={`studio__toggle-btn ${mode === "basic" ? "studio__toggle-btn--active" : ""}`}>Basic</button>
      <button onClick={() => onChange("advanced")} className={`studio__toggle-btn ${mode === "advanced" ? "studio__toggle-btn--active" : ""}`}>Advanced</button>
    </div>
  );
}
