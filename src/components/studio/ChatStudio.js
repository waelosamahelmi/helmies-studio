"use client";

import { lazy, Suspense } from "react";
import SimpleMode from "./modes/SimpleMode";
import OrchestratorMode from "./modes/OrchestratorMode";
const ImageStudioV2 = lazy(() => import("./ImageStudioV2"));
const VideoStudioV2 = lazy(() => import("./VideoStudioV2"));
const AudioStudioV2 = lazy(() => import("./AudioStudioV2"));
const LipSyncStudioV2 = lazy(() => import("./LipSyncStudioV2"));
const RecastStudioV2 = lazy(() => import("./RecastStudioV2"));
const CinemaStudioV2 = lazy(() => import("./CinemaStudioV2"));
const InfluencerStudioV2 = lazy(() => import("./InfluencerStudioV2"));
const MarketingStudioV2 = lazy(() => import("./MarketingStudioV2"));
const MotionStudioV2 = lazy(() => import("./MotionStudioV2"));
const ClippingStudioV2 = lazy(() => import("./ClippingStudioV2"));

// SimpleMode is now only a fallback for tools without a dedicated V2 workspace.
const TOOL_MODES = [];

function StudioFallback() {
  return <div className="studio__loading"><div className="studio__spinner" />Loading workspace...</div>;
}

export default function ChatStudio({ tool, initialModel }) {
  if (tool === "image") {
    return <Suspense fallback={<StudioFallback />}><ImageStudioV2 initialModel={initialModel} /></Suspense>;
  }
  if (tool === "video") {
    return <Suspense fallback={<StudioFallback />}><VideoStudioV2 initialModel={initialModel} /></Suspense>;
  }
  if (tool === "audio") {
    return <Suspense fallback={<StudioFallback />}><AudioStudioV2 /></Suspense>;
  }
  if (tool === "cinema") {
    return <Suspense fallback={<StudioFallback />}><CinemaStudioV2 /></Suspense>;
  }
  if (tool === "lipsync") {
    return <Suspense fallback={<StudioFallback />}><LipSyncStudioV2 /></Suspense>;
  }
  if (tool === "body-swap" || tool === "recast") {
    return <Suspense fallback={<StudioFallback />}><RecastStudioV2 /></Suspense>;
  }
  if (tool === "influencer") {
    return <Suspense fallback={<StudioFallback />}><InfluencerStudioV2 /></Suspense>;
  }
  if (tool === "marketing") {
    return <Suspense fallback={<StudioFallback />}><MarketingStudioV2 /></Suspense>;
  }
  if (tool === "vibe-motion" || tool === "motion") {
    return <Suspense fallback={<StudioFallback />}><MotionStudioV2 /></Suspense>;
  }
  if (tool === "clipping") {
    return <Suspense fallback={<StudioFallback />}><ClippingStudioV2 /></Suspense>;
  }
  if (tool && tool !== "orchestrator" && TOOL_MODES.includes(tool)) {
    return <SimpleMode key={tool} tool={tool} initialModel={initialModel} />;
  }
  return <OrchestratorMode />;
}
