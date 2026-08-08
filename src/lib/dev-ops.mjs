// Helmies Studio — the operator surface behind Dev mode (worker-safe core).
//
// THE RULE THIS FILE EXISTS TO ENFORCE: nothing here ever takes a command
// from a request. Not a command string, not a process name, not a flag.
// A dev panel that can run arbitrary shell is a remote shell with a login
// page in front of it, and one XSS or one leaked session turns it into
// somebody else's server.
//
// So: a fixed verb list, a fixed process list, and every argument passed
// as an argv array to execFile — never a shell string, so there is no
// metacharacter to escape in the first place.

/** The processes Dev mode is allowed to see and act on. */
export const MANAGED_PROCESSES = [
  { name: "helmies-studio", label: "Studio", role: "The app itself", critical: true },
  { name: "helmies-worker", label: "Worker", role: "Runs the generation queue", critical: true },
  { name: "dev-terminal", label: "Terminal", role: "The web shell", critical: false },
  { name: "dev-opencode", label: "Opencode", role: "Coding agent", critical: false },
  { name: "dev-hermes", label: "Hermes", role: "Assistant", critical: false },
  { name: "browser-mcp", label: "Browser MCP", role: "Browser automation", critical: false },
];

export const MANAGED_NAMES = new Set(MANAGED_PROCESSES.map((p) => p.name));
export const processMeta = (name) => MANAGED_PROCESSES.find((p) => p.name === name) || null;

/** What may be done to one. `delete` is deliberately absent. */
export const PROCESS_ACTIONS = new Set(["restart", "reload", "stop", "start"]);

/**
 * Validate an action request. Returns { ok } or { ok:false, error }.
 *
 * Stopping the app that serves this page would take the panel down with
 * it, and stopping the worker silently strands every queued job — so both
 * are refused. Restart (which comes back) is allowed for either.
 */
export function validateProcessAction(name, action) {
  if (!MANAGED_NAMES.has(name)) return { ok: false, error: "That process is not managed here." };
  if (!PROCESS_ACTIONS.has(action)) return { ok: false, error: "Unknown action." };
  const meta = processMeta(name);
  if (meta?.critical && action === "stop") {
    return {
      ok: false,
      error: `${meta.label} cannot be stopped from here — stopping it would ${
        name === "helmies-studio" ? "take this page down with it" : "strand every queued job"
      }. Restart it instead.`,
    };
  }
  return { ok: true };
}

/** pm2 jlist → only what the panel shows, and only for managed processes. */
export function parseProcessList(raw) {
  let list;
  try {
    list = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];

  return list
    .filter((p) => MANAGED_NAMES.has(p?.name))
    .map((p) => {
      const env = p.pm2_env || {};
      const monit = p.monit || {};
      const meta = processMeta(p.name);
      return {
        name: p.name,
        label: meta?.label || p.name,
        role: meta?.role || "",
        critical: !!meta?.critical,
        status: env.status || "unknown",
        pid: p.pid || null,
        restarts: env.restart_time ?? 0,
        unstableRestarts: env.unstable_restarts ?? 0,
        uptimeMs: env.pm_uptime && env.status === "online" ? Date.now() - env.pm_uptime : 0,
        cpu: monit.cpu ?? 0,
        memoryBytes: monit.memory ?? 0,
      };
    })
    .sort((a, b) => Number(b.critical) - Number(a.critical) || a.label.localeCompare(b.label));
}

/* ── Terminals ────────────────────────────────────────────────────────────
   A web terminal is one service serving many clients: each connection gets
   its own shell, so "open another session" is another connection, not
   another server. That is why sessions live in the browser and only the
   SERVICE can be restarted — and why restarting it is described honestly
   as ending every session, because it does. */
export const TERMINAL_SERVICES = [
  { id: "terminal", label: "Shell", url: "/dev-terminal", process: "dev-terminal" },
  { id: "opencode", label: "Opencode", url: "/dev-opencode", process: "dev-opencode" },
];

export const MAX_TERMINAL_SESSIONS = 6;

export const terminalService = (id) => TERMINAL_SERVICES.find((t) => t.id === id) || TERMINAL_SERVICES[0];

/** Human sizes, used by the panel and by the tests that pin them. */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatUptime(ms) {
  const s = Math.floor((Number(ms) || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/* Disk from `df -k` and memory from `free -k`, parsed rather than shelled
   through awk — one less place for a quoting mistake to live. */
export function parseDf(stdout) {
  const lines = String(stdout || "").trim().split("\n").slice(1);
  const row = lines[0]?.trim().split(/\s+/);
  if (!row || row.length < 5) return null;
  const total = Number(row[1]) * 1024;
  const used = Number(row[2]) * 1024;
  const available = Number(row[3]) * 1024;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { total, used, available, percent: Math.round((used / total) * 100) };
}

export function parseFree(stdout) {
  const line = String(stdout || "").split("\n").find((l) => /^Mem:/i.test(l.trim()));
  if (!line) return null;
  const row = line.trim().split(/\s+/);
  const total = Number(row[1]) * 1024;
  const used = Number(row[2]) * 1024;
  const available = Number(row[6] ?? row[3]) * 1024;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { total, used, available, percent: Math.round((used / total) * 100) };
}
