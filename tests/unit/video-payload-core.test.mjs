// Dedicated video adapters (audit class E) — payload and poll shapes pinned
// to docs/model-audit/video-dedicated.md's documented examples, including the
// Veo3 two-stage 1080p/4K retrieval state machine.
import { describe, it, expect } from "vitest";
import {
  VIDEO_FAMILY,
  videoProviderFamily,
  videoSubmitPath,
  videoPollTarget,
  formatVideoRequest,
  buildRunwayBody,
  buildVeoBody,
  buildVeoExtendBody,
  parseRunwayPoll,
  parseAlephPoll,
  parseVeoPoll,
  parseVideoPoll,
  VEO_1080P_MAX_ATTEMPTS,
  VEO_4K_MAX_ATTEMPTS,
} from "../../src/lib/video-payload-core.mjs";

describe("videoProviderFamily", () => {
  it("claims the five dedicated ids and nothing else", () => {
    expect(videoProviderFamily("generate-ai-video")).toBe(VIDEO_FAMILY.RUNWAY);
    expect(videoProviderFamily("extend-ai-video")).toBe(VIDEO_FAMILY.RUNWAY_EXTEND);
    expect(videoProviderFamily("generate-aleph-video")).toBe(VIDEO_FAMILY.ALEPH);
    expect(videoProviderFamily("generate-veo-3-video")).toBe(VIDEO_FAMILY.VEO);
    expect(videoProviderFamily("extend-video")).toBe(VIDEO_FAMILY.VEO_EXTEND);
    // Market models with similar words stay untouched.
    expect(videoProviderFamily("pixverse/extend")).toBeNull();
    expect(videoProviderFamily("grok-imagine/extend")).toBeNull();
    expect(videoProviderFamily("kling/text-to-video")).toBeNull();
    expect(videoProviderFamily(null)).toBeNull();
  });
});

describe("Runway generate", () => {
  it("posts the real flat body to /api/v1/runway/generate", () => {
    expect(videoSubmitPath("generate-ai-video")).toBe("/api/v1/runway/generate");
    const req = formatVideoRequest("generate-ai-video", "a drone shot", {
      duration: 5,
      quality: "1080p",
      aspect_ratio: "16:9",
      negative_prompt: "dropped",
    });
    expect(req.path).toBe("/api/v1/runway/generate");
    expect(req.body).toEqual({ prompt: "a drone shot", duration: 5, quality: "1080p", aspectRatio: "16:9" });
  });

  it("maps canonical resolution→quality and omits aspectRatio in i2v mode per the doc", () => {
    const body = buildRunwayBody("x", { resolution: "720p", image_url: "https://cdn.example/f.png", aspect_ratio: "16:9", duration: 10 });
    expect(body.quality).toBe("720p");
    expect(body.imageUrl).toBe("https://cdn.example/f.png");
    expect(body.aspectRatio).toBeUndefined();
    expect(body.duration).toBe(10);
  });

  it("extend posts taskId + prompt + quality to /api/v1/runway/extend", () => {
    const req = formatVideoRequest("extend-ai-video", "keep going", { task_id: "rw-1", quality: "720p" });
    expect(req.path).toBe("/api/v1/runway/extend");
    expect(req.body).toEqual({ taskId: "rw-1", prompt: "keep going", quality: "720p" });
  });

  it("polls record-detail and reads state/videoInfo.videoUrl", () => {
    expect(videoPollTarget("generate-ai-video", "rw-1", {})).toBe("/api/v1/runway/record-detail?taskId=rw-1");
    expect(videoPollTarget("extend-ai-video", "rw-2", {})).toBe("/api/v1/runway/record-detail?taskId=rw-2");
    expect(parseRunwayPoll({ state: "generating" }).status).toBe("pending");
    expect(parseRunwayPoll({ state: "success", videoInfo: { videoUrl: "https://cdn.example/v.mp4" } })).toEqual({
      status: "success",
      outputs: ["https://cdn.example/v.mp4"],
      error: undefined,
    });
    // success without a materialized URL is not done.
    expect(parseRunwayPoll({ state: "success", videoInfo: {} }).status).toBe("pending");
    expect(parseRunwayPoll({ state: "fail", failMsg: "bad input" })).toEqual({ status: "failed", outputs: [], error: "bad input" });
  });
});

