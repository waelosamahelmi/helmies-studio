"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import CommandPalette from "@/components/studio/CommandPalette";
import { apiFetch } from "@/lib/client-fetch";
import ChatStudio from "@/components/studio/ChatStudio";
import WorkflowBuilder from "@/components/studio/WorkflowBuilder";
import ProjectMemory from "@/components/studio/ProjectMemory";
import {
  IconImage, IconVideo, IconMusic, IconCamera, IconFilm, IconCut,
  IconMegaphone, IconMic, IconUsers, IconCrown,
  IconStar, IconBolt, IconArrowUpRight, IconClose, IconSparkle, IconMenu,
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
  const [activeTab, setActiveTab] = useState(initialTool || "orchestrator");
  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [pinnedGroup, setPinnedGroup] = useState(null);
  const [railOffset, setRailOffset] = useState(0);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

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

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await apiFetch("/api/generations/status?limit=50");
        const data = await res.json();
        if (data.generations) {
          setPendingCount(data.generations.filter((g) => g.status === "pending").length);
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
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
      <div className="grain" aria-hidden="true" />

      <div className="studio">
        {/* Mobile studio header — logo + credits */}
        <div className="studio__mobile-header">
          <Link href="/" className="studio__mobile-logo">
            <img src="/ico.svg" alt="" />
            <span>Studio</span>
          </Link>
          <Link href="/settings" className="studio__mobile-credits">
            <IconBolt />
          </Link>
        </div>
          {/* Mobile backdrop */}
          <AnimatePresence>
            {mobileNavOpen && (
              <motion.div
                className="studio__backdrop md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                onClick={() => setMobileNavOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* Sidebar — icon rail with hover flyout */}
        <aside className={`studio__rail ${mobileNavOpen ? "studio__rail--open" : ""}`} onMouseLeave={() => { setHoveredGroup(null); }}>
          {/* Mobile close button */}
          <button className="studio__rail-close md:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
            <IconClose />
          </button>
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

          {/* Footer — credits + pending */}
          <div className="studio__rail-foot">
            {pendingCount > 0 && (
              <div className="studio__pending-badge" title={`${pendingCount} generation${pendingCount > 1 ? "s" : ""} in progress`}>
                <span className="studio__pending-dot" />
                <span className="studio__pending-count">{pendingCount}</span>
              </div>
            )}
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
          {/* Mobile horizontal tabs */}
          <div className="studio__tabs">
            {TOOLS.filter(t => t.id !== "memory").map((t) => {
              const TabIcon = t.Icon;
              return (
                <button
                  key={t.id}
                  className={`studio__tab ${activeTab === t.id ? "studio__tab--active" : ""}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  <TabIcon />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Mobile hamburger toggle — hidden, replaced by tabs */}
          <button
            className="studio__hamburger md:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          >
            {mobileNavOpen ? <IconClose /> : <IconMenu />}
          </button>
          <div className="studio__body">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                layoutId="studio-content"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: EASE }}
                style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
              >
                {activeTab === "orchestrator" && <ChatStudio tool="orchestrator" />}
                {activeTab === "workflows" && <WorkflowBuilder />}
                {activeTab === "memory" && <ProjectMemory />}
                {activeTab !== "orchestrator" && activeTab !== "workflows" && activeTab !== "memory" && (
                  <ChatStudio tool={activeTab} key={activeTab} />
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