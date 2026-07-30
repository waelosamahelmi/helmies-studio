"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { IconBolt, IconArrowUpRight, IconFilm, IconImage, IconVideo, IconMusic, IconCrown, IconCheck, IconClose, IconSparkle } from "@/components/Icons";
import { apiFetch } from "@/lib/client-fetch";

const EASE = [0.32, 0.72, 0, 1];
const SPRING = { type: "spring", stiffness: 420, damping: 30 };

const AGENT_OPTIONS = [
  { id: "image", name: "Image", icon: IconImage, color: "#4ADE80" },
  { id: "video", name: "Video", icon: IconVideo, color: "#60A5FA" },
  { id: "audio", name: "Audio", icon: IconMusic, color: "#FACC15" },
  { id: "website", name: "Website", icon: IconFilm, color: "#A855F7" },
  { id: "marketing", name: "Marketing", icon: IconCrown, color: "#FF1B6B" },
  { id: "coding", name: "Coding", icon: IconBolt, color: "#34D399" },
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

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--color-hairline)",
  color: "var(--color-text)",
  fontSize: 12,
  outline: "none",
  fontFamily: "var(--font-sans)",
};

function AnimatedLine({ index, total }) {
  if (index >= total - 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", height: 36, alignItems: "center" }}>
      <svg width="2" height="36" viewBox="0 0 2 36">
        <motion.line x1="1" y1="0" x2="1" y2="36" stroke="#FF1B6B" strokeWidth="2" strokeDasharray="4 4" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.4 }} transition={{ duration: 0.6, ease: EASE, delay: index * 0.15 }} />
        <motion.circle cx="1" cy="0" r="2.5" fill="#FF1B6B" initial={{ cy: 0 }} animate={{ cy: [0, 36] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: index * 0.3 }} />
      </svg>
    </div>
  );
}

function VariableHint({ text }) {
  const isVar = /^\$/.test(text);
  if (!isVar) return <span>{text}</span>;
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        padding: "2px 6px",
        borderRadius: 100,
        background: "rgba(124,58,237,0.12)",
        color: "var(--color-accent)",
        border: "1px solid rgba(124,58,237,0.22)",
        marginLeft: 4,
      }}
    >
      <IconSparkle width={9} height={9} /> {text}
    </motion.span>
  );
}