describe("Aleph", () => {
  it("posts prompt + required videoUrl to /api/v1/aleph/generate", () => {
    const req = formatVideoRequest("generate-aleph-video", "make it noir", {
      video_url: "https://cdn.example/src.mp4",
      aspect_ratio: "21:9",
      seed: 42,
      reference_image: "https://cdn.example/ref.png",
    });
    expect(req.path).toBe("/api/v1/aleph/generate");
    expect(req.body).toEqual({
      prompt: "make it noir",
      videoUrl: "https://cdn.example/src.mp4",
      aspectRatio: "21:9",
      seed: 42,
      referenceImage: "https://cdn.example/ref.png",
    });
  });

  it("polls its own record-info and reads response.resultVideoUrl (not the Runway shape)", () => {
    expect(videoPollTarget("generate-aleph-video", "al-1", {})).toBe("/api/v1/aleph/record-info?taskId=al-1");
    expect(parseAlephPoll({ successFlag: 0 }).status).toBe("pending");
    expect(parseAlephPoll({ successFlag: 1, response: { resultVideoUrl: "https://cdn.example/out.mp4" } })).toEqual({
      status: "success",
      outputs: ["https://cdn.example/out.mp4"],
      error: undefined,
    });
    expect(parseAlephPoll({ successFlag: 0, errorMessage: "transform failed" }).status).toBe("failed");
  });
});

describe("Veo3 generate + extend bodies", () => {
  it("posts the real flat body with snake_case aspect_ratio and a Veo3.1 engine under `model`", () => {
    expect(videoSubmitPath("generate-veo-3-video")).toBe("/api/v1/veo/generate");
    const req = formatVideoRequest("generate-veo-3-video", "sunset timelapse", {
      image_urls: ["https://cdn.example/a.png", "https://cdn.example/b.png", "https://cdn.example/c.png"],
      model_tier: "veo3.1-fast",
      generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: 8,
    });
    expect(req.path).toBe("/api/v1/veo/generate");
    expect(req.body).toEqual({
      prompt: "sunset timelapse",
      imageUrls: ["https://cdn.example/a.png", "https://cdn.example/b.png"], // capped at 2 per doc
      model: "veo3.1-fast",
      generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: 8,
    });
  });

  // M-straggler (live probe 2026-08-05): a submit with NO `model` at all
  // 422'd "Invalid model" — the engine selector is effectively required and
  // wants the Veo3.1 spellings, so the body always carries one and legacy
  // tier names stored in templates/schemas are normalized rather than sent.
  it("always sends a model, defaulting the fast Veo3.1 engine and normalizing legacy tier spellings", () => {
    expect(buildVeoBody("x", {}).model).toBe("veo3.1-fast");
    expect(buildVeoBody("x", { model_tier: "veo3_fast" }).model).toBe("veo3.1-fast");
    expect(buildVeoBody("x", { model_tier: "veo3" }).model).toBe("veo3.1");
    expect(buildVeoBody("x", { model_tier: "veo3_lite" }).model).toBe("veo3.1-lite");
    expect(buildVeoBody("x", { model_tier: "VEO3.1" }).model).toBe("veo3.1");
  });

  it("extend posts taskId with its OWN tier enum (fast|quality|lite)", () => {
    const req = formatVideoRequest("extend-video", "continue the shot", {
      task_id: "veo_task_123",
      seeds: 12345,
      model_tier: "quality",
    });
    expect(req.path).toBe("/api/v1/veo/extend");
    expect(req.body).toEqual({ taskId: "veo_task_123", prompt: "continue the shot", seeds: 12345, model: "quality" });
    // generate's enum values are NOT valid on extend.
    expect(buildVeoExtendBody("x", { model_tier: "veo3_fast" }).model).toBeUndefined();
    // ...and an unknown/extend-flavoured tier on generate falls back to the
    // default engine rather than leaking an invalid value onto the wire.
    expect(buildVeoBody("x", { model_tier: "quality" }).model).toBe("veo3.1-fast");
  });
});

