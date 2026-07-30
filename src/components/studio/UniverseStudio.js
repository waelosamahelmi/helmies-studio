"use client";

export default function UniverseStudio({ initialTool = "image" }) {
  const page = initialTool === "orchestrator" ? "agent" : initialTool === "body-swap" ? "recast" : initialTool === "memory" ? "projects" : initialTool === "vibe-motion" ? "motion" : initialTool;
  return (
    <iframe
      className="studio-universe-frame"
      src={`/api/studio/universe?page=${encodeURIComponent(page)}`}
      title="Helmies Command Universe"
      allow="clipboard-write; fullscreen"
    />
  );
}
