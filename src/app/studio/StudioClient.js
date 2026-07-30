"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";

// ── Universe Shell (v6) ──
import UniverseShell from "@/components/studio/universe/UniverseShell";
import InstrumentOrbit from "@/components/studio/universe/InstrumentOrbit";
import RecentConstellation from "@/components/studio/universe/RecentConstellation";

// ── v6 Studio Components ──
import OrchestratorStudio from "@/components/studio/OrchestratorStudio";
import ImageStudio from "@/components/studio/ImageStudio";
import VideoStudio from "@/components/studio/VideoStudio";
import DirectorStudio from "@/components/studio/DirectorStudio";
import AudioStudio from "@/components/studio/AudioStudio";
import MusicStudio from "@/components/studio/MusicStudio";
import LipSyncStudio from "@/components/studio/LipSyncStudio";
import RecastStudio from "@/components/studio/RecastStudio";
import InfluencerStudio from "@/components/studio/InfluencerStudio";
import AvatarStudio from "@/components/studio/AvatarStudio";
import CanvasStudio from "@/components/studio/CanvasStudio";
import CinemaStudio from "@/components/studio/CinemaStudio";
import MotionStudio from "@/components/studio/MotionStudio";
import VideoEditStudio from "@/components/studio/VideoEditStudio";
import ClippingStudio from "@/components/studio/ClippingStudio";
import MarketingStudio from "@/components/studio/MarketingStudio";
import WorkflowStudio from "@/components/studio/WorkflowStudio";
import BrandKitStudio from "@/components/studio/BrandKitStudio";
import MemoryStudio from "@/components/studio/MemoryStudio";
import AssetLibraryStudio from "@/components/studio/AssetLibraryStudio";

// ── Icons ──
import {
  IconImage, IconVideo, IconMusic, IconCamera, IconFilm, IconCut,
  IconMegaphone, IconMic, IconUsers, IconCrown, IconStar, IconBolt,
  IconSparkle, IconPlay, IconDownload, IconSettings, IconShield,
} from "@/components/Icons";

// ═══════════════════════════════════════════════════════════════════════
// Tool registry — all 20 creative instruments
// ═══════════════════════════════════════════════════════════════════════

const TOOLS = [
  ["orchestrator", "Agent",      "Plan and execute creative productions",      IconSparkle,  "create"],
  ["image",        "Image",      "Generate and transform images",              IconImage,    "create"],
  ["video",        "Video",      "Generate and transform video",               IconVideo,    "create"],
  ["director",     "Director",   "Plan and execute multi-shot films",          IconPlay,     "create"],
  ["audio",        "Audio",      "Generate voice and sound",                   IconMusic,    "create"],
  ["music",        "Music",      "Compose music and speech",                   IconMusic,    "create"],
  ["lipsync",      "Lip Sync",   "Synchronize speech and performance",         IconMic,      "create"],
  ["body-swap",    "Recast",     "Transfer identity into a scene",             IconUsers,    "create"],
  ["influencer",   "Influencer", "Build consistent AI personas",               IconCrown,    "create"],
  ["avatar",       "AI Avatar",  "Animate a speaking portrait",                IconUsers,    "create"],
  ["canvas",       "Canvas",     "Compose, mask, and refine visually",         IconImage,    "create"],
  ["cinema",       "Cinema",     "Direct cameras, lenses, and light",          IconCamera,   "create"],
  ["vibe-motion",  "Motion",     "Animate visual source material",             IconFilm,     "create"],
  ["video-edit",   "Video Edit", "Extend and transform footage",               IconVideo,    "create"],
  ["clipping",     "Clipping",   "Find and produce editorial highlights",      IconCut,      "create"],
  ["marketing",    "Marketing",  "Produce campaign deliverables",              IconMegaphone,"create"],
  ["workflows",    "Workflows",  "Connect repeatable creative pipelines",      IconBolt,     "build"],
  ["brands",       "Brand Kits", "Control identity and visual guardrails",     IconImage,    "build"],
  ["memory",       "Projects",   "Reuse characters, styles, and memory",       IconStar,     "build"],
  ["assets",       "Assets",     "Manage production media",                    IconDownload, "build"],
].map(([id, label, desc, Icon, group]) => ({ id, label, desc, Icon, group }));

const QUICK = ["orchestrator", "image", "video", "director", "canvas", "assets", "workflows", "brands"];

// ═══════════════════════════════════════════════════════════════════════
// Tool component resolver
// ═══════════════════════════════════════════════════════════════════════

