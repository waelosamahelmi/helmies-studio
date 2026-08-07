// ── Shared agent display names (Phase 0.3) ─────────────────────────────────
// Single source for agent-kind → display label across the orchestrator UI.
// Replaces three divergent in-file copies (OrchestratorStudio, PlanApproval,
// StepProgress — the StepProgress copy was missing i2v/upscale/music/
// voiceover/export and fell back to raw underscore text there).
export const AGENT_NAMES = {
  orchestrator: "Orchestrator",
  creative_director: "Creative director",
  image_director: "Image director",
  video_director: "Video director",
  brand_guardian: "Brand guardian",
  prompt_engineer: "Prompt engineer",
  storyboard: "Storyboard",
  audio_agent: "Audio",
  vision_analyst: "Vision analyst",
  quality_control: "Quality control",
  cost_optimizer: "Cost optimizer",
  assembly: "Assembly",
  image: "Image",
  video: "Video",
  audio: "Audio",
  website: "Website",
  marketing: "Marketing",
  coding: "Code",
  i2v: "Animate",
  upscale: "Upscale",
  music: "Music",
  voiceover: "Voiceover",
  export: "Deliverable",
};

export const agentDisplayName = (a) => AGENT_NAMES[a] || String(a || "Step").replace(/_/g, " ");
