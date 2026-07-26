"use client";

import { lazy, Suspense } from "react";
import SimpleMode from "./modes/SimpleMode";
import OrchestratorMode from "./modes/OrchestratorMode";
const ImageStudioV2 = lazy(() => import("./ImageStudioV2"));
const VideoStudioV2 = lazy(() => import("./VideoStudioV2"));

const TOOL_MODES = ["image", "video", "audio", "cinema", "vibe-motion", "clipping", "marketing", "lipsync", "body-swap", "influencer"];

function StudioFallback() {
  return <div className="studio__loading"><div className="studio__spinner" />Loading workspace...</div>;
}

export default function ChatStudio({ tool }) {
  if (tool === "image") {
    return <Suspense fallback={<StudioFallback />}><ImageStudioV2 /></Suspense>;
  }
  if (tool === "video") {
    return <Suspense fallback={<StudioFallback />}><VideoStudioV2 /></Suspense>;
  }
  if (tool && tool !== "orchestrator" && TOOL_MODES.includes(tool)) {
    return <SimpleMode key={tool} tool={tool} />;
  }
  return <OrchestratorMode />;
}
