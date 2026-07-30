"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/client-fetch";

const FILTERS = ["All", "Images", "Videos", "Favorites"];

const IconImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

export default function PhoneGallery() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/generations?limit=40");
      const data = await res.json();
      setItems((data.generations || data.items || []).filter(g => g.outputUrl || g.url));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchGallery(); }, [fetchGallery]);

  const filtered = items.filter(item => {
    if (filter === "All") return true;
    if (filter === "Images") return !(item.outputUrl || item.url || "").match(/\.(mp4|webm)/i);
    if (filter === "Videos") return (item.outputUrl || item.url || "").match(/\.(mp4|webm)/i);
    return true;
  });

  return (
    <div className="ph-gallery">
      <div className="ph-gallery-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`ph-gallery-filter${filter === f ? " ph-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ph-muted)" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ph-muted)" }}>
          <IconImage />
          <p style={{ marginTop: 12 }}>No items found</p>
        </div>
      ) : (
        <div className="ph-gallery-grid">
          {filtered.map((item, i) => (
            <div key={item.id || i} className="ph-gallery-item">
              <img src={item.outputUrl || item.url} alt="" loading="lazy" />
              {item.model && <span className="ph-gallery-item-badge">{item.model}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
