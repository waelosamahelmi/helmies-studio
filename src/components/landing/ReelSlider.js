"use client";

import { useRef, useEffect } from "react";

/**
 * ReelSlider — 3 vertical columns of images that auto-scroll upward
 * like a film strip. Each column runs at a slightly different speed
 * for parallax depth. Pauses on hover.
 */
export default function ReelSlider({ columns, speed = 0.35 }) {
  return (
    <div className="reel-slider">
      {columns.map((col, ci) => (
        <ReelColumn key={ci} images={col} speed={speed * (0.8 + ci * 0.2)} />
      ))}
    </div>
  );
}

function ReelColumn({ images, speed }) {
  const trackRef = useRef(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const children = track.children;
    if (children.length === 0) return;

    const totalH = track.scrollHeight / 2;
    if (totalH === 0) return;

    const tick = () => {
      if (!pausedRef.current) {
        offsetRef.current += speed;
        if (offsetRef.current >= totalH) offsetRef.current -= totalH;
        track.style.transform = `translateY(${-offsetRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [speed]);

  const items = [...images, ...images];

  return (
    <div
      className="reel-column"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
    >
      <div ref={trackRef} className="reel-column__track">
        {items.map((src, i) => (
          <div key={i} className="reel-column__item">
            <img src={src} alt="" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}
