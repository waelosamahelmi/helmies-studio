"use client";

import { useEffect, useState } from "react";
import { clock, IcCheck, IcAlert } from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   STEP PROGRESS — one plan step's live state (EDITSv1 E3.5)
   ──────────────────────────────────────────────────────────────────────────
   waiting / running / done / failed, with the agent name, the task, a real
   elapsed clock while running, and the step's credits once known. Driven by
   the review loop's /api/agent/step calls or the auto run's step events.
   ══════════════════════════════════════════════════════════════════════════ */

const AGENT_NAMES = {
  orchestrator: "Orchestrator", creative_director: "Creative director",
  image_director: "Image director", video_director: "Video director",
  brand_guardian: "Brand guardian", prompt_engineer: "Prompt engineer",
  storyboard: "Storyboard", audio_agent: "Audio", vision_analyst: "Vision analyst",
  quality_control: "Quality control", cost_optimizer: "Cost optimizer",
  assembly: "Assembly", image: "Image", video: "Video", audio: "Audio",
  website: "Website", marketing: "Marketing", coding: "Code",
};
const agentName = (a) => AGENT_NAMES[a] || String(a || "Step").replace(/_/g, " ");
const pad = (n) => String(n).padStart(2, "0");

function useElapsed(active) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) { setS(0); return; }
    setS(0);
    const t0 = Date.now();
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return s;
}

const STATUS_WORD = { waiting: "waiting", running: "running", done: "done", failed: "failed" };

export default function StepProgress({ item }) {
  const running = item.status === "running";
  const elapsed = useElapsed(running);
  const state =
    item.status === "done" ? "is-done"
    : running ? "is-running"
    : item.status === "failed" ? "is-failed" : "";

  return (
    <div className={`st-stepcard ${state}`} role="listitem" aria-label={`Step ${item.n}, ${STATUS_WORD[item.status] || "waiting"}`}>
      {running ? (
        <span className="hs-spin" style={{ width: 13, height: 13 }} aria-hidden="true" />
      ) : item.status === "done" ? (
        <IcCheck className="hs-icon-sm" style={{ color: "var(--signal)" }} aria-hidden="true" />
      ) : item.status === "failed" ? (
        <IcAlert className="hs-icon-sm" style={{ color: "var(--fault)" }} aria-hidden="true" />
      ) : (
        <span className="st-plan__n">{pad(item.n)}</span>
      )}

      <div className="st-stepcard__body">
        <span className="st-stepcard__agent">{agentName(item.agent)}</span>
        {item.task && <span className="st-stepcard__task">{item.task}</span>}
        {item.error && <span className="hs-error">{item.error}</span>}
      </div>

      <span className="st-stepcard__meta">
        {running && <span>{clock(elapsed)}</span>}
        {typeof item.credits === "number" && item.status === "done" && <span>{item.credits} cr</span>}
        <span>{STATUS_WORD[item.status] || "waiting"}</span>
      </span>
    </div>
  );
}
