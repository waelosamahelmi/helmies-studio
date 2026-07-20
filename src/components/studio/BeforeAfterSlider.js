"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

const EASE = [0.32, 0.72, 0, 1];

export default function BeforeAfterSlider({ beforeSrc, afterSrc, beforeLabel = "Before", afterLabel = "After" }) {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handleMouseDown = useCallback(() => setIsDragging(true), []);
  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleMouseMove = useCallback((e) => { if (isDragging) handleMove(e.clientX); }, [isDragging, handleMove]);
  const handleTouchMove = useCallback((e) => { handleMove(e.touches[0].clientX); }, [handleMove]);

  return (
    <div
      className="compare-slider"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      <div className="compare-slider__after">
        <img src={afterSrc} alt={afterLabel} draggable={false} />
        <span className="compare-slider__label compare-slider__label--after">{afterLabel}</span>
      </div>

      <div className="compare-slider__before" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={beforeSrc} alt={beforeLabel} draggable={false} />
        <span className="compare-slider__label compare-slider__label--before">{beforeLabel}</span>
      </div>

      <div
        className="compare-slider__handle"
        style={{ left: `${position}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div className="compare-slider__handle-line" />
        <motion.div
          className="compare-slider__handle-circle"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 4L3 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13 4L17 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      </div>
    </div>
  );
}
