import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// src/lib/log.js — one JSON line per call, redaction applied automatically.
// These tests capture the underlying console.* call and inspect its single
// string argument (never the pre-JSON.stringify object) so a leak into the
// *serialized* line is what actually fails the test — matching how a real
// log aggregator only ever sees the string.

let logSpy, warnSpy, errorSpy;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log.info/warn/error — shape", () => {
  it("log.info writes one valid-JSON line with ts, level, event", async () => {
    const { log } = await import("@/lib/log");
    log.info("generation_settled", { userId: "u1" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0];
    expect(typeof line).toBe("string");
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("generation_settled");
    expect(typeof parsed.ts).toBe("string");
    expect(Number.isNaN(Date.parse(parsed.ts))).toBe(false);
    expect(parsed.userId).toBe("u1");
  });

  it("log.warn writes level 'warn' via console.warn", async () => {
    const { log } = await import("@/lib/log");
    log.warn("reservation_settle_clamped", { jobId: "j1" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(parsed.level).toBe("warn");
    expect(parsed.event).toBe("reservation_settle_clamped");
  });

  it("log.error writes level 'error' via console.error", async () => {
    const { log } = await import("@/lib/log");
    log.error("job_heartbeat_failed", { jobId: "j1" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("job_heartbeat_failed");
  });
});

describe("redact — automatic sanitization", () => {
  it("strips any field whose key matches key/secret/token/password/authorization, case-insensitively", async () => {
    const { log } = await import("@/lib/log");
    log.info("provider_call", {
      apiKey: "sk-super-secret-value",
      Secret: "another-secret-value",
      authToken: "bearer-token-value",
      password: "hunter2-value",
      Authorization: "Bearer abc123value",
      userId: "u1",
    });

    const line = logSpy.mock.calls[0][0];
    expect(line).not.toMatch(/apiKey/i);
    expect(line).not.toMatch(/secret/i);
    expect(line).not.toMatch(/token/i);
    expect(line).not.toMatch(/password/i);
    expect(line).not.toMatch(/authorization/i);
    expect(line).not.toContain("sk-super-secret-value");
    expect(line).not.toContain("another-secret-value");
    expect(line).not.toContain("bearer-token-value");
    expect(line).not.toContain("hunter2-value");
    expect(line).not.toContain("abc123value");

    const parsed = JSON.parse(line);
    expect(parsed.userId).toBe("u1");
  });

  it("replaces a prompt field with promptChars and never emits the prompt text", async () => {
    const { log } = await import("@/lib/log");
    const prompt = "a extremely specific and private prompt about someone's medical history";
    log.info("generation_submitted", { prompt, userId: "u1" });

    const line = logSpy.mock.calls[0][0];
    expect(line).not.toContain(prompt);
    expect(line).not.toContain("medical history");

    const parsed = JSON.parse(line);
    expect(parsed.prompt).toBeUndefined();
    expect(parsed.promptChars).toBe(prompt.length);
  });

  it("redact() is exported directly and applies the same rules standalone", async () => {
    const { redact } = await import("@/lib/log");
    const out = redact({ apiKey: "x", prompt: "hello world", userId: "u1" });
    expect(out.apiKey).toBeUndefined();
    expect(out.prompt).toBeUndefined();
    expect(out.promptChars).toBe(11);
    expect(out.userId).toBe("u1");
  });
});

describe("log.error — err serialization and stack redaction", () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it("includes err.message but never a stack trace when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { log } = await import("@/lib/log");

    const err = new Error("provider request failed");
    log.error("job_failed", { jobId: "j1", err });

    const line = errorSpy.mock.calls[0][0];
    const parsed = JSON.parse(line);
    expect(parsed.err.message).toBe("provider request failed");
    expect(parsed.err.stack).toBeUndefined();
    // The stack trace format ("at functionName (file:line:col)") must not
    // leak into the line some other way either.
    expect(line).not.toMatch(/\bat .+:\d+:\d+/);
  });

  it("includes the stack outside production", async () => {
    process.env.NODE_ENV = "test";
    vi.resetModules();
    const { log } = await import("@/lib/log");

    const err = new Error("provider request failed");
    log.error("job_failed", { jobId: "j1", err });

    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed.err.message).toBe("provider request failed");
    expect(typeof parsed.err.stack).toBe("string");
    expect(parsed.err.stack.length).toBeGreaterThan(0);
  });
});
