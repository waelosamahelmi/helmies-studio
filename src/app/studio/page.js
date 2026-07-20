"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import CommandPalette from "@/components/studio/CommandPalette";
import ImageStudio from "@/components/studio/ImageStudio";
import VideoStudio from "@/components/studio/VideoStudio";
import LipSyncStudio from "@/components/studio/LipSyncStudio";
import AudioStudio from "@/components/studio/AudioStudio";
import CinemaStudio from "@/components/studio/CinemaStudio";
import VibeMotionStudio from "@/components/studio/VibeMotionStudio";
import ClippingStudio from "@/components/studio/ClippingStudio";
import MarketingStudio from "@/components/studio/MarketingStudio";
import RecastStudio from "@/components/studio/RecastStudio";
import AiInfluencerStudio from "@/components/studio/AiInfluencerStudio";
import OrchestratorChat from "@/components/studio/OrchestratorChat";
import WorkflowBuilder from "@/components/studio/WorkflowBuilder";
import ProjectMemory from "@/components/studio/ProjectMemory";
import {
  IconImage, IconVideo, IconMusic, IconCamera, IconFilm, IconCut,
  IconMegaphone, IconMic, IconUsers, IconCrown,
  IconStar, IconBolt, IconArrowUpRight, IconMenu, IconClose, IconSparkle,
} from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const TOOLS = [
  { id: "orchestrator", label: "Orchestrator", desc: "AI agent that plans & executes tasks", Icon: IconSparkle, color: "#FF1B6B", group: "AI Agents", badge: "New" },
  { id: "workflows", label: "Workflows", desc: "Multi-step AI pipelines", Icon: IconBolt, color: "#7C3AED", group: "AI Agents", badge: null },
  { id: "image", label: "Image", desc: "Text-to-image & image-to-image", Icon: IconImage, color: "#FF1B6B", group: "Generate", badge: "32" },
  { id: "video", label: "Video", desc: "Text, image & video-to-video", Icon: IconVideo, color: "#7C3AED", group: "Generate", badge: "17" },
  { id: "audio", label: "Audio", desc: "Music, voice & sound effects", Icon: IconMusic, color: "#00E5FF", group: "Generate", badge: "7" },
  { id: "cinema", label: "Cinema", desc: "Cinematic camera controls", Icon: IconCamera, color: "#FF6B35", group: "Cinematic", badge: null },
  { id: "vibe-motion", label: "Motion", desc: "Motion graphics & remix", Icon: IconFilm, color: "#FFD166", group: "Cinematic", badge: null },
  { id: "clipping", label: "Clipping", desc: "AI highlight extraction", Icon: IconCut, color: "#00E68A", group: "Cinematic", badge: null },
  { id: "marketing", label: "Marketing", desc: "UGC video ads & product shots", Icon: IconMegaphone, color: "#FF1B6B", group: "Cinematic", badge: "New" },
  { id: "lipsync", label: "Lip Sync", desc: "Sync audio to portrait or video", Icon: IconMic, color: "#7C3AED", group: "Character", badge: "9" },
  { id: "body-swap", label: "Body Swap", desc: "Recast faces into any scene", Icon: IconUsers, color: "#00E5FF", group: "Character", badge: null },
  { id: "influencer", label: "Influencer", desc: "Build AI personas", Icon: IconCrown, color: "#FF6B35", group: "Character", badge: null },
  { id: "memory", label: "Memory", desc: "Save & reuse characters, styles, assets", Icon: IconStar, color: "#FFD166", group: "AI Agents", badge: null },
];

