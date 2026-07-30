"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import StageArea from "@/components/studio/v6/StageArea";

/* ── Inline SVG: Fullscreen expand ── */
const IconFullscreen = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15,3 21,3 21,9" />
    <polyline points="9,21 3,21 3,15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const OVERLAY_AUTO_HIDE_MS = 3000;

export default function MobileStageArea({
  children,
  stageProps = {},
  currentModel,
  generating = false,
  progress,
  stage,
}) {
  const [overlayVisible, setOverlayVisible] = useState(true);
  const hideTimer = useRef(null);

  /* ── Auto-hide overlay after inactivity ── */
  const resetOverlayTimer = useCallback(() => {
    setOverlayVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlayVisible(false);
    }, OVERLAY_AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    // Start the timer on mount
    resetOverlayTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [resetOverlayTimer]);

  /* ── Fullscreen toggle ── */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const progressPct = progress != null ? Math.min(Math.max(progress, 0), 100) : 0;

  return (
    <div
      className="v6-mobile-stage"
      onTouchStart={resetOverlayTimer}
      onClick={resetOverlayTimer}
    >
      {/* Floating overlay */}
      <div
        className={[
          "v6-mobile-stage-overlay",
          overlayVisible ? "v6-mobile-stage-overlay--visible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {currentModel && (
          <span className="v6-mobile-stage-badge">{currentModel}</span>
        )}
        <button
          className="v6-mobile-stage-fullscreen"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
        >
          <IconFullscreen />
        </button>
      </div>

      {/* Main stage content */}
      <StageArea {...stageProps} />

      {/* Mobile progress bar overlay */}
      {generating && (
        <div className="v6-mobile-progress">
          <div
            className="v6-mobile-progress-bar"
            style={{ width: `${progressPct}%` }}
          />
          <div className="v6-mobile-progress-label">
            {stage || "Generating\u2026"}
          </div>
        </div>
      )}

      {/* Pass through children for any additional content */}
      {children}
    </div>
  );
}
