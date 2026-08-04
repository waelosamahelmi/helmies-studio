// BUG 3 — every Alibaba generation failed with
//   403 {"code":"AccessDenied","message":"current user api does not support
//        asynchronous calls"}
// which reads like an account entitlement problem but is not: live probes on
// 2026-08-04 (recorded verbatim in src/lib/alibaba-provider-core.mjs's header)
// showed the SAME account happily accepts async task submits on the video
// route, and returns a real image URL from the SYNCHRONOUS
// multimodal-generation route for the very models that 403 on the async image
// route. DashScope's message means "not on THIS route", not "not for you".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAlibabaRoute, getAlibabaApiPath, getAlibabaHeaders, isAlibabaSyncEndpoint,
  formatAlibabaPayload, parseAlibabaOutputs, ALIBABA_ROUTES, ASPECT_TO_SIZE,
} from "@/lib/alibaba-provider-core.mjs";

// Verbatim from the probe run.
const SYNC_IMAGE_RESPONSE = {
  output: { choices: [{ finish_reason: "stop", message: { content: [{ image: "https://dashscope-a717.oss-accelerate.aliyuncs.com/7d/b7/20260805/e941b3c0/9890a9aa.png" }, { text: "a red cube on white background" }], role: "assistant" } }] },
  usage: { height: 1328, image_count: 1, width: 1328 },
  request_id: "1f2b5ef8-f087-979d-8aa5-ad219e84b305",
};
const ASYNC_TASK_RESPONSE = { output: { task_id: "26dc3acf-cc77-4ca1-b5a6-cfff9a3afe88", task_status: "PENDING" }, request_id: "1f9ef5a8" };
const ASYNC_POLL_SUCCEEDED = { output: { task_id: "f1707fd5", task_status: "SUCCEEDED", results: [{ url: "https://dashscope…/out.png" }] }, request_id: "a755dfd6" };
const ACCESS_DENIED_BODY = JSON.stringify({ code: "AccessDenied", message: "current user api does not support asynchronous calls", request_id: "b18633d8" });

describe("route selection", () => {
  it("sends the image family to the SYNCHRONOUS multimodal-generation route", () => {
    for (const model of ["qwen-image-max", "qwen-image-plus", "qwen-image-edit-plus", "z-image-turbo", "wan2.7-image", "wan2.6-image", "qwen-image-2.0-pro"]) {
      expect(getAlibabaApiPath(model)).toBe("/api/v1/services/aigc/multimodal-generation/generation");
      expect(isAlibabaSyncEndpoint(model)).toBe(true);
    }
  });

  it("keeps the wan video family on the ASYNC task route (11/13 already returned a task_id there)", () => {
    for (const model of ["wan2.7-t2v", "wan2.6-t2v", "wan2.5-t2v-preview", "wan2.7-i2v", "wan2.6-i2v-flash", "wan2.7-r2v", "wan2.7-videoedit"]) {
      expect(getAlibabaApiPath(model)).toBe("/api/v1/services/aigc/video-generation/video-synthesis");
      expect(getAlibabaRoute(model)).toBe(ALIBABA_ROUTES.asyncVideo);
    }
  });

  it("moves the animate pair to image2video — the only route that does not 403 for them", () => {
    for (const model of ["wan2.2-animate-move", "wan2.2-animate-mix"]) {
      expect(getAlibabaApiPath(model)).toBe("/api/v1/services/aigc/image2video/video-synthesis");
    }
  });
});

describe("the async header is per-route, not per-provider", () => {
  it("is absent on the synchronous image route (sending it is what produced the 403)", () => {
    expect(getAlibabaHeaders("qwen-image-max")).toEqual({});
    expect(getAlibabaHeaders("z-image-turbo")).toEqual({});
  });

  it("is present on both async task routes", () => {
    expect(getAlibabaHeaders("wan2.6-t2v")).toEqual({ "X-DashScope-Async": "enable" });
    expect(getAlibabaHeaders("wan2.2-animate-move")).toEqual({ "X-DashScope-Async": "enable" });
  });
});

describe("payload shape per route", () => {
  it("builds the multimodal messages body for a text-to-image model", () => {
    const body = formatAlibabaPayload("qwen-image-max", "a red cube", { endpoint: "qwen-image-max", size: "1328*1328", n: 1 });
    expect(body.model).toBe("qwen-image-max");
    expect(body.input.messages[0].content).toEqual([{ text: "a red cube" }]);
    expect(body.parameters).toEqual({ size: "1328*1328", n: 1 });
    expect(body.input.prompt).toBeUndefined();
  });

  it("puts image items BEFORE the text — the edit models validate that layout", () => {
    const body = formatAlibabaPayload("qwen-image-edit-plus", "make it blue", {
      endpoint: "qwen-image-edit-plus", image_url: "https://a/1.png", images_list: ["https://a/2.png"],
    });
    expect(body.input.messages[0].content).toEqual([
      { image: "https://a/1.png" }, { image: "https://a/2.png" }, { text: "make it blue" },
    ]);
  });

  it("translates the studio's aspect_ratio into a size every image model accepts", () => {
    const body = formatAlibabaPayload("z-image-turbo", "a cube", { endpoint: "z-image-turbo", aspect_ratio: "16:9" });
    expect(body.parameters.size).toBe(ASPECT_TO_SIZE["16:9"]);
    // Every mapped size sits inside the tightest area window any model reported.
    for (const size of Object.values(ASPECT_TO_SIZE)) {
      const [w, h] = size.split("*").map(Number);
      expect(w * h).toBeGreaterThanOrEqual(589824);
      expect(w * h).toBeLessThanOrEqual(4194304);
      expect(Math.max(w, h)).toBeLessThanOrEqual(2048);
    }
  });

  it("never lets a stray aspect_ratio leak into the sync parameters block", () => {
    const body = formatAlibabaPayload("qwen-image-max", "a cube", { endpoint: "qwen-image-max", aspect_ratio: "1:1", negative_prompt: "blurry" });
    expect(body.parameters.aspect_ratio).toBeUndefined();
    expect(body.parameters.negative_prompt).toBe("blurry");
  });

  it("keeps the proven async task body for the video route", () => {
    const body = formatAlibabaPayload("wan2.6-i2v", "a cube spinning", {
      endpoint: "wan2.6-i2v", image_url: "https://a/1.png", duration: 5, resolution: "720p", aspect_ratio: "16:9",
    });
    expect(body.input).toMatchObject({ prompt: "a cube spinning", img_url: "https://a/1.png" });
    expect(body.parameters).toMatchObject({ duration: 5, size: "1280*720" });
  });
});

