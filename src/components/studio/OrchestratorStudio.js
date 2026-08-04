"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { parseQuestionBlock, stripQuestionBlock } from "@/lib/agent-chat";
import {
  Brief, SpendMeter, Group, Specs, Confirm, Sheet,
  IcSpark, IcFlow, IcCheck, IcAlert, IcChevron, IcExternal, IcInfo,
} from "@/components/studio/kit";
import SessionList from "@/components/studio/agent/SessionList";
import Markdown from "@/components/studio/agent/Markdown";
import QuestionCard from "@/components/studio/agent/QuestionCard";
import ThinkingCard from "@/components/studio/agent/ThinkingCard";
import PlanApproval, { modelsForStep } from "@/components/studio/agent/PlanApproval";
import StepProgress from "@/components/studio/agent/StepProgress";
import AssetCard from "@/components/studio/agent/AssetCard";
import { useModelCatalog } from "@/components/studio/useModelCatalog";

/* ══════════════════════════════════════════════════════════════════════════
   ORCHESTRATOR — .st-talk
   ──────────────────────────────────────────────────────────────────────────
   A conversation with one consequential moment in it: the plan. Chat is free
   and streams token by token. A plan spends credits, so it is never run on
   its own — the whole bill is laid out, step by step, and the user approves
   it. Every number on screen comes from the API's own quote.
   ══════════════════════════════════════════════════════════════════════════ */

const EXAMPLES = [
  "Plan a 30-second launch film for a linen bedding brand",
  "Make a hero image of a ceramic kettle, then animate it",
  "Write a launch campaign and generate three ad frames",
  "Compose a 15-second track for a product reel",
];

const AGENT_NAMES = {
  orchestrator: "Orchestrator",
  creative_director: "Creative director",
  image_director: "Image director",
  video_director: "Video director",
  brand_guardian: "Brand guardian",
  prompt_engineer: "Prompt engineer",
  storyboard: "Storyboard",
  audio_agent: "Audio",
  vision_analyst: "Vision analyst",
  quality_control: "Quality control",
  cost_optimizer: "Cost optimizer",
  assembly: "Assembly",
  image: "Image",
  video: "Video",
  audio: "Audio",
  website: "Website",
  marketing: "Marketing",
  coding: "Code",
};

const STATUS_WORD = { pending: "waiting", running: "running", done: "done", failed: "failed" };

const agentName = (a) => AGENT_NAMES[a] || String(a || "Step").replace(/_/g, " ");
const pad = (n) => String(n).padStart(2, "0");
const isUrl = (s) => typeof s === "string" && /^(https?:\/\/|\/)/.test(s.trim());
const isVideo = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes("/video/");
const isAudio = (u) => /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u);

/* ── SSE plumbing ───────────────────────────────────────────────────────────
   Chunks arrive on network boundaries, not on frame boundaries, so a single
   `data:` line can be split across two reads. Everything is buffered and only
   whole lines are parsed; the remainder is carried to the next read. */

