"use client";

/* ── Inline SVGs ── */
const IconSpark = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
  </svg>
);

const IconUpload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17,8 12,3 7,8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconEnhance = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
  </svg>
);

const IconCross = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

/* ══════════════════════════════════════════════════════════════ */
export default function PromptDock({
  value,
  onChange,
  onSubmit,
  onEnhance,
  onUpload,
  cost,
  generating = false,
  stage,
  icon = "spark",
}) {
  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!generating && value?.trim()) onSubmit?.();
    }
  };

  const stageLabel = stage
    ? stage.charAt(0).toUpperCase() + stage.slice(1)
    : null;

  const Icon = icon === "bolt" ? IconBolt : IconSpark;

  return (
    <div className="v6-prompt-dock">
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Direct the output with a precise creative brief"
        rows={2}
      />

      <div className="v6-prompt-actions">
        {/* ── Left side: upload + enhance ── */}
        <div>
          {onUpload && (
            <button
              className="v6-btn v6-ghost v6-icon-only"
              onClick={onUpload}
              title="Upload reference"
              disabled={generating}
            >
              <IconUpload />
            </button>
          )}
          {onEnhance && (
            <button
              className="v6-btn v6-ghost v6-sm"
              onClick={onEnhance}
              disabled={generating || !value?.trim()}
            >
              <IconEnhance />
              Enhance
            </button>
          )}
        </div>

        {/* ── Right side: generate / cancel ── */}
        <div>
          {generating ? (
            <button
              className="v6-btn v6-ghost"
              onClick={onSubmit}
            >
              <IconCross />
              Cancel{stageLabel ? ` · ${stageLabel}` : ""}
            </button>
          ) : (
            <button
              className="v6-btn v6-primary"
              onClick={onSubmit}
              disabled={!value?.trim()}
            >
              <Icon />
              Generate
              {cost != null && (
                <span className="v6-model-cost">
                  <IconBolt /> {cost}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
