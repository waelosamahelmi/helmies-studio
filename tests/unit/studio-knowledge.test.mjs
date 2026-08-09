import { describe, it, expect, vi, beforeEach } from "vitest";
import { NON_PROVIDER_STEP_CREDITS } from "../../src/lib/pricing-engine.js";

const rows = [
  { modelId: "bytedance/seedance-2-5", capability: "video", creditsCost: 143,
    inputSchema: { fields: { duration: { minimum: -1, maximum: 30 }, reference_audio_urls: {}, image_url: {} } } },
  { modelId: "kling-2.6/image-to-video", capability: "image-to-video", creditsCost: 75,
    inputSchema: { fields: { duration: { enum: [5, 10] }, aspect_ratio: { enum: ["16:9", "9:16"] } } } },
  { modelId: "google/nano-banana", capability: "image", creditsCost: 10, inputSchema: { fields: { prompt: {} } } },
  { modelId: "generate-music", capability: "audio", creditsCost: 1, inputSchema: { fields: { prompt: {} } } },
  { modelId: "google/gemini-3-1-flash-tts", capability: "text-to-speech", creditsCost: 13, inputSchema: { fields: { text: {} } } },
];

vi.mock("../../src/lib/prisma.js", () => ({
  default: { modelPricing: { findMany: vi.fn(async () => rows) } },
}));

const load = async () => {
  const mod = await import("../../src/lib/studio-knowledge.js");
  mod.forgetStudioCapabilities();
  return mod;
};

describe("studioCapabilities", () => {
  beforeEach(() => vi.resetModules());

  it("groups models by what they are FOR and leads with the price", async () => {
    const { studioCapabilities } = await load();
    const text = await studioCapabilities();
    expect(text).toContain("bytedance/seedance-2-5 — 143 cr");
    expect(text).toContain("Video from an approved still");
    expect(text).toContain("Music, lyrics, vocals and sound effects");
  });

  it("carries the limits that actually decide a choice", async () => {
    const { studioCapabilities } = await load();
    const text = await studioCapabilities();
    // The 4s floor is measured, not declared — a shot under it is a 422 and
    // a dead render, which is the most expensive thing to get wrong.
    expect(text).toContain("4-30s");
    expect(text).toContain("voice-clone");
    expect(text).toContain("5-10s");
  });

  it("names the steps that cost no model at all", async () => {
    const { studioCapabilities } = await load();
    const text = await studioCapabilities();
    expect(text).toContain("title — 1 cr");
    expect(text).toContain("assembly — 5 cr");
  });

  it("keeps its copy of the free-step prices in step with the real ones", async () => {
    // studio-knowledge.js deliberately does not import pricing-engine.js —
    // that module uses "@/" aliases and would make the digest unloadable
    // outside the Next bundle. This is what stops the copy drifting.
    const { studioCapabilities } = await load();
    const text = await studioCapabilities();
    for (const [kind, credits] of Object.entries(NON_PROVIDER_STEP_CREDITS)) {
      expect(text).toContain(`${kind} — ${credits} cr`);
    }
  });

  it("says nothing rather than throwing when the catalog is unreachable", async () => {
    vi.resetModules();
    vi.doMock("../../src/lib/prisma.js", () => ({
      default: { modelPricing: { findMany: vi.fn(async () => { throw new Error("down"); }) } },
    }));
    const { studioCapabilities } = await import("../../src/lib/studio-knowledge.js");
    expect(await studioCapabilities()).toBe("");
  });
});