async function openStream(url, body, signal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let message = `The request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      if (data?.creditsNeeded != null && data?.creditsAvailable != null) {
        message = `${message} This run needs ${data.creditsNeeded} credits and you have ${data.creditsAvailable}.`;
      }
    } catch { /* the body was not JSON — keep the status message */ }
    throw new Error(message);
  }

  const kind = res.headers.get("content-type") || "";
  if (!res.body || typeof res.body.getReader !== "function" || !kind.includes("text/event-stream")) {
    /* The route answered in plain JSON instead of streaming. */
    const data = await res.json().catch(() => null);
    return { json: data || {} };
  }
  return { res };
}

async function readSSE(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let seen = 0;

  const take = (line) => {
    const text = line.trim();
    if (!text.startsWith("data:")) return;
    const payload = text.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      onEvent(JSON.parse(payload));
      seen += 1;
    } catch { /* a frame the server did not encode as JSON — skip it */ }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(take);
    }
    take(buffer);
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  return seen;
}

/* ── Cost of a plan — read off the API's quote, never computed here ─────── */
function planCosts(plan) {
  const steps = plan?.steps || [];
  const breakdown = plan?.estimate?.breakdown;
  const perStep = steps.map((s, i) => {
    const quoted = breakdown?.[i]?.credits;
    if (typeof quoted === "number") return quoted;
    return typeof s?.estimatedCredits === "number" ? s.estimatedCredits : null;
  });

  let total = null;
  if (typeof plan?.estimate?.total === "number") total = plan.estimate.total;
  else if (perStep.length && perStep.every((c) => typeof c === "number")) total = perStep.reduce((a, b) => a + b, 0);
  else if (typeof plan?.totalCredits === "number") total = plan.totalCredits;

  return { perStep, total };
}

/* The plan card itself is src/components/studio/agent/PlanApproval.js —
   models, quality and aspect are editable per media step, every change is
   re-quoted live by the server, and Approve sends the exact displayed
   plan. */

/* ── Live run progress — driven by the run stream's own step events ─────── */
function RunCard({ run }) {
  const steps = run?.steps || [];
  const heading =
    run.status === "running" ? "Running" : run.status === "done" ? "Finished" : "Stopped";

  return (
    <section className="st-plan" aria-label={`Run progress, ${heading.toLowerCase()}`}>
      <header className="st-plan__head">
        {run.status === "running" ? (
          <span className="hs-spin" style={{ width: 13, height: 13 }} aria-hidden="true" />
        ) : run.status === "done" ? (
          <IcCheck className="hs-icon-sm" />
        ) : (
          <IcAlert className="hs-icon-sm" />
        )}
        <span className="hs-label" style={{ margin: 0 }}>{heading}</span>
        {run.creditsUsed != null && (
          <span className="hs-badge hs-badge--accent hs-mono" style={{ marginLeft: "auto" }}>
            {run.creditsUsed} cr
          </span>
        )}
      </header>

      <div role="list">
        {steps.map((step) => (
          <div
            key={step.n}
            role="listitem"
            className={`st-plan__step${
              step.status === "done" ? " is-done"
              : step.status === "running" ? " is-running"
              : step.status === "failed" ? " is-failed" : ""
            }`}
          >
            <span className="st-plan__n">{pad(step.n)}</span>
            <div className="st-plan__task">
              <span>{agentName(step.agent)}</span>
              {step.task && <span className="hs-hint">{step.task}</span>}
              {step.error && <span className="hs-error">{step.error}</span>}
            </div>
            <span className="st-plan__cost">{STATUS_WORD[step.status] || "waiting"}</span>
          </div>
        ))}
      </div>

      {run.error && (
        <p className="hs-notice hs-notice--fault" style={{ margin: "var(--s-3)" }}>
          {run.error}
        </p>
      )}
    </section>
  );
}

/* ── Typed outputs (assembled) → AssetCards, ungated (E3.5) ────────────── */
function AssetGrid({ assembled }) {
  const media = [
    ...(assembled?.images || []),
    ...(assembled?.videos || []),
    ...(assembled?.audio || []),
  ].filter((entry) => isUrl(entry?.url));
  const text = (assembled?.text || []).filter((entry) => entry?.content?.trim?.());
  if (!media.length && !text.length) return null;

  return (
    <div className="hs-stack" style={{ gap: "var(--s-3)" }}>
      {media.map((entry) => (
        <AssetCard
          key={`${entry.step}-${entry.url}`}
          url={entry.url}
          label={`Step ${entry.step} output`}
          gated={false}
        />
      ))}
      {text.map((entry, i) => (
        <details key={`text-${entry.step}-${i}`} className="hs-card">
          <summary className="hs-label" style={{ margin: 0, cursor: "pointer" }}>
            Text output {pad(entry.step || i + 1)}
          </summary>
          <pre
            style={{
              marginTop: "var(--s-3)", maxHeight: 240, overflow: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              fontSize: 11, color: "var(--tx-dim)",
            }}
          >
            {entry.content}
          </pre>
        </details>
      ))}
    </div>
  );
}

/* ── Whatever the run produced ─────────────────────────────────────────── */
function Outputs({ items }) {
  const media = items.filter(isUrl);
  const text = items.filter((o) => typeof o === "string" && !isUrl(o) && o.trim());
  if (!media.length && !text.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
      {media.length > 0 && (
        <div className="hs-thumbs">
          {media.map((url, i) => (
            <a
              key={`${url}-${i}`}
              className="hs-thumb"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open output ${i + 1} in a new tab`}
            >
              {isVideo(url) ? (
                <video src={url} muted playsInline preload="metadata" />
              ) : isAudio(url) ? (
                <span
                  className="hs-mono"
                  style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 10, color: "var(--tx-mute)" }}
                >
                  AUDIO
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                <img src={url} alt={`Output ${i + 1}`} />
              )}
            </a>
          ))}
        </div>
      )}

      {text.map((body, i) => (
        <details key={`text-${i}`} className="hs-card">
          <summary className="hs-label" style={{ margin: 0, cursor: "pointer" }}>
            Text output {pad(i + 1)}
          </summary>
          <pre
            style={{
              marginTop: "var(--s-3)", maxHeight: 240, overflow: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              fontSize: 11, color: "var(--tx-dim)",
            }}
          >
            {body}
          </pre>
        </details>
      ))}
    </div>
  );
}

/* ── Resume: rebuild the feed from a session's stored messages (E3.6) ──────
   The server persists every turn (E3.1/E3.2): user/assistant text and
   question turns as markdown, plan/run/outputs as JSON. This maps them back
   onto the exact message shapes the live feed renders, so a resumed session
   looks like it never left. */
function parseStoredJson(content) {
  try { return JSON.parse(content); } catch { return null; }
}

