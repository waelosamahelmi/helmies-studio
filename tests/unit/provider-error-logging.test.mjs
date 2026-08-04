import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// URGENT production fix — never discard a provider/LLM error again.
//
// Every `throw new Error(brandError(txt))` site in src/lib/providers.js
// used to hand the raw provider/LLM response to brandError and let `txt`
// fall out of scope forever — nothing ever logged it, and src/lib/log.js
// also strips stacks in production, so a failure's real cause was
// unrecoverable from the server logs (this is why the flux-dev incident
// took a database-forensics session to diagnose instead of a log search).
// Every such site now logs the raw text once via the structured logger
// BEFORE throwing — the thrown message stays the branded, user-safe one.

vi.mock("@/lib/prisma", () => ({ default: {} }));

const { errorSpy } = vi.hoisted(() => ({ errorSpy: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: { error: errorSpy, warn: vi.fn(), info: vi.fn() } }));

import { submitOnly, pollProviderResult, llmComplete, llmStream, brandError } from "@/lib/providers";

function fakeKieProvider() {
  return {
    name: "kie",
    apiKey: "test-key",
    baseUrl: "https://api.example.test",
    buildUrl: () => "/api/v1/jobs/createTask",
    formatPayload: (model, prompt, params) => ({ model, input: { prompt, ...params } }),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  errorSpy.mockClear();
  process.env.OPENROUTER_KEY = "test-openrouter-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_KEY;
});

describe("submitOnly — raw provider body is logged once, the thrown message stays branded", () => {
  it("a non-2xx submit response logs the raw body via the structured logger and throws only the branded string", async () => {
    const rawBody = "KIE upstream: model 'flux-dev' has been retired, use nano-banana-2 instead";
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: async () => rawBody });

    const err = await submitOnly(fakeKieProvider(), "flux-dev", { model: "flux-dev", prompt: "a kettle" }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(brandError(rawBody));
    // The raw provider text must never leak into the user-facing message.
    expect(err.message).not.toContain(rawBody);
    expect(err.message).not.toContain("flux-dev");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [event, fields] = errorSpy.mock.calls[0];
    expect(typeof event).toBe("string");
    expect(fields.provider).toBe("kie");
    expect(fields.status).toBe(404);
    expect(fields.body).toContain(rawBody);
  });

  it("a 200 response with no task id and no outputs logs the raw reason and throws only the branded string", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: "insufficient provider balance for this workspace" }),
    });

    const err = await submitOnly(fakeKieProvider(), "some-model", { model: "some-model", prompt: "x" }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain("insufficient provider balance for this workspace");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, fields] = errorSpy.mock.calls[0];
    expect(fields.body).toContain("insufficient provider balance for this workspace");
  });

  it("attaches the raw reason as the thrown error's native .cause (message, and stack outside production)", async () => {
    const rawBody = "upstream 503: gpu pool exhausted";
    global.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => rawBody });

    const err = await submitOnly(fakeKieProvider(), "m1", { model: "m1", prompt: "x" }).catch((e) => e);

    expect(err.cause).toBeTruthy();
    expect(err.cause.message).toContain(rawBody);
  });
});

describe("pollProviderResult — raw poll failures are logged once, the thrown message stays branded", () => {
  function makeProvider() {
    return {
      name: "kie",
      apiKey: "test-key",
      baseUrl: "https://api.example.test",
      buildPollUrl: (id) => `/poll/${id}`,
      parsePoll: (data) => ({ status: (data.status || "").toLowerCase(), outputs: data.outputs || [], error: data.error }),
    };
  }

  it("a non-2xx poll response logs the raw body and throws only the branded string", async () => {
    const rawBody = "upstream gateway error: connection reset";
    global.fetch.mockResolvedValue({ ok: false, status: 400, text: async () => rawBody });

    const err = await pollProviderResult(makeProvider(), "req-1", 1, 1).catch((e) => e);

    expect(err.message).not.toContain(rawBody);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, fields] = errorSpy.mock.calls[0];
    expect(fields.body).toContain(rawBody);
    expect(fields.status).toBe(400);
  });

  it("a provider-reported terminal failure logs the raw error and throws only the branded string", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "failed", error: "content safety violation: explicit content detected in frame 3" }),
    });

    const err = await pollProviderResult(makeProvider(), "req-2", 900, 1).catch((e) => e);

    expect(err.terminal).toBe(true);
    expect(err.message).not.toContain("explicit content detected in frame 3");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, fields] = errorSpy.mock.calls[0];
    expect(fields.body).toContain("explicit content detected in frame 3");
  });
});

describe("llmComplete / llmStream — raw OpenRouter body is logged once, the thrown message stays branded", () => {
  it("llmComplete logs the raw body (including a secret-shaped substring) and never leaks it in the thrown message", async () => {
    const rawBody = JSON.stringify({ error: { message: "invalid_api_key: sk-abcdefgh12345678" } });
    global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => rawBody });

    const err = await llmComplete([{ role: "user", content: "hi" }]).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain("sk-abcdefgh12345678");
    expect(err.message).not.toContain(rawBody);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [event, fields] = errorSpy.mock.calls[0];
    expect(event).toBe("llm_complete_http_error");
    expect(fields.provider).toBe("openrouter");
    expect(fields.status).toBe(401);
    expect(fields.body).toContain(rawBody);
  });

  it("llmStream logs the raw body and never leaks it in the thrown message", async () => {
    const rawBody = "502 Bad Gateway from upstream model router";
    global.fetch.mockResolvedValue({ ok: false, status: 502, text: async () => rawBody });

    const err = await llmStream([{ role: "user", content: "hi" }]).catch((e) => e);

    expect(err.message).not.toContain(rawBody);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [event, fields] = errorSpy.mock.calls[0];
    expect(event).toBe("llm_stream_http_error");
    expect(fields.body).toContain(rawBody);
  });
});
