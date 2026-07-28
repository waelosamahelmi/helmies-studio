"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import ChatFeed from "../chat/ChatFeed";
import ChatInput from "../chat/ChatInput";
import ChatHeader from "../chat/ChatHeader";
import AISuggestions from "../chat/AISuggestions";
import { IconSparkle, IconChevron, IconCheck, IconBolt, IconArrowUpRight, IconDownload, IconSettings, IconClose } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];
const SPRING = { type: "spring", stiffness: 420, damping: 30 };

const SUGGESTIONS = [
  { icon: "🎬", label: "I want to create a luxury perfume commercial" },
  { icon: "🎨", label: "Design a brand kit for my tech startup" },
  { icon: "🎵", label: "I need a cinematic trailer with music" },
  { icon: "📱", label: "Create a social media campaign for my product" },
  { icon: "🌄", label: "Generate a fantasy landscape image" },
  { icon: "🎥", label: "Make a video from my photos" },
];

const STATUS_META = {
  pending: { color: "#8A8A99", glow: "rgba(138,138,153,0.4)", label: "Pending" },
  running: { color: "#FF1B6B", glow: "rgba(255,27,107,0.55)", label: "Running" },
  done: { color: "#4ADE80", glow: "rgba(74,222,128,0.4)", label: "Complete" },
  error: { color: "#FF4D4D", glow: "rgba(255,77,77,0.5)", label: "Failed" },
};

function ThinkingDots() {
  return (
    <span className="orch__thinking" style={orchThinkingStyle}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={orchThinkingDotStyle}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: EASE, delay: i * 0.14 }}
        />
      ))}
    </span>
  );
}

function StepCard({ step, index }) {
  const meta = STATUS_META[step.status] || STATUS_META.pending;
  const isRunning = step.status === "running";
  const isDone = step.status === "done";
  const isError = step.status === "error";

  return (
    <motion.div
      className="studio__glass"
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING, delay: index * 0.04 }}
      style={stepCardStyle(meta)}
    >
      <div style={stepCardHeadStyle}>
        <div style={stepIconWrapStyle(meta, isRunning)}>
          {isDone ? (
            <IconCheck width={12} height={12} />
          ) : isError ? (
            <IconClose width={12} height={12} />
          ) : isRunning ? (
            <motion.span
              style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: `2px solid ${meta.color}`, borderTopColor: "transparent" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
          ) : (
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={stepLabelStyle}>{step.label}</div>
          <div style={stepStatusStyle(meta)}>{meta.label}{isRunning && " · working…"}</div>
        </div>
        {step.cost > 0 && (
          <div style={stepCostStyle}>
            <IconBolt width={10} height={10} style={{ color: "#FF1B6B" }} />
            {step.cost}
          </div>
        )}
      </div>
      {step.output && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3, ease: EASE }}
          style={stepPreviewStyle}
        >
          {typeof step.output === "string" ? step.output.slice(0, 140) : "output ready"}
        </motion.div>
      )}
    </motion.div>
  );
}

function PlanCard({ plan, onConfirm, executing }) {
  return (
    <motion.div
      className="studio__glass studio__glass--strong"
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING }}
      style={planCardStyle}
    >
      <div style={planHeaderStyle}>
        <span style={planIconStyle}><IconSparkle width={14} height={14} /></span>
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>Execution Plan</span>
        <span style={planCostStyle}><IconBolt width={11} height={11} /> {plan.totalCredits}</span>
      </div>
      <div style={planStepsStyle}>
        {plan.steps.map((s, i) => (
          <StepCard key={i} step={s} index={i} />
        ))}
      </div>
      {onConfirm && (
        <motion.button
          className="studio__generate"
          onClick={onConfirm}
          disabled={executing}
          whileHover={{ scale: executing ? 1 : 1.02 }}
          whileTap={{ scale: executing ? 1 : 0.97 }}
          style={{ width: "100%", marginTop: 12 }}
        >
          <IconSparkle width={14} height={14} />
          {executing ? "Executing…" : `Confirm & Execute · ${plan.totalCredits} credits`}
        </motion.button>
      )}
    </motion.div>
  );
}

