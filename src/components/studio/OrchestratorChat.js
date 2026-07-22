"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconBolt, IconArrowUpRight, IconSparkle, IconImage, IconVideo, IconMusic, IconCrown, IconClose } from "@/components/Icons";
import { useToast } from "@/components/ToastProvider";

const EASE = [0.32, 0.72, 0, 1];

const STEP_LABELS = {
  image: { icon: IconImage, label: "Generating image", color: "#FF1B6B" },
  video: { icon: IconVideo, label: "Generating video", color: "#7C3AED" },
  audio: { icon: IconMusic, label: "Generating audio", color: "#00E5FF" },
  website: { icon: IconSparkle, label: "Building website", color: "#FFD166" },
  marketing: { icon: IconCrown, label: "Creating marketing content", color: "#FF1B6B" },
  coding: { icon: IconBolt, label: "Writing code", color: "#00E68A" },
};

const STAGE_LABELS = {
  image: ["Queued", "Rendering", "Finalizing"],
  video: ["Queued", "Rendering", "Upscaling", "Finalizing"],
  audio: ["Queued", "Composing", "Mastering"],
};

function ThinkingIndicator() {
  return (
    <div className="orchestrator__thinking">
      <div className="orchestrator__thinking-dots">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="orchestrator__thinking-dot"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="orchestrator__thinking-text">Thinking...</span>
    </div>
  );
}

