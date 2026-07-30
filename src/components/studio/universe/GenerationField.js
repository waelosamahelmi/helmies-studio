"use client";

import { useEffect, useRef } from "react";

const PHASE_LABELS = {
  preparing: "Preparing creative context",
  reserving: "Reserving compute",
  submitting: "Routing to the model",
  generating: "Synthesizing the output",
  processing: "Processing the render",
  quality_check: "Checking output quality",
  finalizing: "Storing the final asset",
};

export default function GenerationField({ phase = "generating", elapsed = 0, model, onCancel, canCancel = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let frameId = 0;
    let width = 1;
    let height = 1;
    let started = performance.now();
    const particles = Array.from({ length: 72 }, (_, index) => ({
      angle: index / 72 * Math.PI * 2,
      radius: 54 + (index * 37) % 220,
      speed: .00011 + index % 9 * .000012,
      size: 1 + index % 4 * .35,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      const time = now - started;
      const cx = width / 2;
      const cy = height / 2;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(cx, cy);
      for (let ring = 0; ring < 5; ring += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, 58 + ring * 46 + Math.sin(time * .001 + ring) * 7, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,65,111,${.24 - ring * .035})`;
        ctx.setLineDash([2 + ring * 2, 10 + ring * 4]);
        ctx.lineDashOffset = time * .004 * (ring % 2 ? 1 : -1);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      particles.forEach((particle, index) => {
        const angle = particle.angle + time * particle.speed * (index % 2 ? 1 : -1);
        const radius = particle.radius + Math.sin(time * .0018 + index) * 13;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x * .52, y * .52);
        ctx.strokeStyle = `rgba(255,65,111,${index % 4 ? .08 : .2})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = index % 7 ? "#ff416f" : "#fff8fc";
        ctx.globalAlpha = .35 + (Math.sin(time * .002 + index) + 1) * .22;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
      const pulse = 42 + Math.sin(time * .003) * 9;
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, pulse);
      glow.addColorStop(0, "#fff8fc");
      glow.addColorStop(.16, "#ff416f");
      glow.addColorStop(1, "rgba(255,65,111,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      frameId = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) frameId = requestAnimationFrame(draw);
    else draw(started);
    return () => { observer.disconnect(); cancelAnimationFrame(frameId); };
  }, []);

  return (
    <section className="universe-generation" aria-live="polite">
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="universe-generation__core">
        <span>{PHASE_LABELS[phase] || PHASE_LABELS.generating}</span>
        <strong>{model || "Creative model"}</strong>
        <small>{Math.max(0, Math.round(elapsed))} seconds elapsed</small>
      </div>
      {canCancel && <button className="universe-button universe-button--quiet" onClick={onCancel}>Cancel generation</button>}
    </section>
  );
}
