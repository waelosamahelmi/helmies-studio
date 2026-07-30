"use client";

const IconImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

export default function PhoneStage({
  result,
  error,
  emptyLabel = "Create",
  emptyDesc = "Describe your vision with precision and watch it emerge.",
  onResultTap,
  onRetry,
}) {
  /* ── Error state ── */
  if (error) {
    return (
      <div className="ph-stage">
        <div className="ph-stage-grid" />
        <div className="ph-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3>Generation failed</h3>
          <p>{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                marginTop: 12,
                padding: "8px 24px",
                borderRadius: 10,
                border: "none",
                background: "var(--ph-accent, #ff416f)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Result state ── */
  if (result?.url) {
    return (
      <div className="ph-stage">
        <div className="ph-stage-result" onClick={onResultTap}>
          {result.url.endsWith(".mp4") || result.url.endsWith(".webm") ? (
            <video src={result.url} controls playsInline />
          ) : (
            <img src={result.url} alt="Generated" />
          )}
        </div>
        <div className="ph-swipe-hint">
          Tap to view full screen
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  return (
    <div className="ph-stage">
      <div className="ph-stage-grid" />
      <div className="ph-stage-empty">
        <div className="ph-stage-empty-icon">
          <IconImage />
        </div>
        <h2>{emptyLabel}</h2>
        <p>{emptyDesc}</p>
      </div>
    </div>
  );
}