function StepCard({ step, index, status, output }) {
  const meta = STEP_LABELS[step.agent] || STEP_LABELS.image;
  const Icon = meta.icon;
  const stages = STAGE_LABELS[step.agent] || STAGE_LABELS.image;
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, stages.length - 1));
    }, 3000);
    return () => clearInterval(timer);
  }, [status, stages.length]);

  const isVideo = output?.match(/\.(mp4|webm)$/i);
  const isImage = output?.match(/\.(jpg|jpeg|png|webp|gif)$/i);

  return (
    <motion.div
      className={`step-card step-card--${status}`}
      initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.12, duration: 0.5, ease: EASE }}
    >
      <div className="step-card__header">
        <span className="step-card__num">{index + 1}</span>
        <span className="step-card__icon" style={{ color: meta.color }}>
          {status === "running" ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              style={{ display: "inline-flex" }}
            >
              <Icon />
            </motion.span>
          ) : status === "completed" ? (
            <span className="step-card__check">✓</span>
          ) : status === "failed" ? (
            <span className="step-card__x">✕</span>
          ) : (
            <Icon />
          )}
        </span>
        <div className="step-card__info">
          <span className="step-card__agent">{step.agent}</span>
          <span className="step-card__task">{step.task}</span>
        </div>
        <div className="step-card__right">
          {status === "running" && (
            <span className="step-card__stage">{stages[stageIdx]}</span>
          )}
          {status === "completed" && (
            <span className="step-card__status step-card__status--done">Done</span>
          )}
          {status === "failed" && (
            <span className="step-card__status step-card__status--fail">Failed</span>
          )}
        </div>
      </div>

      {output && (
        <motion.div
          className="step-card__output"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          {isImage && <img src={output} alt={`Step ${index + 1}`} className="step-card__thumb" />}
          {isVideo && <video src={output} controls className="step-card__thumb" />}
          {!isImage && !isVideo && (
            <pre className="step-card__text-output">{typeof output === "string" ? output.slice(0, 500) : JSON.stringify(output)?.slice(0, 500)}</pre>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

export default function OrchestratorChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [stepCards, setStepCards] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const scrollRef = useRef(null);
  const { notify } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, stepCards, streamingText, thinking]);

  const handlePlan = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setThinking(true);
    setStreamingText("");
    setInput("");

    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, stream: true }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

          for (const line of lines) {
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "token") {
                accumulated += parsed.content;
                setStreamingText(accumulated);
              } else if (parsed.type === "plan" && parsed.plan) {
                const planData = parsed.plan;
                setPlan(planData);
                setMessages((m) => {
                  const updated = [...m];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: accumulated || planData.summary || "I've planned the task. Review the estimate below.",
                      plan: planData,
                    };
                  } else {
                    updated.push({
                      role: "assistant",
                      content: accumulated || planData.summary || "I've planned the task. Review the estimate below.",
                      plan: planData,
                    });
                  }
                  return updated;
                });
                setStreamingText("");
              }
            } catch {}
          }
        }
      } else {
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
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e.message }]);
    } finally {
      setThinking(false);
    }
  };

  const handleExecute = async () => {
    if (!plan) return;
    setExecuting(true);
    setStepCards(plan.steps.map((s, i) => ({ ...s, index: i, status: "pending", output: null })));

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input || messages[messages.length - 1]?.content || "" }),
      });
      const data = await res.json();

      if (data.success && data.stepResults) {
        const updated = plan.steps.map((s, i) => {
          const sr = data.stepResults[i];
          return {
            ...s,
            index: i,
            status: sr?.status || "failed",
            output: data.outputs?.[i] || null,
          };
        });
        setStepCards(updated);
        setMessages((m) => [...m, {
          role: "assistant",
          content: `Done! ${data.stepResults.filter((s) => s.status === "completed").length}/${data.stepResults.length} steps completed. ${data.creditsUsed} credits used.`,
        }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: `Failed: ${data.error}` }]);
      }
      setPlan(null);
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
        {messages.length === 0 && !executing && (
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
            className={`orchestrator__msg orchestrator__msg--${msg.role} group`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            onMouseEnter={() => setHoveredMsg(i)}
            onMouseLeave={() => setHoveredMsg(null)}
          >
            {msg.role === "assistant" && (
              <div className="orchestrator__msg-icon"><IconSparkle /></div>
            )}
            <div className="orchestrator__msg-content">
              <p>{msg.content}</p>
              {hoveredMsg === i && (
                <motion.div
                  className="orchestrator__msg-actions"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15, ease: EASE }}
                >
                  <button
                    className="orchestrator__msg-action-btn"
                    onClick={() => { navigator.clipboard.writeText(msg.content); notify("Copied to clipboard"); }}
                    title="Copy"
                  >
                    Copy
                  </button>
                  <button
                    className="orchestrator__msg-action-btn"
                    onClick={() => { setInput(msg.content); }}
                    title="Edit & resend"
                  >
                    Edit
                  </button>
                </motion.div>
              )}
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
                      const StepIcon = meta.icon;
                      return (
                        <div key={j} className="orchestrator__step">
                          <span className="orchestrator__step-num">{j + 1}</span>
                          <span className="orchestrator__step-icon" style={{ color: meta.color }}><StepIcon /></span>
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
            </div>
          </motion.div>
        ))}

        {thinking && <ThinkingIndicator />}

        {streamingText && !thinking && (
          <motion.div
            className="orchestrator__msg orchestrator__msg--assistant"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <div className="orchestrator__msg-icon"><IconSparkle /></div>
            <div className="orchestrator__msg-content">
              <p>{streamingText}<span className="orchestrator__cursor">|</span></p>
            </div>
          </motion.div>
        )}

        {stepCards.length > 0 && (
          <div className="orchestrator__step-cards">
            {stepCards.map((step, i) => (
              <StepCard key={i} step={step} index={step.index} status={step.status} output={step.output} />
            ))}
          </div>
        )}
      </div>

      <div className="orchestrator__input">
        <textarea
          placeholder="Describe what you want to create..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); plan ? handleExecute() : handlePlan(); } }}
        />
        {plan ? (
          <button className="btn btn-primary" onClick={handleExecute} disabled={executing}>
            {executing ? "Executing..." : <>Confirm & Execute <span className="btn__icon"><IconBolt /></span></>}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handlePlan} disabled={executing || thinking || !input.trim()}>
            {thinking ? "Planning..." : <>Plan Task <span className="btn__icon"><IconSparkle /></span></>}
          </button>
        )}
      </div>
    </div>
  );
}
