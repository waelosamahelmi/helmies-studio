"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import {
  TERMINAL_SERVICES, MAX_TERMINAL_SESSIONS, terminalService,
  formatBytes, formatUptime,
} from "@/lib/dev-ops.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   DEV MODE
   ──────────────────────────────────────────────────────────────────────────
   This replaces the floating button that sat on top of the studio on every
   page. That button was permanently in the way of the product it was there
   to debug, it could only ever be one panel wide, and it put a live shell
   one stray tap away from a customer demo. Operator tools belong where the
   other operator tools are.

   What it can do is deliberately bounded. The server accepts a fixed verb
   on a fixed process name and nothing else — no command box, no free text
   reaching a shell. A dev panel that can run anything is a remote shell
   with a login page in front of it.
   ══════════════════════════════════════════════════════════════════════════ */

const TABS = [
  { id: "terminals", label: "Terminals" },
  { id: "processes", label: "Processes" },
  { id: "logs", label: "Logs" },
  { id: "system", label: "System" },
];

const STATUS_TONE = {
  online: "hs-badge--signal",
  stopped: "hs-badge--fault",
  errored: "hs-badge--fault",
  launching: "hs-badge--caution",
  stopping: "hs-badge--caution",
};

export default function DevPanel() {
  const [tab, setTab] = useState("terminals");

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <div className="hs-chips" role="tablist" aria-label="Dev mode sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`hs-chip${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "terminals" && <Terminals />}
      {tab === "processes" && <Processes />}
      {tab === "logs" && <Logs />}
      {tab === "system" && <System />}
    </div>
  );
}

/* ── Terminals ─────────────────────────────────────────────────────────────
   A web terminal is one service serving many clients: each connection is
   its own shell. So a session is a tab here, and closing a tab ends that
   shell. Restarting the SERVICE ends all of them at once, which is what
   "force stop everything" honestly means — and the button says so rather
   than pretending it can pick one. */
let sessionSeq = 0;

