"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
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
  IconSearch, IconStar, IconBolt, IconChevron, IconArrowUpRight, IconMenu, IconSparkle,
} from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const TOOLS = [
  { id: "orchestrator", label: "Orchestrator", desc: "AI agent that plans & executes tasks", Icon: IconSparkle, color: "#FF1B6B", group: "AI Agents", badge: "New" },
  { id: "workflows", label: "Workflows", desc: "Multi-step AI pipelines", Icon: IconBolt, color: "#7C3AED", group: "AI Agents", badge: null },
  { id: "image", label: "Image", desc: "Text-to-image & image-to-image", Icon: IconImage, color: "#FF1B6B", group: "Generate", badge: "55+" },
  { id: "video", label: "Video", desc: "Text, image & video-to-video", Icon: IconVideo, color: "#7C3AED", group: "Generate", badge: "40+" },
  { id: "audio", label: "Audio", desc: "Music, voice & sound effects", Icon: IconMusic, color: "#00E5FF", group: "Generate", badge: "20+" },
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
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeTool = TOOLS.find((t) => t.id === activeTab) || TOOLS[0];

  const filtered = search.trim()
    ? TOOLS.filter((t) => t.label.toLowerCase().includes(search.toLowerCase()) || t.desc.toLowerCase().includes(search.toLowerCase()))
    : TOOLS;

  const grouped = filtered.reduce((acc, t) => {
    acc[t.group] = acc[t.group] || [];
    acc[t.group].push(t);
    return acc;
  }, {});

  const toggleFav = (id) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 6)));
  };

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="studio">
        {/* Sidebar */}
        <aside className={`studio__sidebar ${collapsed ? "studio__sidebar--collapsed" : ""} ${mobileNavOpen ? "studio__sidebar--open" : ""}`}>
          <div className="studio__sidebar-head">
            <Link href="/" className="flex items-center gap-2 min-w-0">
              <img src="/ico.svg" alt="" className="studio__sidebar-mark" />
              {!collapsed && <span className="studio__sidebar-brand">Studio</span>}
            </Link>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="studio__collapse hidden md:flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <IconChevron />
            </button>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="studio__collapse md:hidden"
              aria-label="Close sidebar"
              style={{ transform: "rotate(180deg)" }}
            >
              <IconChevron />
            </button>
          </div>

          {!collapsed && (
            <div className="studio__search">
              <div className="field">
                <IconSearch className="field__icon" />
                <input
                  type="text"
                  placeholder="Find a tool..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          )}

          {!collapsed && favorites.length > 0 && !search && (
            <div className="px-3 pb-3 border-b border-white/10">
              <div className="studio__group-label flex items-center gap-1.5 !px-0 !pb-2">
                <IconStar style={{ color: "#FFD166", width: "0.7rem", height: "0.7rem" }} />
                Favorites
              </div>
              <div className="flex flex-wrap gap-1.5">
                {favorites.map((id) => {
                  const t = TOOLS.find((x) => x.id === id);
                  if (!t) return null;
                  const FavIcon = t.Icon;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`pill ${activeTab === id ? "pill--active" : ""}`}
                      style={!activeTab === id ? {} : { borderColor: t.color, color: t.color, background: `${t.color}15` }}
                    >
                      <FavIcon style={{ width: "0.75rem", height: "0.75rem" }} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <nav className="studio__nav">
            {Object.entries(grouped).map(([group, tools]) => (
              <div key={group} className="mb-1">
                {!collapsed && <div className="studio__group-label">{group}</div>}
                {tools.map((t) => {
                  const ToolIcon = t.Icon;
                  const isActive = activeTab === t.id;
                  const isFav = favorites.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setActiveTab(t.id); setMobileNavOpen(false); }}
                      className={`studio__item ${isActive ? "studio__item--active" : ""}`}
                      title={collapsed ? t.label : undefined}
                    >
                      <span className="studio__item-icon" style={{ color: t.color }}>
                        <ToolIcon />
                      </span>
                      {!collapsed && (
                        <>
                          <span className="studio__item-label">{t.label}</span>
                          {t.badge && <span className="studio__item-badge">{t.badge}</span>}
                          <button
                            type="button"
                            className={`studio__fav ${isFav ? "studio__fav--on" : ""}`}
                            onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }}
                            aria-label="Toggle favorite"
                          >
                            <IconStar />
                          </button>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="studio__sidebar-foot">
            <Link href="/pricing" className="studio__user">
              <div className="studio__avatar">W</div>
              {!collapsed && (
                <div className="studio__user-meta">
                  <div className="studio__user-name">Wael Helmi</div>
                  <div className="studio__user-credits">
                    <IconBolt />
                    <span>100 credits</span>
                  </div>
                </div>
              )}
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="studio__main">
          <div className="studio__header">
            <button
              className="studio__collapse md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open tools"
            >
              <IconMenu />
            </button>
            <span className="studio__header-icon" style={{ color: activeTool.color }}>
              <activeTool.Icon />
            </span>
            <div>
              <h1>{activeTool.label} Studio</h1>
              <p>{activeTool.desc}</p>
            </div>
          </div>
          <div className="studio__body">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: EASE }}
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
    </>
  );
}