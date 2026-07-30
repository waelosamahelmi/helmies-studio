"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/* ── Inline SVG: Upload (arrow-up-tray) ── */
const IconUpload = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17,8 12,3 7,8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

/* ── Inline SVG: Microphone ── */
const IconMic = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="22" />
  </svg>
);

/* ── Inline SVG: Send / Generate (arrow-up) ── */
const IconSend = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5,12 12,5 19,12" />
  </svg>
);

/* ── Inline SVG: Cancel X ── */
const IconCancel = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MAX_TEXTAREA_HEIGHT = 120;
const MIN_TEXTAREA_HEIGHT = 44;

export default function MobilePromptDock({
  value = "",
  onChange,
  onGenerate,
  onSubmit,
  placeholder = "Describe what you want to create\u2026",
  generating = false,
  maxChars = 2000,
  cost = 0,
  onAttach,
  characterCount,
}) {
  const [voiceActive, setVoiceActive] = useState(false);
  const textareaRef = useRef(null);

  const charLength = characterCount ?? (value || "").length;
  const nearLimit = charLength > maxChars * 0.8;
  const atLimit = charLength >= maxChars;

  /* ── Auto-expand textarea ── */
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  /* ── Voice input (SpeechRecognition API) ── */
  const toggleVoice = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    if (voiceActive) {
      setVoiceActive(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const current = value || "";
      const newValue = current ? `${current} ${transcript}` : transcript;
      if (newValue.length <= maxChars) {
        onChange?.(newValue);
      } else {
        onChange?.(newValue.slice(0, maxChars));
      }
    };

    recognition.onerror = () => setVoiceActive(false);
    recognition.onend = () => setVoiceActive(false);

    setVoiceActive(true);
    recognition.start();
  }, [voiceActive, value, onChange, maxChars]);

  const handleChange = (text) => {
    onChange?.(text.slice(0, maxChars));
  };

  const handleSubmit = () => {
    if (generating) {
      onGenerate?.(); // cancel
    } else if (value?.trim()) {
      onSubmit?.();
    }
  };

  /* ── Keyboard-aware: blur on Escape ── */
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      textareaRef.current?.blur();
    }
  };

  return (
    <div className="v6-mobile-prompt-dock">
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className="v6-mobile-prompt-dock__input"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onInput={autoResize}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxChars}
        rows={1}
        aria-label="Creative prompt"
        style={{ minHeight: `${MIN_TEXTAREA_HEIGHT}px` }}
      />

      {/* Actions bar */}
      <div className="v6-mobile-prompt-dock__actions">
        {/* Left: attach + voice */}
        <div className="v6-mobile-prompt-dock__actions-left">
          {onAttach && (
            <button
              className="v6-btn v6-ghost v6-icon-only"
              onClick={onAttach}
              disabled={generating}
              aria-label="Attach file"
            >
              <IconUpload />
            </button>
          )}

          {/* Voice input — gracefully hidden if unsupported */}
          {typeof window !== "undefined" &&
            (window.SpeechRecognition || window.webkitSpeechRecognition) && (
              <button
                className={[
                  "v6-btn v6-ghost v6-icon-only",
                  voiceActive && "v6-mobile-prompt-dock__voice--active",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={toggleVoice}
                disabled={generating || atLimit}
                aria-label={voiceActive ? "Stop recording" : "Voice input"}
              >
                <IconMic />
              </button>
            )}
        </div>

        {/* Right: char count + submit */}
        <div className="v6-mobile-prompt-dock__actions-right">
          <span
            className={[
              "v6-mobile-prompt-dock__count",
              nearLimit && "v6-mobile-prompt-dock__count--warn",
              atLimit && "v6-mobile-prompt-dock__count--limit",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {charLength}/{maxChars}
          </span>

          <button
            className={[
              "v6-btn",
              generating ? "v6-mobile-prompt-dock__cancel" : "v6-primary",
            ].join(" ")}
            onClick={handleSubmit}
            disabled={!generating && !value?.trim()}
          >
            {generating ? (
              <>
                <IconCancel /> Cancel
              </>
            ) : (
              <>
                <IconSend /> Generate
                {cost > 0 && (
                  <span className="v6-mobile-prompt-dock__cost-badge">
                    {cost}
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
