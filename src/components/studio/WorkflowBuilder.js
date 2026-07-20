"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { IconBolt, IconArrowUpRight, IconFilm, IconImage, IconVideo, IconMusic, IconCrown } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];
const AGENT_OPTIONS = [
  { id: "image", name: "Image", icon: IconImage },
  { id: "video", name: "Video", icon: IconVideo },
  { id: "audio", name: "Audio", icon: IconMusic },
  { id: "website", name: "Website", icon: IconFilm },
  { id: "marketing", name: "Marketing", icon: IconCrown },
  { id: "coding", name: "Coding", icon: IconBolt },
];

const TEMPLATES = [
  {
    name: "Image → Video Pipeline",
    description: "Generate an image, then animate it into a video",
    steps: [
      { agent: "image", task: "Generate hero image", params: { model: "flux-dev", prompt: "$INPUT_prompt", aspect_ratio: "16:9" } },
      { agent: "video", task: "Animate the image", params: { model: "kling-v2.1-i2v", image_url: "$STEP_1_OUTPUT", prompt: "$INPUT_motion", duration: 5 } },
    ],
  },
  {
    name: "Marketing Campaign",
    description: "Generate images and create marketing content",
    steps: [
      { agent: "image", task: "Generate product image", params: { model: "flux-dev", prompt: "$INPUT_product", aspect_ratio: "1:1" } },
      { agent: "marketing", task: "Create ad copy", params: { prompt: "Create an ad for: $INPUT_product" } },
    ],
  },
  {
    name: "Character → Scene",
    description: "Create a character, then place them in a scene",
    steps: [
      { agent: "image", task: "Generate character", params: { model: "nano-banana-pro", prompt: "$INPUT_character", aspect_ratio: "3:4" } },
      { agent: "image", task: "Place in scene", params: { model: "nano-banana-pro-edit", prompt: "$INPUT_scene", image_url: "$STEP_1_OUTPUT", aspect_ratio: "16:9" } },
    ],
  },
];

function AnimatedLine({ index, total }) {
  if (index >= total - 1) return null;
  return (
    <div className="workflow-line">
      <svg width="2" height="40" viewBox="0 0 2 40">
        <motion.line
          x1="1" y1="0" x2="1" y2="40"
          stroke="#FF1B6B"
          strokeWidth="2"
          strokeDasharray="4 4"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.4 }}
          transition={{ duration: 0.6, ease: EASE, delay: index * 0.15 }}
        />
        <motion.circle
          cx="1" cy="0" r="2"
          fill="#FF1B6B"
          initial={{ cy: 0 }}
          animate={{ cy: [0, 40] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: index * 0.3 }}
        />
      </svg>
    </div>
  );
}

export default function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState([]);
  const [templates] = useState(TEMPLATES);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);

  const loadWorkflows = () => {
    fetch("/api/workflows").then((r) => r.json()).then(setWorkflows).catch(() => {});
  };

  useEffect(() => { loadWorkflows(); }, []);

  const addStep = (agentId) => {
    setSteps((s) => [...s, { id: `step-${Date.now()}`, agent: agentId, task: "", params: { model: "", prompt: "" } }]);
  };

  const updateStep = (idx, field, value) => {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, [field]: value } : step)));
  };

  const updateStepParam = (idx, key, value) => {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, params: { ...step.params, [key]: value } } : step)));
  };

  const removeStep = (idx) => {
    setSteps((s) => s.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!name || steps.length === 0) return;
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: "", steps }),
    });
    setName("");
    setSteps([]);
    loadWorkflows();
  };

  const loadTemplate = (tmpl) => {
    setName(tmpl.name);
    setSteps(tmpl.steps.map((s, i) => ({ ...s, id: `tmpl-${Date.now()}-${i}` })));
  };

  const execute = async (wfId) => {
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/workflows/${wfId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: {} }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: e.message });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="workflow-builder">
      <div className="workflow-builder__left">
        <h3>Templates</h3>
        <div className="workflow-templates">
          {templates.map((t) => (
            <button key={t.name} className="workflow-template" onClick={() => loadTemplate(t)}>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          ))}
        </div>

        <h3>Your Workflows</h3>
        <div className="workflow-list">
          {workflows.map((wf) => (
            <div key={wf.id} className="workflow-item">
              <div>
                <strong>{wf.name}</strong>
                <span>{wf.steps?.length || 0} steps</span>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => execute(wf.id)} disabled={executing}>
                Run
              </button>
            </div>
          ))}
          {workflows.length === 0 && <p className="admin__empty">No workflows yet.</p>}
        </div>
      </div>

      <div className="workflow-builder__right">
        <div className="workflow-builder__form">
          <input className="field-input" placeholder="Workflow name" value={name} onChange={(e) => setName(e.target.value)} />

          <div className="workflow-steps">
            <Reorder.Group axis="y" values={steps} onReorder={setSteps} style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {steps.map((step, i) => {
                const Icon = AGENT_OPTIONS.find((a) => a.id === step.agent)?.icon || IconBolt;
                return (
                  <Reorder.Item key={step.id} value={step} style={{ listStyle: "none" }}>
                    <div className="workflow-step">
                      <div className="workflow-step__header">
                        <span className="workflow-step__drag" style={{ cursor: "grab", opacity: 0.4, marginRight: 8 }}>⠿</span>
                        <span className="workflow-step__num">{i + 1}</span>
                        <span className="workflow-step__icon"><Icon /></span>
                        <span className="workflow-step__agent">{step.agent}</span>
                        <button className="btn-ghost" onClick={() => removeStep(i)}>Remove</button>
                      </div>
                      <input className="field-input" placeholder="Task description" value={step.task} onChange={(e) => updateStep(i, "task", e.target.value)} />
                      <div className="workflow-step__params">
                        <input className="field-input" placeholder="model (e.g. flux-dev)" value={step.params.model || ""} onChange={(e) => updateStepParam(i, "model", e.target.value)} />
                        <textarea className="field-textarea" placeholder="prompt (use $INPUT_x or $STEP_N_OUTPUT)" value={step.params.prompt || ""} onChange={(e) => updateStepParam(i, "prompt", e.target.value)} rows={2} />
                      </div>
                    </div>
                    <AnimatedLine index={i} total={steps.length} />
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>

          <div className="workflow-builder__agents">
            {AGENT_OPTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.id} className="workflow-builder__agent-btn" onClick={() => addStep(a.id)}>
                  <Icon /> {a.name}
                </button>
              );
            })}
          </div>

          <button className="btn btn-primary btn-lg w-full" onClick={save} disabled={!name || steps.length === 0}>
            Save Workflow
          </button>
        </div>

        {result && (
          <div className="workflow-result">
            {result.success ? (
              <>
                <h4>Workflow completed</h4>
                <p>{result.creditsUsed} credits used</p>
                {result.outputs?.map((url, i) => {
                  if (!url) return null;
                  if (url.match(/\.(mp4|webm)$/i)) return <video key={i} src={url} controls className="studio-result__video" />;
                  if (url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return <img key={i} src={url} alt="" className="studio-result__img" />;
                  return <pre key={i}>{url}</pre>;
                })}
              </>
            ) : (
              <p className="studio-error">{result.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