function feedFromStored(stored, nextId) {
  const out = [];
  const hasRunAfter = (idx) => stored.slice(idx + 1).some((m) => m.kind === "run" || m.kind === "outputs");
  const nextUserAfter = (idx) => stored.slice(idx + 1).find((m) => m.role === "user");

  stored.forEach((m, idx) => {
    const id = nextId();
    if (m.role === "user") {
      out.push({ id, role: "user", text: m.content });
      return;
    }
    if (m.kind === "text" || m.kind === "question") {
      /* A question that was followed by a user turn shows as answered; the
         LAST question in the feed stays answerable. */
      const answered = m.kind === "question" ? nextUserAfter(idx)?.content : undefined;
      out.push({ id, role: "agent", text: m.content, answered });
      return;
    }
    if (m.kind === "plan") {
      const plan = parseStoredJson(m.content);
      if (!plan?.steps?.length) return;
      const prevUser = [...stored.slice(0, idx)].reverse().find((x) => x.role === "user");
      out.push({
        id, role: "agent",
        text: plan.summary || "",
        plan,
        request: prevUser?.content || "",
        decision: hasRunAfter(idx) ? "approved" : undefined,
      });
      return;
    }
    if (m.kind === "run") {
      const data = parseStoredJson(m.content);
      if (!data) return;
      if (typeof data.stepIndex === "number") {
        /* A single reviewed step (from /api/agent/step). */
        out.push({
          id, role: "agent", text: "",
          review: {
            items: [{
              n: data.stepIndex + 1,
              agent: data.agent,
              task: data.task,
              status: data.status === "completed" ? "done" : "failed",
              credits: typeof data.creditsUsed === "number" ? data.creditsUsed : null,
              error: data.error || "",
              ...(typeof data.output === "string" ? { output: data.output } : {}),
              prompt: "",
              kind: data.agent,
            }],
            awaiting: null,
            done: true,
          },
        });
      } else {
        out.push({
          id, role: "agent",
          text: data.status === "done"
            ? (data.summary || "The production finished.")
            : "The production stopped before it finished.",
          run: {
            status: data.status === "done" ? "done" : "failed",
            creditsUsed: typeof data.creditsUsed === "number" ? data.creditsUsed : undefined,
            error: data.status === "done" ? "" : data.error || "",
            steps: (data.stepResults || []).map((r) => ({
              n: r.step,
              agent: r.agent,
              task: r.task || "",
              status: r.status === "completed" ? "done" : r.status === "failed" ? "failed" : "pending",
              error: r.error || "",
            })),
            outputs: [],
          },
        });
      }
      return;
    }
    if (m.kind === "outputs") {
      const data = parseStoredJson(m.content);
      if (data?.assembled) out.push({ id, role: "agent", text: "", assembled: data.assembled });
    }
  });

  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function OrchestratorStudio({ templateConfig, onCreditsChanged }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");           // "" | "chat" | "plan" | "run"
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [mode, setMode] = useState("review");     // "review" | "auto" (execution mode)
  const [sessions, setSessions] = useState([]);   // the rail: newest active sessions
  const [confirmSwitch, setConfirmSwitch] = useState(null); // { id: string|null } while busy
  /* E7.3: the side pane is hidden below 1024px, so it needs a way back. */
  const [sideOpen, setSideOpen] = useState(false);

  const feedRef = useRef(null);
  const abortRef = useRef(null);
  const sessionRef = useRef(null);
  const needsTitleRef = useRef(false); // auto-title once, from the first user message
  const idRef = useRef(0);
  const nextId = () => (idRef.current += 1);

  /* Model catalog for the plan's per-step model editing */
  const { models: catalogModels, loading: catalogLoading } = useModelCatalog({});

  /* ── Sessions rail (E3.6) ────────────────────────────────────────────── */
  const loadSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/agent/sessions", { retries: 0 });
      const data = await res.json();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch { /* the rail just stays empty */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  /* ── Session: created implicitly on the first message (E3.1/E3.4) ────── */
  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    try {
      const res = await apiFetch("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        retries: 0,
      });
      const data = await res.json();
      if (data?.session?.id) {
        sessionRef.current = data.session.id;
        setSessionId(data.session.id);
        needsTitleRef.current = true;
        loadSessions();
        return data.session.id;
      }
    } catch { /* chat still works without persistence */ }
    return null;
  }, [loadSessions]);

  /* Auto-title the session ONCE from the first user message (60 chars). */
  const autoTitle = useCallback(async (text) => {
    const sid = sessionRef.current;
    if (!sid || !needsTitleRef.current || !text) return;
    needsTitleRef.current = false;
    try {
      await apiFetch(`/api/agent/sessions/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text.slice(0, 60) }),
        retries: 0,
      });
      loadSessions();
    } catch {
      needsTitleRef.current = true; // try again on the next message
    }
  }, [loadSessions]);

  /* Resume: load a stored session and re-render its full feed. */
  const resumeSession = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/agent/sessions/${id}`, { retries: 0 });
      const data = await res.json();
      abortRef.current?.abort();
      sessionRef.current = id;
      setSessionId(id);
      needsTitleRef.current = (data?.session?.title || "New session") === "New session";
      setMode(data?.session?.settings?.autoComplete ? "auto" : "review");
      setMessages(feedFromStored(Array.isArray(data?.messages) ? data.messages : [], nextId));
      setError("");
      setBusy("");
      setAtBottom(true);
      loadSessions();
    } catch (err) {
      setError(err?.message || "Could not load that session.");
    }
  }, [loadSessions]);

  /* New session: create + switch to an empty feed. */
  const startNewSession = useCallback(async () => {
    abortRef.current?.abort();
    sessionRef.current = null;
    setSessionId(null);
    needsTitleRef.current = false;
    setMessages([]);
    setMode("review");
    setError("");
    setBusy("");
    setAtBottom(true);
    try {
      const res = await apiFetch("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        retries: 0,
      });
      const data = await res.json();
      if (data?.session?.id) {
        sessionRef.current = data.session.id;
        setSessionId(data.session.id);
        needsTitleRef.current = true;
        loadSessions();
      }
    } catch { /* the next message will create one implicitly */ }
  }, [loadSessions]);

  /* In-flight work blocks switching behind a confirm dialog. */
  const handleSelectSession = useCallback((id) => {
    if (id === sessionRef.current) return;
    if (busy) { setConfirmSwitch({ id }); return; }
    resumeSession(id);
  }, [busy, resumeSession]);

  const handleNewSession = useCallback(() => {
    if (busy) { setConfirmSwitch({ id: null }); return; }
    startNewSession();
  }, [busy, startNewSession]);

  /* Execution mode is persisted onto the session's settings so
     "don't ask again" survives resume. */
  const changeMode = useCallback(async (next) => {
    setMode(next);
    const sid = sessionRef.current;
    if (!sid) return;
    try {
      await apiFetch(`/api/agent/sessions/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { autoComplete: next === "auto" } }),
        retries: 0,
      });
    } catch { /* the toggle still applies locally */ }
  }, []);

  /* ── Balance: the API's number, or nothing at all ────────────────────── */
  const loadBalance = useCallback(async () => {
    try {
      const res = await apiFetch("/api/credits", { retries: 0 });
      const data = await res.json();
      setBalance(typeof data?.credits === "number" ? data.credits : null);
    } catch {
      /* Leave the balance unknown rather than showing a number we cannot vouch for. */
    }
  }, []);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  /* A template can arrive after mount and pre-fill the brief */
  useEffect(() => {
    if (templateConfig?.prompt) setInput(String(templateConfig.prompt));
  }, [templateConfig]);

  /* Abort any stream still running when the tool unmounts */
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  /* ── Feed scrolling: follow the newest message only if already there ─── */
  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= 120);
  }, []);

  /* `behavior: "auto"` overrides the feed's CSS smooth scrolling on purpose:
     an animated jump fires intermediate scroll events that would read as
     "the user scrolled away" and stall the follow mid-stream. */
  const toEnd = () => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  };

  useEffect(() => {
    if (!atBottom) return;
    toEnd();
  }, [messages, atBottom]);

  const jumpToLatest = useCallback(() => {
    toEnd();
    setAtBottom(true);
  }, []);

  /* ── Message helpers ─────────────────────────────────────────────────── */
  const patch = useCallback((id, change) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? (typeof change === "function" ? change(m) : { ...m, ...change }) : m)),
    );
  }, []);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError("");
    setAtBottom(true);
  }, []);

  /* ── Chat — streams, costs nothing ───────────────────────────────────── */
  /* `textOverride` lets a QuestionCard answer go out as a normal user
     message without touching the composer's draft — and also lets <Brief>
     (kit/Brief.js) pass the textarea's live DOM value straight through on
     Enter, rather than this closure falling back to its own `input` state.
     That fallback would be exactly as stale: Brief's `value` prop IS
     `input`, so at the instant a WebKit keydown can fire before React's
     controlled-value re-render lands (proven in Brief.js's onKeyDown), this
     closure's `input` is stale too — reusing it here would silently resend
     the previous draft. `clearInput` defaults to true so Brief's own
     Enter/click sends still clear the composer as before; the QuestionCard
     path below opts out since that override isn't the composer's text. */
  const send = useCallback(async (textOverride, { clearInput = true } = {}) => {
    const text = (typeof textOverride === "string" ? textOverride : input).trim();
    if (!text || busy) return;

    const history = [
      ...messages.filter((m) => m.text).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
      { role: "user", content: text },
    ];

    const askId = nextId();
    const replyId = nextId();
    if (clearInput) setInput("");
    setError("");
    setAtBottom(true);
    setMessages((prev) => [
      ...prev,
      { id: askId, role: "user", text },
      { id: replyId, role: "agent", text: "" },
    ]);
    setBusy("chat");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const sid = await ensureSession();
      autoTitle(text);
      const { res, json } = await openStream("/api/agent/chat", { messages: history, sessionId: sid }, ctrl.signal);

      if (json) {
        if (json.error) throw new Error(json.error);
        patch(replyId, { text: json.content || "" });
      } else {
        let tokens = 0;
        await readSSE(res, (event) => {
          if (event.type === "token" && event.content) {
            tokens += 1;
            patch(replyId, (m) => ({ ...m, text: m.text + event.content }));
          }
        });
        if (!tokens) {
          throw new Error("The agent's reply came back empty. Send the message again.");
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        patch(replyId, (m) => ({ ...m, text: m.text || "You stopped this reply." }));
      } else {
        setError(err?.message || "The chat stream failed.");
        setMessages((prev) => prev.filter((m) => m.id !== replyId || m.text));
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy("");
    }
  }, [input, busy, messages, patch, ensureSession, autoTitle]);

  /* Answering the agent's question sends the choice as the next message —
     the composer's own draft (if the user was mid-typing something else)
     is untouched, so this explicitly opts out of send's default clear. */
  const answerQuestion = useCallback((message, answer) => {
    if (busy) return;
    patch(message.id, { answered: answer });
    send(answer, { clearInput: false });
  }, [busy, patch, send]);

  /* ── Plan — one JSON quote, no credits spent ─────────────────────────── */
  /* `textOverride` lets a plan-card revision request re-plan without
     touching the composer's draft. */
  const propose = useCallback(async (textOverride) => {
    const text = (typeof textOverride === "string" ? textOverride : input).trim();
    if (!text || busy) return;

    const askId = nextId();
    const replyId = nextId();
    if (typeof textOverride !== "string") setInput("");
    setError("");
    setAtBottom(true);
    setMessages((prev) => [
      ...prev,
      { id: askId, role: "user", text },
      { id: replyId, role: "agent", text: "", thinking: "costing" },
    ]);
    setBusy("plan");

    try {
      const sid = await ensureSession();
      autoTitle(text);
      /* `stream: false` is required — the route streams SSE by default and the
         previous build called .json() on that stream, so no plan ever landed. */
      const res = await apiFetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, stream: false, sessionId: sid }),
        timeout: 120000,
        retries: 0,
      });
      const data = await res.json();
      const steps = Array.isArray(data?.steps) ? data.steps : [];
      if (!steps.length) {
        throw new Error("The agent returned a plan with no steps. Describe the production in more detail and plan again.");
      }

      patch(replyId, {
        text: data.summary || `Here is a ${steps.length}-step production. Check the total, then approve it.`,
        thinking: false,
        request: text,
        plan: {
          steps,
          summary: data.summary,
          estimate: data.estimate,
          totalCredits: data.totalCredits,
          maxCredits: data.maxCredits,
        },
      });
      loadBalance();
    } catch (err) {
      setError(err?.message || "Planning failed.");
      setMessages((prev) => prev.filter((m) => m.id !== replyId));
    } finally {
      setBusy("");
    }
  }, [input, busy, patch, loadBalance, ensureSession, autoTitle]);

  /* ══ Review-mode execution (EDITSv1 E3.5) ══════════════════════════════
     The client walks the approved plan one /api/agent/step call at a time.
     Each media output pauses the run behind an AssetCard — Accept advances,
     Regenerate re-runs the same step (charged again, exactly its quote),
     Edit regenerates with a server-re-quoted override, and "Don't ask
     again" flips the session to auto-complete and runs the remaining
     sub-plan through /api/agent/run. Raw (un-proxied) outputs are kept
     client-side only for $STEP_N_OUTPUT chaining. */
  const reviewRuns = useRef(new Map()); // messageId -> { plan, rawOutputs: [] }

  const patchReview = useCallback((id, change) => {
    patch(id, (m) => ({
      ...m,
      review: { ...m.review, ...(typeof change === "function" ? change(m.review) : change) },
    }));
  }, [patch]);

  const patchReviewItem = useCallback((id, index, change) => {
    patchReview(id, (review) => ({
      items: review.items.map((it, i) => (i === index ? { ...it, ...change } : it)),
    }));
  }, [patchReview]);

  const finishReview = useCallback((id, failed = false) => {
    patchReview(id, { done: true, awaiting: null });
    patch(id, (m) => ({
      ...m,
      text: failed
        ? "The production stopped before it finished."
        : "The production finished. Everything above is in your library.",
    }));
    setBusy("");
    loadBalance();
    onCreditsChanged?.();
  }, [patchReview, patch, loadBalance, onCreditsChanged]);

  const runReviewStep = useCallback(async (id, index) => {
    const ctx = reviewRuns.current.get(id);
    if (!ctx) return;
    const { plan } = ctx;
    if (index >= plan.steps.length) { finishReview(id); return; }

    setBusy("run");
    patchReviewItem(id, index, { status: "running", error: "" });
    setAtBottom(true);

    try {
      const res = await apiFetch("/api/agent/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionRef.current,
          plan,
          stepIndex: index,
          previousOutputs: ctx.rawOutputs.slice(0, index).map((o) => o ?? null),
        }),
        timeout: 600000,
        retries: 0,
      });
      const data = await res.json();
      ctx.rawOutputs[index] = data.rawOutput ?? data.output ?? null;
      const media = !!(data.assembled &&
        (data.assembled.images?.length || data.assembled.videos?.length || data.assembled.audio?.length));
      patchReviewItem(id, index, {
        status: "done",
        credits: typeof data.creditsUsed === "number" ? data.creditsUsed : undefined,
        ...(typeof data.output === "string" ? { output: data.output } : {}),
        media,
      });
      loadBalance();
      if (media) {
        /* Pause for review — Accept / Regenerate / Edit / Don't ask again. */
        patchReview(id, { awaiting: index });
        setBusy("");
      } else {
        runReviewStep(id, index + 1);
      }
    } catch (err) {
      patchReviewItem(id, index, { status: "failed", error: err?.message || "The step failed." });
      patchReview(id, { awaiting: null, failedAt: index });
      setBusy("");
      setError(err?.message || "The step failed. It was not charged — try it again.");
      loadBalance();
    }
  }, [patchReviewItem, patchReview, finishReview, loadBalance]);

  const acceptStep = useCallback((id, index) => {
    if (busy) return;
    patchReview(id, { awaiting: null });
    runReviewStep(id, index + 1);
  }, [busy, patchReview, runReviewStep]);

  /* Regenerate one step (optionally with prompt/model overrides — the
     server re-quotes them). Charged again on success; a failure refunds
     and keeps the previous asset reviewable. */
  const regenerateStep = useCallback(async (id, index, overrides = null) => {
    const ctx = reviewRuns.current.get(id);
    if (!ctx || busy) return;
    const hadOutput = ctx.rawOutputs[index] != null;

    setBusy("run");
    patchReview(id, { awaiting: null });
    patchReviewItem(id, index, { status: "running", error: "" });

    try {
      const res = await apiFetch("/api/agent/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionRef.current,
          plan: ctx.plan,
          stepIndex: index,
          regenerate: true,
          ...(overrides ? { paramOverrides: overrides } : {}),
          previousOutputs: ctx.rawOutputs.slice(0, index).map((o) => o ?? null),
        }),
        timeout: 600000,
        retries: 0,
      });
      const data = await res.json();
      ctx.rawOutputs[index] = data.rawOutput ?? data.output ?? null;
      const media = !!(data.assembled &&
        (data.assembled.images?.length || data.assembled.videos?.length || data.assembled.audio?.length));
      patchReviewItem(id, index, {
        status: "done",
        credits: typeof data.creditsUsed === "number" ? data.creditsUsed : undefined,
        ...(typeof data.output === "string" ? { output: data.output } : {}),
        media,
      });
      if (media) {
        patchReview(id, { awaiting: index });
        setBusy("");
      } else {
        runReviewStep(id, index + 1);
      }
    } catch (err) {
      /* The failed attempt was refunded server-side; the previous asset
         (if any) stays reviewable. */
      patchReviewItem(id, index, {
        status: hadOutput ? "done" : "failed",
        error: hadOutput ? "" : err?.message || "The step failed.",
      });
      if (hadOutput) patchReview(id, { awaiting: index });
      setBusy("");
      setError(err?.message || "Regenerating failed. The attempt was not charged.");
    } finally {
      loadBalance();
    }
  }, [busy, patchReview, patchReviewItem, runReviewStep, loadBalance]);

  /* Rewrite $STEP_N_OUTPUT references for the remaining sub-plan: refs to
     already-completed steps get their real output substituted; refs to
     later steps are renumbered relative to the sub-plan. */
  const substituteRefs = (steps, rawOutputs, offset) =>
    steps.map((s) => {
      const params = { ...(s.params || {}) };
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string" && value.startsWith("$STEP_")) {
          const n = parseInt(value.match(/\d+/)?.[0], 10);
          if (Number.isFinite(n)) {
            if (n <= offset && rawOutputs[n - 1]) params[key] = rawOutputs[n - 1];
            else if (n > offset) params[key] = `$STEP_${n - offset}_OUTPUT`;
          }
        }
      }
      return { ...s, params };
    });

  /* "Don't ask again": accept this asset, flip the session to
     auto-complete, and run every remaining step as one /api/agent/run
     stream (its estimate is the remaining slice of the approved quote). */
  const dontAskAgain = useCallback(async (id, index) => {
    const ctx = reviewRuns.current.get(id);
    if (!ctx || busy) return;

    changeMode("auto");
    patchReview(id, { awaiting: null });

    const { plan } = ctx;
    const doneCount = index + 1;
    const remainingSteps = substituteRefs(plan.steps.slice(doneCount), ctx.rawOutputs, doneCount);
    if (!remainingSteps.length) { finishReview(id); return; }

    const remainingBreakdown = (plan.estimate?.breakdown || []).slice(doneCount);
    const remainingPlan = {
      steps: remainingSteps,
      summary: plan.summary,
      estimate: {
        total: remainingBreakdown.reduce((a, b) => a + (b?.credits || 0), 0),
        breakdown: remainingBreakdown,
      },
    };

    setBusy("run");
    setAtBottom(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const itemPatch = (event) => {
      const change = {
        status: event.status === "completed" ? "done" : "failed",
        error: event.error || "",
      };
      if (typeof event.creditsUsed === "number") change.credits = event.creditsUsed;
      if (typeof event.output === "string" && /^(https?:\/\/|\/)/.test(event.output)) {
        change.output = event.output;
        change.media = true;
      }
      return change;
    };

    const settleAuto = (event) => {
      patchReview(id, (review) => ({
        items: review.items.map((it, i) => {
          if (i < doneCount) return it;
          const r = (event.stepResults || []).find((sr) => sr.step === i - doneCount + 1);
          return r ? { ...it, ...itemPatch({ ...r, output: r.output }) } : it;
        }),
        assembled: event.assembled || review.assembled,
      }));
      finishReview(id, !event.success);
    };

    try {
      const { res, json } = await openStream(
        "/api/agent/run",
        { message: plan.summary || "", plan: remainingPlan, sessionId: sessionRef.current },
        ctrl.signal,
      );

      if (json) {
        settleAuto(json);
      } else {
        let finished = false;
        await readSSE(res, (event) => {
          if (event.type === "step_start") {
            patchReviewItem(id, doneCount + event.step - 1, { status: "running", error: "" });
          } else if (event.type === "step_complete") {
            patchReviewItem(id, doneCount + event.step - 1, itemPatch(event));
          } else if (event.type === "run_complete") {
            finished = true;
            settleAuto(event);
          }
        });
        if (!finished) throw new Error("The run stream ended before it reported a result.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError(err?.message || "The run failed.");
      finishReview(id, true);
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [busy, changeMode, patchReview, patchReviewItem, finishReview]);

  const startReview = useCallback((plan) => {
    const reviewId = nextId();
    reviewRuns.current.set(reviewId, { plan, rawOutputs: [] });
    setMessages((prev) => [...prev, {
      id: reviewId,
      role: "agent",
      text: "",
      review: {
        items: plan.steps.map((s, i) => ({
          n: i + 1,
          agent: s.agent,
          task: s.task,
          status: "waiting",
          credits: plan.estimate?.breakdown?.[i]?.credits ?? null,
          prompt: s.params?.prompt || "",
          kind: s.agent,
        })),
        awaiting: null,
        done: false,
      },
    }]);
    setAtBottom(true);
    runReviewStep(reviewId, 0);
  }, [runReviewStep]);

  /* ── Approve — the only path that spends credits ─────────────────────── */
  /* `approvedPlan` is the EXACT plan the user saw and edited in the
     PlanApproval card (models/params + its live re-quoted estimate); the
     server re-verifies every price and honors it verbatim (E3.2).
     Review mode walks it step by step; auto-complete streams the whole
     run. */
  const approve = useCallback(async (message, approvedPlan, chosenMode) => {
    if (busy || !message?.plan) return;
    const plan = approvedPlan || message.plan;

    patch(message.id, { decision: "approved", plan });
    setError("");
    setAtBottom(true);

    if ((chosenMode || mode) !== "auto") {
      startReview(plan);
      return;
    }

    const runId = nextId();
    const steps = (plan.steps || []).map((s, i) => ({
      n: i + 1, agent: s.agent, task: s.task, status: "pending",
    }));
    setMessages((prev) => [
      ...prev,
      { id: runId, role: "agent", text: "", run: { status: "running", steps, outputs: [] } },
    ]);
    setBusy("run");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    /* Once the server reports an outcome, nothing later may overwrite it —
       a stream can still throw after run_complete has landed. */
    let reported = false;

    const settle = (event) => {
      reported = true;
      patch(runId, (m) => ({
        ...m,
        text: event.success
          ? event.summary || "The production finished."
          : "The production stopped before it finished.",
        run: {
          ...m.run,
          status: event.success ? "done" : "failed",
          error: event.success ? "" : event.error || "The run failed.",
          creditsUsed: typeof event.creditsUsed === "number" ? event.creditsUsed : m.run.creditsUsed,
          outputs: Array.isArray(event.outputs) ? event.outputs.filter((o) => typeof o === "string") : m.run.outputs,
          /* `assembled` (typed outputs) drives the AssetCard grid — E3.5. */
          assembled: event.assembled || m.run.assembled,
          steps: mergeStepResults(m.run.steps, event.stepResults),
        },
      }));
    };

    try {
      const { res, json } = await openStream(
        "/api/agent/run",
        { message: message.request || plan.summary || "", plan, sessionId: sessionRef.current },
        ctrl.signal,
      );

      if (json) {
        settle(json);
      } else {
        let finished = false;
        await readSSE(res, (event) => {
          if (event.type === "step_start") {
            patch(runId, (m) => ({
              ...m,
              run: { ...m.run, steps: writeStep(m.run.steps, event.step, { agent: event.agent, task: event.task, status: "running" }) },
            }));
          } else if (event.type === "step_complete") {
            patch(runId, (m) => ({
              ...m,
              run: {
                ...m.run,
                steps: writeStep(m.run.steps, event.step, {
                  agent: event.agent,
                  status: event.status === "completed" ? "done" : "failed",
                  error: event.error || "",
                }),
              },
            }));
          } else if (event.type === "run_complete") {
            finished = true;
            settle(event);
          }
        });
        if (!finished) {
          throw new Error("The run stream ended before it reported a result. Check your library before running it again.");
        }
      }
    } catch (err) {
      if (!reported) {
        const aborted = err?.name === "AbortError";
        patch(runId, (m) => ({
          ...m,
          text: aborted ? "You stopped this run." : m.text,
          run: {
            ...m.run,
            status: "failed",
            error: aborted
              ? "You stopped this run. Steps that already finished were still charged."
              : err?.message || "The run failed.",
          },
        }));
        if (!aborted) setError(err?.message || "The run failed.");
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy("");
      loadBalance();
      onCreditsChanged?.();
    }
  }, [busy, patch, loadBalance, onCreditsChanged, mode, startReview]);

  /* A free-text revision request goes back to the planner with the
     original brief as context. */
  const adjust = useCallback((message, revision) => {
    const original = message.request || message.plan?.summary || "";
    if (revision) {
      propose(`${original}\n\nRevision: ${revision}`);
    } else {
      setInput(original);
      setAtBottom(true);
    }
  }, [propose]);

  /* ── Session readout for the side panel ──────────────────────────────── */
  const spent = useMemo(
    () => messages.reduce((sum, m) => {
      let acc = sum + (typeof m.run?.creditsUsed === "number" ? m.run.creditsUsed : 0);
      for (const item of m.review?.items || []) {
        if (item.status === "done" && typeof item.credits === "number") acc += item.credits;
      }
      return acc;
    }, 0),
    [messages],
  );

  const latestPlan = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].plan) return messages[i];
    return null;
  }, [messages]);

  const latestPlanTotal = latestPlan ? planCosts(latestPlan.plan).total : null;

  const producedUrls = useMemo(() => {
    const urls = [];
    for (const m of messages) {
      for (const o of m.run?.outputs || []) if (isUrl(o)) urls.push(o);
      for (const item of m.review?.items || []) if (isUrl(item.output)) urls.push(item.output);
    }
    return urls;
  }, [messages]);

  const stageWord =
    busy === "run" ? "running" : busy === "plan" ? "planning" : busy === "chat" ? "thinking" : undefined;

  /* ── The session context, rendered once and placed twice (E7.3) ───────────
     `.st-talk__side` is hidden below 1024px — on every phone AND every
     tablet — and until now nothing replaced it, so the balance, the Clear
     control, the latest plan's summary and the produced-outputs list simply
     ceased to exist there. Every other surface already had an answer to
     this: Workspace and the audio archetype use a `.st-panel-tabs` button
     that opens a Sheet, the canvas has its layers Sheet, workflows have
     `.st-flow__open`. This reuses that pattern rather than inventing a
     fourth one — the SAME subtree renders in the desktop aside and in the
     Sheet, so anything that appears in one appears in the other by
     construction, including groups that only exist once there is a plan. */
  const sessionPane = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }} data-testid="agent-session-pane">
      <SessionList
        sessions={sessions}
        activeId={sessionId}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
      />

      <Group
        label="Credits"
        right={
          messages.length > 0 ? (
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={clear}>
              Clear
            </button>
          ) : null
        }
      >
        <Specs
          rows={[
            { k: "Balance", v: balance == null ? "Unknown" : `${balance} cr` },
            { k: "Spent here", v: `${spent} cr` },
          ]}
        />
      </Group>

      {latestPlan && (
        <Group label="Latest plan">
          <Specs
            rows={[
              { k: "Steps", v: String(latestPlan.plan.steps?.length || 0) },
              { k: "Estimate", v: latestPlanTotal == null ? "Not quoted" : `${latestPlanTotal} cr` },
              { k: "Ceiling", v: latestPlan.plan.maxCredits != null ? `${latestPlan.plan.maxCredits} cr` : null },
              { k: "State", v: latestPlan.decision === "approved" ? "Approved" : "Awaiting approval" },
            ]}
          />
        </Group>
      )}

      {producedUrls.length > 0 && (
        <Group label="Produced">
          <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
            {producedUrls.map((url, i) => (
              <a
                key={`${url}-${i}`}
                className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--block"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ justifyContent: "flex-start" }}
              >
                <IcExternal className="hs-icon-sm" />
                <span className="hs-mono">Output {pad(i + 1)}</span>
              </a>
            ))}
          </div>
        </Group>
      )}

      <Group label="How this works">
        <p className="hs-hint">
          Chat is free. A plan is a quote — nothing runs and nothing is charged until you
          approve it. Approving spends the total shown on the plan; if a step fails partway,
          the unused reservation is returned.
        </p>
      </Group>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="st-talk">
      <div className="st-talk__main">
        <div
          className="st-talk__feed"
          ref={feedRef}
          onScroll={onFeedScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={!!busy}
          aria-label="Conversation with the orchestrator"
        >
          {messages.length === 0 ? (
            <div className="hs-empty">
              <span className="hs-empty__mark"><IcSpark /></span>
              <h3>Describe what you want made</h3>
              <p>
                Talk it through first — the agent asks questions and costs nothing. When the shape
                is right, choose <b>Plan production</b> and you will get every step with its price
                before anything runs.
              </p>
              <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="hs-chip"
                    onClick={() => setInput(example)}
                    style={{ fontFamily: "var(--ff-ui)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}
                    title={example}
                  >
                    {example.length > 46 ? `${example.slice(0, 46)}…` : example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const mine = message.role === "user";
              /* The agent's prose is markdown; a trailing ```question block
                 becomes a QuestionCard (the LAST block wins — same parser
                 the server persists with). */
              const question = !mine && message.text ? parseQuestionBlock(message.text) : null;
              const prose = question ? stripQuestionBlock(message.text) : message.text;
              const showThinking =
                !mine && !message.text && !message.plan && !message.run &&
                (message.thinking || busy === "chat");
              return (
                <article key={message.id} className={`st-msg st-msg--${mine ? "user" : "agent"}`}>
                  <span className="st-msg__who" aria-hidden="true">{mine ? "YOU" : "HS"}</span>
                  <div className="st-msg__body">
                    <span className="hs-sr">{mine ? "You said" : "The orchestrator said"}</span>

                    {mine && message.text && (
                      <div className="st-msg__text">
                        {message.text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
                      </div>
                    )}

                    {!mine && prose && <Markdown>{prose}</Markdown>}

                    {question && (
                      <QuestionCard
                        question={question}
                        answered={message.answered}
                        disabled={!!busy}
                        onAnswer={(answer) => answerQuestion(message, answer)}
                      />
                    )}

                    {showThinking && (
                      <ThinkingCard
                        stage={message.thinking === "costing" ? "costing" : "thinking"}
                        considerations={
                          message.thinking === "costing"
                            ? ["Breaking the brief into steps", "Choosing a model for each step", "Quoting each step's price"]
                            : ["Reading the conversation", "Drafting a reply"]
                        }
                      />
                    )}

                    {message.plan && (
                      <PlanApproval
                        key={`plan-${message.id}`}
                        message={message}
                        balance={balance}
                        busy={busy}
                        models={catalogModels}
                        modelsLoading={catalogLoading}
                        mode={mode}
                        onModeChange={changeMode}
                        onApprove={(plan, chosenMode) => approve(message, plan, chosenMode)}
                        onAdjust={(revision) => adjust(message, revision)}
                      />
                    )}

                    {message.review && (
                      <div className="hs-stack" style={{ gap: "var(--s-2)" }} role="list" aria-label="Production steps">
                        {message.review.items.map((item, i) => {
                          const gated = message.review.awaiting === i && !message.review.done;
                          const showAsset = typeof item.output === "string" && isUrl(item.output);
                          const showText = typeof item.output === "string" && !isUrl(item.output) && item.output.trim();
                          return (
                            <div key={item.n} className="hs-stack" style={{ gap: "var(--s-2)" }}>
                              <StepProgress item={item} />
                              {showText && (
                                <details className="hs-card">
                                  <summary className="hs-label" style={{ margin: 0, cursor: "pointer" }}>
                                    Step {pad(item.n)} text output
                                  </summary>
                                  <pre
                                    style={{
                                      marginTop: "var(--s-3)", maxHeight: 240, overflow: "auto",
                                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                                      fontSize: 11, color: "var(--tx-dim)",
                                    }}
                                  >
                                    {item.output.slice(0, 2000)}
                                  </pre>
                                </details>
                              )}
                              {showAsset && (
                                <AssetCard
                                  url={item.output}
                                  label={`Step ${item.n} output`}
                                  gated={gated}
                                  busy={busy === "run"}
                                  currentPrompt={item.prompt}
                                  modelPool={modelsForStep({ agent: item.kind, params: {} }, catalogModels)}
                                  modelsLoading={catalogLoading}
                                  onAccept={() => acceptStep(message.id, i)}
                                  onRegenerate={(overrides) => regenerateStep(message.id, i, overrides)}
                                  onAutoComplete={() => dontAskAgain(message.id, i)}
                                />
                              )}
                              {item.status === "failed" && !message.review.done && (
                                <div>
                                  <button
                                    type="button"
                                    className="hs-btn hs-btn--ghost hs-btn--sm"
                                    onClick={() => regenerateStep(message.id, i)}
                                    disabled={!!busy}
                                  >
                                    <IcAlert className="hs-icon-sm" /> Try this step again
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {message.run && <RunCard run={message.run} />}
                    {message.run?.assembled ? (
                      <AssetGrid assembled={message.run.assembled} />
                    ) : (
                      message.run?.outputs?.length > 0 && <Outputs items={message.run.outputs} />
                    )}

                    {/* A resumed session's stored outputs message (E3.6) */}
                    {message.assembled && <AssetGrid assembled={message.assembled} />}
                  </div>
                </article>
              );
            })
          )}

          {!atBottom && messages.length > 0 && (
            <button
              type="button"
              className="hs-btn hs-btn--sm st-talk__jump"
              onClick={jumpToLatest}
              aria-label="Jump to the newest message"
            >
              <IcChevron className="hs-icon-sm" /> Newest
            </button>
          )}
        </div>

        {error && (
          <div
            className="hs-notice hs-notice--fault"
            role="alert"
            style={{ margin: "0 var(--s-4) var(--s-3)" }}
          >
            <IcAlert className="hs-icon-sm" />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          </div>
        )}

        <Brief
          value={input}
          onChange={setInput}
          onSubmit={send}
          enterSends
          glow={!!busy}
          /* Only the two streaming calls can be stopped mid-flight; the plan
             request is a single round trip, so no false stop button. */
          onCancel={busy === "chat" || busy === "run" ? stop : undefined}
          generating={!!busy}
          stage={stageWord}
          cost={0}
          balance={balance}
          affordable
          submitLabel="Send"
          meterLabel="Chat"
          placeholder="Describe the production. Ask questions first — chatting costs nothing."
          extras={
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={propose}
              disabled={!input.trim() || !!busy}
              title="Turn this brief into a costed, step-by-step plan"
            >
              <IcFlow className="hs-icon-sm" /> Plan production
            </button>
          }
        />

        {/* Below 1024px the pane on the right is gone — this is the way back
            to it, the same affordance Workspace.js and the audio archetype
            use. Hidden above that width by `.st-panel-tabs`. */}
        <div className="st-panel-tabs st-panel-tabs--talk">
          <button
            type="button"
            className="hs-btn hs-btn--sm"
            onClick={() => setSideOpen(true)}
            aria-expanded={sideOpen}
          >
            <IcInfo className="hs-icon-sm" /> Session
          </button>
        </div>
      </div>

      <aside className="st-talk__side" aria-label="Session context">
        {sessionPane}
      </aside>

      <Sheet open={sideOpen} onClose={() => setSideOpen(false)} title="Session">
        {sessionPane}
      </Sheet>

      {/* Switching sessions mid-run needs a conscious choice (E3.6). */}
      <Confirm
        open={!!confirmSwitch}
        onClose={() => setConfirmSwitch(null)}
        onConfirm={() => {
          const target = confirmSwitch;
          if (!target) return;
          if (target.id) resumeSession(target.id);
          else startNewSession();
        }}
        title="Leave this run?"
        body="Work is still in progress. Switching sessions stops watching it here — steps that already ran stay charged and saved."
        confirmLabel="Switch"
        danger={false}
      />
    </div>
  );
}

/* ── Step bookkeeping for the run stream ────────────────────────────────── */
function writeStep(steps, n, change) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.some((s) => s.n === n)) return [...list, { n, status: "pending", ...change }];
  return list.map((s) => (s.n === n ? { ...s, ...change } : s));
}

function mergeStepResults(steps, results) {
  if (!Array.isArray(results) || !results.length) return steps;
  return results.reduce(
    (acc, r, i) =>
      writeStep(acc, r.step || i + 1, {
        agent: r.agent,
        status: r.status === "completed" ? "done" : r.status === "failed" ? "failed" : "pending",
        error: r.error || "",
      }),
    steps,
  );
}
