"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileChipScroller } from "@/components/studio/mobile";

/* ── Inline SVG Icons ── */
const IconSpark = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" /></svg>);
const IconBolt = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>);
const IconSend = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22,2 15,22 11,13 2,9" /></svg>);
const IconCross = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
const IconPlan = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>);
const IconPlay = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 19,12 5,21" /></svg>);
const IconCheck = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12" /></svg>);
const IconClock = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>);
const IconImage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>);
const IconVideo = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="23,7 16,12 23,17" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>);
const IconAudio = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>);
const IconDownload = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>);
const IconMessage = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>);
const IconChevronDown = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>);
const IconChevronUp = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>);
const IconCopy = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>);
const IconRefresh = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>);
const IconUser = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const IconArrowDown = () => (<svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>);

const QUICK_ACTIONS = [
  { label: "Generate an image", icon: IconImage, prompt: "Create a cinematic portrait with soft golden lighting" },
  { label: "Create a video", icon: IconVideo, prompt: "Make a short video of a product reveal with smooth camera motion" },
  { label: "Build a brand kit", icon: IconPlan, prompt: "Design a brand kit for a modern tech startup called Lumina" },
  { label: "Plan a production", icon: IconSpark, prompt: "Plan a full production for a 30-second social media ad" },
];

const AGENT_COLORS = {
  image: "#4ade80", video: "#60a5fa", audio: "#c084fc",
  creative_director: "#f472b6", orchestrator: "#fb923c",
  brand_guardian: "#facc15", storyboard: "#a78bfa",
  prompt_engineer: "#38bdf8", marketing: "#f87171",
  website: "#34d399", coding: "#818cf8",
};

