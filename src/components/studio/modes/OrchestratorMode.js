"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/client-fetch";
import ChatFeed from "../chat/ChatFeed";
import ChatInput from "../chat/ChatInput";
import ChatHeader from "../chat/ChatHeader";
import AISuggestions from "../chat/AISuggestions";
import { IconSparkle } from "@/components/Icons";

const SUGGESTIONS = [
  { icon: "🎬", label: "Create a luxury perfume commercial" },
  { icon: "🎨", label: "Design a brand kit for a tech startup" },
  { icon: "🎵", label: "Make a cinematic trailer with music" },
  { icon: "📱", label: "Create a social media campaign" },
];

export default function OrchestratorMode() {
  const [messages, setMessages] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [plan, setPlan] = useState(null);
  const [stepCards, setStepCards] = useState([]);

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

  const handlePlan = useCallback(async (text) => {
    if (!text.trim() || thinking || executing) return;

    const userMsg = { id: Date.now(), type: "user", text };
    const thinkingMsg = { id: Date.now() + 1, type: "loading", elapsed: 0 };
    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setThinking(true);

    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, stream: true }),
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
              cost: planData.estimate?.breakdown?.find(b => b.step === s.task)?.credits || 0,
              status: null,
              agent: s.agent,
              task: s.task,
              params: s.params,
            }));

            setPlan({
              steps,
              totalCredits,
              summary: planData.summary || "",
              rawPlan: planData,
            });
          }
        }
      }
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.type === "loading" ? { ...m, type: "error", text: e.message } : m
      ));
    } finally {
      setThinking(false);
    }
  }, [thinking, executing]);

  const handleExecute = useCallback(async () => {
    if (!plan || executing) return;

    const planMsg = {
      id: Date.now(),
      type: "plan",
      steps: plan.steps,
      totalCredits: plan.totalCredits,
    };
    setMessages(prev => [...prev.filter(m => m.type !== "loading"), planMsg]);
    setExecuting(true);

    const stepCardsInit = plan.steps.map((s, i) => ({
      index: i,
      ...s,
      status: "pending",
      output: null,
    }));
    setStepCards(stepCardsInit);

    try {
      const summary = plan.summary || plan.steps.map(s => s.task).join(", ");
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: summary,
          context: { precomputedPlan: plan.rawPlan },
          stream: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Execution failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let lastOutput = null;
      let lastOutputs = null;

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
            setStepCards(prev => prev.map(s =>
              s.index === stepIndex ? { ...s, status: "running" } : s
            ));
            setMessages(prev => prev.map(m =>
              m.type === "plan" && m.steps
                ? { ...m, steps: m.steps.map((s, i) => i === stepIndex ? { ...s, status: "running" } : s) }
                : m
            ));
          } else if (data.type === "step_complete") {
            const stepIndex = (data.step || 1) - 1;
            const output = data.output || null;
            setStepCards(prev => prev.map(s =>
              s.index === stepIndex ? { ...s, status: data.status === "failed" ? "error" : "done", output } : s
            ));
            setMessages(prev => prev.map(m =>
              m.type === "plan" && m.steps
                ? { ...m, steps: m.steps.map((s, i) => i === stepIndex ? { ...s, status: data.status === "failed" ? "error" : "done" } : s) }
                : m
            ));
          } else if (data.type === "run_complete") {
            setExecuting(false);
            lastOutput = data.assembled?.images?.[0]?.url
              || data.assembled?.videos?.[0]?.url
              || data.outputs?.[0] || null;
            lastOutputs = data.outputs || [];

            const resultMsg = {
              id: Date.now(),
              type: "result",
              url: lastOutput,
              outputs: lastOutputs.length > 1 ? lastOutputs : null,
              creditsUsed: data.creditsUsed || plan.totalCredits,
            };

            if (!data.success) {
              resultMsg.type = "error";
              resultMsg.text = data.error || "Some steps failed";
            }

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

  const handleInput = useCallback(async (text) => {
    await handlePlan(text);
  }, [handlePlan]);

  useEffect(() => {
    if (plan && !executing && !thinking) {
      setMessages(prev => {
        if (prev.some(m => m.type === "plan")) return prev;
        const planMsg = {
          id: Date.now(),
          type: "plan",
          steps: plan.steps,
          totalCredits: plan.totalCredits,
          onConfirm: handleExecute,
        };
        return [...prev.filter(m => m.type !== "loading"), planMsg];
      });
    }
  }, [plan, executing, thinking, handleExecute]);

  const handleRetry = () => {};

  return (
    <div className="orchestrator-mode">
      <ChatHeader Icon={IconSparkle} label="Orchestrator" pendingCount={pendingCount} />
      <ChatFeed
        messages={messages}
        onRetry={handleRetry}
        idle={
          <div className="orchestrator-mode__idle">
            <div className="orchestrator-mode__greeting">
              <h2>What would you like to create today?</h2>
              <p>Describe what you want, and the Orchestrator will plan and execute it step by step.</p>
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
      {messages.length === 0 && (
        <div className="orchestrator-mode__suggestions">
          <AISuggestions suggestions={SUGGESTIONS} onSelect={(s) => handleInput(s.label)} />
        </div>
      )}
      <ChatInput
        placeholder="Describe what you want to create..."
        onSubmit={handleInput}
        disabled={thinking || executing}
        loading={thinking}
      />
    </div>
  );
}