describe("Veo3 two-stage retrieval state machine", () => {
  it("completes immediately at base resolution (720p / unspecified)", () => {
    const state = {};
    const parsed = parseVeoPoll(
      { successFlag: 1, response: { resolution: "720p", resultUrls: ["https://cdn.example/720.mp4"] } },
      state,
    );
    expect(parsed).toEqual({ status: "success", outputs: ["https://cdn.example/720.mp4"], error: undefined });
    expect(state.veoStage).toBeUndefined();
  });

  it("1080p: base success switches stage, reports pending, then completes on resultUrl", () => {
    const state = {};
    // Base task succeeds but the task's resolution is 1080p → not done yet.
    const first = parseVeoPoll(
      { successFlag: 1, response: { resolution: "1080p", fullResultUrls: ["https://cdn.example/base.mp4"] } },
      state,
    );
    expect(first.status).toBe("pending");
    expect(state.veoStage).toBe("1080p");
    expect(state.retryHttpErrors).toBe(true);
    // The next poll now targets the 1080p retrieval endpoint (GET).
    expect(videoPollTarget("generate-veo-3-video", "veo-1", state)).toBe("/api/v1/veo/get-1080p-video?taskId=veo-1");
    // Still rendering → pending; then the URL exists → success.
    expect(parseVeoPoll({}, state).status).toBe("pending");
    expect(parseVeoPoll({ resultUrl: "https://cdn.example/1080.mp4" }, state)).toEqual({
      status: "success",
      outputs: ["https://cdn.example/1080.mp4"],
      error: undefined,
    });
  });

  it("1080p: degrades to the base output after the bounded window", () => {
    const state = {};
    parseVeoPoll({ successFlag: 1, response: { resolution: "1080p", resultUrls: ["https://cdn.example/base.mp4"] } }, state);
    let last;
    for (let i = 0; i < VEO_1080P_MAX_ATTEMPTS; i++) last = parseVeoPoll({}, state);
    expect(last).toEqual({ status: "success", outputs: ["https://cdn.example/base.mp4"], error: undefined });
  });

  it("4k: switches to the POST retrieval descriptor and completes on resultUrls", () => {
    const state = {};
    parseVeoPoll({ successFlag: 1, response: { resolution: "4k", resultUrls: ["https://cdn.example/base.mp4"] } }, state);
    expect(state.veoStage).toBe("4k");
    const target = videoPollTarget("generate-veo-3-video", "veo-2", state);
    expect(target).toEqual({ path: "/api/v1/veo/get-4k-video", method: "POST", body: { taskId: "veo-2" } });
    expect(parseVeoPoll({ taskId: "veo-2" }, state).status).toBe("pending");
    expect(parseVeoPoll({ taskId: "veo-2", resultUrls: ["https://cdn.example/4k.mp4"] }, state)).toEqual({
      status: "success",
      outputs: ["https://cdn.example/4k.mp4"],
      error: undefined,
    });
  });

  it("4k: the provider's 'unavailable' envelope degrades to the base output", () => {
    const state = {};
    parseVeoPoll({ successFlag: 1, response: { resolution: "4k", resultUrls: ["https://cdn.example/base.mp4"] } }, state);
    const parsed = parseVeoPoll({ code: 500, msg: "The 4K version of this video is unavailable" }, state);
    expect(parsed).toEqual({ status: "success", outputs: ["https://cdn.example/base.mp4"], error: undefined });
  });

  it("4k: degrades after the bounded window too", () => {
    const state = {};
    parseVeoPoll({ successFlag: 1, response: { resolution: "4k", resultUrls: ["https://cdn.example/base.mp4"] } }, state);
    let last;
    for (let i = 0; i < VEO_4K_MAX_ATTEMPTS; i++) last = parseVeoPoll({ taskId: "veo-3" }, state);
    expect(last.status).toBe("success");
    expect(last.outputs).toEqual(["https://cdn.example/base.mp4"]);
  });

  it("base failures stay failures (successFlag 2/3)", () => {
    expect(parseVeoPoll({ successFlag: 2, errorMessage: "content policy" }, {}).status).toBe("failed");
    expect(parseVeoPoll({ successFlag: 3 }, {}).status).toBe("failed");
    expect(parseVeoPoll({ successFlag: 0 }, {}).status).toBe("pending");
  });
});

describe("parseVideoPoll dispatch", () => {
  it("returns null for non-dedicated models", () => {
    expect(parseVideoPoll({ state: "success" }, "wan/2-7-text-to-video", {})).toBeNull();
    expect(parseVideoPoll({}, null, {})).toBeNull();
  });
});
