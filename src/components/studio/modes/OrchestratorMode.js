"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import GenerationField from "../universe/GenerationField";
import { IconArrowUpRight, IconBolt, IconCheck, IconClose, IconDownload, IconSearch, IconSettings, IconSparkle } from "@/components/Icons";

const SUGGESTIONS = [
  "Create a six-shot launch film for a skincare collection",
  "Build a complete visual identity for a technology company",
  "Plan a cinematic trailer with an original score",
  "Produce a product campaign for three social formats",
];

const modelName = (model) => model?.name || model?.displayName || model?.id?.split("/").pop() || "Creative agent";
const outputUrl = (output) => typeof output === "string" ? output : output?.url || output?.outputUrl;

function PlanField({ steps = [], totalCredits, executing, onConfirm }) {
  if (!steps.length) return null;
  return (
    <section className="agent-universe__plan-field" aria-label="Production plan">
      <header><div><span>Execution map</span><h2>{steps.length} connected operations</h2></div><strong><IconBolt /> {totalCredits || 0}</strong></header>
      <div className="agent-universe__plan-map">
        <i className="agent-universe__plan-line" />
        {steps.map((step, index) => (
          <motion.article key={`${step.label}-${index}`} className={`agent-universe__plan-node is-${step.status || "pending"}`} initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * .06 }}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{step.agent || "Creative agent"}</strong><p>{step.task || step.label}</p></div>
            <small>{step.status === "done" ? "Complete" : step.status === "running" ? "Running" : step.status === "error" ? "Failed" : `${step.cost || 0} credits`}</small>
          </motion.article>
        ))}
      </div>
      {onConfirm && <button className="agent-universe__execute" type="button" onClick={onConfirm} disabled={executing}><IconSparkle /> Confirm and execute <span>{totalCredits || 0} credits</span></button>}
    </section>
  );
}

function AgentMessage({ message, onRetry }) {
  if (message.type === "loading") return null;
  if (message.type === "plan") return <PlanField steps={message.steps} totalCredits={message.totalCredits} onConfirm={message.onConfirm} />;
  if (message.type === "result") {
    const urls = (message.outputs?.length ? message.outputs : [message.url]).map(outputUrl).filter(Boolean);
    return <article className="agent-message agent-message--result"><div className="agent-message__identity"><IconSparkle /><span>Helmies Agent</span></div><div className="agent-message__result-grid">{urls.map((url, index) => <figure key={`${url}-${index}`}>{/\.(mp4|webm|mov)(\?|$)/i.test(url) ? <video src={url} controls playsInline /> : <img src={url} alt={`Generated production output ${index + 1}`} />}<figcaption><a href={url} download><IconDownload /> Download</a><button type="button" onClick={() => onRetry?.(message)}><IconArrowUpRight /> Create variation</button></figcaption></figure>)}</div>{message.creditsUsed > 0 && <small><IconBolt /> {message.creditsUsed} credits used</small>}</article>;
  }
  return <article className={`agent-message agent-message--${message.type}`}><div className="agent-message__identity">{message.type === "user" ? <span>YOU</span> : <><IconSparkle /><span>Helmies Agent</span></>}</div><div className="agent-message__copy">{message.text || message.streamText || "The request could not be completed."}</div></article>;
}