function Tool({ id, initialModel }) {
  const map = {
    // v6 studio components
    orchestrator: <OrchestratorStudio tool="orchestrator" initialModel={initialModel} />,
    image:        <ImageStudio initialModel={initialModel} />,
    video:        <VideoStudio initialModel={initialModel} />,
    director:     <DirectorStudio />,
    audio:        <AudioStudio />,
    music:        <MusicStudio />,
    lipsync:      <LipSyncStudio />,
    "body-swap":  <RecastStudio />,
    influencer:   <InfluencerStudio />,
    avatar:       <AvatarStudio />,
    canvas:       <CanvasStudio />,
    cinema:       <CinemaStudio />,
    "vibe-motion":<MotionStudio />,
    "video-edit": <VideoEditStudio />,
    clipping:     <ClippingStudio />,
    marketing:    <MarketingStudio />,
    workflows:    <WorkflowStudio />,
    brands:       <BrandKitStudio />,
    memory:       <MemoryStudio />,
    assets:       <AssetLibraryStudio />,
  };

  return map[id] || map.orchestrator;
}

// ═══════════════════════════════════════════════════════════════════════
// StudioClient — root studio experience
// ═══════════════════════════════════════════════════════════════════════

export default function StudioClient({ initialTool = "orchestrator", initialModel }) {
  const router = useRouter();

  // ── state ──
  const [active, setActive] = useState(initialTool);
  const [indexOpen, setIndexOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  const [credits, setCredits] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [admin, setAdmin] = useState(false);

  // ── derived ──
  const quickTools = useMemo(
    () => QUICK.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean),
    [],
  );

  const destinations = useMemo(
    () => [
      { label: "Generations", desc: "Generation history and active jobs", href: "/gallery",           Icon: IconImage },
      { label: "Settings",    desc: "Account and generation defaults",    href: "/settings",          Icon: IconSettings },
      { label: "Billing",     desc: "Credits and subscription",          href: "/settings?tab=billing", Icon: IconBolt },
      ...(admin ? [{ label: "Admin", desc: "Operations control", href: "/admin", Icon: IconShield }] : []),
    ],
    [admin],
  );

  // ── navigation ──
  const select = (id) => {
    setActive(id);
    setIndexOpen(false);
    router.push(`/studio/${id}`, { scroll: false });
  };

  // sync active tool when route changes externally
  useEffect(() => { setActive(initialTool); }, [initialTool]);

  // ── data fetching ──
  useEffect(() => {
    Promise.allSettled([
      apiFetch("/api/assets?limit=5").then((r) => (r.ok ? r.json() : {})),
      apiFetch("/api/credits").then((r) => (r.ok ? r.json() : {})),
      apiFetch("/api/auth/session").then((r) => (r.ok ? r.json() : {})),
    ]).then(([a, c, s]) => {
      if (a.status === "fulfilled") setAssets((a.value.assets || []).filter((item) => item.url || item.outputUrl));
      if (c.status === "fulfilled") setCredits(c.value.credits);
      if (s.status === "fulfilled") setAdmin(s.value?.user?.role === "admin");
    });
  }, []);

  // ── generation status polling ──
  useEffect(() => {
    let timer;
    let stopped = false;

    const poll = async () => {
      try {
        const response = await apiFetch("/api/generations/status?limit=50");
        const data = await response.json();
        if (!stopped) {
          setPendingCount(
            (data.generations || []).filter((job) =>
              ["pending", "processing"].includes(job.status),
            ).length,
          );
        }
      } catch {
        /* ignore polling errors */
      }
      if (!stopped) timer = window.setTimeout(poll, 10_000);
    };

    poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  // ── keyboard shortcut: Ctrl+K → command palette ──
  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  return (
    <MotionConfig reducedMotion="user">
      <UniverseShell
        credits={credits}
        pendingCount={pendingCount}
        onCommand={() => setCommandOpen(true)}
        orbit={
          <InstrumentOrbit
            tools={quickTools}
            active={active}
            onSelect={select}
            onOpenIndex={() => setIndexOpen(true)}
          />
        }
        recents={
          <RecentConstellation assets={assets} onOpen={() => select("assets")} />
        }
      >
        <AnimatePresence mode="wait">
          <Tool key={active} id={active} initialModel={initialModel} />
        </AnimatePresence>
      </UniverseShell>
    </MotionConfig>
  );
}
