"use client";

export default function PhonePillBar({ items = [], onTap }) {
  if (!items.length) return null;
  return (
    <div className="ph-pillbar">
      {items.map((item) => (
        <button key={item.key} className="ph-pill" onClick={() => onTap(item.key)}>
          {item.label}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ))}
    </div>
  );
}