export default function OrchestratorMode() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [plan, setPlan] = useState(null);
  const [stepCards, setStepCards] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("deepseek/deepseek-v4-flash");
  const [modelQuery, setModelQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState("approve");
  const [quality, setQuality] = useState(82);
  const [pendingCount, setPendingCount] = useState(0);
  const messagesRef = useRef([]);
  const feedRef = useRef(null);

  useEffect(() => { messagesRef.current = messages; feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [messages, streamingText]);
  useEffect(() => {
    apiFetch("/api/openrouter/models").then((response) => response.json()).then((data) => {
      if (!data.models?.length) return;
      setModels(data.models);
      if (!data.models.some((model) => model.id === selectedModel)) setSelectedModel(data.models[0].id);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    let timer;
    const poll = async () => { try { const response = await apiFetch("/api/generations/status?limit=50"); const data = await response.json(); setPendingCount((data.generations || []).filter((job) => ["pending", "processing"].includes(job.status)).length); } catch {} timer = window.setTimeout(poll, 10000); };
    poll(); return () => window.clearTimeout(timer);
  }, []);

  const filteredModels = useMemo(() => models.filter((model) => `${modelName(model)} ${model.provider || ""} ${model.id}`.toLowerCase().includes(modelQuery.toLowerCase())).slice(0, 40), [models, modelQuery]);
  const currentModel = models.find((model) => model.id === selectedModel) || { id: selectedModel, name: selectedModel.split("/").pop(), provider: selectedModel.split("/")[0] };

  const streamChat = useCallback(async (chatMessages) => {
    const response = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: chatMessages, model: selectedModel }) });
    if (!response.ok) throw new Error("Agent connection failed");
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let fullText = "";
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) { if (!line.startsWith("data: ")) continue; try { const data = JSON.parse(line.slice(6)); if (data.type === "token" && data.content) { fullText += data.content; setStreamingText(fullText); } } catch {} }
    }
    return fullText;
  }, [selectedModel]);

  const handleChat = useCallback(async (value) => {
    const text = value.trim(); if (!text || thinking || executing) return;
    setDraft(""); setMessages((previous) => [...previous, { id: crypto.randomUUID(), type: "user", text }]); setThinking(true); setStreamingText("");
    const history = messagesRef.current.filter((message) => ["user", "assistant"].includes(message.type)).map((message) => ({ role: message.type === "user" ? "user" : "assistant", content: message.text || message.streamText })); history.push({ role: "user", content: text });
    try { const responseText = await streamChat(history); setMessages((previous) => [...previous, { id: crypto.randomUUID(), type: "assistant", text: responseText }]); }
    catch (error) { setMessages((previous) => [...previous, { id: crypto.randomUUID(), type: "error", text: error.message }]); }
    finally { setThinking(false); setStreamingText(""); }
  }, [executing, streamChat, thinking]);

  const handlePlan = useCallback(async () => {
    if (thinking || executing || plan) return;
    const conversation = messagesRef.current.filter((message) => ["user", "assistant"].includes(message.type)).map((message) => `${message.type}: ${message.text}`).join("\n");
    setThinking(true);
    try {
      const response = await fetch("/api/agent/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: conversation, stream: true, context: { approvalMode, quality } }) });
      if (!response.ok) throw new Error("Planning failed");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; try { const data = JSON.parse(line.slice(6)); if (data.type === "plan") { const raw = data.plan; const steps = (raw.steps || []).map((step) => ({ ...step, label: `${step.agent}: ${step.task}`, cost: raw.estimate?.breakdown?.find((item) => item.task === step.task)?.credits || 0 })); setPlan({ steps, totalCredits: raw.estimate?.total || 0, summary: raw.summary || "", rawPlan: raw }); } } catch {} } }
    } catch (error) { setMessages((previous) => [...previous, { id: crypto.randomUUID(), type: "error", text: error.message }]); }
    finally { setThinking(false); }
  }, [approvalMode, executing, plan, quality, thinking]);

  const handleExecute = useCallback(async () => {
    if (!plan || executing) return;
    setExecuting(true); setStepCards(plan.steps.map((step, index) => ({ ...step, index, status: "pending" })));
    try {
      const response = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: plan.summary || plan.steps.map((step) => step.task).join(", "), context: { precomputedPlan: plan.rawPlan, approvalMode, quality }, stream: true }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Execution failed"); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; try { const data = JSON.parse(line.slice(6)); const index = (data.step || 1) - 1; if (data.type === "step_start") setStepCards((previous) => previous.map((step) => step.index === index ? { ...step, status: "running" } : step)); if (data.type === "step_complete") setStepCards((previous) => previous.map((step) => step.index === index ? { ...step, status: data.status === "failed" ? "error" : "done", output: data.output } : step)); if (data.type === "run_complete") { const url = data.assembled?.images?.[0]?.url || data.assembled?.videos?.[0]?.url || outputUrl(data.outputs?.[0]); setMessages((previous) => [...previous, { id: crypto.randomUUID(), type: data.success ? "result" : "error", url, outputs: data.outputs, creditsUsed: data.creditsUsed || plan.totalCredits, text: data.error }]); } } catch {} } }
    } catch (error) { setMessages((previous) => [...previous, { id: crypto.randomUUID(), type: "error", text: error.message }]); }
    finally { setExecuting(false); }
  }, [approvalMode, executing, plan, quality]);

  const hasConversation = messages.some((message) => message.type === "assistant");
  const activeSteps = stepCards.length ? stepCards : plan?.steps || [];

  return (
    <main className="agent-universe">
      <section className="agent-universe__stage">
        <header className="agent-universe__heading"><div><span>Creative orchestration</span><h1>Agent</h1><p>Shape a production in conversation, inspect the plan, then let specialized models execute it.</p></div><div className="agent-universe__status"><i /> {pendingCount ? `${pendingCount} active jobs` : "System ready"}</div></header>
        <div className="agent-universe__conversation" ref={feedRef}>
          {!messages.length && !thinking && <section className="agent-universe__welcome"><span><IconSparkle /></span><h2>What are we making?</h2><p>Describe the outcome, references, formats, and constraints. Agent will turn the brief into an inspectable production plan.</p><div>{SUGGESTIONS.map((suggestion, index) => <button key={suggestion} type="button" onClick={() => handleChat(suggestion)}><small>{String(index + 1).padStart(2, "0")}</small>{suggestion}<IconArrowUpRight /></button>)}</div></section>}
          {messages.map((message) => <AgentMessage key={message.id} message={message} onRetry={() => handleChat(messages.findLast((item) => item.type === "user")?.text || "Create another variation")} />)}
          {thinking && <article className="agent-message agent-message--thinking"><div className="agent-message__identity"><IconSparkle /><span>Helmies Agent</span></div>{streamingText ? <div className="agent-message__copy">{streamingText}</div> : <div className="agent-thinking-field"><i /><i /><i /><span>Reasoning across your brief</span></div>}</article>}
          {plan && !executing && <PlanField steps={plan.steps} totalCredits={plan.totalCredits} onConfirm={handleExecute} />}
          {executing && <div className="agent-universe__execution"><GenerationField phase="generating" model={currentModel} /><PlanField steps={activeSteps} totalCredits={plan?.totalCredits} executing /></div>}
        </div>
      </section>

      <aside className="agent-universe__context">
        <header><div><span>Context orbit</span><h2>Agent intelligence</h2></div><button type="button" aria-label="Agent settings" onClick={() => setSettingsOpen((open) => !open)}><IconSettings /></button></header>
        <div className="agent-universe__model-current"><i /><div><span>Reasoning model</span><strong>{modelName(currentModel)}</strong><small>{currentModel.provider || currentModel.id?.split("/")[0]}</small></div></div>
        <label className="agent-universe__model-search"><IconSearch /><input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Search reasoning models" /></label>
        <div className="agent-universe__models">{filteredModels.map((model) => <button key={model.id} type="button" className={model.id === selectedModel ? "is-active" : ""} onClick={() => setSelectedModel(model.id)}><div><strong>{modelName(model)}</strong><small>{model.provider || model.id.split("/")[0]}</small></div>{model.id === selectedModel && <IconCheck />}</button>)}</div>
        <AnimatePresence>{settingsOpen && <motion.section className="agent-universe__guardrails" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><h3>Execution guardrails</h3><label>Approval mode<select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value)}><option value="approve">Approve before execution</option><option value="budget">Run within planned budget</option></select></label><label>Quality threshold <output>{quality}</output><input type="range" min="60" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label></motion.section>}</AnimatePresence>
        <dl className="agent-universe__facts"><div><dt>Memory</dt><dd>Project context active</dd></div><div><dt>Plan state</dt><dd>{plan ? `${plan.steps.length} operations` : "Waiting for brief"}</dd></div><div><dt>Approval</dt><dd>{approvalMode === "approve" ? "Required" : "Budget controlled"}</dd></div></dl>
      </aside>

      <form className="agent-universe__composer" onSubmit={(event) => { event.preventDefault(); handleChat(draft); }}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); handleChat(draft); } }} placeholder="Describe the production, references, constraints, and deliverables…" disabled={thinking || executing} />
        <footer><div><span>{modelName(currentModel)}</span><small>Memory active</small></div>{hasConversation && !plan && <button className="agent-universe__plan-action" type="button" onClick={handlePlan} disabled={thinking}><IconSparkle /> Build production plan</button>}<button className="agent-universe__send" type="submit" disabled={!draft.trim() || thinking || executing}><span>{thinking ? "Thinking" : "Send brief"}</span><IconArrowUpRight /></button></footer>
      </form>
    </main>
  );
}
