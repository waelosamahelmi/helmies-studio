"use client";

export default function AISuggestions({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="ai-suggestions">
      {suggestions.map((s, i) => (
        <button
          key={i}
          className="ai-suggestions__chip"
          onClick={() => onSelect?.(s)}
        >
          {s.icon && <span className="ai-suggestions__icon">{s.icon}</span>}
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}
