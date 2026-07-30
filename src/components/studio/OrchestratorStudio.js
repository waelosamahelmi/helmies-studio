"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/client-fetch";

/* ── Inline SVG Icons (v6 style: 24x24, stroke currentColor, strokeWidth 1.7) ── */

const IconSpark = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconSend = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22,2 15,22 11,13 2,9" />
  </svg>
);

const IconCross = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconPlan = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);

const IconPlay = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5,3 19,12 5,21" />
  </svg>
);

const IconCheck = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);

const IconImage = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21,15 16,10 5,21" />
  </svg>
);

const IconVideo = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23,7 16,12 23,17" /><rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
);

const IconAudio = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);

const IconDownload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconMessage = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

/* ── Type badge colors for agent steps ── */
const AGENT_COLORS = {
  image: "#4ade80", video: "#60a5fa", audio: "#c084fc",
  creative_director: "#f472b6", orchestrator: "#fb923c",
  brand_guardian: "#facc15", storyboard: "#a78bfa",
  prompt_engineer: "#38bdf8", marketing: "#f87171",
  website: "#34d399", coding: "#818cf8",
};

/* ══════════════════════════════════════════════════════════════ */
export default function OrchestratorStudio() {
  /* ── State ── */
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState("chat"); // "chat" | "plan" | "execute"
  const [plan, setPlan] = useState(null); // current production plan
  const [error, setError] = useState(null);
  const [thinking, setThinking] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  /* ── Focus input on mount ── */
  useEffect(() => { inputRef.current?.focus(); }, []);

  /* ── Helper: add message ── */
  const addMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), ...msg }]);
  }, []);

  /* ── Helper: update last assistant message (for streaming) ── */
  const updateLastAssistant = useCallback((updater) => {
    setMessages((prev) => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === "assistant") {
          updated[i] = typeof updater === "function" ? updater(updated[i]) : { ...updated[i], ...updater };
          break;
        }
      }
      return updated;
    });
  }, []);

  /* ── Send chat message (SSE streaming) ── */
  const handleSendChat = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = { role: "user", content: input.trim() };
    addMessage(userMsg);
    setInput("");
    setError(null);
    setStreaming(true);
    setThinking(true);

    // Add placeholder assistant message
    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", plan: null, steps: null }]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })) }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Chat failed" }));
        throw new Error(err.error || "Chat failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "token" && parsed.content) {
              setThinking(false);
              updateLastAssistant((prev) => ({
                ...prev,
                content: (prev.content || "") + parsed.content,
              }));
            } else if (parsed.type === "plan") {
              updateLastAssistant({ plan: parsed.plan });
            } else if (parsed.type === "step_start") {
              updateLastAssistant((prev) => ({
                ...prev,
                steps: [...(prev.steps || []), { index: parsed.step, agent: parsed.agent, task: parsed.task, status: "running" }],
              }));
            } else if (parsed.type === "step_complete") {
              updateLastAssistant((prev) => ({
                ...prev,
                steps: (prev.steps || []).map((s) =>
                  s.index === parsed.step ? { ...s, status: parsed.status, output: parsed.output, error: parsed.error } : s
                ),
              }));
            }
          } catch {} // skip unparseable chunks
        }
      }
    } catch (e) {
      setError(e.message);
      updateLastAssistant((prev) => ({ ...prev, content: prev.content || `Error: ${e.message}` }));
    } finally {
      setStreaming(false);
      setThinking(false);
    }
  };

  /* ── Create plan via /api/agent/plan ── */
  const handleCreatePlan = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = { role: "user", content: input.trim() };
    addMessage(userMsg);
    setInput("");
    setError(null);
    setStreaming(true);
    setThinking(true);

    try {
      const res = await apiFetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content }),
      });

      const data = await res.json();
      if (data.plan) {
        setPlan(data.plan);
        addMessage({
          role: "assistant",
          content: data.plan.summary || `Created a plan with ${data.plan.steps?.length || 0} steps.`,
          plan: data.plan,
        });
        setMode("plan");
      } else if (data.error) {
        throw new Error(data.error);
      } else {
        addMessage({ role: "assistant", content: "Could not generate a plan. Try describing your request in more detail." });
      }
    } catch (e) {
      setError(e.message);
      addMessage({ role: "assistant", content: `Error creating plan: ${e.message}` });
    } finally {
      setStreaming(false);
      setThinking(false);
    }
  };

  /* ── Execute plan via /api/agent/run ── */
  const handleExecutePlan = async () => {
    if (!plan || streaming) return;
    setError(null);
    setStreaming(true);
    setThinking(true);

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const userPrompt = lastUserMsg?.content || "Execute this plan";

    addMessage({ role: "assistant", content: "Executing production plan…", steps: plan.steps?.map((s, i) => ({ index: i + 1, agent: s.agent, task: s.task, status: "pending" })) || [] });

    try {
      const res = await apiFetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userPrompt, plan }),
      });

      const data = await res.json();
      if (data.success) {
        updateLastAssistant((prev) => ({
          ...prev,
          content: data.summary || `Completed ${data.stepResults?.length || 0} steps.`,
          steps: (data.stepResults || []).map((r, i) => ({
            index: r.step || i + 1,
            agent: r.agent || "unknown",
            task: "",
            status: r.status || "completed",
            output: r.output,
            error: r.error,
          })),
        }));
        if (data.outputs) {
          updateLastAssistant((prev) => ({ ...prev, outputs: data.outputs }));
        }
      } else {
        updateLastAssistant((prev) => ({ ...prev, content: data.error || "Execution failed." }));
      }
    } catch (e) {
      setError(e.message);
      updateLastAssistant((prev) => ({ ...prev, content: `Execution error: ${e.message}` }));
    } finally {
      setStreaming(false);
      setThinking(false);
    }
  };

  /* ── Key handler ── */
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mode === "chat") handleSendChat();
      else if (mode === "plan") handleCreatePlan();
      else if (mode === "execute") handleExecutePlan();
    }
  };

  /* ── Clear chat ── */
  const handleClear = () => {
    setMessages([]);
    setPlan(null);
    setError(null);
    setMode("chat");
  };

  /* ── Render a message ── */
  const renderMessage = (msg) => {
    const isUser = msg.role === "user";
    const hasContent = msg.content && msg.content.length > 0;

    return (
      <div
        key={msg.id}
        className={`v6-chat-msg ${isUser ? "v6-chat-msg--user" : "v6-chat-msg--assistant"}`}
      >
        {/* Avatar */}
        <div className="v6-chat-avatar">
          {isUser ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          ) : (
            <IconSpark width={14} height={14} />
          )}
        </div>

        {/* Bubble */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasContent && (
            <div className="v6-chat-bubble" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {msg.content}
            </div>
          )}

          {/* Thinking indicator */}
          {!hasContent && !isUser && (thinking || streaming) && (
            <div className="v6-chat-bubble" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", background: "var(--v6-muted)",
                animation: "pulse 1.5s ease infinite",
              }} />
              <span style={{
                width: 6, height: 6, borderRadius: "50%", background: "var(--v6-muted)",
                animation: "pulse 1.5s ease 0.3s infinite",
              }} />
              <span style={{
                width: 6, height: 6, borderRadius: "50%", background: "var(--v6-muted)",
                animation: "pulse 1.5s ease 0.6s infinite",
              }} />
            </div>
          )}

          {/* Plan card */}
          {msg.plan && !isUser && (
            <div style={{
              marginTop: 8, padding: 12, borderRadius: 10, border: "1px solid var(--v6-line)",
              background: "var(--v6-surface2)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--v6-accent)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <IconPlan width={12} height={12} />
                Production Plan
              </div>
              {msg.plan.summary && (
                <p style={{ fontSize: 11, margin: "0 0 8px", color: "var(--v6-muted)" }}>{msg.plan.summary}</p>
              )}
              {msg.plan.steps?.map((step, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  borderRadius: 6, marginBottom: 4, background: "var(--v6-surface)",
                  border: "1px solid var(--v6-line)",
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, width: 18, height: 18, borderRadius: "50%",
                    background: (AGENT_COLORS[step.agent] || "#6b7280") + "30",
                    color: AGENT_COLORS[step.agent] || "#6b7280",
                    display: "grid", placeItems: "center",
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600 }}>{step.agent?.replace(/_/g, " ") || "Step"}</div>
                    <div style={{ fontSize: 9, color: "var(--v6-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{step.task}</div>
                  </div>
                  {step.estimatedCredits != null && (
                    <span style={{ fontSize: 9, color: "var(--v6-muted)", fontFamily: "var(--font-mono, monospace)", flexShrink: 0 }}>
                      <IconBolt width={8} height={8} /> {step.estimatedCredits}c
                    </span>
                  )}
                </div>
              ))}
              {msg.plan.estimate?.total != null && (
                <div style={{ fontSize: 10, fontWeight: 700, textAlign: "right", marginTop: 6, color: "var(--v6-accent)" }}>
                  ~{msg.plan.estimate.total} credits
                </div>
              )}
            </div>
          )}

          {/* Step progress */}
          {msg.steps && msg.steps.length > 0 && !isUser && (
            <div style={{
              marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid var(--v6-line)",
              background: "var(--v6-surface2)",
            }}>
              {msg.steps.map((step) => {
                const isRunning = step.status === "running";
                const isDone = step.status === "completed";
                const isFailed = step.status === "failed";
                const color = AGENT_COLORS[step.agent] || "#6b7280";
                return (
                  <div key={step.index} style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0",
                    borderBottom: "1px solid var(--v6-line)",
                  }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      background: isDone ? color : isFailed ? "#ef4444" : isRunning ? color + "30" : "var(--v6-surface)",
                      border: `1.5px solid ${isDone ? color : isFailed ? "#ef4444" : isRunning ? color : "var(--v6-line)"}`,
                      display: "grid", placeItems: "center", marginTop: 1,
                    }}>
                      {isDone ? (
                        <IconCheck width={10} height={10} style={{ color: "#fff" }} />
                      ) : isFailed ? (
                        <IconCross width={10} height={10} style={{ color: "#fff" }} />
                      ) : isRunning ? (
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%",
                          border: "1.5px solid " + color, borderTopColor: "transparent",
                          animation: "spin 0.8s linear infinite",
                        }} />
                      ) : (
                        <span style={{ fontSize: 8, fontWeight: 700 }}>{step.index}</span>
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600 }}>
                        {step.agent?.replace(/_/g, " ") || "Agent"}
                      </div>
                      {step.task && (
                        <div style={{ fontSize: 9, color: "var(--v6-muted)" }}>{step.task.slice(0, 80)}</div>
                      )}
                      {step.error && <div style={{ fontSize: 9, color: "#ef4444" }}>{step.error}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Outputs (images/video/audio in chat) */}
          {msg.outputs && msg.outputs.length > 0 && !isUser && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {msg.outputs.map((url, i) => {
                const isVideo = url?.match(/\.(mp4|webm|mov)/i) || url?.includes("/video/");
                const isAudio = url?.match(/\.(mp3|wav|ogg|flac)/i);
                const isImg = !isVideo && !isAudio;
                if (typeof url !== "string") return null;
                return (
                  <div key={i} style={{
                    width: 120, borderRadius: 8, overflow: "hidden", border: "1px solid var(--v6-line)",
                    background: "var(--v6-surface)",
                  }}>
                    {isVideo ? (
                      <video src={url} controls muted style={{ width: "100%", height: 80, objectFit: "cover", background: "#000" }} />
                    ) : isAudio ? (
                      <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 6 }}>
                        <IconAudio width={16} height={16} style={{ color: "var(--v6-accent)" }} />
                        <audio src={url} controls style={{ width: "100%", height: 24 }} />
                      </div>
                    ) : (
                      <img src={url} alt="" style={{ width: "100%", height: 80, objectFit: "cover" }} />
                    )}
                    {url && (
                      <div style={{ padding: "4px 6px", display: "flex", justifyContent: "flex-end" }}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener"
                          style={{ color: "var(--v6-muted)", display: "flex" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDownload width={12} height={12} />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ═══════════════════ RENDER ── */
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 18px", borderBottom: "1px solid var(--v6-line)",
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Orchestrator Studio
          </h1>
          <p style={{ fontSize: 11, color: "var(--v6-muted)", margin: "2px 0 0" }}>
            Agent chat with planning and execution
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {messages.length > 0 && (
            <button className="v6-btn v6-ghost v6-sm" onClick={handleClear} title="Clear chat">
              <IconCross width={12} height={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Main layout: chat + optional plan side panel ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ── Chat Column ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Messages */}
          <div className="v6-chat-list" ref={listRef}>
            {messages.length === 0 && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14, background: "var(--v6-surface2)",
                  border: "1px solid var(--v6-line)", display: "grid", placeItems: "center",
                }}>
                  <IconSpark width={24} height={24} style={{ color: "var(--v6-muted)" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Orchestrator Agent</h2>
                  <p style={{ fontSize: 12, color: "var(--v6-muted)", maxWidth: 300, margin: 0 }}>
                    Chat with me to plan and execute creative productions. I can generate images, video, audio, and more.
                  </p>
                </div>
              </div>
            )}
            {messages.map(renderMessage)}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "8px 18px", fontSize: 11, color: "#ef4444",
              background: "rgba(239,68,68,0.06)", borderTop: "1px solid rgba(239,68,68,0.15)",
            }}>
              {error}
              <button
                onClick={() => setError(null)}
                style={{ marginLeft: 8, background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Input Area ── */}
          <div className="v6-chat-input-wrap">
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[
                { id: "chat", label: "Chat", icon: <IconMessage width={12} height={12} /> },
                { id: "plan", label: "Plan", icon: <IconPlan width={12} height={12} /> },
                { id: "execute", label: "Execute", icon: <IconPlay width={12} height={12} /> },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`v6-btn ${mode === m.id ? "v6-primary" : ""}`}
                  style={{ fontSize: 10, padding: "4px 10px" }}
                  onClick={() => setMode(m.id)}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === "chat" ? "Describe what you want to create…" :
                  mode === "plan" ? "Describe your production for planning…" :
                  "Ready to execute the production plan?"
                }
                rows={2}
                disabled={streaming}
                style={{ flex: 1 }}
              />
              <button
                className="v6-btn v6-primary"
                onClick={() => {
                  if (mode === "chat") handleSendChat();
                  else if (mode === "plan") handleCreatePlan();
                  else if (mode === "execute") handleExecutePlan();
                }}
                disabled={!input.trim() || streaming}
                style={{ flexShrink: 0 }}
              >
                {streaming ? (
                  <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                ) : (
                  <>
                    {mode === "chat" ? <IconSend width={14} height={14} /> : mode === "plan" ? <IconPlan width={14} height={14} /> : <IconPlay width={14} height={14} />}
                    {mode === "chat" ? " Send" : mode === "plan" ? " Plan" : " Execute"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Side Panel (Plan Details) ── */}
        {mode === "plan" && plan && (
          <div style={{
            width: 240, borderLeft: "1px solid var(--v6-line)", padding: 14,
            overflowY: "auto", background: "var(--v6-surface)", flexShrink: 0,
          }}>
            <div className="v6-eyebrow" style={{ marginBottom: 12 }}>Plan Details</div>

            {plan.summary && (
              <p style={{ fontSize: 11, color: "var(--v6-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>{plan.summary}</p>
            )}

            {plan.steps?.map((step, i) => (
              <div key={i} style={{
                padding: "8px 10px", borderRadius: 8, marginBottom: 6,
                border: "1px solid var(--v6-line)", background: "var(--v6-surface2)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: AGENT_COLORS[step.agent] || "var(--v6-text)", marginBottom: 2 }}>
                  {i + 1}. {step.agent?.replace(/_/g, " ")}
                </div>
                <div style={{ fontSize: 9, color: "var(--v6-muted)", lineHeight: 1.4 }}>{step.task}</div>
                {step.estimatedCredits != null && (
                  <div style={{ fontSize: 9, color: "var(--v6-muted)", marginTop: 4 }}>
                    <IconBolt width={8} height={8} /> {step.estimatedCredits} credits
                  </div>
                )}
              </div>
            ))}

            {plan.estimate?.total != null && (
              <div style={{
                marginTop: 12, padding: 10, borderRadius: 8, background: "var(--v6-surface2)",
                border: "1px solid var(--v6-line)", textAlign: "center",
              }}>
                <div style={{ fontSize: 9, color: "var(--v6-muted)", marginBottom: 2 }}>Total Credits</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--v6-accent)", fontFamily: "var(--font-mono, monospace)" }}>
                  {plan.estimate.total}
                </div>
              </div>
            )}

            {plan.maxCredits && (
              <div style={{ fontSize: 10, color: "var(--v6-muted)", textAlign: "center", marginTop: 4 }}>
                Max: {plan.maxCredits} credits
              </div>
            )}

            {/* Execute button in side panel */}
            {(mode === "plan" || mode === "execute") && plan && (
              <button
                className="v6-btn v6-primary"
                onClick={handleExecutePlan}
                disabled={streaming}
                style={{ width: "100%", marginTop: 14 }}
              >
                <IconPlay width={12} height={12} /> Execute Plan
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
