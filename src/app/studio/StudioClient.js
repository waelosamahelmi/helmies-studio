"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import CommandPalette from "@/components/studio/CommandPalette";
import { apiFetch } from "@/lib/client-fetch";
import ChatStudio from "@/components/studio/ChatStudio";
import WorkflowBuilder from "@/components/studio/WorkflowBuilder";
import ProjectMemory from "@/components/studio/ProjectMemory";
import BrandKitsView from "@/components/studio/BrandKitsView";
import CanvasWorkspace from "@/components/studio/CanvasWorkspace";
import DirectorWorkspace from "@/components/studio/DirectorWorkspace";
import AssetLibrary from "@/components/studio/AssetLibrary";
import MusicStudio from "@/components/studio/MusicStudio";
import VideoEditStudio from "@/components/studio/VideoEditStudio";
import AvatarStudio from "@/components/studio/AvatarStudio";
import ImageStudioV2 from "@/components/studio/ImageStudioV2";
import VideoStudioV2 from "@/components/studio/VideoStudioV2";
import AudioStudioV2 from "@/components/studio/AudioStudioV2";
import CinemaStudioV2 from "@/components/studio/CinemaStudioV2";
import LipSyncStudioV2 from "@/components/studio/LipSyncStudioV2";
import RecastStudioV2 from "@/components/studio/RecastStudioV2";
import InfluencerStudioV2 from "@/components/studio/InfluencerStudioV2";
import MarketingStudioV2 from "@/components/studio/MarketingStudioV2";
import MotionStudioV2 from "@/components/studio/MotionStudioV2";
import ClippingStudioV2 from "@/components/studio/ClippingStudioV2";
import {
  IconImage, IconVideo, IconMusic, IconCamera, IconFilm, IconCut,
  IconMegaphone, IconMic, IconUsers, IconCrown,
  IconStar, IconBolt, IconClose, IconSparkle, IconMenu, IconPlay, IconDownload,
  IconChevron, IconSearch, IconSettings, IconShield,
} from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];
const SIDEBAR_KEY = "helmies.studio.sidebar";

// All 20 tools. `group` maps onto the CREATE/BUILD IA (see STUDIO_UI_REBUILD.md §2).
const TOOLS = [
  { id: "orchestrator", label: "Agent", desc: "AI agent that plans & executes tasks", Icon: IconSparkle, color: "#FF1B6B", group: "create", badge: "New" },
  { id: "image", label: "Image", desc: "Text-to-image & image-to-image", Icon: IconImage, color: "#FF1B6B", group: "create", badge: "32" },
  { id: "video", label: "Video", desc: "Text, image & video-to-video", Icon: IconVideo, color: "#7C3AED", group: "create", badge: "17" },
  { id: "director", label: "Director", desc: "Multi-shot video production planner", Icon: IconPlay, color: "#E040FB", group: "create", badge: "New" },
  { id: "audio", label: "Audio", desc: "Music, voice & sound effects", Icon: IconMusic, color: "#00E5FF", group: "create", badge: "7" },
  { id: "music", label: "Music", desc: "Suno music & ElevenLabs TTS", Icon: IconMusic, color: "#00E5FF", group: "create", badge: "New" },
  { id: "lipsync", label: "Lip Sync", desc: "Sync audio to portrait or video", Icon: IconMic, color: "#7C3AED", group: "create", badge: "9" },
  { id: "body-swap", label: "Recast", desc: "Recast faces into any scene", Icon: IconUsers, color: "#00E5FF", group: "create", badge: null },
  { id: "influencer", label: "Influencer", desc: "Build AI personas", Icon: IconCrown, color: "#FF6B35", group: "create", badge: null },
  { id: "avatar", label: "AI Avatar", desc: "Kling AI avatar animation", Icon: IconUsers, color: "#FF6B35", group: "create", badge: "New" },
  { id: "canvas", label: "Canvas", desc: "Visual composition editor & mask tools", Icon: IconImage, color: "#FF6B35", group: "create", badge: "New" },
  { id: "cinema", label: "Cinema", desc: "Cinematic camera controls", Icon: IconCamera, color: "#FF6B35", group: "create", badge: null },
  { id: "vibe-motion", label: "Motion", desc: "Motion graphics & remix", Icon: IconFilm, color: "#FFD166", group: "create", badge: null },
  { id: "video-edit", label: "Video Edit", desc: "Runway, Veo extend, Wan V2V", Icon: IconVideo, color: "#7C3AED", group: "create", badge: "New" },
  { id: "clipping", label: "Clipping", desc: "AI highlight extraction", Icon: IconCut, color: "#00E68A", group: "create", badge: null },
  { id: "marketing", label: "Marketing", desc: "UGC video ads & product shots", Icon: IconMegaphone, color: "#FF1B6B", group: "create", badge: "New" },
  { id: "workflows", label: "Workflows", desc: "Multi-step AI pipelines", Icon: IconBolt, color: "#7C3AED", group: "build", badge: null },
  { id: "brands", label: "Brand Kits", desc: "Manage brand identities", Icon: IconImage, color: "#7C3AED", group: "build", badge: null },
  { id: "memory", label: "Projects", desc: "Save & reuse characters, styles, assets", Icon: IconStar, color: "#FFD166", group: "build", badge: null },
  { id: "assets", label: "Assets", desc: "Media library & asset management", Icon: IconDownload, color: "#00E68A", group: "build", badge: null },
];