function Terminals() {
  const [sessions, setSessions] = useState(() => [
    { key: `s${++sessionSeq}`, service: "terminal" },
  ]);
  const [active, setActive] = useState(() => `s${sessionSeq}`);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const open = useCallback((serviceId) => {
    if (sessions.length >= MAX_TERMINAL_SESSIONS) {
      setError(`${MAX_TERMINAL_SESSIONS} sessions is the limit — each one is a live shell holding memory on the box.`);
      return;
    }
    const key = `s${++sessionSeq}`;
    setSessions((prev) => [...prev, { key, service: serviceId }]);
    setActive(key);
    setError("");
  }, [sessions.length]);

  const close = useCallback((key) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.key !== key);
      setActive((cur) => (cur === key ? next[next.length - 1]?.key ?? null : cur));
      return next;
    });
  }, []);

  /* Ending every session at once. This restarts the service, so it is
     described as what it does rather than as "force stop" — the shells do
     not come back, and anything running inside them dies with them. */
  const restartService = useCallback(async (serviceId) => {
    const svc = terminalService(serviceId);
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/dev/processes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: svc.process, action: "restart" }),
        retries: 0,
      });
      setSessions((prev) => prev.filter((s) => s.service !== serviceId));
      setNotice(`${svc.label} restarted — every session on it ended.`);
    } catch (e) {
      setError(e?.message || "That service could not be restarted.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="hs-stack" style={{ gap: "var(--s-3)" }}>
      <div className="hs-row" style={{ flexWrap: "wrap", gap: "var(--s-2)" }}>
        {TERMINAL_SERVICES.map((svc) => (
          <button key={svc.id} type="button" className="hs-btn hs-btn--outline hs-btn--sm"
            onClick={() => open(svc.id)} disabled={sessions.length >= MAX_TERMINAL_SESSIONS}>
            + New {svc.label.toLowerCase()}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {TERMINAL_SERVICES.map((svc) => (
          <button key={svc.id} type="button" className="hs-btn hs-btn--danger hs-btn--sm"
            onClick={() => restartService(svc.id)} disabled={busy}
            title={`Restart ${svc.label} — this ends every session on it, including anything still running`}>
            End all {svc.label.toLowerCase()} sessions
          </button>
        ))}
      </div>

      {error && <div className="hs-notice hs-notice--fault" role="alert"><span style={{ flex: 1 }}>{error}</span></div>}
      {notice && !error && <div className="hs-notice hs-notice--signal" role="status"><span style={{ flex: 1 }}>{notice}</span></div>}

      {!sessions.length ? (
        <div className="hs-empty">
          <h3>No sessions open</h3>
          <p>Each session is its own shell on the server. Open one above.</p>
        </div>
      ) : (
        <>
          <div className="hs-chips" role="tablist" aria-label="Open sessions">
            {sessions.map((s, i) => {
              const svc = terminalService(s.service);
              return (
                <span key={s.key} style={{ display: "inline-flex", alignItems: "center" }}>
                  <button type="button" role="tab" aria-selected={active === s.key}
                    className={`hs-chip${active === s.key ? " is-active" : ""}`}
                    onClick={() => setActive(s.key)}>
                    {svc.label} {i + 1}
                  </button>
                  <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
                    onClick={() => close(s.key)} aria-label={`Close ${svc.label} ${i + 1}`} title="Close this session">
                    ×
                  </button>
                </span>
              );
            })}
          </div>

          {/* Every session stays mounted: hiding one rather than unmounting
              it is what lets you flip between two shells without losing
              whatever is running in the one you left. */}
          <div className="dev-term">
            {sessions.map((s) => (
              <iframe
                key={s.key}
                src={terminalService(s.service).url}
                title={`${terminalService(s.service).label} session`}
                style={{ display: active === s.key ? "block" : "none" }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ── Processes ───────────────────────────────────────────────────────── */
function Processes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dev/processes", { retries: 0 });
      const data = await res.json();
      setRows(data.processes || []);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e?.message || "The process list could not be read.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const act = useCallback(async (name, action) => {
    setActing(`${name}:${action}`);
    setError("");
    setNotice("");
    try {
      await apiFetch("/api/dev/processes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, action }),
        retries: 0,
      });
      setNotice(`${name} ${action}ed.`);
    } catch (e) {
      /* Restarting the app that serves this page kills the response
         mid-flight. That is the restart working, not failing. */
      if (name === "helmies-studio" && action === "restart") {
        setNotice("Studio is restarting — this page will answer again in a few seconds.");
      } else {
        setError(e?.message || `${name} could not be ${action}ed.`);
      }
    } finally {
      setActing(null);
      setTimeout(load, 2000);
    }
  }, [load]);

  if (loading) return <div className="hs-skel" style={{ height: 200 }} />;

  return (
    <section className="hs-stack" style={{ gap: "var(--s-3)" }}>
      {error && <div className="hs-notice hs-notice--fault" role="alert"><span style={{ flex: 1 }}>{error}</span></div>}
      {notice && !error && <div className="hs-notice hs-notice--signal" role="status"><span style={{ flex: 1 }}>{notice}</span></div>}

      <ul className="st-members" role="list">
        {rows.map((p) => (
          <li key={p.name} className="st-member" style={{ flexWrap: "wrap" }}>
            <span className={`hs-badge ${STATUS_TONE[p.status] || ""}`}>{p.status}</span>
            <span className="st-member__name">
              {p.label}
              <span className="hs-hint" style={{ display: "block" }}>{p.role}</span>
            </span>
            <span className="st-member__meta hs-mono">
              {[
                p.status === "online" ? formatUptime(p.uptimeMs) : null,
                `${p.cpu}%`,
                formatBytes(p.memoryBytes),
                p.restarts ? `${p.restarts} restarts` : null,
              ].filter(Boolean).join(" · ")}
            </span>
            <div className="hs-row" style={{ gap: "var(--s-2)" }}>
              <button type="button" className="hs-btn hs-btn--sm hs-btn--outline"
                onClick={() => act(p.name, "restart")} disabled={!!acting}>
                {acting === `${p.name}:restart` ? "…" : "Restart"}
              </button>
              {p.status !== "online" ? (
                <button type="button" className="hs-btn hs-btn--sm hs-btn--primary"
                  onClick={() => act(p.name, "start")} disabled={!!acting}>Start</button>
              ) : !p.critical ? (
                <button type="button" className="hs-btn hs-btn--sm hs-btn--danger"
                  onClick={() => act(p.name, "stop")} disabled={!!acting}>Stop</button>
              ) : (
                <span className="hs-hint" title="Stopping this would take the panel down with it, or strand every queued job">
                  no stop
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Logs ────────────────────────────────────────────────────────────── */
function Logs() {
  const [source, setSource] = useState("helmies-studio");
  const [sources, setSources] = useState([]);
  const [logs, setLogs] = useState("");
  const [filter, setFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [follow, setFollow] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/dev/logs?source=${encodeURIComponent(source)}&lines=400`, { retries: 0 });
      const data = await res.json();
      setLogs(data.logs || "");
      if (data.sources) setSources(data.sources);
    } catch (e) {
      setLogs(`Could not read the logs: ${e?.message || "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    load();
    if (!follow) return undefined;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load, follow]);

  const shown = useMemo(() => {
    let lines = logs.split("\n");
    if (errorsOnly) lines = lines.filter((l) => /error|fatal|exception|unhandled|\bwarn\b/i.test(l));
    const q = filter.trim().toLowerCase();
    if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
    return lines.join("\n") || "Nothing matches.";
  }, [logs, errorsOnly, filter]);

  useEffect(() => {
    if (follow && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [shown, follow]);

  return (
    <section className="hs-stack" style={{ gap: "var(--s-3)" }}>
      <div className="hs-row" style={{ flexWrap: "wrap", gap: "var(--s-2)" }}>
        <select className="hs-input" style={{ maxWidth: 200 }} value={source}
          onChange={(e) => setSource(e.target.value)} aria-label="Process">
          {(sources.length ? sources : [{ name: "helmies-studio", label: "Studio" }]).map((s) => (
            <option key={s.name} value={s.name}>{s.label}</option>
          ))}
        </select>
        <input className="hs-input" style={{ maxWidth: 240 }} value={filter} type="search"
          onChange={(e) => setFilter(e.target.value)} placeholder="Filter lines" aria-label="Filter log lines" />
        <button type="button" className={`hs-chip${errorsOnly ? " is-active" : ""}`}
          aria-pressed={errorsOnly} onClick={() => setErrorsOnly((v) => !v)}>Errors only</button>
        <button type="button" className={`hs-chip${follow ? " is-active" : ""}`}
          aria-pressed={follow} onClick={() => setFollow((v) => !v)}>Follow</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={load} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </button>
        <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm"
          onClick={() => {
            navigator.clipboard.writeText(shown).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre ref={preRef} className="dev-logs">{shown}</pre>
    </section>
  );
}

/* ── System ──────────────────────────────────────────────────────────── */
function System() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let dead = false;
    const load = () => apiFetch("/api/dev/system", { retries: 0 })
      .then((r) => r.json())
      .then((d) => { if (!dead) setInfo(d); })
      .catch((e) => { if (!dead) setError(e?.message || "Could not read the system."); });
    load();
    const t = setInterval(load, 15000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  if (error) return <div className="hs-notice hs-notice--fault" role="alert"><span style={{ flex: 1 }}>{error}</span></div>;
  if (!info) return <div className="hs-skel" style={{ height: 160 }} />;

  const queue = info.queue || {};
  const rows = [
    // What is actually running, which is not the same claim as "I deployed
    // that" — every confusing session has come from the gap between them.
    ["Deployed commit", info.commit || "unknown"],
    ["Studio uptime", formatUptime(info.appUptimeMs)],
    ["Host uptime", formatUptime(info.hostUptimeMs)],
    ["Node", info.node],
    ["Host", `${info.hostname} · ${info.platform}`],
    ["Load", `${info.loadAvg?.join(" ")} across ${info.cpus} cores`],
    ["Memory", info.memory ? `${formatBytes(info.memory.used)} of ${formatBytes(info.memory.total)} (${info.memory.percent}%)` : "unknown"],
    ["Disk", info.disk ? `${formatBytes(info.disk.used)} of ${formatBytes(info.disk.total)} (${info.disk.percent}%)` : "unknown"],
    ["Queue", Object.keys(queue).length
      ? Object.entries(queue).map(([k, v]) => `${v} ${k}`).join(" · ")
      : "empty"],
  ];

  return (
    <section className="hs-stack" style={{ gap: "var(--s-3)" }}>
      {info.disk?.percent >= 90 && (
        <div className="hs-notice hs-notice--caution" role="status">
          <span style={{ flex: 1 }}>
            The disk is {info.disk.percent}% full. Renders are written here, so this stops the app before it stops the box.
          </span>
        </div>
      )}
      <ul className="st-members" role="list">
        {rows.map(([k, v]) => (
          <li key={k} className="st-member">
            <span className="st-member__name">{k}</span>
            <span className="st-member__meta hs-mono" style={{ textAlign: "right" }}>{v}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
