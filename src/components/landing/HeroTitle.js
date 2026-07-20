"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * HeroTitle — cursor brush effect. Image is masked inside large text.
 * As the cursor moves, radial-gradient spots reveal the image through the text.
 * The spots trail and fade over 3 seconds.
 */
const TRAIL_LENGTH = 50;
const BRUSH_SIZE = 50;
const FADE_MS = 3000;

export default function HeroTitle({ image, line1, line2, accent, line1Accent, small }) {
  const wrapRef = useRef(null);
  const paintRef = useRef(null);
  const [mask, setMask] = useState("radial-gradient(circle 1px at -9999px -9999px, transparent 0%, transparent 100%)");
  const trailRef = useRef([]);
  const posRef = useRef({ x: -9999, y: -9999 });
  const activeRef = useRef(false);
  const rafRef = useRef(null);
  const idleRef = useRef(null);

  const updateMask = useCallback(() => {
    const now = Date.now();
    if (activeRef.current && posRef.current.x > -9000) {
      trailRef.current.push({ ...posRef.current, t: now });
    }
    trailRef.current = trailRef.current.filter((p) => now - p.t < FADE_MS);
    if (trailRef.current.length > TRAIL_LENGTH) {
      trailRef.current = trailRef.current.slice(-TRAIL_LENGTH);
    }

    if (trailRef.current.length === 0) {
      setMask("radial-gradient(circle 1px at -9999px -9999px, transparent 0%, transparent 100%)");
    } else {
      const gradients = trailRef.current.map((p) => {
        const age = (now - p.t) / FADE_MS;
        const alpha = 1 - age;
        const size = BRUSH_SIZE * (0.7 + alpha * 0.3);
        return `radial-gradient(circle ${Math.round(size)}px at ${Math.round(p.x)}px ${Math.round(p.y)}px, #000 0%, #000 ${Math.round(35 + alpha * 15)}%, transparent ${Math.round(60 + alpha * 15)}%)`;
      });
      setMask(gradients.join(", "));
    }

    rafRef.current = requestAnimationFrame(updateMask);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updateMask);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [updateMask]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onMove = (e) => {
      const rect = wrap.getBoundingClientRect();
      posRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      activeRef.current = true;
      if (idleRef.current) clearTimeout(idleRef.current);
      idleRef.current = setTimeout(() => {
        activeRef.current = false;
      }, 2000);
    };

    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", () => {
      activeRef.current = false;
    });
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mouseleave", () => {});
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, []);

  return (
    <div ref={wrapRef} className="hero-title-wrap">
      <h1 className={`hero-title hero-title--base${small ? " hero-title--small" : ""}`}>
        <span className="hero-title__line">
          {line1Accent && <span className="hero-title__accent">{line1Accent}</span>}
          {line1}
        </span>
        {line2 && (
          <span className="hero-title__line">
            {accent && <span className="hero-title__accent">{accent}</span>}
            {line2}
          </span>
        )}
      </h1>
      <h1
        ref={paintRef}
        className={`hero-title hero-title--paint${small ? " hero-title--small" : ""}`}
        style={{
          "--paint-bg": image ? `url(${image})` : "none",
          "--paint-mask": mask,
        }}
        aria-hidden="true"
      >
        <span className="hero-title__line">
          {line1Accent && <span className="hero-title__paint-accent">{line1Accent}</span>}
          {line1}
        </span>
        {line2 && (
          <span className="hero-title__line">
            {accent && <span className="hero-title__paint-accent">{accent}</span>}
            {line2}
          </span>
        )}
      </h1>
    </div>
  );
}
