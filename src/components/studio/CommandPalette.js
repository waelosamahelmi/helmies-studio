"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconSearch, IconImage, IconVideo, IconMusic, IconCamera, IconFilm, IconCut, IconMegaphone, IconMic, IconUsers, IconCrown, IconStar, IconBolt, IconSparkle } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const TOOLS = [
  { id: "image", label: "Image Studio", desc: "Text-to-image & image editing", Icon: IconImage, shortcut: "1" },
  { id: "video", label: "Video Studio", desc: "Text, image & video generation", Icon: IconVideo, shortcut: "2" },
  { id: "audio", label: "Audio Studio", desc: "Music, voice & sound effects", Icon: IconMusic, shortcut: "3" },
  { id: "cinema", label: "Cinema Studio", desc: "Cinematic camera controls", Icon: IconCamera, shortcut: "4" },
  { id: "vibe-motion", label: "Motion Studio", desc: "Motion graphics & remix", Icon: IconFilm, shortcut: "5" },
  { id: "clipping", label: "Clipping Studio", desc: "AI highlight extraction", Icon: IconCut, shortcut: "6" },
  { id: "marketing", label: "Marketing Studio", desc: "UGC video ads & product shots", Icon: IconMegaphone, shortcut: "7" },
  { id: "lipsync", label: "Lip Sync Studio", desc: "Sync audio to portrait or video", Icon: IconMic, shortcut: "8" },
  { id: "body-swap", label: "Body Swap Studio", desc: "Recast faces into any scene", Icon: IconUsers, shortcut: "9" },
  { id: "influencer", label: "Influencer Studio", desc: "Build AI personas", Icon: IconCrown, shortcut: "0" },
  { id: "orchestrator", label: "AI Orchestrator", desc: "Plan & execute multi-step tasks", Icon: IconSparkle, shortcut: "O" },
  { id: "workflows", label: "Workflows", desc: "Multi-step AI pipelines", Icon: IconBolt, shortcut: "W" },
  { id: "memory", label: "Project Memory", desc: "Characters, styles & assets", Icon: IconStar, shortcut: "M" },
];

export default function CommandPalette({ onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = TOOLS.filter((t) =>
    !query || t.label.toLowerCase().includes(query.toLowerCase()) || t.desc.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIdx]) {
        onSelect(filtered[selectedIdx].id);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [filtered, selectedIdx, onSelect, onClose]);

  return (
    <motion.div
      className="command-palette__overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="command-palette"
        initial={{ opacity: 0, scale: 0.96, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -20 }}
        transition={{ duration: 0.2, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette__input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            className="command-palette__input"
            placeholder="Search tools, models, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="command-palette__kbd">ESC</kbd>
        </div>

        <div className="command-palette__list">
          {filtered.map((tool, i) => {
            const Icon = tool.Icon;
            return (
              <button
                key={tool.id}
                className={`command-palette__item ${i === selectedIdx ? "command-palette__item--selected" : ""}`}
                onClick={() => { onSelect(tool.id); onClose(); }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="command-palette__item-icon"><Icon /></span>
                <div className="command-palette__item-text">
                  <span className="command-palette__item-label">{tool.label}</span>
                  <span className="command-palette__item-desc">{tool.desc}</span>
                </div>
                <kbd className="command-palette__item-shortcut">{tool.shortcut}</kbd>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="command-palette__empty">No tools found</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
