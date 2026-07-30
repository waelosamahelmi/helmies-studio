"use client";

import { useState } from "react";

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
const IconShare = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

export default function PhoneResultView({ result, onClose }) {
  const [toast, setToast] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const handleDownload = () => {
    if (result?.url) {
      window.open(result.url, "_blank");
      showToast("Download started");
    }
  };

  const handleShare = async () => {
    if (result?.url && navigator.share) {
      try { await navigator.share({ url: result.url }); } catch {}
    } else {
      showToast("Link copied");
    }
  };

  const handleFavorite = () => {
    showToast("Saved to favorites");
  };

  return (
    <div className="ph-result-viewer">
      {/* Top bar */}
      <div className="ph-result-viewer-bar">
        <button className="ph-result-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
          {result?.creditsUsed ? `${result.creditsUsed}c` : ""}
        </span>
        <div style={{ width: 36 }} />
      </div>

      {/* Media */}
      <div className="ph-result-viewer-media">
        {result?.url?.endsWith(".mp4") || result?.url?.endsWith(".webm") ? (
          <video src={result.url} controls playsInline autoPlay />
        ) : (
          <img src={result.url} alt="Generated" />
        )}
      </div>

      {/* Actions bar */}
      <div className="ph-result-viewer-actions">
        <button className="ph-result-action" onClick={handleFavorite}>
          <IconHeart /> Favorite
        </button>
        <button className="ph-result-action" onClick={handleDownload}>
          <IconDownload /> Save
        </button>
        <button className="ph-result-action" onClick={handleShare}>
          <IconShare /> Share
        </button>
      </div>

      {/* Toast */}
      {toast && <div className="ph-toast">{toast}</div>}
    </div>
  );
}
