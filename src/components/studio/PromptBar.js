"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconBolt, IconSparkle } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const TOOL_MAP = {
  image: "image", video: "video", audio: "audio", lipsync: "lipsync",
  cinema: "image", "vibe-motion": "video", clipping: "video",
  marketing: "video", "body-swap": "lipsync", influencer: "image",
};

export default function PromptBar({ activeTab }) {
  const [focused, setFocused] = useState(false);
  const [prompt, setPrompt] = useState("");

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    const tool = TOOL_MAP[activeTab] || "image";
    window.dispatchEvent(new CustomEvent("helmies-prompt", {
      detail: { prompt, tool, studio: activeTab },
    }));
    setPrompt("");
  };

  return (
    <div className={`studio__prompt-bar ${focused ? "studio__prompt-bar--focused" : ""}`}>
      <div className="studio__prompt-bar-inner">
        <input
          className="studio__prompt-input"
          placeholder={`Describe what you want to create in ${activeTab}...`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <AnimatePresence>
          {focused && (
            <motion.button
              className="btn btn-primary btn-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, ease: EASE }}
              onClick={handleSubmit}
              disabled={!prompt.trim()}
            >
              Generate
              <span className="btn__icon"><IconBolt /></span>
            </motion.button>
          )}
        </AnimatePresence>
        {!focused && (
          <span className="studio__prompt-hint">Enter ↵</span>
        )}
      </div>
    </div>
  );
}