export default function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState([]);
  const [templates] = useState(TEMPLATES);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [assembling, setAssembling] = useState(false);
  const [assembledUrl, setAssembledUrl] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadedWorkflow, setLoadedWorkflow] = useState(null);
  const [stepStatuses, setStepStatuses] = useState({});

  const loadWorkflows = () => {
    fetch("/api/workflows").then((r) => r.json()).then(setWorkflows).catch(() => {});
  };

  useEffect(() => { loadWorkflows(); }, []);

  const addStep = (agentId) => {
    setSteps((s) => [...s, { id: `step-${Date.now()}-${s.length}`, agent: agentId, task: "", params: { model: "", prompt: "" } }]);
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
    setSaveOpen(false);
    loadWorkflows();
  };

  const loadTemplate = (tmpl) => {
    setName(tmpl.name);
    setSteps(tmpl.steps.map((s, i) => ({ ...s, id: `tmpl-${Date.now()}-${i}` })));
    setLoadedWorkflow(null);
  };

  const execute = async (wfId) => {
    setExecuting(true);
    setResult(null);
    setAssembledUrl(null);
    setStepStatuses({});
    try {
      const res = await apiFetch(`/api/workflows/${wfId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: {} }),
      });
      const data = await res.json();
      setResult(data);
      if (data.steps) {
        const statuses = {};
        data.steps.forEach((s, i) => { statuses[i] = s.status || (s.success ? "done" : "error"); });
        setStepStatuses(statuses);
      }
    } catch (e) {
      setResult({ success: false, error: e.message });
    } finally {
      setExecuting(false);
    }
  };

  const assembleOutputs = async () => {
    if (!result?.outputs) return;
    const videoUrls = result.outputs.filter((url) => url && url.match(/\.(mp4|webm)$/i));
    if (videoUrls.length === 0) return;
    setAssembling(true);
    try {
      const res = await apiFetch("/api/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: videoUrls }),
      });
      const data = await res.json();
      if (data.url) setAssembledUrl(data.url);
    } catch {} finally {
      setAssembling(false);
    }
  };

  return (
    <div className="workflow-universe workflow-builder" style={wbStyle}>
      {/* Left pane */}
      <div style={leftPaneStyle}>
        <div style={{ padding: "16px 16px 8px" }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-dim)", marginBottom: 10 }}>Templates</h3>
        </div>
        <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((t) => (
            <motion.button
              key={t.name}
              className="studio__glass studio__model-card"
              onClick={() => loadTemplate(t)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              style={{ padding: 12, textAlign: "left", display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>{t.name}</strong>
                <span style={{ fontSize: 10, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)" }}>{t.steps.length} steps</span>
              </div>
              <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--color-text-dim)" }}>{t.description}</span>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {t.steps.map((s, i) => {
                  const a = AGENT_OPTIONS.find((x) => x.id === s.agent);
                  return a ? (
                    <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 6px", borderRadius: 100, background: `${a.color}1f`, color: a.color }}>{a.name}</span>
                  ) : null;
                })}
              </div>
            </motion.button>
          ))}
        </div>

        <div style={{ padding: "0 16px 8px", borderTop: "1px solid var(--color-hairline)", paddingTop: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-dim)", marginBottom: 10 }}>Your Workflows</h3>
        </div>
        <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {workflows.map((wf) => (
            <motion.div
              key={wf.id}
              className="studio__glass"
              whileHover={{ y: -1, borderColor: "var(--color-hairline-strong)" }}
              style={{ padding: 12, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: 12, fontWeight: 700, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wf.name}</strong>
                <span style={{ fontSize: 10, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)" }}>{wf.steps?.length || 0} steps</span>
              </div>
              <motion.button
                className="studio__generate"
                onClick={() => execute(wf.id)}
                disabled={executing}
                whileHover={{ scale: executing ? 1 : 1.05 }}
                whileTap={{ scale: executing ? 1 : 0.95 }}
                style={{ padding: "6px 14px", minWidth: "auto", fontSize: 11 }}
              >
                <IconArrowUpRight width={12} height={12} /> Run
              </motion.button>
            </motion.div>
          ))}
          {workflows.length === 0 && <p style={{ fontSize: 12, color: "var(--color-text-faint)", textAlign: "center", padding: "16px 8px" }}>No workflows yet.</p>}
        </div>
      </div>

      {/* Right pane */}
      <div style={rightPaneStyle}>
        <div style={formWrapStyle}>
          {/* Name + save */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <input
              className="studio__composer-premium"
              style={{ ...inputStyle, flex: 1, fontSize: 14, fontWeight: 600 }}
              placeholder="Workflow name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <motion.button
              className="studio__generate"
              onClick={() => setSaveOpen(true)}
              disabled={!name || steps.length === 0}
              whileHover={{ scale: name && steps.length ? 1.03 : 1 }}
              whileTap={{ scale: name && steps.length ? 0.97 : 1 }}
              style={{ minWidth: "auto", padding: "10px 20px" }}
            >
              <IconCheck width={14} height={14} /> Save
            </motion.button>
          </div>

          {/* Steps */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
            {steps.length === 0 && (
              <div className="studio__empty" style={{ padding: "32px 16px" }}>
                <div className="studio__empty-glyph"><span className="studio__empty-glyph-icon"><IconFilm width={26} height={26} /></span></div>
                <h2 className="studio__empty-title">Build your pipeline</h2>
                <p className="studio__empty-desc">Add steps below or load a template to begin.</p>
              </div>
            )}
            <Reorder.Group axis="y" values={steps} onReorder={setSteps} style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {steps.map((step, i) => {
                const agent = AGENT_OPTIONS.find((a) => a.id === step.agent);
                const Icon = agent?.icon || IconBolt;
                const status = stepStatuses[i];
                return (
                  <Reorder.Item key={step.id} value={step} style={{ listStyle: "none" }}>
                    <motion.div
                      layout
                      className="studio__glass"
                      whileDrag={{ scale: 1.02, boxShadow: "0 24px 60px -12px rgba(0,0,0,0.8)" }}
                      style={{ ...stepCardStyle(agent), padding: 14, borderRadius: 14, marginBottom: 4 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <span style={{ cursor: "grab", color: "var(--color-text-faint)", fontSize: 14, lineHeight: 1 }}>⠿</span>
                        <div style={stepNumStyle(agent)}>{i + 1}</div>
                        <span style={stepIconStyle(agent)}><Icon width={14} height={14} /></span>
                        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.005em", color: "var(--color-text)" }}>{agent?.name || step.agent}</span>
                        {status && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 100, background: status === "done" ? "rgba(74,222,128,0.14)" : status === "error" ? "rgba(255,77,77,0.14)" : "rgba(250,204,21,0.14)", color: status === "done" ? "#4ADE80" : status === "error" ? "#FF4D4D" : "#FACC15" }}>
                            {status}
                          </span>
                        )}
                        <div style={{ flex: 1 }} />
                        <motion.button onClick={() => removeStep(i)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} style={{ background: "transparent", border: "none", color: "var(--color-text-faint)", cursor: "pointer", padding: 4 }}>
                          <IconClose width={14} height={14} />
                        </motion.button>
                      </div>
                      <input style={inputStyle} placeholder="Task description…" value={step.task} onChange={(e) => updateStep(i, "task", e.target.value)} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        <input style={inputStyle} placeholder="model (e.g. flux-dev, kling-v2.1-i2v)…" value={step.params.model || ""} onChange={(e) => updateStepParam(i, "model", e.target.value)} />
                        <div style={{ position: "relative" }}>
                          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60, paddingTop: 8 }} placeholder="prompt — use $INPUT_x or $STEP_N_OUTPUT for interpolation…" value={step.params.prompt || ""} onChange={(e) => updateStepParam(i, "prompt", e.target.value)} rows={2} />
                        </div>
                        {/* Variable interpolation hint */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: "var(--color-text-faint)", fontWeight: 600 }}>Variables:</span>
                          <VariableHint text="$INPUT" />
                          {i > 0 && <VariableHint text={`$STEP_${i}_OUTPUT`} />}
                        </div>
                      </div>
                    </motion.div>
                    <AnimatedLine index={i} total={steps.length} />
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>

          {/* Agent chips */}
          <div style={{ borderTop: "1px solid var(--color-hairline)", paddingTop: 14, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-dim)", marginBottom: 10 }}>Add Step</div>
            <div className="studio__chip-group-premium">
              {AGENT_OPTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <motion.button
                    key={a.id}
                    className="studio__chip-premium"
                    onClick={() => addStep(a.id)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    style={{ borderColor: `${a.color}40` }}
                    type="button"
                  >
                    <span className="studio__chip-premium-icon" style={{ color: a.color, width: 13, height: 13 }}><Icon width={13} height={13} /></span>
                    {a.name}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              className="studio__glass"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ ...SPRING }}
              style={resultStyle}
            >
              {result.success ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(74,222,128,0.16)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.3)" }}><IconCheck width={12} height={12} /></span>
                    <h4 style={{ fontSize: 14, fontWeight: 700 }}>Workflow completed</h4>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-brand)", fontFamily: "var(--font-mono)", padding: "3px 9px", borderRadius: 100, background: "rgba(255,27,107,0.1)" }}><IconBolt width={11} height={11} /> {result.creditsUsed}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.outputs?.map((url, i) => {
                      if (!url) return null;
                      if (url.match(/\.(mp4|webm)$/i)) return <video key={i} src={url} controls style={{ width: "100%", borderRadius: 10, background: "#000" }} />;
                      if (url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return <img key={i} src={url} alt="" style={{ width: "100%", borderRadius: 10 }} />;
                      return <pre key={i} style={{ fontSize: 11, padding: 10, borderRadius: 8, background: "rgba(0,0,0,0.3)", overflow: "auto" }}>{url}</pre>;
                    })}
                  </div>
                  {result.outputs?.some((url) => url && url.match(/\.(mp4|webm)$/i)) && (
                    <div style={{ marginTop: 12 }}>
                      {assembledUrl ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <video src={assembledUrl} controls style={{ width: "100%", borderRadius: 10 }} />
                          <a href={assembledUrl} download className="studio__result-action studio__result-action--primary" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
                            Download Assembled <IconArrowUpRight width={13} height={13} />
                          </a>
                        </div>
                      ) : (
                        <motion.button className="studio__generate" onClick={assembleOutputs} disabled={assembling} whileHover={{ scale: assembling ? 1 : 1.03 }} whileTap={{ scale: assembling ? 1 : 0.97 }} style={{ width: "100%" }}>
                          <IconFilm width={14} height={14} /> {assembling ? "Assembling…" : "Assemble Videos"}
                        </motion.button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="studio__error" style={{ margin: 0 }}>{result.error}</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Save modal */}
      <AnimatePresence>
        {saveOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSaveOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 200 }} />
            <motion.div
              className="studio__glass studio__glass--strong"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ ...SPRING }}
              style={modalStyle}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>Save Workflow</h3>
                <motion.button onClick={() => setSaveOpen(false)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} style={{ background: "transparent", border: "none", color: "var(--color-text-faint)", cursor: "pointer" }}><IconClose width={16} height={16} /></motion.button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Name</label>
                  <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name…" />
                </div>
                <div className="studio__glass" style={{ padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.25)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-dim)", marginBottom: 8 }}>Summary</div>
                  <div style={{ fontSize: 12, color: "var(--color-text)", marginBottom: 4 }}>{steps.length} step{steps.length !== 1 ? "s" : ""}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {steps.map((s, i) => {
                      const a = AGENT_OPTIONS.find((x) => x.id === s.agent);
                      return a ? <span key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 6px", borderRadius: 100, background: `${a.color}1f`, color: a.color }}>{i + 1}. {a.name}</span> : null;
                    })}
                  </div>
                </div>
                <motion.button className="studio__generate" onClick={save} disabled={!name || steps.length === 0} whileHover={{ scale: name && steps.length ? 1.03 : 1 }} whileTap={{ scale: name && steps.length ? 0.97 : 1 }} style={{ width: "100%" }}>
                  <IconCheck width={14} height={14} /> Save Workflow
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Styles ── */
const wbStyle = {
  display: "flex",
  height: "100%",
  gap: 0,
  background: "var(--color-void)",
};
const leftPaneStyle = {
  width: 280,
  flexShrink: 0,
  borderRight: "1px solid var(--color-hairline)",
  background: "rgba(8,8,13,0.7)",
  backdropFilter: "blur(16px)",
  overflowY: "auto",
};
const rightPaneStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  padding: 20,
  overflow: "hidden",
};
const formWrapStyle = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
};
const resultStyle = {
  padding: 14,
  borderRadius: 16,
  marginTop: 16,
  maxHeight: "40vh",
  overflowY: "auto",
};
const modalStyle = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(420px, 92vw)",
  padding: 20,
  borderRadius: 18,
  zIndex: 201,
};
function stepCardStyle(agent) {
  return { boxShadow: `inset 0 0 0 1px ${agent?.color || "var(--color-hairline)"}22, var(--studio-shadow-soft)` };
}
function stepNumStyle(agent) {
  return {
    width: 26,
    height: 26,
    borderRadius: 8,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    background: `${agent?.color || "var(--color-brand)"}1f`,
    color: agent?.color || "var(--color-brand)",
    border: `1px solid ${agent?.color || "var(--color-brand)"}44`,
  };
}
function stepIconStyle(agent) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    color: agent?.color || "var(--color-text-dim)",
    border: "1px solid var(--color-hairline)",
  };
}