export default function StudioPage({ initialTool }) {
  const [activeTab, setActiveTab] = useState(initialTool || "image");
  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [pinnedGroup, setPinnedGroup] = useState(null);
  const [railOffset, setRailOffset] = useState(0);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const activeTool = TOOLS.find((t) => t.id === activeTab) || TOOLS[0];

  const grouped = TOOLS.reduce((acc, t) => {
    acc[t.group] = acc[t.group] || { label: t.group, color: t.color, items: [] };
    acc[t.group].items.push(t);
    return acc;
  }, {});

  const GROUPS = Object.values(grouped);
  const openGroup = pinnedGroup || hoveredGroup;

  const toggleFav = (id) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 6)));
  };

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="studio">
        {/* Sidebar — icon rail with hover flyout */}
        <aside className={`studio__rail ${mobileNavOpen ? "studio__rail--open" : ""}`} onMouseLeave={() => { setHoveredGroup(null); }}>
          {/* Logo */}
          <div className="studio__rail-logo">
            <Link href="/" aria-label="Helmies Studio home">
              <img src="/ico.svg" alt="" />
            </Link>
          </div>

          {/* Group icons */}
          <nav className="studio__rail-nav">
            {GROUPS.map((group, gi) => {
              const GroupIcon = group.items[0].Icon;
              const hasActive = group.items.some((t) => t.id === activeTab);
              return (
                <div
                  key={group.label}
                  className="studio__rail-item-wrap"
                  onMouseEnter={(e) => { setHoveredGroup(group.label); setRailOffset(e.currentTarget.offsetTop); }}
                >
                  <button
                    className={`studio__rail-item ${hasActive ? "studio__rail-item--active" : ""}`}
                    style={{ "--rail-color": group.color }}
                    onClick={(e) => { setPinnedGroup(pinnedGroup === group.label ? null : group.label); setRailOffset(e.currentTarget.parentElement.offsetTop); }}
                    title={group.label}
                  >
                    <GroupIcon />
                  </button>
                </div>
              );
            })}
          </nav>

          {/* Footer — credits */}
          <div className="studio__rail-foot">
            <Link href="/settings" className="studio__rail-credits" title="Credits & Settings">
              <IconBolt />
            </Link>
          </div>

          {/* Flyout panel */}
          {openGroup && (
            <div className="studio__flyout" style={{ "--rail-offset": `${railOffset}px` }} onMouseEnter={() => setHoveredGroup(openGroup)}>
              <div className="studio__flyout-header">
                <span className="studio__flyout-title">{openGroup}</span>
                <button className="studio__flyout-close" onClick={() => setPinnedGroup(null)} aria-label="Close menu">
                  <IconClose />
                </button>
              </div>
              <div className="studio__flyout-list">
                {grouped[openGroup].items.map((t) => {
                  const ToolIcon = t.Icon;
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setActiveTab(t.id); setMobileNavOpen(false); setPinnedGroup(null); setHoveredGroup(null); }}
                      className={`studio__flyout-item ${isActive ? "studio__flyout-item--active" : ""}`}
                    >
                      <span className="studio__flyout-icon" style={{ color: t.color }}>
                        <ToolIcon />
                      </span>
                      <div className="studio__flyout-text">
                        <span className="studio__flyout-label">{t.label}</span>
                        <span className="studio__flyout-desc">{t.desc}</span>
                      </div>
                      {t.badge && <span className="studio__flyout-badge">{t.badge}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="studio__main">
          <div className="studio__body">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: EASE }}
                style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
              >
                {activeTab === "orchestrator" && <OrchestratorChat />}
                {activeTab === "workflows" && <WorkflowBuilder />}
                {activeTab === "memory" && <ProjectMemory />}
                {activeTab === "image" && <ImageStudio />}
                {activeTab === "video" && <VideoStudio />}
                {activeTab === "lipsync" && <LipSyncStudio />}
                {activeTab === "audio" && <AudioStudio />}
                {activeTab === "cinema" && <CinemaStudio />}
                {activeTab === "vibe-motion" && <VibeMotionStudio />}
                {activeTab === "clipping" && <ClippingStudio />}
                {activeTab === "marketing" && <MarketingStudio />}
                {activeTab === "body-swap" && <RecastStudio />}
                {activeTab === "influencer" && <AiInfluencerStudio />}
                {activeTab !== "orchestrator" && activeTab !== "workflows" && activeTab !== "memory" && activeTab !== "image" && activeTab !== "video" && activeTab !== "lipsync" && activeTab !== "audio" && activeTab !== "cinema" && activeTab !== "vibe-motion" && activeTab !== "clipping" && activeTab !== "marketing" && activeTab !== "body-swap" && activeTab !== "influencer" && (
                  <div className="bezel" style={{ color: activeTool.color }}>
                    <div className="bezel__core">
                      <div className="studio__empty">
                        <div className="studio__empty-icon">
                          <activeTool.Icon />
                        </div>
                        <h3>{activeTool.label} Studio</h3>
                        <p>
                          The {activeTool.label.toLowerCase()} studio is coming soon.
                          <br />
                          {activeTool.desc}
                        </p>
                        <div className="studio__empty-cta">
                          <Link href="/pricing" className="btn btn-secondary">
                            Upgrade for early access
                            <span className="btn__icon"><IconArrowUpRight /></span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {cmdOpen && (
          <CommandPalette
            onSelect={(id) => { setActiveTab(id); setCmdOpen(false); }}
            onClose={() => setCmdOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}