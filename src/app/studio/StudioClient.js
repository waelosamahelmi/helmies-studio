"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig, AnimatePresence, motion } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import UniverseShell from "@/components/studio/universe/UniverseShell";
import InstrumentOrbit from "@/components/studio/universe/InstrumentOrbit";
import InstrumentIndex from "@/components/studio/universe/InstrumentIndex";
import RecentConstellation from "@/components/studio/universe/RecentConstellation";
import CommandSurface from "@/components/studio/universe/CommandSurface";
import SpecializedWorkspace from "@/components/studio/universe/SpecializedWorkspace";
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
import { IconImage, IconVideo, IconMusic, IconCamera, IconFilm, IconCut, IconMegaphone, IconMic, IconUsers, IconCrown, IconStar, IconBolt, IconSparkle, IconPlay, IconDownload, IconSettings, IconShield } from "@/components/Icons";

const TOOLS = [
  ["orchestrator", "Agent", "Plan and execute creative productions", IconSparkle, "create"], ["image", "Image", "Generate and transform images", IconImage, "create"], ["video", "Video", "Generate and transform video", IconVideo, "create"], ["director", "Director", "Plan and execute multi-shot films", IconPlay, "create"], ["audio", "Audio", "Generate voice and sound", IconMusic, "create"], ["music", "Music", "Compose music and speech", IconMusic, "create"], ["lipsync", "Lip Sync", "Synchronize speech and performance", IconMic, "create"], ["body-swap", "Recast", "Transfer identity into a scene", IconUsers, "create"], ["influencer", "Influencer", "Build consistent AI personas", IconCrown, "create"], ["avatar", "AI Avatar", "Animate a speaking portrait", IconUsers, "create"], ["canvas", "Canvas", "Compose, mask, and refine visually", IconImage, "create"], ["cinema", "Cinema", "Direct cameras, lenses, and light", IconCamera, "create"], ["vibe-motion", "Motion", "Animate visual source material", IconFilm, "create"], ["video-edit", "Video Edit", "Extend and transform footage", IconVideo, "create"], ["clipping", "Clipping", "Find and produce editorial highlights", IconCut, "create"], ["marketing", "Marketing", "Produce campaign deliverables", IconMegaphone, "create"], ["workflows", "Workflows", "Connect repeatable creative pipelines", IconBolt, "build"], ["brands", "Brand Kits", "Control identity and visual guardrails", IconImage, "build"], ["memory", "Projects", "Reuse characters, styles, and memory", IconStar, "build"], ["assets", "Assets", "Manage production media", IconDownload, "build"],
].map(([id, label, desc, Icon, group]) => ({ id, label, desc, Icon, group }));
const QUICK = ["orchestrator", "image", "video", "director", "canvas", "assets", "workflows", "brands"];

const SPECIALIZED = { orchestrator: "agent", workflows: "workflows", memory: "projects", brands: "brands", canvas: "canvas", director: "director", assets: "assets", music: "music", "video-edit": "video-edit", avatar: "avatar" };

function Tool({ id, initialModel }) {
  const map = { orchestrator: <ChatStudio tool="orchestrator" initialModel={initialModel} />, workflows: <WorkflowBuilder />, memory: <ProjectMemory />, brands: <BrandKitsView />, canvas: <CanvasWorkspace />, director: <DirectorWorkspace />, assets: <AssetLibrary />, music: <MusicStudio />, "video-edit": <VideoEditStudio />, avatar: <AvatarStudio />, image: <ImageStudioV2 initialModel={initialModel} />, video: <VideoStudioV2 initialModel={initialModel} />, audio: <AudioStudioV2 />, cinema: <CinemaStudioV2 />, lipsync: <LipSyncStudioV2 />, "body-swap": <RecastStudioV2 />, influencer: <InfluencerStudioV2 />, marketing: <MarketingStudioV2 />, "vibe-motion": <MotionStudioV2 />, clipping: <ClippingStudioV2 /> };
  const content = map[id] || map.orchestrator;
  const spec = SPECIALIZED[id];
  return spec ? <SpecializedWorkspace tool={spec}>{content}</SpecializedWorkspace> : content;
}

export default function StudioClient({ initialTool = "orchestrator", initialModel }) {
  const router = useRouter();
  const [active, setActive] = useState(initialTool);
  const [indexOpen, setIndexOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  const [credits, setCredits] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [admin, setAdmin] = useState(false);
  const quickTools = useMemo(() => QUICK.map((id) => TOOLS.find((tool) => tool.id === id)), []);
  const destinations = useMemo(() => [{ label: "Generations", desc: "Generation history and active jobs", href: "/gallery", Icon: IconImage }, { label: "Settings", desc: "Account and generation defaults", href: "/settings", Icon: IconSettings }, { label: "Billing", desc: "Credits and subscription", href: "/settings?tab=billing", Icon: IconBolt }, ...(admin ? [{ label: "Admin", desc: "Operations control", href: "/admin", Icon: IconShield }] : [])], [admin]);

  const select = (id) => { setActive(id); setIndexOpen(false); router.push(`/studio/${id}`, { scroll: false }); };
  useEffect(() => { setActive(initialTool); }, [initialTool]);
  useEffect(() => {
    Promise.allSettled([apiFetch("/api/assets?limit=5").then((r) => r.ok ? r.json() : {}), apiFetch("/api/credits").then((r) => r.ok ? r.json() : {}), apiFetch("/api/auth/session").then((r) => r.ok ? r.json() : {})]).then(([a, c, s]) => { if (a.status === "fulfilled") setAssets((a.value.assets || []).filter((item) => item.url || item.outputUrl)); if (c.status === "fulfilled") setCredits(c.value.credits); if (s.status === "fulfilled") setAdmin(s.value?.user?.role === "admin"); });
  }, []);
  useEffect(() => {
    let timer; let stopped = false;
    const poll = async () => { try { const response = await apiFetch("/api/generations/status?limit=50"); const data = await response.json(); if (!stopped) setPendingCount((data.generations || []).filter((job) => ["pending", "processing"].includes(job.status)).length); } catch {} if (!stopped) timer = window.setTimeout(poll, 10000); };
    poll(); return () => { stopped = true; window.clearTimeout(timer); };
  }, []);
  useEffect(() => { const handler = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((value) => !value); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);

  return <MotionConfig reducedMotion="user"><UniverseShell credits={credits} pendingCount={pendingCount} onCommand={() => setCommandOpen(true)} orbit={<InstrumentOrbit tools={quickTools} active={active} onSelect={select} onOpenIndex={() => setIndexOpen(true)} />} index={<InstrumentIndex open={indexOpen} tools={TOOLS} destinations={destinations} onSelect={select} onClose={() => setIndexOpen(false)} />} recents={<RecentConstellation assets={assets} onOpen={() => select("assets")} />}><AnimatePresence mode="wait"><motion.div key={active} className="universe-tool" initial={{ opacity: 0, y: 12, scale: .995 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .32 }}><Tool id={active} initialModel={initialModel} /></motion.div></AnimatePresence></UniverseShell><CommandSurface open={commandOpen} onClose={() => setCommandOpen(false)} onSelect={select} /></MotionConfig>;
}
