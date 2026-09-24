/* The text half of the studio used to hang off one prepaid balance. These pin
   the behaviour that ended that, each against a fact measured on KIE's live
   API on 2026-09-21 (see llm-transport.mjs's header). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasLlm, llmAttempts, llmSend, resetLlmBench, toKieMessages } from "../../src/lib/llm-transport.mjs";
import { DEFAULT_LLM, LLM_MODELS, llmChoices, llmModel } from "../../src/lib/llm-models.mjs";

const ok = (content = "hello") => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }] }),
});
// KIE's refusal: HTTP 200, a JSON envelope, no `choices`.
const kieRefusal = (code, msg) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json;charset=utf-8" },
  json: async () => ({ code, msg }),
  text: async () => JSON.stringify({ code, msg }),
});
const MSG = [{ role: "user", content: "hi" }];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.KIE_KEY = "kie-test";
  process.env.OPENROUTER_KEY = "or-test";
  delete process.env.LLM_PROVIDER_ORDER;
  resetLlmBench();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.KIE_KEY;
  delete process.env.OPENROUTER_KEY;
  delete process.env.LLM_PROVIDER_ORDER;
});

describe("the registry", () => {
  it("defaults to a model BOTH wallets can pay for, that sees and hears", () => {
    const row = llmModel(DEFAULT_LLM);
    expect(row.kie).toBeTruthy();
    expect(row.modalities).toEqual(expect.arrayContaining(["image", "audio"]));
  });

  it("never lists the same model twice", () => {
    const ids = LLM_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = LLM_MODELS.map((m) => m.kie).filter(Boolean);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("tells the picker which balances can pay for each model", () => {
    const byId = Object.fromEntries(llmChoices().map((c) => [c.id, c.providers]));
    expect(byId[DEFAULT_LLM]).toEqual(["kie", "openrouter"]);
    expect(byId["deepseek/deepseek-v4-pro"]).toEqual(["openrouter"]);
  });
});

describe("routing", () => {
  it("tries KIE first, with the model in the PATH and not in the body", async () => {
    fetch.mockResolvedValue(ok());
    const sent = await llmSend(MSG, { model: DEFAULT_LLM });
    expect(sent.provider).toBe("kie");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://api.kie.ai/${llmModel(DEFAULT_LLM).kie}/v1/chat/completions`);
    expect(JSON.parse(init.body)).not.toHaveProperty("model");
  });

  it("sends an OpenRouter-only model to OpenRouter, with the model in the body", async () => {
    fetch.mockResolvedValue(ok());
    const sent = await llmSend(MSG, { model: "deepseek/deepseek-v4-pro" });
    expect(sent.provider).toBe("openrouter");
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe("deepseek/deepseek-v4-pro");
  });

  it("a provider with no key is not a route — and is never logged as a failure", async () => {
    delete process.env.KIE_KEY;
    fetch.mockResolvedValue(ok());
    const onFailure = vi.fn();
    const sent = await llmSend(MSG, { model: DEFAULT_LLM, onFailure });
    expect(sent.provider).toBe("openrouter");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("LLM_PROVIDER_ORDER reorders the wallets and ignores names it does not know", () => {
    process.env.LLM_PROVIDER_ORDER = "openrouter, nonsense, kie";
    expect(llmAttempts(DEFAULT_LLM).map((a) => a.provider).slice(0, 2)).toEqual(["openrouter", "kie"]);
  });

  it("hasLlm is true with EITHER key — the old gate only looked at OpenRouter's", () => {
    delete process.env.OPENROUTER_KEY;
    expect(hasLlm()).toBe(true);
    delete process.env.KIE_KEY;
    expect(hasLlm()).toBe(false);
  });
});

describe("failover", () => {
  it("treats KIE's HTTP-200 refusal as a failure and moves to the next wallet", async () => {
    fetch.mockResolvedValueOnce(kieRefusal(402, "Insufficient credits")).mockResolvedValueOnce(ok("from openrouter"));
    const onFailure = vi.fn();
    const sent = await llmSend(MSG, { model: DEFAULT_LLM, onFailure });
    expect(sent.provider).toBe("openrouter");
    expect(sent.data.choices[0].message.content).toBe("from openrouter");
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toMatchObject({ provider: "kie", status: 402 });
  });

  it("the 2026-09-20 outage: OpenRouter answers 402, the studio keeps talking", async () => {
    process.env.LLM_PROVIDER_ORDER = "openrouter,kie";
    fetch
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => "requires more credits" })
      .mockResolvedValueOnce(ok("from kie"));
    const sent = await llmSend(MSG, { model: DEFAULT_LLM });
    expect(sent.provider).toBe("kie");
  });

  it("an empty wallet is benched, so the next call does not pay a wasted round-trip", async () => {
    fetch.mockResolvedValueOnce(kieRefusal(402, "Insufficient credits")).mockResolvedValue(ok());
    await llmSend(MSG, { model: DEFAULT_LLM });
    fetch.mockClear();
    const sent = await llmSend(MSG, { model: DEFAULT_LLM });
    expect(sent.provider).toBe("openrouter");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a route that answered 5xx is benched on its own — the provider's other models stay first in line", async () => {
    delete process.env.OPENROUTER_KEY;
    fetch.mockResolvedValueOnce(kieRefusal(500, "internal error")).mockResolvedValue(ok());
    const first = await llmSend(MSG, { model: DEFAULT_LLM });
    expect(first.provider).toBe("kie");
    expect(first.model).not.toBe(DEFAULT_LLM);
    fetch.mockClear();
    const next = llmAttempts(DEFAULT_LLM);
    expect(next[0]).toMatchObject({ provider: "kie" });
    expect(next[0].model).not.toBe(DEFAULT_LLM);
    expect(next[next.length - 1].model).toBe(DEFAULT_LLM);
  });

  it("falls back to the default MODEL when the requested one has no living route, and says so", async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => "no credits" }) // deepseek @ openrouter
      .mockResolvedValueOnce(ok("default answered"));                                       // default @ kie
    const sent = await llmSend(MSG, { model: "deepseek/deepseek-v4-pro" });
    expect(sent).toMatchObject({ provider: "kie", model: DEFAULT_LLM, substituted: "deepseek/deepseek-v4-pro" });
  });

  it("after the requested and default models, tries every other KIE-reachable model, cheapest first", () => {
    delete process.env.OPENROUTER_KEY;
    const attempts = llmAttempts(DEFAULT_LLM).map((a) => a.wireModel);
    expect(attempts[0]).toBe(llmModel(DEFAULT_LLM).kie);
    expect(attempts).toEqual(expect.arrayContaining(["gemini-3-6-flash-openai", "gpt-5-2"]));
    expect(new Set(attempts).size).toBe(attempts.length);
  });

  it("never hands audio to a model that cannot hear, even as a last resort", () => {
    const attempts = llmAttempts("anthropic/claude-opus-5", { needs: ["text", "audio"] });
    expect(attempts.length).toBeGreaterThan(0);
    for (const a of attempts) expect(llmModel(a.model).modalities).toContain("audio");
  });

  it("rejects with the last failure and every attempt, when nothing answers", async () => {
    fetch.mockResolvedValue(kieRefusal(500, "maintenance"));
    await expect(llmSend(MSG, { model: DEFAULT_LLM })).rejects.toMatchObject({ status: 500, attempts: expect.any(Array) });
  });

  it("a refusal to a STREAMING call is JSON with a 200 — not a stream", async () => {
    fetch.mockResolvedValueOnce(kieRefusal(401, "Unauthorized")).mockResolvedValueOnce({
      ok: true, status: 200, headers: { get: () => "text/event-stream" }, body: { getReader() {} },
    });
    const sent = await llmSend(MSG, { model: DEFAULT_LLM, stream: true });
    expect(sent.provider).toBe("openrouter");
    expect(sent.body).toBeTruthy();
  });
});

describe("what KIE is sent", () => {
  it("rewrites input_audio as a data: URI in an image_url part — KIE drops input_audio silently", () => {
    const [m] = toKieMessages([{ role: "user", content: [{ type: "text", text: "Transcribe." }, { type: "input_audio", input_audio: { data: "QUJD", format: "mp3" } }] }]);
    expect(m.content[0]).toEqual({ type: "text", text: "Transcribe." });
    expect(m.content[1]).toEqual({ type: "image_url", image_url: { url: "data:audio/mpeg;base64,QUJD" } });
  });

  it("leaves plain strings and image parts exactly as they were", () => {
    const messages = [{ role: "system", content: "s" }, { role: "user", content: [{ type: "image_url", image_url: { url: "https://x/y.png" } }] }];
    expect(toKieMessages(messages)).toEqual(messages);
  });

  it("OpenRouter still receives input_audio untouched", async () => {
    delete process.env.KIE_KEY;
    fetch.mockResolvedValue(ok());
    const audio = { type: "input_audio", input_audio: { data: "QUJD", format: "wav" } };
    await llmSend([{ role: "user", content: [audio] }], { model: DEFAULT_LLM });
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content[0]).toEqual(audio);
  });

  it("asks OpenRouter for low reasoning effort when the budget is small, so thinking cannot eat the answer", async () => {
    delete process.env.KIE_KEY;
    fetch.mockResolvedValue(ok());
    await llmSend(MSG, { model: DEFAULT_LLM, maxTokens: 500 });
    expect(JSON.parse(fetch.mock.calls[0][1].body).reasoning).toEqual({ effort: "low" });
    fetch.mockClear();
    await llmSend(MSG, { model: DEFAULT_LLM, maxTokens: 4096 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("reasoning");
  });

  it("passes response_format through, so JSON mode survives the move", async () => {
    fetch.mockResolvedValue(ok("{}"));
    await llmSend(MSG, { model: DEFAULT_LLM, responseFormat: { type: "json_object" } });
    expect(JSON.parse(fetch.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
  });
});
