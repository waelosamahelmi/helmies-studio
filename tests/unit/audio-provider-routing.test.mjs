// End-to-end coverage of the AUDIO wiring inside the KIE adapter: the
// mapping module (tests/unit/audio-payload-core.test.mjs covers it in
// isolation) is only useful if submitOnly/pollProviderResult actually route
// through it. These tests assert the bytes that leave the process.
//
// The production failure they lock down: audio was 0-for-30. Speech models
// were posted `{"input":{"prompt":…}}` and answered "text is required"; the
// whole Suno suite was posted to the market route and answered "The model
// name you specified is not supported".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

const { submitOnly, pollProviderResult, PROVIDERS } = await import("@/lib/providers.js");

function kie() {
  return { ...PROVIDERS.kie, name: "kie", apiKey: "test-key" };
}

function lastRequest() {
  const [url, init] = global.fetch.mock.calls.at(-1);
  return { url, body: init?.body ? JSON.parse(init.body) : null, method: init?.method };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.NEXTAUTH_URL = "https://studio.example.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitOnly — speech models", () => {
  it("posts text + voice inside input on the ordinary createTask route", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "t-1" } }),
    });

    await submitOnly(kie(), "elevenlabs/text-to-speech-multilingual-v2", {
      model: "elevenlabs/text-to-speech-multilingual-v2",
      prompt: "Read this aloud.",
      voice: "bella",
      stability: 0.4,
      negative_prompt: "blurry",
    });

    const { url, body } = lastRequest();
    expect(url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(body.model).toBe("elevenlabs/text-to-speech-multilingual-v2");
    expect(body.input.text).toBe("Read this aloud.");
    expect(body.input.prompt).toBeUndefined();
    expect(typeof body.input.voice).toBe("string");
    expect(body.input.voice).not.toBe("bella"); // resolved to a provider voice id
    expect(body.input.stability).toBe(0.4);
    expect(body.input.negative_prompt).toBeUndefined();
    expect(body.callBackUrl).toBe("https://studio.example.test/api/webhooks/generation-complete");
  });

  it("builds Google's speakers/dialogue_turns pair", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "t-2" } }),
    });

    await submitOnly(kie(), "google/gemini-3-1-flash-tts", {
      model: "google/gemini-3-1-flash-tts",
      prompt: "Testing one two three.",
    });

    const { body } = lastRequest();
    expect(body.input.speakers).toHaveLength(1);
    expect(body.input.dialogue_turns).toEqual([{ speaker_id: "Speaker 1", text: "Testing one two three." }]);
  });
});

describe("submitOnly — Suno music", () => {
  it("posts a FLAT engine-selector body to the music route, not the market route", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "m-1" } }),
    });

    const result = await submitOnly(kie(), "generate-music", {
      model: "generate-music",
      prompt: "a calm lofi piano loop",
      style: "lofi, piano",
      title: "Paper Rain",
      duration: 60,
      instrumental: true,
      negative_prompt: "blurry",
    });

    const { url, body } = lastRequest();
    expect(url).toBe("https://api.kie.ai/api/v1/generate");
    expect(body).toEqual({
      model: "V5_5",
      prompt: "a calm lofi piano loop",
      style: "lofi, piano",
      title: "Paper Rain",
      duration: 60,
      instrumental: true,
      customMode: true,
      callBackUrl: "https://studio.example.test/api/webhooks/generation-complete",
    });
    expect(result.requestId).toBe("m-1");
    // Handed back so the caller can poll on the same identifier it submitted on.
    expect(result.providerModel).toBe("generate-music");
  });

  it("surfaces the music route's own in-body rejection instead of a generic failure", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 422, msg: "model error", data: null }),
    });

    await expect(
      submitOnly(kie(), "generate-music", { model: "generate-music", prompt: "x" }),
    ).rejects.toThrow(/temporarily unavailable|unexpected error/i);
  });

  it("leaves every non-audio model on the market route, byte for byte", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "i-1" } }),
    });

    await submitOnly(kie(), "flux-2/pro-text-to-image", {
      model: "flux-2/pro-text-to-image",
      prompt: "a plain grey square",
      aspect_ratio: "16:9",
    });

    const { url, body } = lastRequest();
    expect(url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(body.input).toEqual({ prompt: "a plain grey square", aspect_ratio: "16:9" });
  });
});

describe("pollProviderResult — music results", () => {
  it("polls music on the record-info route and returns the finished track", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 200,
        data: {
          taskId: "m-1",
          status: "SUCCESS",
          response: { sunoData: [{ audioUrl: "https://cdn.example/track.mp3" }] },
        },
      }),
    });

    const out = await pollProviderResult(kie(), "m-1", 3, 1, "generate-music");

    expect(global.fetch.mock.calls[0][0]).toBe("https://api.kie.ai/api/v1/generate/record-info?taskId=m-1");
    expect(out.outputs).toEqual(["https://cdn.example/track.mp3"]);
    expect(out.url).toBe("https://cdn.example/track.mp3");
  });

  it("fails fast, and brands the moderation status, when music is refused", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: { taskId: "m-2", status: "SENSITIVE_WORD_ERROR", response: null } }),
    });

    await expect(pollProviderResult(kie(), "m-2", 5, 1, "generate-music")).rejects.toThrow(
      "The request was blocked by safety filters.",
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the default poll route for everything else", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 200,
        data: { taskId: "i-1", state: "success", resultJson: '{"resultUrls":["https://cdn.example/1.png"]}' },
      }),
    });

    const out = await pollProviderResult(kie(), "i-1", 3, 1, "flux-2/pro-text-to-image");

    expect(global.fetch.mock.calls[0][0]).toBe("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=i-1");
    expect(out.outputs).toEqual(["https://cdn.example/1.png"]);
  });
});
