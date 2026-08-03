"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";

import Shell from "@/components/studio/kit/Shell";
import { TOOL_IDS } from "@/components/studio/kit/tools";
import CommandPalette from "@/components/studio/CommandPalette";
import ErrorBoundary from "@/components/studio/v6/ErrorBoundary";

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

/* EDITSv1 E1.3: text→video and image→video are separate tools with a fixed
   mode each — module-scope wrappers keep a stable component identity across
   renders (an inline arrow here would remount the studio on every render). */
const TextToVideoStudio = (props) => <VideoStudio {...props} fixedMode="ttv" />;
const ImageToVideoStudio = (props) => <VideoStudio {...props} fixedMode="i2v" />;

const TOOL_COMPONENTS = {
  orchestrator: OrchestratorStudio,
  image: ImageStudio,
  video: TextToVideoStudio,
  i2v: ImageToVideoStudio,
  director: DirectorStudio,
  audio: AudioStudio,
  music: MusicStudio,
  lipsync: LipSyncStudio,
  "body-swap": RecastStudio,
  influencer: InfluencerStudio,
  avatar: AvatarStudio,
  canvas: CanvasStudio,
  cinema: CinemaStudio,
  "vibe-motion": MotionStudio,
  "video-edit": VideoEditStudio,
  clipping: ClippingStudio,
  marketing: MarketingStudio,
  workflows: WorkflowStudio,
  brands: BrandKitStudio,
  memory: MemoryStudio,
  assets: AssetLibraryStudio,
};

export default function StudioClient({ initialTool = "orchestrator", initialModel }) {
  const router = useRouter();
  const params = useSearchParams();

  const [active, setActive] = useState(TOOL_IDS.includes(initialTool) ? initialTool : "orchestrator");
  const [credits, setCredits] = useState(null);
  const [running, setRunning] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [templateConfig, setTemplateConfig] = useState(null);

  /* Follow the route when it changes from outside (back button, deep link) */
  useEffect(() => {
    if (TOOL_IDS.includes(initialTool)) setActive(initialTool);
  }, [initialTool]);

  const select = useCallback((id) => {
    if (!TOOL_IDS.includes(id) || id === active) return;
    setActive(id);
    router.push(`/studio/${id}`, { scroll: false });
  }, [active, router]);

  /* A template preloads a tool's settings */
  const templateSlug = params.get("template");
  useEffect(() => {
    if (!templateSlug) return;
    let dead = false;
    apiFetch(`/api/templates/${templateSlug}/apply`)
      .then((r) => r.json())
      .then((d) => { if (!dead && d?.config) setTemplateConfig(d.config); })
      .catch(() => {});
    return () => { dead = true; };
  }, [templateSlug]);

  /* Credit balance — refreshed whenever a generation settles */
  const loadCredits = useCallback(() => {
    apiFetch("/api/credits")
      .then((r) => r.json())
      .then((d) => setCredits(d?.credits ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCredits();
    const onSettled = () => loadCredits();
    window.addEventListener("generation:settled", onSettled);
    return () => window.removeEventListener("generation:settled", onSettled);
  }, [loadCredits]);

  /* Running jobs — polled while the tab is visible, paused when it is not */
  useEffect(() => {
    let dead = false;
    let timer;

    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await apiFetch("/api/generations/status?limit=50", { retries: 0 });
          const d = await r.json();
          if (!dead) {
            const n = (d.generations || []).filter((g) =>
              ["pending", "processing", "queued", "running"].includes(g.status),
            ).length;
            setRunning((prev) => {
              if (prev > 0 && n === 0) window.dispatchEvent(new Event("generation:settled"));
              return n;
            });
          }
        } catch { /* transient — try again next tick */ }
      }
      if (!dead) timer = setTimeout(tick, 10000);
    };

    tick();
    return () => { dead = true; clearTimeout(timer); };
  }, []);

  /* ⌘K / Ctrl+K */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Tool = TOOL_COMPONENTS[active] || OrchestratorStudio;

  return (
    <MotionConfig reducedMotion="user">
      <Shell
        active={active}
        onSelect={select}
        onCommand={() => setPaletteOpen(true)}
        credits={credits}
        running={running}
      >
        <ErrorBoundary key={active}>
          <Tool
            tool={active}
            initialModel={initialModel}
            templateConfig={templateConfig}
            onCreditsChanged={loadCredits}
          />
        </ErrorBoundary>
      </Shell>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={select}
        active={active}
      />
    </MotionConfig>
  );
}