const TOOL_GROUPS = [
  { id: "create", label: "Create" },
  { id: "build", label: "Build" },
];

// Link groups: destinations that are routes, not in-shell tools.
const LINK_GROUPS = [
  {
    id: "library",
    label: "Library",
    items: [
      { id: "generations", label: "Generations", desc: "Your generated media", href: "/gallery", Icon: IconImage },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      { id: "settings", label: "Settings", desc: "Account, credits & API keys", href: "/settings", Icon: IconSettings },
      { id: "billing", label: "Billing", desc: "Plans & subscriptions", href: "/pricing", Icon: IconBolt },
    ],
  },
];

const ADMIN_GROUP = {
  id: "admin",
  label: "Admin",
  items: [
    { id: "admin", label: "Dashboard", desc: "Admin overview", href: "/admin", Icon: IconShield },
  ],
};

// Bottom nav on mobile: quick-switch tools + drawer trigger.
const MOBILE_PRIMARY = ["orchestrator", "image", "video", "assets"];

export default function StudioPage({ initialTool, initialModel }) {
  const [activeTab, setActiveTab] = useState(initialTool || "orchestrator");
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({ create: true, build: true });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [credits, setCredits] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Restore sidebar collapse preference after mount (avoids hydration mismatch).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  // Session (admin detection, same pattern as Navbar.js).
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => setIsAdmin(s?.user?.role === "admin"))
      .catch(() => {});
  }, []);

  // Credits balance for the top-bar chip.
  useEffect(() => {
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.credits === "number") setCredits(d.credits);
      })
      .catch(() => {});
  }, []);

  // ⌘K / Ctrl+K toggles the command palette.
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

  // Pending-generations polling (unchanged): 10s base, 1.5x backoff to 60s,
  // pauses while the tab is hidden.
  useEffect(() => {
    let interval;
    let cancelled = false;
    let backoff = 10000;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await apiFetch("/api/generations/status?limit=50");
        const data = await res.json();
        if (data.generations) {
          setPendingCount(data.generations.filter((g) => g.status === "pending").length);
        }
        backoff = 10000;
      } catch {
        backoff = Math.min(backoff * 1.5, 60000);
      }
      if (!cancelled) {
        clearInterval(interval);
        interval = setInterval(poll, backoff);
      }
    };
    poll();
    interval = setInterval(poll, backoff);

    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else if (!cancelled) {
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const activeTool = TOOLS.find((t) => t.id === activeTab) || TOOLS[0];
  const ActiveIcon = activeTool.Icon;

  const selectTool = (id) => {
    setActiveTab(id);
    setMobileNavOpen(false);
  };

  const toggleGroup = (id) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderToolItem = (t) => {
    const ToolIcon = t.Icon;
    const isActive = activeTab === t.id;
    return (
      <button
        key={t.id}
        onClick={() => selectTool(t.id)}
        className={`studio__side-item ${isActive ? "studio__side-item--active" : ""}`}
        style={{ "--tool-color": t.color }}
        title={collapsed ? t.label : undefined}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="studio__side-item-icon">
          <ToolIcon />
        </span>
        <span className="studio__side-item-label">{t.label}</span>
        {t.badge && (
          <span className={`studio__side-item-badge ${t.badge === "New" ? "studio__side-item-badge--new" : ""}`}>
            {t.badge}
          </span>
        )}
      </button>
    );
  };

  const renderLinkItem = (item) => {
    const ItemIcon = item.Icon;
    return (
      <Link
        key={item.id}
        href={item.href}
        className="studio__side-item"
        title={collapsed ? item.label : undefined}
        onClick={() => setMobileNavOpen(false)}
      >
        <span className="studio__side-item-icon">
          <ItemIcon />
        </span>
        <span className="studio__side-item-label">{item.label}</span>
      </Link>
    );
  };

  const renderGroup = (group, items, renderItems) => {
    const isOpen = openGroups[group.id] !== false;
    return (
      <div className="studio__side-group" key={group.id}>
        <button
          className="studio__side-group-head"
          onClick={() => toggleGroup(group.id)}
          aria-expanded={isOpen}
        >
          <span className="studio__side-group-label">{group.label}</span>
          <span className="studio__side-group-count">{items.length}</span>
          <IconChevron />
        </button>
        <div className={`studio__side-group-items ${isOpen ? "" : "studio__side-group-items--closed"}`}>
          <div className="studio__side-group-inner">{renderItems()}</div>
        </div>
      </div>
    );
  };

  const linkGroups = isAdmin ? [...LINK_GROUPS, ADMIN_GROUP] : LINK_GROUPS;

  return (
    <MotionConfig reducedMotion="user">
      <div className="grain" aria-hidden="true" />

      <div className="studio">
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

        {/* Sidebar — grouped, collapsible; slide-over drawer on mobile */}
        <aside
          className={`studio__side ${collapsed ? "studio__side--collapsed" : ""} ${mobileNavOpen ? "studio__side--open" : ""}`}
        >
          <div className="studio__side-head">
            <Link href="/" className="studio__side-logo" aria-label="Helmies Studio home">
              <img src="/ico.svg" alt="" />
              <span className="studio__side-wordmark">Studio</span>
            </Link>
            <button
              className="studio__side-close md:hidden"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            >
              <IconClose />
            </button>
            <button
              className="studio__side-collapse"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <IconChevron />
            </button>
          </div>

          <nav className="studio__side-nav" aria-label="Studio tools">
            {TOOL_GROUPS.map((group) =>
              renderGroup(group, TOOLS.filter((t) => t.group === group.id), () =>
                TOOLS.filter((t) => t.group === group.id).map(renderToolItem)
              )
            )}
            {linkGroups.map((group) => renderGroup(group, group.items, () => group.items.map(renderLinkItem)))}
          </nav>
        </aside>

        {/* Workspace column */}
        <div className="studio__content">
          {/* Top bar */}
          <header className="studio__topbar">
            <button
              className="studio__topbar-menu md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <IconMenu />
            </button>

            <div className="studio__topbar-title">
              <span className="studio__topbar-icon" style={{ "--tool-color": activeTool.color }}>
                <ActiveIcon />
              </span>
              <div className="studio__topbar-text">
                <span className="studio__topbar-label">{activeTool.label}</span>
                <span className="studio__topbar-desc">{activeTool.desc}</span>
              </div>
            </div>

            <div className="studio__topbar-actions">
              <button
                className="studio__topbar-cmdk"
                onClick={() => setCmdOpen(true)}
                aria-label="Search tools (Command K)"
              >
                <IconSearch />
                <span className="studio__topbar-cmdk-text">Search tools</span>
                <kbd className="studio__topbar-kbd">⌘K</kbd>
              </button>

              {pendingCount > 0 && (
                <Link
                  href="/gallery"
                  className="studio__topbar-jobs"
                  title={`${pendingCount} generation${pendingCount > 1 ? "s" : ""} in progress`}
                >
                  <span className="studio__pending-dot" />
                  <span className="studio__pending-count">{pendingCount}</span>
                  <span className="studio__topbar-jobs-label">running</span>
                </Link>
              )}

              <Link href="/settings" className="studio__topbar-credits" aria-label="Credits and settings">
                <IconBolt />
                <span className="studio__topbar-credits-count">{credits === null ? "···" : credits}</span>
              </Link>
            </div>
          </header>

          {/* Workspace */}
          <main className="studio__main">
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
                  {activeTab === "orchestrator" && <ChatStudio tool="orchestrator" initialModel={initialModel} />}
                  {activeTab === "workflows" && <WorkflowBuilder />}
                  {activeTab === "memory" && <ProjectMemory />}
                  {activeTab === "brands" && <BrandKitsView />}
                  {activeTab === "canvas" && <CanvasWorkspace />}
                  {activeTab === "director" && <DirectorWorkspace />}
                  {activeTab === "assets" && <AssetLibrary />}
                  {activeTab === "music" && <MusicStudio />}
                  {activeTab === "video-edit" && <VideoEditStudio />}
                  {activeTab === "avatar" && <AvatarStudio />}
                  {activeTab === "image" && <ImageStudioV2 initialModel={initialModel} />}
                  {activeTab === "video" && <VideoStudioV2 initialModel={initialModel} />}
                  {activeTab === "audio" && <AudioStudioV2 />}
                  {activeTab === "cinema" && <CinemaStudioV2 />}
                  {activeTab === "lipsync" && <LipSyncStudioV2 />}
                  {(activeTab === "body-swap" || activeTab === "recast") && <RecastStudioV2 />}
                  {activeTab === "influencer" && <InfluencerStudioV2 />}
                  {activeTab === "marketing" && <MarketingStudioV2 />}
                  {(activeTab === "vibe-motion" || activeTab === "motion") && <MotionStudioV2 />}
                  {activeTab === "clipping" && <ClippingStudioV2 />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav className="studio__bottomnav" aria-label="Primary tools">
          {MOBILE_PRIMARY.map((id) => {
            const t = TOOLS.find((x) => x.id === id);
            const NavIcon = t.Icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                className={`studio__bottomnav-item ${isActive ? "studio__bottomnav-item--active" : ""}`}
                onClick={() => selectTool(t.id)}
                aria-current={isActive ? "page" : undefined}
              >
                <NavIcon />
                <span>{t.label}</span>
              </button>
            );
          })}
          <button className="studio__bottomnav-item" onClick={() => setMobileNavOpen(true)} aria-label="Open all tools">
            <IconMenu />
            <span>Menu</span>
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {cmdOpen && (
          <CommandPalette
            onSelect={(id) => {
              setActiveTab(id);
              setCmdOpen(false);
            }}
            onClose={() => setCmdOpen(false)}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
