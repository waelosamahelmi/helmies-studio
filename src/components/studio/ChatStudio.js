"use client";

import SimpleMode from "./modes/SimpleMode";
import OrchestratorMode from "./modes/OrchestratorMode";

const TOOL_MODES = ["image", "video", "audio", "cinema", "vibe-motion", "clipping", "marketing", "lipsync", "body-swap", "influencer"];

export default function ChatStudio({ tool }) {
  if (tool && tool !== "orchestrator" && TOOL_MODES.includes(tool)) {
    return <SimpleMode key={tool} tool={tool} />;
  }

  return <OrchestratorMode />;
}
