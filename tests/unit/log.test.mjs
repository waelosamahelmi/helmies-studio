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

// Code-review follow-up: the original redact() only inspected top-level
// string-keyed fields — a nested object, an array of objects, a
// case-differently-named prompt key, a non-string prompt, or a secret
// embedded in err.message's free text all passed through verbatim. Each
// vector below is the exact scenario the review executed and found leaking.
describe("redact — nested and non-obvious vectors (code review follow-up)", () => {
  it("strips a sensitive key nested arbitrarily deep (req.headers.authorization)", async () => {
    const { log } = await import("@/lib/log");
    log.info("outbound_request", {
      req: { headers: { authorization: "Bearer super-secret-nested-token" }, method: "GET" },
    });

    const line = logSpy.mock.calls[0][0];
    expect(line).not.toContain("super-secret-nested-token");
    expect(line).not.toMatch(/authorization/i);

    const parsed = JSON.parse(line);
    expect(parsed.req.headers).toEqual({});
    expect(parsed.req.method).toBe("GET"); // non-sensitive nested sibling survives
  });

  it("strips sensitive keys and truncates prompts inside an array of objects", async () => {
    const { log } = await import("@/lib/log");
    const promptText = "a very specific private prompt about a real person";
    log.info("batch_submitted", {
      items: [
        { token: "item-1-secret-token", prompt: promptText },
        { id: "item-2", apiKey: "item-2-secret-key" },
      ],
    });

    const line = logSpy.mock.calls[0][0];
    expect(line).not.toContain("item-1-secret-token");
    expect(line).not.toContain(promptText);
    expect(line).not.toContain("item-2-secret-key");

    const parsed = JSON.parse(line);
    expect(parsed.items[0].token).toBeUndefined();
    expect(parsed.items[0].promptChars).toBe(promptText.length);
    expect(parsed.items[1].apiKey).toBeUndefined();
    expect(parsed.items[1].id).toBe("item-2");
  });

  it("handles a non-string prompt value without throwing and without leaking its content", async () => {
    const { log } = await import("@/lib/log");
    const structuredPrompt = { text: "hidden content", refs: ["a", "b"] };
    expect(() => log.info("generation_submitted", { prompt: structuredPrompt })).not.toThrow();

    const line = logSpy.mock.calls[0][0];
    expect(line).not.toContain("hidden content");

    const parsed = JSON.parse(line);
    expect(parsed.prompt).toBeUndefined();
    expect(parsed.promptChars).toBe(JSON.stringify(structuredPrompt).length);
  });

  it("matches prompt-family keys case-insensitively: Prompt, promptText, negative_prompt", async () => {
    const { log } = await import("@/lib/log");
    log.info("generation_submitted", {
      Prompt: "one two three",
      promptText: "four five six seven",
      negative_prompt: "eight nine",
    });

    const line = logSpy.mock.calls[0][0];
    expect(line).not.toContain("one two three");
    expect(line).not.toContain("four five six seven");
    expect(line).not.toContain("eight nine");

    const parsed = JSON.parse(line);
    expect(parsed.Prompt).toBeUndefined();
    expect(parsed.PromptChars).toBe(13);
    expect(parsed.promptText).toBeUndefined();
    expect(parsed.promptTextChars).toBe(19);
    expect(parsed.negative_prompt).toBeUndefined();
    expect(parsed.negative_promptChars).toBe(10);
  });

  it("does not mangle a key named promptWarnings (not a prompt-family key)", async () => {
    const { redact } = await import("@/lib/log");
    const out = redact({ promptWarnings: ["ok"] });
    expect(out.promptWarnings).toEqual(["ok"]);
  });

  it("scrubs a secret-shaped value embedded in err.message free text", async () => {
    const { log } = await import("@/lib/log");
    const err = new Error("provider rejected the request: invalid api key: sk-proj-abcdef1234567890xyz");
    log.error("provider_call_failed", { err });

    const line = errorSpy.mock.calls[0][0];
    expect(line).not.toContain("sk-proj-abcdef1234567890xyz");

    const parsed = JSON.parse(line);
    expect(parsed.err.message).toContain("provider rejected the request");
    expect(parsed.err.message).toContain("[redacted]");
    expect(parsed.err.message).not.toContain("sk-proj-abcdef1234567890xyz");
  });

  it("scrubs a Bearer token embedded in err.message free text", async () => {
    const { log } = await import("@/lib/log");
    const err = new Error("upstream call failed — Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.reallylongtoken.sig");
    log.error("provider_call_failed", { err });

    const line = errorSpy.mock.calls[0][0];
    expect(line).not.toContain("eyJhbGciOiJIUzI1NiJ9.reallylongtoken.sig");

    const parsed = JSON.parse(line);
    expect(parsed.err.message).toContain("[redacted]");
  });

  it("does not mangle ordinary prose in err.message that merely contains the word 'Authorization'", async () => {
    const { log } = await import("@/lib/log");
    const err = new Error("Authorization failed for this user");
    log.error("auth_check_failed", { err });

    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    // "failed" is short and not key-shaped — must not be replaced with
    // "[redacted]", or ordinary diagnostic text becomes useless.
    expect(parsed.err.message).toBe("Authorization failed for this user");
  });

  it("caps recursion depth instead of throwing on a pathologically deep object", async () => {
    const { redact } = await import("@/lib/log");
    let deep = { secretAtBottom: "leaf-secret-value" };
    for (let i = 0; i < 20; i++) deep = { nested: deep };

    expect(() => redact({ deep })).not.toThrow();
    const out = JSON.stringify(redact({ deep }));
    expect(out).not.toContain("leaf-secret-value");
  });
});
