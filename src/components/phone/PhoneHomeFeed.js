"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/client-fetch";

const IconImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

export default function PhoneHomeFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/generations?limit=20");
      const data = await res.json();
      setItems((data.generations || data.items || []).filter(g => g.outputUrl || g.url));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  if (loading) {
    return (
      <div className="ph-feed">
        <div className="ph-feed-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>
          <h3>Loading...</h3>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="ph-feed">
        <div className="ph-feed-empty">
          <IconImage />
          <h3>No generations yet</h3>
          <p>Switch to the Create tab to start generating.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ph-feed">
      {items.map((item, i) => (
        <div key={item.id || i} className="ph-feed-item">
          <img
            src={item.outputUrl || item.url}
            alt=""
            className="ph-feed-media"
            loading="lazy"
          />
          <div className="ph-feed-meta">
            {item.prompt && <div className="ph-feed-prompt">{item.prompt}</div>}
            <span className="ph-feed-badge">{item.model || "Image"}</span>
            {item.creditsUsed && <span className="ph-feed-badge">{item.creditsUsed}c</span>}
            {item.createdAt && (
              <span className="ph-feed-badge">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
