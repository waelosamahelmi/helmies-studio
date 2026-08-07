"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";

import Shell from "@/components/studio/kit/Shell";
import { TOOL_IDS } from "@/components/studio/kit/tools";
import CommandPalette from "@/components/studio/CommandPalette";
import ErrorBoundary from "@/components/studio/v6/ErrorBoundary";
import { useToast } from "@/components/ToastProvider";
import ShortcutHelp, { GO_KEYS } from "@/components/studio/ShortcutHelp";

import OrchestratorStudio from "@/components/studio/OrchestratorStudio";
import ImageStudio from "@/components/studio/ImageStudio";
import VideoStudio from "@/components/studio/VideoStudio";
import DirectorStudio from "@/components/studio/DirectorStudio";
import AudioStudio from "@/components/studio/AudioStudio";
import MusicStudio from "@/components/studio/MusicStudio";
import PerformStudio from "@/components/studio/PerformStudio";
import MarketingStudio from "@/components/studio/MarketingStudio";
import WorkflowStudio from "@/components/studio/WorkflowStudio";
import BrandKitStudio from "@/components/studio/BrandKitStudio";
import MemoryStudio from "@/components/studio/MemoryStudio";
import CharacterStudio from "@/components/studio/CharacterStudio";
import AssetLibraryStudio from "@/components/studio/AssetLibraryStudio";

/* S1: the 20-tool map consolidated into mode-switching studios. The retired
   slugs (canvas, cinema, influencer, i2v, vibe-motion, video-edit,
   body-swap, clipping, audio-tools, lipsync, avatar) redirect in
   src/app/studio/[tool]/page.js to their new studio + `?mode=` — the old
   surfaces live on as modes, not rail entries. */
const TOOL_COMPONENTS = {
  orchestrator: OrchestratorStudio,
  image: ImageStudio,
  video: VideoStudio,
  director: DirectorStudio,
  audio: AudioStudio,
  music: MusicStudio,
  perform: PerformStudio,
  marketing: MarketingStudio,
  workflows: WorkflowStudio,
  brands: BrandKitStudio,
  cast: CharacterStudio,
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
  const [keysOpen, setKeysOpen] = useState(false);
  const chordRef = useRef(null);
  const [templateConfig, setTemplateConfig] = useState(null);
  const [isPending, startTransition] = useTransition();

  /* Follow the route when it changes from outside (back button, deep link) */
  useEffect(() => {
    if (TOOL_IDS.includes(initialTool)) setActive(initialTool);
  }, [initialTool]);

  const select = useCallback((id) => {
    if (!TOOL_IDS.includes(id) || id === active) return;
    startTransition(() => {
      setActive(id);
      router.push(`/studio/${id}`, { scroll: false });
    });
  }, [active, router]);

  /* A template preloads a tool's settings. The handoff must be visible:
     the user just clicked "Open in studio" on a template page, and without
     feedback a failed apply is indistinguishable from a successful one.
     The toast handle is held in a ref because the provider hands out a
     fresh object literal every render — depending on it directly would
     re-apply the template on every parent render. */
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const templateSlug = params.get("template");
  useEffect(() => {
    if (!templateSlug) return;
    let dead = false;
    apiFetch(`/api/templates/${templateSlug}/apply`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (dead) return;
        if (d?.config) {
          setTemplateConfig(d.config);
          toastRef.current?.addToast(`Template loaded — ${d.name || templateSlug} settings applied`, "success");
        } else {
          toastRef.current?.addToast("That template could not be loaded", "error");
        }
      })
      .catch(() => { if (!dead) toastRef.current?.addToast("That template could not be loaded", "error"); });
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

  /* Global shortcuts.

     Typing must never be hijacked: a bare "g" is a letter in a brief, not a
     command. So the unmodified keys are ignored while focus is in a field,
     and only the modified ones (⌘K) work everywhere. `?` opens the map —
     shortcuts nobody can discover may as well not exist. */
  useEffect(() => {
    const typing = (el) =>
      !!el && (el.isContentEditable
        || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      if (e.altKey || typing(document.activeElement)) return;

      if (e.key === "?") {
        e.preventDefault();
        setKeysOpen((v) => !v);
        return;
      }

      /* g then a tool letter — the two-key idiom from Gmail and GitHub,
         which is what a keyboard user reaches for first. */
      if (!mod && e.key.toLowerCase() === "g") {
        chordRef.current = window.setTimeout(() => { chordRef.current = null; }, 1200);
        return;
      }
      if (chordRef.current) {
        const target = GO_KEYS[e.key.toLowerCase()];
        window.clearTimeout(chordRef.current);
        chordRef.current = null;
        if (target) { e.preventDefault(); select(target); }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const Tool = TOOL_COMPONENTS[active] || OrchestratorStudio;

  return (
    <MotionConfig reducedMotion="user">
      <Shell
        active={active}
        onSelect={select}
        onCommand={() => setPaletteOpen(true)}
        onKeys={() => setKeysOpen(true)}
        credits={credits}
        running={running}
      >
        {/* Tool-switch loading bar — sits at the top of the work area and
            resolves in under a frame for warm components, so it is only
            visible when a heavier tool needs its first paint. */}
        {isPending && (
          <div
            aria-busy="true"
            style={{
              position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
              height: 2, background: "var(--filament)",
              animation: "hs-loading-bar 0.8s ease infinite",
            }}
          />
        )}
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

      <ShortcutHelp open={keysOpen} onClose={() => setKeysOpen(false)} />
    </MotionConfig>
  );
}
