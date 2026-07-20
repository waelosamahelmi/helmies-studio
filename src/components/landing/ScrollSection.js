"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const EASE = [0.32, 0.72, 0, 1];

/**
 * ScrollSection — full-viewport section with parallax background.
 * Content fades in once on scroll entry via whileInView.
 */
export default function ScrollSection({
  bg,
  bgVideo,
  overlay = 0.6,
  accent,
  className = "",
  children,
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const bgY = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const bgScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.06, 1, 1.03]);

  return (
    <section ref={ref} className={`scroll-section ${className}`}>
      <motion.div className="scroll-section__bg" style={{ y: bgY, scale: bgScale }}>
        {bgVideo ? (
          <video src={bgVideo} muted loop playsInline autoPlay />
        ) : bg ? (
          <img src={bg} alt="" />
        ) : null}
        <div className="scroll-section__scrim" style={{ opacity: overlay }} />
        {accent && (
          <div
            className="scroll-section__glow"
            style={{ background: `radial-gradient(60% 50% at 50% 50%, ${accent}22, transparent 70%)` }}
          />
        )}
      </motion.div>

      <motion.div
        className="scroll-section__content"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        {children}
      </motion.div>
    </section>
  );
}