describe("parseAlibabaOutputs handles both response shapes", () => {
  it("pulls the image URL out of the synchronous multimodal choices", () => {
    expect(parseAlibabaOutputs(SYNC_IMAGE_RESPONSE)).toEqual([SYNC_IMAGE_RESPONSE.output.choices[0].message.content[0].image]);
  });

  it("still reads the async results array and the legacy array shape", () => {
    expect(parseAlibabaOutputs(ASYNC_POLL_SUCCEEDED)).toEqual(["https://dashscope…/out.png"]);
    expect(parseAlibabaOutputs([{ url: "https://a/1.png" }])).toEqual(["https://a/1.png"]);
    expect(parseAlibabaOutputs({ output: { video_url: "https://a/v.mp4" } })).toEqual(["https://a/v.mp4"]);
  });

  it("returns nothing for a task-only response (so submitOnly polls instead of claiming success)", () => {
    expect(parseAlibabaOutputs(ASYNC_TASK_RESPONSE)).toEqual([]);
  });
});

// ── End to end through submitOnly ──────────────────────────────────────────
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { modelPricing: { findUnique: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

describe("submitOnly against the Alibaba adapter", () => {
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.modelPricing.findUnique.mockResolvedValue(null);
    prismaMock.modelPricing.findFirst.mockResolvedValue(null);
    process.env.ALIBABA_KEY = "test-key";
    delete process.env.ALIBABA_WORKSPACE_ID;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ALIBABA_KEY;
  });

  it("returns the synchronous image immediately (no polling) and never sends the async header", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SYNC_IMAGE_RESPONSE), text: () => Promise.resolve("") });
    const { submitOnly } = await import("@/lib/providers.js");

    const result = await submitOnly("alibaba", "qwen-image-max", { model: "qwen-image-max", prompt: "a red cube", size: "1328*1328" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/services/aigc/multimodal-generation/generation");
    expect(init.headers["X-DashScope-Async"]).toBeUndefined();
    expect(result.requestId).toBeNull();
    expect(result.immediateResult.outputs).toEqual([SYNC_IMAGE_RESPONSE.output.choices[0].message.content[0].image]);
  });

  it("never mistakes the synchronous response's request_id for a pollable task id", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(SYNC_IMAGE_RESPONSE), text: () => Promise.resolve("") });
    const { submitOnly } = await import("@/lib/providers.js");
    const result = await submitOnly("alibaba", "z-image-turbo", { model: "z-image-turbo", prompt: "x" });
    expect(result.requestId).toBeNull();
  });

  it("still submits the video family as an async task, with the header", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(ASYNC_TASK_RESPONSE), text: () => Promise.resolve("") });
    const { submitOnly } = await import("@/lib/providers.js");

    const result = await submitOnly("alibaba", "wan2.6-t2v", { model: "wan2.6-t2v", prompt: "a cube spinning", duration: 5, resolution: "720p" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/services/aigc/video-generation/video-synthesis");
    expect(init.headers["X-DashScope-Async"]).toBe("enable");
    expect(result.requestId).toBe("26dc3acf-cc77-4ca1-b5a6-cfff9a3afe88");
    expect(result.immediateResult).toBeUndefined();
  });

  it("turns a genuine 403 AccessDenied into an honest branded message that never names the provider", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve(ACCESS_DENIED_BODY) });
    const { submitOnly, brandError } = await import("@/lib/providers.js");

    await expect(submitOnly("alibaba", "qwen-image-max", { model: "qwen-image-max", prompt: "x" }))
      .rejects.toThrow("This model isn't available to run right now. Please choose another.");

    const branded = brandError(ACCESS_DENIED_BODY);
    expect(branded).not.toMatch(/alibaba|dashscope|kie|accessdenied/i);
    expect(branded).not.toBe("An unexpected error occurred. Please try again.");
  });

  it("keeps the raw provider reason attached as the error's cause for server-side triage", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve(ACCESS_DENIED_BODY) });
    const { submitOnly } = await import("@/lib/providers.js");
    const err = await submitOnly("alibaba", "qwen-image-max", { model: "qwen-image-max", prompt: "x" }).catch((e) => e);
    expect(err.cause?.message).toContain("AccessDenied");
  });
});
