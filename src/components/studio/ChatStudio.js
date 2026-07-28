"use client";

import SimpleMode from "./modes/SimpleMode";
import OrchestratorMode from "./modes/OrchestratorMode";
import ImageStudioV2 from "./ImageStudioV2";
import VideoStudioV2 from "./VideoStudioV2";
import AudioStudioV2 from "./AudioStudioV2";
import LipSyncStudioV2 from "./LipSyncStudioV2";
import RecastStudioV2 from "./RecastStudioV2";
import CinemaStudioV2 from "./CinemaStudioV2";
import InfluencerStudioV2 from "./InfluencerStudioV2";
import MarketingStudioV2 from "./MarketingStudioV2";
import MotionStudioV2 from "./MotionStudioV2";
import ClippingStudioV2 from "./ClippingStudioV2";

// SimpleMode is now only a fallback for tools without a dedicated V2 workspace.
const TOOL_MODES = [];

export default function ChatStudio({ tool, initialModel }) {
  if (tool === "image") return <ImageStudioV2 initialModel={initialModel} />;
  if (tool === "video") return <VideoStudioV2 initialModel={initialModel} />;
  if (tool === "audio") return <AudioStudioV2 />;
  if (tool === "cinema") return <CinemaStudioV2 />;
  if (tool === "lipsync") return <LipSyncStudioV2 />;
  if (tool === "body-swap" || tool === "recast") return <RecastStudioV2 />;
  if (tool === "influencer") return <InfluencerStudioV2 />;
  if (tool === "marketing") return <MarketingStudioV2 />;
  if (tool === "vibe-motion" || tool === "motion") return <MotionStudioV2 />;
  if (tool === "clipping") return <ClippingStudioV2 />;
  if (tool && tool !== "orchestrator" && TOOL_MODES.includes(tool)) {
    return <SimpleMode key={tool} tool={tool} initialModel={initialModel} />;
  }
  return <OrchestratorMode />;
}
