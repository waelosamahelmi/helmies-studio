"use client";

import { useState, useRef, useCallback } from "react";
import { IconSettings, IconImage, IconVideo, IconMusic } from "@/components/Icons";

export default function ChatInput({
  placeholder,
  onSubmit,
  uploads,
  handleUpload,
  removeUpload,
  uploadsState,
  modelChip,
  disabled,
  loading,
  cost,
  settingsOpen,
  onSettingsOpen,
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const [activeUploadKey, setActiveUploadKey] = useState(null);

  const handleSubmit = useCallback(() => {
    if (!text.trim() || disabled || loading) return;
    onSubmit(text);
    setText("");
  }, [text, disabled, loading, onSubmit]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const hasUploads = uploads && uploads.length > 0;

  return (
    <div className={`chat-input ${focused ? "chat-input--focused" : ""}`}>
      {/* Upload buttons row */}
      {hasUploads && (
        <div className="chat-input__uploads">
          {uploads.map((u) => {
            const val = uploadsState?.[u.key];
            const count = Array.isArray(val) ? val.length : val ? 1 : 0;
            return (
              <div key={u.key} className="chat-input__upload-group">
                <button
                  className={`chat-input__upload-btn ${count > 0 ? "chat-input__upload-btn--done" : ""}`}
                  onClick={() => { setActiveUploadKey(u.key); fileRef.current?.click(); }}
                >
                  {count > 0 ? `${u.label} (${count})` : u.label}
                  {u.required && count === 0 && <span className="chat-input__required">*</span>}
                </button>
                {count > 0 && (
                  <button className="chat-input__upload-clear" onClick={() => removeUpload?.(u.key)}>
                    ✕
                  </button>
                )}
                {u.presets && count === 0 && (
                  <div className="chat-input__presets">
                    {u.presets.slice(0, 6).map((p) => (
                      <button key={p.id} className="chat-input__preset-btn" onClick={() => handleUpload?.(null, u, p.url)} title={p.name}>
                        <img src={p.url} alt={p.name} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <input
            ref={fileRef}
            type="file"
            accept="*/*"
            multiple
            onChange={(e) => { handleUpload?.(e, uploads.find(u => u.key === activeUploadKey)); e.target.value = ""; }}
            style={{ display: "none" }}
          />
        </div>
      )}

      {/* Upload previews */}
      {uploadsState && Object.keys(uploadsState).length > 0 && (
        <div className="chat-input__previews">
          {Object.entries(uploadsState).map(([key, val]) => {
            const items = Array.isArray(val) ? val : [val];
            return items.filter(Boolean).map((url, i) => (
              <div key={`${key}-${i}`} className="chat-input__preview">
                {typeof url === "string" && url.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i) ? (
                  <img src={url} alt="" />
                ) : (
                  <div className="chat-input__preview-file">
                    <span className="chat-input__preview-icon">📎</span>
                  </div>
                )}
                <button className="chat-input__preview-remove" onClick={() => removeUpload?.(key, i)}>✕</button>
              </div>
            ));
          })}
        </div>
      )}

      {/* Input area */}
      <div className="chat-input__inner" onClick={() => textRef.current?.focus()}>
        {/* Model chip + upload button */}
        <div className="chat-input__tools">
          {modelChip && (
            <div className="chat-input__model-chip">{modelChip}</div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textRef}
          className="chat-input__textarea"
          placeholder={placeholder || "Type a message..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={1}
        />

        {/* Actions */}
        <div className="chat-input__actions">
          <button
            className="chat-input__settings-btn"
            onClick={onSettingsOpen}
            aria-label="Settings"
          >
            <IconSettings />
          </button>
          <button
            className="chat-input__send"
            onClick={handleSubmit}
            disabled={!text.trim() || disabled || loading}
          >
            {loading ? (
              <span className="chat-input__spinner" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {cost > 0 && <span className="chat-input__cost">{cost}⛯</span>}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
