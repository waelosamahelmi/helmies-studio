"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import {
  Brief, SpendMeter, Group, Specs,
  IcSpark, IcFlow, IcCheck, IcAlert, IcChevron, IcExternal,
} from "@/components/studio/kit";

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

/* ══════════════════════════════════════════════════════════════════════════
   The plan — the one screen the user has to read before spending
   ══════════════════════════════════════════════════════════════════════════ */
function PlanCard({ message, balance, busy, onApprove, onAdjust }) {
  const plan = message.plan;
  const steps = plan?.steps || [];
  const { perStep, total } = planCosts(plan);

  const approved = message.decision === "approved";
  const affordable = balance == null || total == null || balance >= total;
  const shortfall = affordable || total == null || balance == null ? 0 : total - balance;

  return (
    <section className="st-plan" aria-label={`Proposed plan, ${steps.length} steps`}>
      <header className="st-plan__head">
        <IcFlow className="hs-icon-sm" />
        <span className="hs-label" style={{ margin: 0 }}>Proposed plan</span>
        <span className="hs-badge hs-mono" style={{ marginLeft: "auto" }}>
          {steps.length} {steps.length === 1 ? "step" : "steps"}
        </span>
      </header>

      <div role="list">
        {steps.map((step, i) => (
          <div className="st-plan__step" role="listitem" key={`${step.agent}-${i}`}>
            <span className="st-plan__n">{pad(i + 1)}</span>
            <div className="st-plan__task">
              <span>{agentName(step.agent)}</span>
              {step.task && <span className="hs-hint">{step.task}</span>}
            </div>
            <span className="st-plan__cost">{perStep[i] == null ? "—" : `${perStep[i]} cr`}</span>
          </div>
        ))}
      </div>

      <footer className="st-plan__foot">
        <SpendMeter
          cost={total ?? 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          label="Total"
        />

        {approved ? (
          <span className="st-plan__acts hs-mono" style={{ fontSize: 10, color: "var(--signal)" }}>
            <IcCheck className="hs-icon-sm" /> Approved
          </span>
        ) : (
          <span className="st-plan__acts">
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={onAdjust}
              disabled={!!busy}
            >
              Adjust
            </button>
            <button
              type="button"
              className="hs-btn hs-btn--primary hs-btn--sm"
              onClick={onApprove}
              disabled={!!busy || !affordable || !steps.length}
              title={
                !affordable ? "Not enough credits for this plan"
                : total == null ? "Approve and run this plan"
                : `Approve and spend ${total} credits`
              }
            >
              <IcCheck className="hs-icon-sm" />
              Approve
              {total != null && <span className="hs-btn__cost hs-mono">{total}</span>}
            </button>
          </span>
        )}
      </footer>
    </section>
  );
}

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

/* ══════════════════════════════════════════════════════════════════════════ */
export default function OrchestratorStudio({ templateConfig, onCreditsChanged }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");           // "" | "chat" | "plan" | "run"
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(null);
  const [atBottom, setAtBottom] = useState(true);

  const feedRef = useRef(null);
  const abortRef = useRef(null);
  const idRef = useRef(0);
  const nextId = () => (idRef.current += 1);

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
  const send = useCallback(async () => {
    const text = input.trim();
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
    setInput("");
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
      const { res, json } = await openStream("/api/agent/chat", { messages: history }, ctrl.signal);

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
  }, [input, busy, messages, patch]);

  /* ── Plan — one JSON quote, no credits spent ─────────────────────────── */
  const propose = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    const askId = nextId();
    const replyId = nextId();
    setInput("");
    setError("");
    setAtBottom(true);
    setMessages((prev) => [
      ...prev,
      { id: askId, role: "user", text },
      { id: replyId, role: "agent", text: "Working out the steps and what they cost…" },
    ]);
    setBusy("plan");

    try {
      /* `stream: false` is required — the route streams SSE by default and the
         previous build called .json() on that stream, so no plan ever landed. */
      const res = await apiFetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, stream: false }),
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
  }, [input, busy, patch, loadBalance]);

  /* ── Approve — the only path that spends credits ─────────────────────── */
  const approve = useCallback(async (message) => {
    if (busy || !message?.plan) return;

    patch(message.id, { decision: "approved" });
    setError("");
    setAtBottom(true);

    const runId = nextId();
    const steps = (message.plan.steps || []).map((s, i) => ({
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
          steps: mergeStepResults(m.run.steps, event.stepResults),
        },
      }));
    };

    try {
      const { res, json } = await openStream(
        "/api/agent/run",
        { message: message.request || message.plan.summary || "", plan: message.plan },
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
  }, [busy, patch, loadBalance, onCreditsChanged]);

  const adjust = useCallback((message) => {
    setInput(message.request || message.plan?.summary || "");
    setAtBottom(true);
  }, []);

  /* ── Session readout for the side panel ──────────────────────────────── */
  const spent = useMemo(
    () => messages.reduce((sum, m) => sum + (typeof m.run?.creditsUsed === "number" ? m.run.creditsUsed : 0), 0),
    [messages],
  );

  const latestPlan = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].plan) return messages[i];
    return null;
  }, [messages]);

  const latestPlanTotal = latestPlan ? planCosts(latestPlan.plan).total : null;

  const producedUrls = useMemo(() => {
    const urls = [];
    for (const m of messages) for (const o of m.run?.outputs || []) if (isUrl(o)) urls.push(o);
    return urls;
  }, [messages]);

  const stageWord =
    busy === "run" ? "running" : busy === "plan" ? "planning" : busy === "chat" ? "thinking" : undefined;

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
              return (
                <article key={message.id} className={`st-msg st-msg--${mine ? "user" : "agent"}`}>
                  <span className="st-msg__who" aria-hidden="true">{mine ? "YOU" : "HS"}</span>
                  <div className="st-msg__body">
                    <span className="hs-sr">{mine ? "You said" : "The orchestrator said"}</span>

                    {message.text && (
                      <div className="st-msg__text">
                        {message.text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
                      </div>
                    )}

                    {!message.text && !mine && busy === "chat" && (
                      <p className="hs-hint">Thinking…</p>
                    )}

                    {message.plan && (
                      <PlanCard
                        message={message}
                        balance={balance}
                        busy={busy}
                        onApprove={() => approve(message)}
                        onAdjust={() => adjust(message)}
                      />
                    )}

                    {message.run && <RunCard run={message.run} />}
                    {message.run?.outputs?.length > 0 && <Outputs items={message.run.outputs} />}
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
      </div>

      <aside className="st-talk__side" aria-label="Session context">
        <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
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
      </aside>
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
