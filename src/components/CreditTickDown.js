"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const EASE = [0.32, 0.72, 0, 1];

export default function CreditTickDown({ value, className = "" }) {
  const [display, setDisplay] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value === prevValue.current) return;
    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    if (Math.abs(to - from) === 0) return;

    setIsAnimating(true);
    const duration = 500;
    const start = performance.now();

    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        setDisplay(to);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <motion.span
      className={`credit-tick ${isAnimating ? "credit-tick--animating" : ""} ${className}`}
      animate={isAnimating ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {display}
    </motion.span>
  );
}
