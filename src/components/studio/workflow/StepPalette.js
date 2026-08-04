"use client";

/* ══════════════════════════════════════════════════════════════════════════
   STEP PALETTE — .st-palette
   ──────────────────────────────────────────────────────────────────────────
   The parts bin. Every kind the engine can actually run, in one column, each
   one draggable onto the chain. Dragging is the quick way and places the step
   exactly where you drop it; clicking appends to the end and is the way that
   works with a keyboard, a screen reader, or a trackpad you'd rather not
   fight. Neither is the "real" one.
   ══════════════════════════════════════════════════════════════════════════ */

export default function StepPalette({ kinds = [], onAdd, onDragStart, onDragEnd, disabled = false }) {
  return (
    <div className="st-palette">
      <span className="hs-label" style={{ margin: 0 }}>Step types</span>

      <div className="st-palette__list">
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            className="st-palette__item"
            draggable={!disabled}
            onDragStart={(e) => onDragStart?.(e, k.id)}
            onDragEnd={onDragEnd}
            onClick={() => onAdd?.(k.id)}
            disabled={disabled}
            title={k.desc}
            aria-label={`Add step: ${k.label}`}
          >
            <k.icon className="hs-icon-sm" aria-hidden="true" />
            <span className="st-palette__label">{k.label}</span>
          </button>
        ))}
      </div>

      <p className="hs-hint">
        Drag one onto the chain to place it, or click to add it at the end.
      </p>
    </div>
  );
}
