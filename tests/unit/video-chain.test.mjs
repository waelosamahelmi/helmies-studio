import { describe, it, expect, vi } from "vitest";
import { applyChainFrame, stepHasOwnReference, chainStepIfNeeded } from "@/lib/video-chain";

// ── Last-frame chaining (2026-08-06) ────────────────────────────────────────
// Owner defect: in a multi-scene ad every clip looked different — characters,
// products and environments drifted. The fix: each clip after the first
// inherits the PREVIOUS clip's last frame as its first-frame reference.

describe("stepHasOwnReference", () => {
  it("true when the step carries any visual reference of its own", () => {
    expect(stepHasOwnReference({ params: { image_url: "https://x/1.png" } })).toBe(true);
    expect(stepHasOwnReference({ params: { images_list: ["https://x/1.png"] } })).toBe(true);
    expect(stepHasOwnReference({ params: { first_frame_url: "https://x/1.png" } })).toBe(true);
    expect(stepHasOwnReference({ params: { input_urls: ["https://x/1.png"] } })).toBe(true);
  });

  it("false when the step is text-only", () => {
    expect(stepHasOwnReference({ params: { prompt: "a shot" } })).toBe(false);
    expect(stepHasOwnReference({ params: {} })).toBe(false);
    expect(stepHasOwnReference({})).toBe(false);
  });
});

describe("applyChainFrame", () => {
  it("injects the chain frame as image_url when the step has no reference of its own", () => {
    const step = { agent: "video", params: { prompt: "continue the scene", aspect_ratio: "9:16" } };
    const chained = applyChainFrame(step, "https://cdn/frame-1.png");
    expect(chained.params.image_url).toBe("https://cdn/frame-1.png");
    expect(chained.params.prompt).toBe("continue the scene"); // untouched
    // Never mutates the caller's step.
    expect(step.params.image_url).toBeUndefined();
  });

  it("leaves a step with its OWN reference alone — the chain only fills the gap", () => {
    const step = { agent: "video", params: { image_url: "$STEP_2_OUTPUT" } };
    expect(applyChainFrame(step, "https://cdn/frame-1.png")).toBe(step);
  });

  it("returns the step unchanged when there is no chain frame", () => {
    const step = { agent: "video", params: { prompt: "x" } };
    expect(applyChainFrame(step, null)).toBe(step);
  });
});

describe("chainStepIfNeeded", () => {
  it("uses the NEWEST previous video output, and degrades gracefully when the frame cannot be extracted", async () => {
    const step = { agent: "video", params: { prompt: "continue" } };
    // The previous "video" URL is unreachable, so extraction fails → the
    // step runs as planned (chaining is best-effort by contract).
    const result = await chainStepIfNeeded(step, ["https://cdn/still.png", "https://cdn/definitely-not-a-real-video.mp4"]);
    expect(result).toBe(step);
    expect(result.params.image_url).toBeUndefined();
  });

  it("does nothing for non-video steps, even with a previous clip", async () => {
    const step = { agent: "music", params: { prompt: "score" } };
    const result = await chainStepIfNeeded(step, ["https://cdn/clip.mp4"]);
    expect(result).toBe(step);
  });

  it("does nothing when the step already has a reference, even with a previous clip", async () => {
    const step = { agent: "video", params: { image_url: "$STEP_2_OUTPUT" } };
    const result = await chainStepIfNeeded(step, ["https://cdn/clip.mp4"]);
    expect(result).toBe(step);
  });
});

// Sanity: the pure wiring above is what the run loop and the review path
// both use, so the chain decision is identical in auto and review mode.
it("the chain decision is a pure function of (step, frame) — no hidden state", () => {
  const a = applyChainFrame({ agent: "video", params: { prompt: "p" } }, "f");
  const b = applyChainFrame({ agent: "video", params: { prompt: "p" } }, "f");
  expect(a).toEqual(b);
});
