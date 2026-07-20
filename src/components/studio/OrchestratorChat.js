"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconBolt, IconArrowUpRight, IconSparkle, IconImage, IconVideo, IconMusic, IconCrown } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const STEP_LABELS = {
  image: { icon: IconImage, label: "Generating image", color: "#FF1B6B" },
  video: { icon: IconVideo, label: "Generating video", color: "#7C3AED" },
  audio: { icon: IconMusic, label: "Generating audio", color: "#00E5FF" },
  website: { icon: IconSparkle, label: "Building website", color: "#FFD166" },
  marketing: { icon: IconCrown, label: "Creating marketing content", color: "#FF1B6B" },
  coding: { icon: IconBolt, label: "Writing code", color: "#00E68A" },
};

export default function OrchestratorChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]);
  const [results, setResults] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveSteps]);

  const handlePlan = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setExecuting(true);

    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();

      if (data.steps) {
        setPlan(data);
        setMessages((m) => [...m, {
          role: "assistant",
          content: data.summary || "I've planned the task. Review the estimate below.",
          plan: data,
        }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.error || "Failed to plan task." }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e.message }]);
    } finally {
      setExecuting(false);
    }
  };

  const handleExecute = async () => {
    if (!plan) return;
    setExecuting(true);
    setLiveSteps(plan.steps.map((s, i) => ({ index: i, agent: s.agent, status: "pending" })));
    setMessages((m) => [...m, {
      role: "assistant",
      content: `Executing ${plan.steps.length} steps... ${plan.estimate.total} credits will be used.`,
    }]);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();

      if (data.success) {
        setResults(data.outputs || []);
        setLiveSteps(data.stepResults.map((sr) => ({ ...sr, status: sr.status })));
        setMessages((m) => [...m, {
          role: "assistant",
          content: `Done! ${data.stepResults.filter((s) => s.status === "completed").length}/${data.stepResults.length} steps completed. ${data.creditsUsed} credits used.`,
          stepResults: data.stepResults,
        }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: `Failed: ${data.error}` }]);
      }
      setPlan(null);
      setInput("");
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e.message }]);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="orchestrator">
      <div className="orchestrator__header">
        <div className="orchestrator__icon"><IconSparkle /></div>
        <div>
          <h2>AI Orchestrator</h2>
          <p>Describe what you want. The orchestrator plans, estimates, and executes.</p>
        </div>
      </div>

      <div className="orchestrator__chat" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="orchestrator__empty">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}>
              <IconSparkle />
            </motion.div>
            <p>Ask me to create anything — an image, a video, a website, marketing content, or code.</p>
            <div className="orchestrator__suggestions">
              <button onClick={() => setInput("Generate a cinematic hero image of a neon city at night, then animate it into a 5-second video")}>
                Image + Video
              </button>
              <button onClick={() => setInput("Create a marketing campaign for a luxury skincare brand with 3 ad variations")}>
                Marketing campaign
              </button>
              <button onClick={() => setInput("Build a landing page for an AI startup with a hero section and pricing")}>
                Website builder
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            className={`orchestrator__msg orchestrator__msg--${msg.role}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {msg.role === "assistant" && (
              <div className="orchestrator__msg-icon"><IconSparkle /></div>
            )}
            <div className="orchestrator__msg-content">
              <p>{msg.content}</p>
              {msg.plan && (
                <motion.div
                  className="orchestrator__plan"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <div className="orchestrator__plan-header">
                    <span>Execution Plan</span>
                    <span className="orchestrator__plan-cost">
                      <IconBolt /> {msg.plan.estimate.total} credits
                    </span>
                  </div>
                  <div className="orchestrator__plan-steps">
                    {msg.plan.steps.map((step, j) => {
                      const meta = STEP_LABELS[step.agent] || STEP_LABELS.image;
                      const Icon = meta.icon;
                      return (
                        <div key={j} className="orchestrator__step">
                          <span className="orchestrator__step-num">{j + 1}</span>
                          <span className="orchestrator__step-icon" style={{ color: meta.color }}><Icon /></span>
                          <div>
                            <div className="orchestrator__step-agent">{step.agent}</div>
                            <div className="orchestrator__step-task">{step.task}</div>
                          </div>
                          <span className="orchestrator__step-cost"><IconBolt /> {msg.plan.estimate.breakdown[j]?.credits || 0}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Live execution steps */}
              {msg.stepResults && (
                <div className="orchestrator__results">
                  {msg.stepResults.map((sr, j) => {
                    const meta = STEP_LABELS[sr.agent] || STEP_LABELS.image;
                    const Icon = meta.icon;
                    return (
                      <motion.div
                        key={j}
                        className={`orchestrator__result orchestrator__result--${sr.status}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: j * 0.1, duration: 0.4, ease: EASE }}
                      >
                        <span className="orchestrator__result-icon"><Icon /></span>
                        <span>Step {sr.step}: {meta.label}</span>
                        <span className="orchestrator__result-status">{sr.status === "completed" ? "Done" : "Failed"}</span>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Live executing indicator */}
        {executing && liveSteps.length > 0 && (
          <div className="orchestrator__live">
            {liveSteps.map((step, i) => {
              const meta = STEP_LABELS[step.agent] || STEP_LABELS.image;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={i}
                  className={`orchestrator__live-step ${step.status}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.15, duration: 0.4, ease: EASE }}
                >
                  <span className="orchestrator__live-icon" style={{ color: meta.color }}>
                    {step.status === "pending" ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%" }}
                      />
                    ) : (
                      <Icon />
                    )}
                  </span>
                  <span>{meta.label}...</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Results gallery */}
      {results.length > 0 && (
        <div className="orchestrator__outputs">
          {results.map((url, i) => {
            if (!url) return null;
            const isVideo = url.match(/\.(mp4|webm)$/i);
            const isImage = url.match(/\.(jpg|jpeg|png|webp|gif)$/i);
            if (isVideo) return (
              <motion.video key={i} src={url} controls autoPlay loop className="orchestrator__output"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1, duration: 0.5, ease: EASE }}
              />
            );
            if (isImage) return (
              <motion.img key={i} src={url} alt={`Output ${i + 1}`} className="orchestrator__output"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1, duration: 0.5, ease: EASE }}
              />
            );
            return (
              <motion.div key={i} className="orchestrator__output-text"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1, duration: 0.5, ease: EASE }}
              >
                <pre>{typeof url === "string" ? url.slice(0, 5000) : JSON.stringify(url, null, 2)}</pre>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="orchestrator__input">
        <textarea
          placeholder="Describe what you want to create..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePlan(); } }}
        />
        {plan ? (
          <button className="btn btn-primary" onClick={handleExecute} disabled={executing}>
            {executing ? "Executing..." : <>Confirm & Execute <span className="btn__icon"><IconBolt /></span></>}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handlePlan} disabled={executing || !input.trim()}>
            {executing ? "Planning..." : <>Plan Task <span className="btn__icon"><IconSparkle /></span></>}
          </button>
        )}
      </div>
    </div>
  );
}