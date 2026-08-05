// End-to-end wiring of the dedicated IMAGE/VIDEO adapters inside the KIE
// provider (mirrors tests/unit/audio-provider-routing.test.mjs): the payload
// cores are only useful if submitOnly/pollProviderResult actually route
// through them. These tests assert the bytes that leave the process.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

const { submitOnly, pollProviderResult, PROVIDERS } = await import("@/lib/providers.js");

function kie() {
  return { ...PROVIDERS.kie, name: "kie", apiKey: "test-key" };
}

function requestAt(index) {
  const [url, init] = global.fetch.mock.calls.at(index);
  return { url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.NEXTAUTH_URL = "https://studio.example.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitOnly — dedicated image routes", () => {
  it("posts a flat 4o body to /api/v1/gpt4o-image/generate", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "4o-1" } }),
    });

    const result = await submitOnly(kie(), "generate-4-o-image", {
      model: "generate-4-o-image",
      prompt: "a plain grey square",
      size: "1:1",
    });

    const { url, body } = requestAt(-1);
    expect(url).toBe("https://api.kie.ai/api/v1/gpt4o-image/generate");
    expect(body).toEqual({
      prompt: "a plain grey square",
      size: "1:1",
      callBackUrl: "https://studio.example.test/api/webhooks/generation-complete",
    });
    expect(result.requestId).toBe("4o-1");
    expect(result.providerModel).toBe("generate-4-o-image");
  });

  it("posts a flat Kontext body to /api/v1/flux/kontext/generate", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "fk-1" } }),
    });

    await submitOnly(kie(), "generate-or-edit-image", {
      model: "generate-or-edit-image",
      prompt: "a cat",
      aspect_ratio: "16:9",
    });

    const { url, body } = requestAt(-1);
    expect(url).toBe("https://api.kie.ai/api/v1/flux/kontext/generate");
    expect(body.model).toBe("flux-kontext-pro");
    expect(body.aspectRatio).toBe("16:9");
    expect(body.input).toBeUndefined();
  });
});

describe("submitOnly — dedicated video routes", () => {
  it("posts Runway to /api/v1/runway/generate", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "rw-1" } }),
    });

    await submitOnly(kie(), "generate-ai-video", {
      model: "generate-ai-video",
      prompt: "a drone shot",
      duration: 5,
      quality: "720p",
      aspect_ratio: "16:9",
    });

    const { url, body } = requestAt(-1);
    expect(url).toBe("https://api.kie.ai/api/v1/runway/generate");
    expect(body).toEqual({
      prompt: "a drone shot",
      duration: 5,
      quality: "720p",
      aspectRatio: "16:9",
      callBackUrl: "https://studio.example.test/api/webhooks/generation-complete",
    });
  });

  it("posts Veo3 to /api/v1/veo/generate and Aleph to /api/v1/aleph/generate", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "t" } }),
    });

    await submitOnly(kie(), "generate-veo-3-video", { model: "generate-veo-3-video", prompt: "x", resolution: "720p" });
    expect(requestAt(-1).url).toBe("https://api.kie.ai/api/v1/veo/generate");

    await submitOnly(kie(), "generate-aleph-video", {
      model: "generate-aleph-video",
      prompt: "x",
      video_url: "https://cdn.example/src.mp4",
    });
    const aleph = requestAt(-1);
    expect(aleph.url).toBe("https://api.kie.ai/api/v1/aleph/generate");
    expect(aleph.body.videoUrl).toBe("https://cdn.example/src.mp4");
  });

  it("keeps every Market model on the generic route, byte for byte", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "i-1" } }),
    });

    await submitOnly(kie(), "kling/text-to-video", {
      model: "kling/text-to-video",
      prompt: "a plain grey square",
      aspect_ratio: "16:9",
    });

    const { url, body } = requestAt(-1);
    expect(url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(body.model).toBe("kling/text-to-video");
    expect(body.input).toEqual({ prompt: "a plain grey square", aspect_ratio: "16:9" });
  });
});

describe("pollProviderResult — dedicated routes", () => {
  it("polls 4o on its record-info route and returns resultUrls", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 200,
        data: { status: "SUCCESS", successFlag: 1, response: { resultUrls: ["https://cdn.example/a.png"] } },
      }),
    });

    const out = await pollProviderResult(kie(), "4o-1", 3, 1, "generate-4-o-image");
    expect(global.fetch.mock.calls[0][0]).toBe("https://api.kie.ai/api/v1/gpt4o-image/record-info?taskId=4o-1");
    expect(out.outputs).toEqual(["https://cdn.example/a.png"]);
  });

  it("drives the full Veo3 1080p two-stage flow through the real loop", async () => {
    // Poll 1: base task success, but the task's resolution is 1080p.
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 200,
        data: { successFlag: 1, response: { resolution: "1080p", resultUrls: ["https://cdn.example/base.mp4"] } },
      }),
    });
    // Poll 2: the 1080p endpoint is still rendering (non-200 → retried).
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not ready" });
    // Poll 3: the 1080p asset exists.
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, data: { resultUrl: "https://cdn.example/1080.mp4" } }),
    });

    const out = await pollProviderResult(kie(), "veo-1", 5, 1, "generate-veo-3-video");

    expect(global.fetch.mock.calls[0][0]).toBe("https://api.kie.ai/api/v1/veo/record-info?taskId=veo-1");
    expect(global.fetch.mock.calls[1][0]).toBe("https://api.kie.ai/api/v1/veo/get-1080p-video?taskId=veo-1");
    expect(global.fetch.mock.calls[2][0]).toBe("https://api.kie.ai/api/v1/veo/get-1080p-video?taskId=veo-1");
    expect(out.outputs).toEqual(["https://cdn.example/1080.mp4"]);
    expect(out.url).toBe("https://cdn.example/1080.mp4");
  });

  it("switches to the POST 4K retrieval after a 4k base success", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 200,
        data: { successFlag: 1, response: { resolution: "4k", resultUrls: ["https://cdn.example/base.mp4"] } },
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, data: { taskId: "veo-2", resultUrls: ["https://cdn.example/4k.mp4"] } }),
    });

    const out = await pollProviderResult(kie(), "veo-2", 4, 1, "generate-veo-3-video");

    const [url, init] = global.fetch.mock.calls[1];
    expect(url).toBe("https://api.kie.ai/api/v1/veo/get-4k-video");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ taskId: "veo-2" });
    expect(out.outputs).toEqual(["https://cdn.example/4k.mp4"]);
  });

  it("polls Runway on record-detail and fails fast on state=fail", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: { state: "fail", failMsg: "internal error, please try again later." } }),
    });

    await expect(pollProviderResult(kie(), "rw-9", 5, 1, "generate-ai-video")).rejects.toThrow(
      "Something went wrong on our end. Please try again.",
    );
    expect(global.fetch.mock.calls[0][0]).toBe("https://api.kie.ai/api/v1/runway/record-detail?taskId=rw-9");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
