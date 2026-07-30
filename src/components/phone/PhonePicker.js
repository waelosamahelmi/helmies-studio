"use client";

import { useEffect } from "react";

export default function PhonePicker({ title, items = [], selected, onSelect, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="ph-picker-overlay" onClick={onClose} />
      <div className="ph-picker">
        <div className="ph-picker-header">
          <span className="ph-picker-title">{title}</span>
          <button className="ph-picker-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="ph-picker-list">
          {items.map((item) => (
            <button
              key={item.value}
              className={`ph-picker-item${selected === item.value ? " ph-selected" : ""}`}
              onClick={() => onSelect(item.value)}
            >
              <span className="ph-picker-item-label">{item.label}</span>
              {item.meta && <span className="ph-picker-item-meta">{item.meta}</span>}
              {selected === item.value && (
                <svg className="ph-picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