function relativeTime(ts) {
  if (!ts) return "";
  const diff = (Date.now() - ts) / 1000;
  if (diff < 10) return "Just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ══════════════════════════════════════════════════════════════ */
export default function OrchestratorStudio() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState("chat");
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [expandedPlans, setExpandedPlans] = useState({});
  const [hoveredMsgId, setHoveredMsgId] = useState(null);

  const isMobile = useIsMobile();

  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  /* ── Auto-scroll (smart) ── */
  useEffect(() => {
    if (!userScrolledUp && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streaming, userScrolledUp]);

  const handleScroll = useCallback(() => {
    const el = listRef.current; if (!el) return;
    setUserScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }, []);

  const scrollToBottom = () => { if (listRef.current) { listRef.current.scrollTop = listRef.current.scrollHeight; setUserScrolledUp(false); } };

  /* ── Message helpers ── */
  const addMessage = useCallback(msg => setMessages(prev => [...prev, { id: Date.now() + Math.random(), timestamp: Date.now(), ...msg }]), []);
  const updateLastAssistant = useCallback(updater => setMessages(prev => { const updated = [...prev]; for (let i = updated.length - 1; i >= 0; i--) { if (updated[i].role === "assistant") { updated[i] = typeof updater === "function" ? updater(updated[i]) : { ...updated[i], ...updater }; break; } } return updated; }), []);

  /* ── Handle send ── */
  const handleSendChat = async () => { /* preserved SSE streaming logic */
    if (!input.trim() || streaming) return;
    const userMsg = { role: "user", content: input.trim() };
    addMessage(userMsg); setInput(""); setError(null); setStreaming(true); setThinking(true);
    const assistantId = Date.now() + 1;
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", plan: null, steps: null, timestamp: Date.now() }]);
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })) }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Chat failed" })); throw new Error(err.error || "Chat failed"); }
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); const lines = chunk.split("\n").filter(l => l.startsWith("data: ")); for (const line of lines) { const data = line.slice(6).trim(); if (data === "[DONE]") continue; try { const parsed = JSON.parse(data); if (parsed.type === "token" && parsed.content) { setThinking(false); updateLastAssistant(prev => ({ ...prev, content: (prev.content || "") + parsed.content })); } else if (parsed.type === "plan") { updateLastAssistant({ plan: parsed.plan }); } else if (parsed.type === "step_start") { updateLastAssistant(prev => ({ ...prev, steps: [...(prev.steps || []), { index: parsed.step, agent: parsed.agent, task: parsed.task, status: "running" }] })); } else if (parsed.type === "step_complete") { updateLastAssistant(prev => ({ ...prev, steps: (prev.steps || []).map(s => s.index === parsed.step ? { ...s, status: parsed.status, output: parsed.output, error: parsed.error } : s) })); } } catch {} } }
    } catch (e) { setError(e.message); updateLastAssistant(prev => ({ ...prev, content: prev.content || `Error: ${e.message}` })); } finally { setStreaming(false); setThinking(false); }
  };

  const handleCreatePlan = async () => { /* preserved plan API */
    if (!input.trim() || streaming) return;
    const userMsg = { role: "user", content: input.trim() };
    addMessage(userMsg); setInput(""); setError(null); setStreaming(true); setThinking(true);
    try { const res = await apiFetch("/api/agent/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: userMsg.content }) }); const data = await res.json(); if (data.plan) { setPlan(data.plan); addMessage({ role: "assistant", content: data.plan.summary || `Created a plan with ${data.plan.steps?.length || 0} steps.`, plan: data.plan }); setMode("plan"); } else if (data.error) throw new Error(data.error); else addMessage({ role: "assistant", content: "Could not generate a plan. Try describing your request in more detail." }); } catch (e) { setError(e.message); addMessage({ role: "assistant", content: `Error creating plan: ${e.message}` }); } finally { setStreaming(false); setThinking(false); }
  };

  const handleExecutePlan = async () => { /* preserved execute API */
    if (!plan || streaming) return; setError(null); setStreaming(true); setThinking(true);
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    const userPrompt = lastUserMsg?.content || "Execute this plan";
    addMessage({ role: "assistant", content: "Executing production plan\u2026", steps: plan.steps?.map((s, i) => ({ index: i + 1, agent: s.agent, task: s.task, status: "pending" })) || [] });
    try { const res = await apiFetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: userPrompt, plan }) }); const data = await res.json(); if (data.success) { updateLastAssistant(prev => ({ ...prev, content: data.summary || `Completed ${data.stepResults?.length || 0} steps.`, steps: (data.stepResults || []).map((r, i) => ({ index: r.step || i + 1, agent: r.agent || "unknown", task: "", status: r.status || "completed", output: r.output, error: r.error })), outputs: data.outputs })); } else { updateLastAssistant(prev => ({ ...prev, content: data.error || "Execution failed." })); } } catch (e) { setError(e.message); updateLastAssistant(prev => ({ ...prev, content: `Execution error: ${e.message}` })); } finally { setStreaming(false); setThinking(false); }
  };

  const handleKeyDown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (mode === "chat") handleSendChat(); else if (mode === "plan") handleCreatePlan(); else if (mode === "execute") handleExecutePlan(); } };
  const handleClear = () => { setMessages([]); setPlan(null); setError(null); setMode("chat"); setExpandedPlans({}); };

  const togglePlanExpand = id => setExpandedPlans(prev => ({ ...prev, [id]: !prev[id] }));
  const copyMessage = useCallback(async (content) => { try { await navigator.clipboard.writeText(content); } catch {} }, []);

  /* ── Render message ── */
  const renderMessage = (msg) => {
    const isUser = msg.role === "user";
    const hasContent = msg.content && msg.content.length > 0;
    const initials = isUser ? "U" : "H";
    const isHovered = hoveredMsgId === msg.id;
    const planExpanded = expandedPlans[msg.id] !== false; // default expanded

    return (
      <div key={msg.id} className={`v6-chat-msg ${isUser ? "v6-chat-msg--user" : "v6-chat-msg--assistant"}`} style={isUser ? { alignSelf: "flex-end", flexDirection: "row-reverse" } : {}} onMouseEnter={() => setHoveredMsgId(msg.id)} onMouseLeave={() => setHoveredMsgId(null)}>
        <div className="v6-chat-avatar" style={isUser ? { background: "var(--v6-accent)" } : {}}>
          {isUser ? <IconUser /> : <IconSpark width={14} height={14} />}
          <span style={{ fontSize: 10, fontWeight: 700, color: isUser ? "#fff" : "var(--v6-muted)" }}>{initials}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Timestamp */}
          {hasContent && isHovered && (
            <div style={{ fontSize: 9, color: "var(--v6-muted)", marginBottom: 2, fontFamily: "var(--v6-mono)" }}>{relativeTime(msg.timestamp)}</div>
          )}
          {hasContent && <div className="v6-chat-bubble" style={isUser ? { background: "var(--v6-accent)", color: "#fff", borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }}>{msg.content}</div>}

          {/* Typing indicator */}
          {!hasContent && !isUser && (thinking || streaming) && (
            <div className="v6-chat-bubble" style={{ display: "flex", alignItems: "center", gap: 5, padding: "12px 16px" }}>
              {[0, 1, 2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--v6-accent)", animation: `v6-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite` }} />)}
            </div>
          )}

          {/* Plan card (accordion) */}
          {msg.plan && !isUser && (
            <div style={{ marginTop: 8, borderRadius: 10, border: "1px solid var(--v6-line)", background: "var(--v6-surface2)", overflow: "hidden" }}>
              <button onClick={() => togglePlanExpand(msg.id)} style={{ width: "100%", border: 0, background: "transparent", color: "var(--v6-text)", padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700 }}>
                <span style={{ color: "var(--v6-accent)", display: "flex" }}><IconPlan width={14} height={14} /></span> Production Plan {planExpanded ? <span style={{ marginLeft: "auto" }}><IconChevronUp width={12} /></span> : <span style={{ marginLeft: "auto" }}><IconChevronDown width={12} /></span>}
              </button>
              {planExpanded && (
                <div style={{ padding: "0 12px 12px" }}>
                  {msg.plan.summary && <p style={{ fontSize: 11, margin: "0 0 8px", color: "var(--v6-muted)" }}>{msg.plan.summary}</p>}
                  {msg.plan.steps?.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 4, background: "var(--v6-surface)", border: "1px solid var(--v6-line)" }}>
                      <span style={{ fontSize: 9, fontWeight: 700, width: 18, height: 18, borderRadius: "50%", background: (AGENT_COLORS[step.agent] || "#6b7280") + "30", color: AGENT_COLORS[step.agent] || "#6b7280", display: "grid", placeItems: "center", flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10, fontWeight: 600 }}>{step.agent?.replace(/_/g, " ") || "Step"}</div><div style={{ fontSize: 9, color: "var(--v6-muted)" }}>{step.task?.slice(0, 60)}</div></div>
                      {step.estimatedCredits != null && <span style={{ fontSize: 9, color: "var(--v6-muted)", flexShrink: 0 }}><IconBolt width={8} /> {step.estimatedCredits}c</span>}
                    </div>
                  ))}
                  {msg.plan.estimate?.total != null && <div style={{ fontSize: 10, fontWeight: 700, textAlign: "right", marginTop: 6, color: "var(--v6-accent)" }}>~{msg.plan.estimate.total} credits</div>}
                </div>
              )}
            </div>
          )}

          {/* Step progress */}
          {msg.steps && msg.steps.length > 0 && !isUser && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid var(--v6-line)", background: "var(--v6-surface2)" }}>
              {msg.steps.map(step => {
                const isRunning = step.status === "running"; const isDone = step.status === "completed"; const isFailed = step.status === "failed"; const color = AGENT_COLORS[step.agent] || "#6b7280";
                return (
                  <div key={step.index} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--v6-line)" }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: isDone ? color : isFailed ? "var(--v6-bad)" : isRunning ? color + "20" : "var(--v6-surface)", border: `2px solid ${isDone ? color : isFailed ? "var(--v6-bad)" : isRunning ? color : "var(--v6-line)"}`, display: "grid", placeItems: "center", marginTop: 1, boxShadow: isRunning ? `0 0 12px ${color}55` : "none", animation: isRunning ? "v6-pulse-ring 1.8s ease-out infinite" : "none" }}>
                      {isDone ? <IconCheck width={11} style={{ color: "#fff" }} /> : isFailed ? <IconCross width={11} style={{ color: "#fff" }} /> : isRunning ? <span style={{ width: 8, height: 8, borderRadius: "50%", border: `2px solid ${color}`, borderTopColor: "transparent", animation: "v6-spin 0.8s linear infinite" }} /> : <span style={{ fontSize: 9, fontWeight: 700 }}>{step.index}</span>}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10, fontWeight: 600 }}>{step.agent?.replace(/_/g, " ") || "Agent"}</div>{step.task && <div style={{ fontSize: 9, color: "var(--v6-muted)" }}>{step.task.slice(0, 80)}</div>}{step.error && <div style={{ fontSize: 9, color: "var(--v6-bad)", marginTop: 2 }}>{step.error}</div>}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Outputs */}
          {msg.outputs && msg.outputs.length > 0 && !isUser && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {msg.outputs.map((url, i) => {
                if (typeof url !== "string") return null;
                const isVideo = url.match(/\.(mp4|webm|mov)/i) || url.includes("/video/");
                const isAudio = url.match(/\.(mp3|wav|ogg|flac)/i);
                return (
                  <div key={i} style={{ width: 120, borderRadius: 8, overflow: "hidden", border: "1px solid var(--v6-line)", background: "var(--v6-surface)" }}>
                    {isVideo ? <video src={url} controls muted style={{ width: "100%", height: 80, objectFit: "cover", background: "#000" }} />
                    : isAudio ? <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 6 }}><IconAudio width={16} style={{ color: "var(--v6-accent)" }} /><audio src={url} controls style={{ width: "100%", height: 24 }} /></div>
                    : <img src={url} alt="" style={{ width: "100%", height: 80, objectFit: "cover" }} />}
                    <div style={{ padding: "4px 6px", display: "flex", justifyContent: "flex-end" }}><a href={url} target="_blank" rel="noopener" style={{ color: "var(--v6-muted)", display: "flex" }} onClick={e => e.stopPropagation()}><IconDownload width={12} /></a></div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Message actions on hover */}
          {hasContent && !isUser && isHovered && (
            <div style={{ display: "flex", gap: 4, marginTop: 4, opacity: 0.6 }}>
              <button className="v6-btn v6-ghost v6-sm v6-icon-only" onClick={() => copyMessage(msg.content)} title="Copy"><IconCopy width={12} /></button>
              <button className="v6-btn v6-ghost v6-sm v6-icon-only" onClick={() => { setInput(msg.content); inputRef.current?.focus(); }} title="Retry"><IconRefresh width={12} /></button>
            </div>
          )}

          {/* Error recovery */}
          {msg.content?.startsWith("Error:") && !isUser && (
            <button className="v6-btn v6-sm" style={{ marginTop: 4 }} onClick={() => { setInput(msg.content.replace("Error: ", "")); handleSendChat(); }}><IconRefresh /> Retry</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderBottom: "1px solid var(--v6-line)" }}>
        <div><h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Orchestrator Studio</h1><p style={{ fontSize: 11, color: "var(--v6-muted)", margin: "2px 0 0" }}>Agent chat with planning and execution</p></div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{messages.length > 0 && <button className="v6-btn v6-ghost v6-sm" onClick={handleClear} title="Clear chat"><IconCross width={12} /> Clear</button>}</div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div className="v6-chat-list" ref={listRef} onScroll={handleScroll}>
            {messages.length === 0 && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 40 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--v6-surface2)", border: "1px solid var(--v6-line)", display: "grid", placeItems: "center" }}><IconSpark width={28} style={{ color: "var(--v6-accent)" }} /></div>
                <div style={{ textAlign: "center" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Orchestrator Agent</h2>
                  <p style={{ fontSize: 12, color: "var(--v6-muted)", maxWidth: 340, margin: "0 auto 14px", lineHeight: 1.5 }}>Chat with me to plan and execute creative productions. I can generate images, video, audio, and more.</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 400 }}>
                  {isMobile ? (
                    <MobileChipScroller
                      items={QUICK_ACTIONS.map(qa => ({ label: qa.label, value: qa.prompt }))}
                      selectedValue={null}
                      onSelect={(prompt) => { setInput(prompt); inputRef.current?.focus(); }}
                    />
                  ) : (
                    QUICK_ACTIONS.map((qa, i) => (
                      <button key={i} className="v6-chip" onClick={() => { setInput(qa.prompt); inputRef.current?.focus(); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px" }}><qa.icon width={12} /> {qa.label}</button>
                    ))
                  )}
                </div>
              </div>
            )}
            {messages.map(renderMessage)}
          </div>

          {/* Error bar */}
          {error && (
            <div style={{ padding: "8px 18px", fontSize: 11, color: "var(--v6-bad)", background: "rgba(255,107,107,0.06)", borderTop: "1px solid rgba(255,107,107,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
              {error}
              <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline", fontSize: 10 }}>Dismiss</button>
            </div>
          )}

          {/* Plan steps inline (mobile) */}
          {isMobile && plan && (mode === "plan" || mode === "execute") && (
            <div style={{ padding: "0 18px 8px", maxHeight: 180, overflowY: "auto", borderTop: "1px solid var(--v6-line)", background: "var(--v6-surface)" }}>
              <div className="v6-eyebrow" style={{ padding: "8px 0 6px" }}>Plan Steps</div>
              {plan.summary && <p style={{ fontSize: 10, color: "var(--v6-muted)", margin: "0 0 8px", lineHeight: 1.4 }}>{plan.summary}</p>}
              {plan.steps?.map((step, i) => (
                <div key={i} style={{ padding: "6px 8px", borderRadius: 6, marginBottom: 4, border: "1px solid var(--v6-line)", background: "var(--v6-surface2)", borderLeft: `3px solid ${AGENT_COLORS[step.agent] || "var(--v6-line)"}`, fontSize: 10 }}>
                  <span style={{ fontWeight: 700, color: AGENT_COLORS[step.agent] || "var(--v6-text)" }}>{i + 1}. {step.agent?.replace(/_/g, " ")}</span>
                  <span style={{ display: "block", fontSize: 9, color: "var(--v6-muted)" }}>{step.task}</span>
                </div>
              ))}
              {(mode === "plan" || mode === "execute") && plan && (
                <button className="v6-btn v6-primary" onClick={handleExecutePlan} disabled={streaming} style={{ width: "100%", marginTop: 6, fontSize: 10, padding: "6px 10px" }}><IconPlay width={12} /> Execute Plan</button>
              )}
            </div>
          )}

          {/* Input */}
          <div className="v6-chat-input-wrap">
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {isMobile ? (
                <MobileChipScroller
                  items={[{ label: "Chat", value: "chat" }, { label: "Plan", value: "plan" }, { label: "Execute", value: "execute" }]}
                  selectedValue={mode}
                  onSelect={setMode}
                />
              ) : (
                [{ id: "chat", label: "Chat", icon: <IconMessage width={12} /> }, { id: "plan", label: "Plan", icon: <IconPlan width={12} /> }, { id: "execute", label: "Execute", icon: <IconPlay width={12} /> }].map(m => (
                  <button key={m.id} className={`v6-btn ${mode === m.id ? "v6-primary" : ""}`} style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => setMode(m.id)}>{m.icon} {m.label}</button>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={mode === "chat" ? "Describe what you want to create\u2026" : mode === "plan" ? "Describe your production for planning\u2026" : "Ready to execute the production plan?"} rows={2} disabled={streaming} style={{ flex: 1 }} />
              <button className="v6-btn v6-primary" onClick={() => { if (mode === "chat") handleSendChat(); else if (mode === "plan") handleCreatePlan(); else if (mode === "execute") handleExecutePlan(); }} disabled={!input.trim() || streaming} style={{ flexShrink: 0 }}>
                {streaming ? <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "v6-spin 0.8s linear infinite" }} />
                : <>{mode === "chat" ? <IconSend width={14} /> : mode === "plan" ? <IconPlan width={14} /> : <IconPlay width={14} />}{" "}{mode === "chat" ? "Send" : mode === "plan" ? "Plan" : "Execute"}</>}
              </button>
            </div>
          </div>
        </div>

        {/* Plan side panel (desktop) */}
        {!isMobile && mode === "plan" && plan && (
          <div style={{ width: 240, borderLeft: "1px solid var(--v6-line)", padding: 14, overflowY: "auto", background: "var(--v6-surface)", flexShrink: 0 }}>
            <div className="v6-eyebrow" style={{ marginBottom: 12 }}>Plan Details</div>
            {plan.summary && <p style={{ fontSize: 11, color: "var(--v6-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>{plan.summary}</p>}
            {plan.steps?.map((step, i) => (
              <div key={i} style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 6, border: "1px solid var(--v6-line)", background: "var(--v6-surface2)", borderLeft: `3px solid ${AGENT_COLORS[step.agent] || "var(--v6-line)"}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: AGENT_COLORS[step.agent] || "var(--v6-text)", marginBottom: 2 }}>{i + 1}. {step.agent?.replace(/_/g, " ")}</div>
                <div style={{ fontSize: 9, color: "var(--v6-muted)", lineHeight: 1.4 }}>{step.task}</div>
                {step.estimatedCredits != null && <div style={{ fontSize: 9, color: "var(--v6-muted)", marginTop: 4 }}><IconBolt width={8} /> {step.estimatedCredits} credits</div>}
              </div>
            ))}
            {plan.estimate?.total != null && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "var(--v6-surface2)", border: "1px solid var(--v6-line)", textAlign: "center" }}><div style={{ fontSize: 9, color: "var(--v6-muted)", marginBottom: 2 }}>Total Credits</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--v6-accent)" }}>{plan.estimate.total}</div></div>}
            {plan.maxCredits && <div style={{ fontSize: 10, color: "var(--v6-muted)", textAlign: "center", marginTop: 4 }}>Max: {plan.maxCredits} credits</div>}
            {(mode === "plan" || mode === "execute") && plan && <button className="v6-btn v6-primary" onClick={handleExecutePlan} disabled={streaming} style={{ width: "100%", marginTop: 14 }}><IconPlay width={12} /> Execute Plan</button>}
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {userScrolledUp && (
        <button onClick={scrollToBottom} style={{ position: "absolute", bottom: 100, right: 24, zIndex: 10, width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--v6-line)", background: "var(--v6-surface)", backdropFilter: "blur(12px)", color: "var(--v6-text)", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "var(--v6-shadow)", animation: "v6-slide-up 0.25s ease-out both" }}><IconArrowDown width={14} /></button>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes v6-spin { to { transform: rotate(360deg); } }
        @keyframes v6-typing-dot { 0%,60%,100% { opacity: 0.25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}
