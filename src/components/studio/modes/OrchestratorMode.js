"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/client-fetch";
import ChatFeed from "../chat/ChatFeed";
import ChatInput from "../chat/ChatInput";
import ChatHeader from "../chat/ChatHeader";
import AISuggestions from "../chat/AISuggestions";
import { IconSparkle, IconChevron, IconCheck } from "@/components/Icons";

const SUGGESTIONS = [
  { icon: "🎬", label: "I want to create a luxury perfume commercial" },
  { icon: "🎨", label: "Design a brand kit for my tech startup" },
  { icon: "🎵", label: "I need a cinematic trailer with music" },
  { icon: "📱", label: "Create a social media campaign for my product" },
  { icon: "🌄", label: "Generate a fantasy landscape image" },
  { icon: "🎥", label: "Make a video from my photos" },
];

export default function OrchestratorMode() {
  const [messages, setMessages] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [plan, setPlan] = useState(null);
  const [stepCards, setStepCards] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("qwen/qwen-2.5-72b-instruct");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const messagesRef = useRef([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await apiFetch("/api/generations/status?limit=50");
        const data = await res.json();
        if (data.generations) setPendingCount(data.generations.filter(g => g.status === "pending").length);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    apiFetch("/api/openrouter/models").then(res => res.json()).then(data => {
      if (data.models?.length > 0) {
        setModels(data.models);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClick = () => setModelPickerOpen(false);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
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
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);
    setStreamingText("");

    const chatHistory = messagesRef.current
      .filter(m => m.type === "user" || m.type === "assistant")
      .map(m => ({ role: m.type === "user" ? "user" : "assistant", content: m.text || m.streamText }));

    chatHistory.push({ role: "user", content: text });

    try {
      const fullText = await streamChat(chatHistory, selectedModel);
      const assistantMsg = { id: Date.now() + 1, type: "assistant", text: fullText, streamText: fullText };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now() + 1, type: "error", text: e.message }]);
    } finally {
      setThinking(false);
      setStreamingText("");
    }
  }, [thinking, executing, streamChat, selectedModel]);

  const handlePlan = useCallback(async () => {
    if (thinking || executing || plan) return;

    const chatHistory = messagesRef.current
      .filter(m => m.type === "user" || m.type === "assistant")
      .map(m => ({ role: m.type === "user" ? "user" : "assistant", content: m.text || m.streamText }));

    const conversationText = chatHistory.map(m => `${m.role}: ${m.content}`).join("\n");

    setThinking(true);
    const loadingMsg = { id: Date.now(), type: "loading" };
    setMessages(prev => [...prev, loadingMsg]);

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
          const data = JSON.parse(line.slice(6));

          if (data.type === "plan") {
            const planData = data.plan;
            const totalCredits = planData.estimate?.total || 0;
            const steps = (planData.steps || []).map(s => ({
              label: `${s.agent}: ${s.task}`,
              cost: planData.estimate?.breakdown?.find(b => b.task === s.task)?.credits || 0,
              status: null,
              agent: s.agent,
              task: s.task,
              params: s.params,
            }));

            setPlan({ steps, totalCredits, summary: planData.summary || "", rawPlan: planData });
          }
        }
      }
    } catch (e) {
      setMessages(prev => [...prev.filter(m => m.id !== loadingMsg.id), { id: Date.now(), type: "error", text: e.message }]);
    } finally {
      setThinking(false);
    }
  }, [thinking, executing, plan]);

  const handleExecute = useCallback(async () => {
    if (!plan || executing) return;

    const planMsg = { id: Date.now(), type: "plan", steps: plan.steps, totalCredits: plan.totalCredits };
    setMessages(prev => [...prev.filter(m => m.type !== "loading"), planMsg]);
    setExecuting(true);

    const stepCardsInit = plan.steps.map((s, i) => ({ index: i, ...s, status: "pending", output: null }));
    setStepCards(stepCardsInit);

    try {
      const summary = plan.summary || plan.steps.map(s => s.task).join(", ");
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
          const data = JSON.parse(line.slice(6));

          if (data.type === "step_start") {
            const stepIndex = (data.step || 1) - 1;
            setStepCards(prev => prev.map(s => s.index === stepIndex ? { ...s, status: "running" } : s));
            setMessages(prev => prev.map(m =>
              m.type === "plan" && m.steps ? { ...m, steps: m.steps.map((s, i) => i === stepIndex ? { ...s, status: "running" } : s) } : m
            ));
          } else if (data.type === "step_complete") {
            const stepIndex = (data.step || 1) - 1;
            setStepCards(prev => prev.map(s => s.index === stepIndex ? { ...s, status: data.status === "failed" ? "error" : "done", output: data.output || null } : s));
            setMessages(prev => prev.map(m =>
              m.type === "plan" && m.steps ? { ...m, steps: m.steps.map((s, i) => i === stepIndex ? { ...s, status: data.status === "failed" ? "error" : "done" } : s) } : m
            ));
          } else if (data.type === "run_complete") {
            setExecuting(false);
            const lastOutput = data.assembled?.images?.[0]?.url || data.assembled?.videos?.[0]?.url || data.outputs?.[0] || null;
            const resultMsg = { id: Date.now(), type: data.success ? "result" : "error", url: lastOutput, outputs: data.outputs?.length > 1 ? data.outputs : null, creditsUsed: data.creditsUsed || plan.totalCredits };
            if (!data.success) resultMsg.text = data.error || "Some steps failed";
            setMessages(prev => [...prev, resultMsg]);
            setStepCards([]);
          }
        }
      }
    } catch (e) {
      setExecuting(false);
      setMessages(prev => [...prev, { id: Date.now(), type: "error", text: e.message }]);
    }
  }, [plan, executing]);

  useEffect(() => {
    if (plan && !executing && !thinking) {
      setMessages(prev => {
        if (prev.some(m => m.type === "plan")) return prev;
        return [...prev.filter(m => m.type !== "loading"), { id: Date.now(), type: "plan", steps: plan.steps, totalCredits: plan.totalCredits, onConfirm: handleExecute }];
      });
    }
  }, [plan, executing, thinking, handleExecute]);

  const handleRetry = () => {};

  const hasConversation = messages.some(m => m.type === "assistant");
  const currentModel = models.find(m => m.id === selectedModel) || { id: selectedModel, name: selectedModel.split("/").pop(), provider: selectedModel.split("/")[0] };

  return (
    <div className="orchestrator-mode">
      <ChatHeader Icon={IconSparkle} pendingCount={pendingCount} />
      {/* Model selector */}
      <div className="orchestrator-mode__model-bar">
        <button
          className="orchestrator-mode__model-btn"
          onClick={(e) => { e.stopPropagation(); setModelPickerOpen(!modelPickerOpen); }}
          type="button"
        >
          <span className="orchestrator-mode__model-name">{currentModel.name}</span>
          <span className="orchestrator-mode__model-provider">{currentModel.provider}</span>
          <IconChevron />
        </button>
        {modelPickerOpen && (
          <div className="orchestrator-mode__model-picker" onClick={(e) => e.stopPropagation()}>
            <div className="orchestrator-mode__model-picker-search">
              <input
                type="text"
                placeholder="Search models..."
                className="orchestrator-mode__model-search-input"
                onChange={(e) => {
                  const q = e.target.value.toLowerCase();
                  document.querySelectorAll(".orchestrator-mode__model-option").forEach(el => {
                    el.style.display = el.textContent.toLowerCase().includes(q) ? "flex" : "none";
                  });
                }}
                autoFocus
              />
            </div>
            <div className="orchestrator-mode__model-picker-list">
              {models.map(m => (
                <button
                  key={m.id}
                  className={`orchestrator-mode__model-option ${selectedModel === m.id ? "orchestrator-mode__model-option--active" : ""}`}
                  onClick={() => { setSelectedModel(m.id); setModelPickerOpen(false); }}
                  type="button"
                >
                  <div className="orchestrator-mode__model-option-info">
                    <span className="orchestrator-mode__model-option-name">{m.name}</span>
                    <span className="orchestrator-mode__model-option-provider">{m.provider}</span>
                  </div>
                  {selectedModel === m.id && <IconCheck />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <ChatFeed
        messages={messages}
        onRetry={handleRetry}
        idle={
          <div className="orchestrator-mode__idle">
            <div className="orchestrator-mode__greeting">
              <h2>What would you like to create today?</h2>
              <p>Describe what you want, and I'll help you plan and create it step by step.</p>
            </div>
            {executing && (
              <div className="orchestrator-mode__executing">
                {stepCards.map((step) => (
                  <div key={step.index} className={`orchestrator-mode__step ${step.status ? `orchestrator-mode__step--${step.status}` : ""}`}>
                    {step.status === "done" && <span className="orchestrator-mode__step-check">✓</span>}
                    {step.status === "running" && <span className="orchestrator-mode__step-loader" />}
                    {step.status === "error" && <span className="orchestrator-mode__step-check" style={{ color: "#FF4D4D" }}>✕</span>}
                    {(!step.status || step.status === "pending") && <span className="orchestrator-mode__step-dot">·</span>}
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
      />
      {messages.length === 0 && !thinking && (
        <div className="orchestrator-mode__suggestions">
          <AISuggestions suggestions={SUGGESTIONS} onSelect={(s) => handleChat(s.label)} />
        </div>
      )}
      {hasConversation && !plan && !executing && !thinking && (
        <div className="orchestrator-mode__plan-bar">
          <button className="orchestrator-mode__plan-btn" onClick={handlePlan} type="button">
            <IconSparkle /> Generate Plan
          </button>
        </div>
      )}
      <ChatInput
        placeholder="Describe what you want to create..."
        onSubmit={handleChat}
        disabled={thinking || executing}
        loading={thinking}
      />
    </div>
  );
}
