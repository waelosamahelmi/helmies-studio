"use client";

import { useState, useMemo } from "react";

export default function PhoneToolsGrid({ tools = [], activeTool, onSelect }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.toLowerCase();
    return tools.filter(t => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  }, [tools, search]);

  // Last 4 used (simulated — just first 4)
  const recents = tools.slice(0, 4);

  return (
    <div className="ph-tools">
      <input
        className="ph-tools-search"
        placeholder="Search tools..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {!search && (
        <>
          <div className="ph-tools-section-title">Recent</div>
          <div className="ph-tools-grid">
            {recents.map((tool) => (
              <button key={tool.id} className="ph-tool-item" onClick={() => onSelect(tool.id)}>
                <div className="ph-tool-icon">
                  {tool.Icon ? <tool.Icon /> : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                  )}
                </div>
                <span className="ph-tool-label">{tool.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="ph-tools-section-title">{search ? "Results" : "All Tools"}</div>
      <div className="ph-tools-grid">
        {filtered.map((tool) => (
          <button
            key={tool.id}
            className="ph-tool-item"
            onClick={() => onSelect(tool.id)}
            style={activeTool === tool.id ? { background: "var(--ph-accent-soft)", borderRadius: "var(--ph-radius-sm)" } : {}}
          >
            <div className="ph-tool-icon" style={activeTool === tool.id ? { background: "var(--ph-accent-soft)" } : {}}>
              {tool.Icon ? <tool.Icon /> : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/>
                </svg>
              )}
            </div>
            <span className="ph-tool-label">{tool.label}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 20, color: "var(--ph-muted)" }}>
          No tools match "{search}"
        </div>
      )}
    </div>
  );
}
