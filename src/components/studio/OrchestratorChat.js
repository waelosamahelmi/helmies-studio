"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconBolt, IconArrowUpRight, IconSparkle, IconImage, IconVideo, IconMusic, IconCrown } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

export default function OrchestratorChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, results]);

  const handlePlan = async () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: "user", content: input }]);
    setExecuting(true);

    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();

      if (data.steps) {
        setPlan(data);
        setMessages((m) => [...m, { role: "assistant", content: data.summary || "I've planned the task. Review the estimate below.", plan: data }]);
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
    setMessages((m) => [...m, { role: "assistant", content: `Executing... ${plan.estimate.total} credits will be used.` }]);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();

      if (data.success) {
        setResults(data.outputs || []);
        setMessages((m) => [...m, {
          role: "assistant",
          content: `Done! ${data.stepResults.length} steps completed. ${data.creditsUsed} credits used.`,
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

  const agentIcon = (agent) => {
    const icons = { image: IconImage, video: IconVideo, audio: IconMusic, orchestrator: IconSparkle };
    return icons[agent] || IconSparkle;
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
            <IconSparkle />
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
          <div key={i} className={`orchestrator__msg orchestrator__msg--${msg.role}`}>
            {msg.role === "assistant" && <div className="orchestrator__msg-icon"><IconSparkle /></div>}
            <div className="orchestrator__msg-content">
              <p>{msg.content}</p>
              {msg.plan && (
                <div className="orchestrator__plan">
                  <div className="orchestrator__plan-header">
                    <span>Execution Plan</span>
                    <span className="orchestrator__plan-cost">
                      <IconBolt /> {msg.plan.estimate.total} credits
                    </span>
                  </div>
                  <div className="orchestrator__plan-steps">
                    {msg.plan.steps.map((step, j) => {
                      const Icon = agentIcon(step.agent);
                      return (
                        <div key={j} className="orchestrator__step">
                          <span className="orchestrator__step-num">{j + 1}</span>
                          <span className="orchestrator__step-icon"><Icon /></span>
                          <div>
                            <div className="orchestrator__step-agent">{step.agent}</div>
                            <div className="orchestrator__step-task">{step.task}</div>
                          </div>
                          <span className="orchestrator__step-cost"><IconBolt /> {msg.plan.estimate.breakdown[j]?.credits || 0}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {msg.stepResults && (
                <div className="orchestrator__results">
                  {msg.stepResults.map((sr, j) => (
                    <div key={j} className={`orchestrator__result ${sr.status}`}>
                      <span>Step {sr.step}: {sr.agent}</span>
                      <span>{sr.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="orchestrator__outputs">
          {results.map((url, i) => {
            if (!url) return null;
            const isVideo = url.match(/\.(mp4|webm)$/i);
            const isImage = url.match(/\.(jpg|jpeg|png|webp|gif)$/i);
            if (isVideo) return <video key={i} src={url} controls autoPlay loop className="orchestrator__output" />;
            if (isImage) return <img key={i} src={url} alt={`Output ${i + 1}`} className="orchestrator__output" />;
            return <div key={i} className="orchestrator__output-text"><pre>{url}</pre></div>;
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