function ModelPicker({ models, selectedModel, onSelect, open, onClose, anchorRef }) {
  const [q, setQ] = useState("");
  const filtered = (models || []).filter((m) => {
    if (!q) return true;
    const s = `${m.name} ${m.provider || ""} ${m.id}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <motion.div
            className="studio__glass studio__glass--strong"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ ...SPRING }}
            style={modelPickerStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={pickerSearchStyle}>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search models…"
                style={pickerInputStyle}
              />
              {q && (
                <button onClick={() => setQ("")} style={pickerClearStyle}>
                  <IconClose width={12} height={12} />
                </button>
              )}
            </div>
            <div style={pickerListStyle}>
              {filtered.length === 0 && (
                <div style={{ padding: "20px 8px", fontSize: 12, color: "var(--color-text-faint)", textAlign: "center" }}>
                  No models found
                </div>
              )}
              {filtered.map((m) => (
                <button
                  key={m.id}
                  className={`studio__model-card ${selectedModel === m.id ? "studio__model-card--active" : ""}`}
                  onClick={() => { onSelect(m.id); onClose(); }}
                  style={{ padding: "10px 12px", borderRadius: 10 }}
                >
                  <div className="studio__model-card-head">
                    <span className="studio__model-card-title" style={{ fontSize: 13 }}>{m.name}</span>
                    {m.provider && <span className="studio__model-card-provider">{m.provider}</span>}
                  </div>
                  {selectedModel === m.id && (
                    <span style={{ color: "var(--color-brand)", display: "inline-flex", alignItems: "center" }}>
                      <IconCheck width={12} height={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function OrchestratorMode() {
  const [messages, setMessages] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [plan, setPlan] = useState(null);
  const [stepCards, setStepCards] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesRef = useRef([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await apiFetch("/api/generations/status?limit=50");
        const data = await res.json();
        if (data.generations) setPendingCount(data.generations.filter((g) => g.status === "pending").length);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    apiFetch("/api/openrouter/models").then((res) => res.json()).then((data) => {
      if (data.models?.length > 0) {
        setModels(data.models);
        if (!data.models.some((m) => m.id === selectedModel) && data.models[0]) {
          setSelectedModel(data.models[0].id);
        }
      }
    }).catch(() => {});
  }, []);

  const streamChat = useCallback(async (chatMessages, model) => {
    const res = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatMessages, model }),
    });
    if (!res.ok) throw new Error("Chat failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const data = JSON.parse(dataStr);
          if (data.type === "token" && data.content) {
            fullText += data.content;
            setStreamingText(fullText);
          }
        } catch {}
      }
    }
    return fullText;
  }, []);

  const handleChat = useCallback(async (text) => {
    if (!text.trim() || thinking || executing) return;
    const userMsg = { id: Date.now(), type: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);
    setStreamingText("");
    const chatHistory = messagesRef.current
      .filter((m) => m.type === "user" || m.type === "assistant")
      .map((m) => ({ role: m.type === "user" ? "user" : "assistant", content: m.text || m.streamText }));
    chatHistory.push({ role: "user", content: text });
    try {
      const fullText = await streamChat(chatHistory, selectedModel);
      setMessages((prev) => [...prev, { id: Date.now() + 1, type: "assistant", text: fullText, streamText: fullText }]);
    } catch (e) {
      setMessages((prev) => [...prev, { id: Date.now() + 1, type: "error", text: e.message }]);
    } finally {
      setThinking(false);
      setStreamingText("");
    }
  }, [thinking, executing, streamChat, selectedModel]);

  const handlePlan = useCallback(async () => {
    if (thinking || executing || plan) return;
    const chatHistory = messagesRef.current
      .filter((m) => m.type === "user" || m.type === "assistant")
      .map((m) => ({ role: m.type === "user" ? "user" : "assistant", content: m.text || m.streamText }));
    const conversationText = chatHistory.map((m) => `${m.role}: ${m.content}`).join("\n");
    setThinking(true);
    setMessages((prev) => [...prev, { id: Date.now(), type: "loading" }]);
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: conversationText, stream: true }),
      });
      if (!res.ok) throw new Error("Planning failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "plan") {
              const planData = data.plan;
              const totalCredits = planData.estimate?.total || 0;
              const steps = (planData.steps || []).map((s) => ({
                label: `${s.agent}: ${s.task}`,
                cost: planData.estimate?.breakdown?.find((b) => b.task === s.task)?.credits || 0,
                status: null,
                agent: s.agent,
                task: s.task,
                params: s.params,
              }));
              setPlan({ steps, totalCredits, summary: planData.summary || "", rawPlan: planData });
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages((prev) => [...prev.filter((m) => m.type !== "loading"), { id: Date.now(), type: "error", text: e.message }]);
    } finally {
      setThinking(false);
    }
  }, [thinking, executing, plan]);

  const handleExecute = useCallback(async () => {
    if (!plan || executing) return;
    setMessages((prev) => [...prev.filter((m) => m.type !== "loading"), { id: Date.now(), type: "plan", steps: plan.steps, totalCredits: plan.totalCredits }]);
    setExecuting(true);
    setStepCards(plan.steps.map((s, i) => ({ index: i, ...s, status: "pending", output: null })));
    try {
      const summary = plan.summary || plan.steps.map((s) => s.task).join(", ");
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: summary, context: { precomputedPlan: plan.rawPlan }, stream: true }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Execution failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "step_start") {
              const i = (data.step || 1) - 1;
              setStepCards((prev) => prev.map((s) => s.index === i ? { ...s, status: "running" } : s));
              setMessages((prev) => prev.map((m) => m.type === "plan" && m.steps ? { ...m, steps: m.steps.map((st, j) => j === i ? { ...st, status: "running" } : st) } : m));
            } else if (data.type === "step_complete") {
              const i = (data.step || 1) - 1;
              setStepCards((prev) => prev.map((s) => s.index === i ? { ...s, status: data.status === "failed" ? "error" : "done", output: data.output || null } : s));
              setMessages((prev) => prev.map((m) => m.type === "plan" && m.steps ? { ...m, steps: m.steps.map((st, j) => j === i ? { ...st, status: data.status === "failed" ? "error" : "done" } : st) } : m));
            } else if (data.type === "run_complete") {
              setExecuting(false);
              const lastOutput = data.assembled?.images?.[0]?.url || data.assembled?.videos?.[0]?.url || data.outputs?.[0] || null;
              const resultMsg = { id: Date.now(), type: data.success ? "result" : "error", url: lastOutput, outputs: data.outputs?.length > 1 ? data.outputs : null, creditsUsed: data.creditsUsed || plan.totalCredits };
              if (!data.success) resultMsg.text = data.error || "Some steps failed";
              setMessages((prev) => [...prev, resultMsg]);
              setStepCards([]);
            }
          } catch {}
        }
      }
    } catch (e) {
      setExecuting(false);
      setMessages((prev) => [...prev, { id: Date.now(), type: "error", text: e.message }]);
    }
  }, [plan, executing]);

  useEffect(() => {
    if (plan && !executing && !thinking) {
      setMessages((prev) => {
        if (prev.some((m) => m.type === "plan")) return prev;
        return [...prev.filter((m) => m.type !== "loading"), { id: Date.now(), type: "plan", steps: plan.steps, totalCredits: plan.totalCredits, onConfirm: handleExecute }];
      });
    }
  }, [plan, executing, thinking, handleExecute]);

  const handleRetry = () => {};
  const hasConversation = messages.some((m) => m.type === "assistant");
  const currentModel = models.find((m) => m.id === selectedModel) || { id: selectedModel, name: selectedModel.split("/").pop(), provider: selectedModel.split("/")[0] };

  return (
    <div className="orchestrator-mode" style={orchStyle}>
      <ChatHeader Icon={IconSparkle} pendingCount={pendingCount} />

      {/* Premium model bar */}
      <div className="orch__bar" style={barStyle}>
        <motion.button
          className="studio__glass studio__glass--brand-edge"
          onClick={() => setModelPickerOpen((v) => !v)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          style={modelBtnStyle}
          type="button"
        >
          <span style={modelDotStyle} />
          <span style={modelNameStyle}>{currentModel.name}</span>
          <span style={modelProviderStyle}>{currentModel.provider}</span>
          <span style={{ display: "inline-flex", color: "var(--color-text-faint)" }}>
            <IconChevron width={14} height={14} />
          </span>
        </motion.button>

        <div style={{ flex: 1 }} />

        <motion.button
          className="studio__glass"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setSettingsOpen(true)}
          style={iconBtnStyle}
          title="Settings"
          type="button"
        >
          <IconSettings width={14} height={14} />
        </motion.button>
      </div>

      <ModelPicker
        models={models}
        selectedModel={selectedModel}
        onSelect={setSelectedModel}
        open={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
      />

      <ChatFeed
        messages={messages}
        onRetry={handleRetry}
        idle={
          <div className="orchestrator-mode__idle" style={idleStyle}>
            <motion.div
              className="studio__empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING }}
            >
              <div className="studio__empty-glyph">
                <span className="studio__empty-glyph-icon"><IconSparkle width={28} height={28} /></span>
              </div>
              <h2 className="studio__empty-title">What would you like to create today?</h2>
              <p className="studio__empty-desc">Describe what you want, and I&apos;ll plan and create it step by step.</p>
            </motion.div>

            {executing && stepCards.length > 0 && (
              <motion.div
                className="orch__steps"
                style={stepsWrapStyle}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING }}
              >
                <div style={stepsTitleStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-dim)" }}>
                    Pipeline
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)" }}>
                    {stepCards.filter((s) => s.status === "done").length}/{stepCards.length}
                  </span>
                </div>
                {stepCards.map((step) => (
                  <StepCard key={step.index} step={step} index={step.index} />
                ))}
              </motion.div>
            )}
          </div>
        }
      />

      {/* Streaming thinking indicator */}
      <AnimatePresence>
        {thinking && (
          <motion.div
            className="studio__glass"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ ...SPRING }}
            style={thinkingCardStyle}
          >
            <div style={thinkingAvatarStyle}><IconSparkle width={14} height={14} /></div>
            <ThinkingDots />
            {streamingText && (
              <span style={thinkingTextStyle} className="studio__chat-bubble--streaming">{streamingText}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {messages.length === 0 && !thinking && (
        <div style={suggestionsWrapStyle}>
          <AISuggestions suggestions={SUGGESTIONS} onSelect={(s) => handleChat(s.label)} />
        </div>
      )}

      {hasConversation && !plan && !executing && !thinking && (
        <motion.div
          className="orch__plan-bar"
          style={planBarStyle}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING }}
        >
          <motion.button
            className="studio__generate"
            onClick={handlePlan}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            type="button"
          >
            <IconSparkle width={15} height={15} />
            Generate Plan
          </motion.button>
        </motion.div>
      )}

      <ChatInput
        placeholder="Describe what you want to create…"
        onSubmit={handleChat}
        disabled={thinking || executing}
        loading={thinking}
        cost={plan?.totalCredits}
      />
    </div>
  );
}

/* ── Styles ── */
const orchStyle = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--color-void)",
};
const barStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 16px 12px",
};
const modelBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 12px",
  borderRadius: 100,
  cursor: "pointer",
  border: "none",
  color: "var(--color-text)",
  fontFamily: "var(--font-sans)",
};
const modelDotStyle = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--color-brand)",
  boxShadow: "0 0 10px rgba(255,27,107,0.7)",
  flexShrink: 0,
};
const modelNameStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "-0.005em",
};
const modelProviderStyle = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-text-faint)",
  padding: "2px 7px",
  borderRadius: 100,
  background: "rgba(124,58,237,0.12)",
  color: "var(--color-accent)",
};
const iconBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-dim)",
};
const modelPickerStyle = {
  position: "absolute",
  zIndex: 100,
  left: 16,
  top: 110,
  width: 320,
  maxHeight: 420,
  display: "flex",
  flexDirection: "column",
};
const pickerSearchStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-hairline)",
};
const pickerInputStyle = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--color-text)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
};
const pickerClearStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.06)",
  border: "none",
  color: "var(--color-text-faint)",
  cursor: "pointer",
};
const pickerListStyle = {
  overflowY: "auto",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const idleStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
  padding: "32px 16px",
};
const stepsWrapStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 6,
};
const stepsTitleStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 4,
};
const thinkingCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  margin: "0 16px 8px",
  borderRadius: 14,
};
const thinkingAvatarStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "rgba(255,27,107,0.16)",
  color: "var(--color-brand)",
  border: "1px solid rgba(255,27,107,0.3)",
  flexShrink: 0,
};
const thinkingTextStyle = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--color-text)",
  flex: 1,
  minWidth: 0,
};
const orchThinkingStyle = { display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 };
const orchThinkingDotStyle = { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--color-brand)" };
const suggestionsWrapStyle = { padding: "0 16px 8px" };
const planBarStyle = { display: "flex", justifyContent: "center", padding: "0 16px 10px" };

function stepCardStyle(meta) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    boxShadow: `inset 0 0 0 1px ${meta.glow.replace(/0\.\d+\)/, "0.06)")}, var(--studio-shadow-soft)`,
  };
}
function stepCardHeadStyle() {
  return { display: "flex", alignItems: "center", gap: 10 };
}
function stepIconWrapStyle(meta, isRunning) {
  return {
    width: 22,
    height: 22,
    borderRadius: "50%",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: `${meta.color}1f`,
    border: `1px solid ${meta.color}55`,
    color: meta.color,
    boxShadow: isRunning ? `0 0 16px ${meta.glow}` : "none",
  };
}
function stepLabelStyle() {
  return { fontSize: 12, fontWeight: 600, color: "var(--color-text)", letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
}
function stepStatusStyle(meta) {
  return { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.color, marginTop: 1 };
}
function stepCostStyle() {
  return { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "var(--color-text-dim)", fontFamily: "var(--font-mono)", flexShrink: 0 };
}
function stepPreviewStyle() {
  return { fontSize: 11, lineHeight: 1.5, color: "var(--color-text-dim)", padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.25)", border: "1px solid var(--color-hairline)" };
}
const planCardStyle = {
  padding: 14,
  borderRadius: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const planHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingBottom: 10,
  borderBottom: "1px solid var(--color-hairline)",
};
const planIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: 8,
  background: "rgba(255,27,107,0.14)",
  color: "var(--color-brand)",
  border: "1px solid rgba(255,27,107,0.3)",
};
const planCostStyle = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--color-brand)",
  fontFamily: "var(--font-mono)",
  padding: "3px 9px",
  borderRadius: 100,
  background: "rgba(255,27,107,0.1)",
  border: "1px solid rgba(255,27,107,0.25)",
};
const planStepsStyle = { display: "flex", flexDirection: "column", gap: 8 };