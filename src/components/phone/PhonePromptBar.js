"use client";

import { useRef, useEffect, useCallback } from "react";

const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconSpark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z"/>
  </svg>
);

const IconCross = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function PhonePromptBar({
  value = "",
  onChange,
  onGenerate,
  generating = false,
  cost = 0,
  onCancel,
  onUpload,
}) {
  const textareaRef = useRef(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [value, autoResize]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!generating && value.trim()) onGenerate();
    }
  };

  return (
    <div className="ph-prompt-bar">
      <div className="ph-prompt-input-wrap">
        <textarea
          ref={textareaRef}
          className="ph-prompt-textarea"
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
          onInput={autoResize}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to create..."
          rows={1}
          aria-label="Creative prompt"
          disabled={generating}
        />
        <div className="ph-prompt-actions">
          {onUpload && (
            <button className="ph-prompt-btn" onClick={onUpload} aria-label="Upload">
              <IconUpload />
            </button>
          )}
          {!generating && (
            <button className="ph-generate-btn" onClick={onGenerate} disabled={!value.trim()}>
              <IconSpark />
              Generate
              {cost > 0 && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>{cost}c</span>}
            </button>
          )}
          {generating && (
            <button className="ph-generate-btn" onClick={onCancel} style={{ background: "var(--ph-surface2)", boxShadow: "none" }}>
              <IconCross /> Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
