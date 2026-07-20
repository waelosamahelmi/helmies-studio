"use client";

import { motion } from "framer-motion";
import { IconBolt, IconImage, IconVideo, IconMusic, IconSparkle, IconCrown, IconCut } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const STAGES = {
  image: ["Queued", "Rendering", "Finalizing"],
  video: ["Queued", "Rendering", "Upscaling", "Finalizing"],
  audio: ["Queued", "Composing", "Mastering"],
  lipsync: ["Queued", "Processing", "Syncing", "Finalizing"],
  recast: ["Queued", "Processing", "Finalizing"],
  clipping: ["Queued", "Analyzing", "Extracting"],
  cinema: ["Queued", "Rendering", "Finalizing"],
  motion: ["Queued", "Rendering", "Finalizing"],
  marketing: ["Queued", "Generating", "Finalizing"],
  influencer: ["Queued", "Generating", "Finalizing"],
};

const TOOL_ICONS = {
  image: IconImage, i2i: IconImage, video: IconVideo, i2v: IconVideo, v2v: IconVideo,
  audio: IconMusic, lipsync: IconMusic, recast: IconCrown, clipping: IconCut,
  cinema: IconSparkle, motion: IconSparkle, marketing: IconCrown, influencer: IconCrown,
};

export default function StagedProgress({ tool = "image", elapsed = 0 }) {
  const stages = STAGES[tool] || STAGES.image;
  const ToolIcon = TOOL_ICONS[tool] || IconBolt;

  const totalEstimate = tool === "video" ? 120 : tool === "audio" ? 60 : 30;
  const progress = Math.min(elapsed / totalEstimate, 1);
  const currentStageIdx = Math.min(Math.floor(progress * stages.length), stages.length - 1);

  return (
    <div className="staged-progress">
      <div className="staged-progress__header">
        <motion.div
          className="staged-progress__icon"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ToolIcon />
        </motion.div>
        <div className="staged-progress__info">
          <span className="staged-progress__label">{stages[currentStageIdx]}</span>
          <span className="staged-progress__time">{elapsed}s elapsed</span>
        </div>
      </div>

      <div className="staged-progress__stages">
        {stages.map((stage, i) => (
          <div key={stage} className={`staged-progress__stage ${i <= currentStageIdx ? "staged-progress__stage--active" : ""} ${i < currentStageIdx ? "staged-progress__stage--done" : ""}`}>
            <div className="staged-progress__dot">
              {i < currentStageIdx && <span className="staged-progress__check">✓</span>}
            </div>
            <span className="staged-progress__stage-label">{stage}</span>
            {i < stages.length - 1 && <div className="staged-progress__line" />}
          </div>
        ))}
      </div>

      <div className="staged-progress__bar">
        <motion.div
          className="staged-progress__bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.5, ease: EASE }}
        />
      </div>
    </div>
  );
}
