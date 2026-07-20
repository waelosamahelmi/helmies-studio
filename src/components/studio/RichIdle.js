"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const EASE = [0.32, 0.72, 0, 1];

const TIPS = {
  image: [
    "Tip: Add 'cinematic lighting' to your prompt for dramatic results.",
    "Tip: Use Flux Dev for photorealistic, Midjourney for artistic.",
    "Tip: Aspect ratio 3:4 is perfect for portraits.",
    "Tip: Upload a reference image to unlock edit models.",
    "Tip: Nano Banana Pro supports 4K resolution.",
  ],
  video: [
    "Tip: Kling v3 gives the best text-to-video quality.",
    "Tip: Upload a start frame for more controlled motion.",
    "Tip: Shorter durations (5s) generate faster.",
    "Tip: Sora 2 supports up to 15 second clips.",
    "Tip: Veo 3 Fast is the fastest video model.",
  ],
  lipsync: [
    "Tip: Upload a clear portrait for best lip sync results.",
    "Tip: LTX 2.3 supports 1080p output.",
    "Tip: Audio should be clear speech for best results.",
  ],
  audio: [
    "Tip: Suno v4.5 generates the highest quality music.",
    "Tip: Bark TTS creates realistic voice from text.",
    "Tip: Music Gen is great for background tracks.",
  ],
  default: [
    "Tip: Use the Orchestrator for multi-step tasks.",
    "Tip: Build workflows to automate repetitive pipelines.",
    "Tip: Save your favorite characters in Memory for reuse.",
    "Tip: Credits roll over with active subscriptions.",
  ],
};

export default function RichIdle({ tool, icon: Icon, title, description }) {
  const [tipIndex, setTipIndex] = useState(0);
  const tips = TIPS[tool] || TIPS.default;

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % tips.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <div className="rich-idle">
      <motion.div
        className="rich-idle__icon"
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon />
      </motion.div>
      <h3>{title}</h3>
      <p>{description}</p>
      <motion.div
        className="rich-idle__tip"
        key={tipIndex}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        {tips[tipIndex]}
      </motion.div>
    </div>
  );
}