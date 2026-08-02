import { describe, it, expect, vi, beforeEach } from "vitest";

// Production crash: "Unknown Agent: Creative Director". The orchestrator LLM
// plans steps for PERSONA agents (creative_director, image_director, ...),
// not just the tool agents (image/video/audio/website/marketing/coding),
// and sometimes emits the human-readable display name instead of the
// registry key. executeStep's switch used to throw on anything it didn't
// recognize as a tool agent — this file locks in that:
//   1. every registered agent (tool or persona) dispatches without throwing,
//   2. display-name / hyphenated / mixed-case variants normalize to the
//      registry key,
//   3. an agent name the model invented never crashes the run — it falls
//      back to a generic LLM step instead, and
//   4. a persona step actually executes (an LLM completion using its own
//      systemPrompt) and returns text.

vi.mock("@/lib/prisma", () => ({
  default: {
    agentRun: { create: vi.fn(), update: vi.fn() },
    generation: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  debitWallet: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/security", () => ({
  detectAbuse: vi.fn(),
}));

vi.mock("@/lib/generation", () => ({
  generateImage: vi.fn(),
  generateI2I: vi.fn(),
  generateVideo: vi.fn(),
  generateI2V: vi.fn(),
  processLipSync: vi.fn(),
  generateAudio: vi.fn(),
  processRecast: vi.fn(),
  runClipping: vi.fn(),
  runMotionGraphics: vi.fn(),
  generateMarketingAd: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  llmComplete: vi.fn(),
  llmStream: vi.fn(),
  resolveProvider: vi.fn(),
}));

import {
  generateImage, generateI2I, generateVideo, generateI2V, generateAudio,
} from "@/lib/generation";
import { llmComplete, resolveProvider } from "@/lib/providers";
import { executeStep, getAgentList, normalizeAgentKey } from "@/lib/agents";

beforeEach(() => {
  vi.clearAllMocks();
  resolveProvider.mockResolvedValue("kie");
  generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });
  generateI2I.mockResolvedValue({ url: "https://cdn.example/img2.png" });
  generateVideo.mockResolvedValue({ url: "https://cdn.example/vid.mp4" });
  generateI2V.mockResolvedValue({ url: "https://cdn.example/vid2.mp4" });
  generateAudio.mockResolvedValue({ url: "https://cdn.example/audio.mp3" });
  llmComplete.mockResolvedValue("some LLM text output");
});

describe("normalizeAgentKey — display name / hyphen / case variants", () => {
  it.each([
    ["creative_director", "creative_director"],
    ["Creative Director", "creative_director"],
    ["creative-director", "creative_director"],
    ["CREATIVE_DIRECTOR", "creative_director"],
    ["  Creative Director  ", "creative_director"],
    ["image_director", "image_director"],
    ["Image Director", "image_director"],
    ["Website Builder Agent", "website"],
    ["Image", "image"],
    ["IMAGE", "image"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeAgentKey(input)).toBe(expected);
  });

  it("an invented agent name slugifies but does not match any registry key", () => {
    expect(normalizeAgentKey("Totally Invented Super Agent")).toBe("totally_invented_super_agent");
  });
});

describe("executeStep — every AGENTS key dispatches without throwing", () => {
  const ids = getAgentList().map((a) => a.id).filter((id) => id !== "orchestrator");

  it.each(ids)("agent %s executes and returns a result", async (id) => {
    const step = { agent: id, task: "do the thing", params: { prompt: "do the thing", model: "flux-dev", endpoint: "flux-dev" } };
    await expect(executeStep(step, [])).resolves.toBeDefined();
  });
});

describe("executeStep — persona agents run as an LLM completion using their own systemPrompt", () => {
  it("creative_director returns the LLM's text and uses the Creative Director systemPrompt", async () => {
    llmComplete.mockResolvedValue("Creative brief: warm, cinematic, product-forward.");

    const result = await executeStep({ agent: "creative_director", task: "plan the concept", params: { prompt: "plan the concept" } }, []);

    expect(result).toBe("Creative brief: warm, cinematic, product-forward.");
    expect(llmComplete).toHaveBeenCalledTimes(1);
    const [messages] = llmComplete.mock.calls[0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/Creative Director/i);
    expect(messages[1]).toEqual({ role: "user", content: "plan the concept" });
  });

  it("resolves the display name 'Creative Director' the same as the key", async () => {
    const result = await executeStep({ agent: "Creative Director", task: "plan it", params: {} }, []);
    expect(result).toBe("some LLM text output");
    expect(llmComplete).toHaveBeenCalledTimes(1);
  });

  it("video_director runs as its own persona (not aliased to the video tool)", async () => {
    await executeStep({ agent: "video_director", task: "plan motion", params: { prompt: "plan motion" } }, []);
    expect(llmComplete).toHaveBeenCalledTimes(1);
    expect(generateVideo).not.toHaveBeenCalled();
    expect(generateI2V).not.toHaveBeenCalled();
    const [messages] = llmComplete.mock.calls[0];
    expect(messages[0].content).toMatch(/Video Director/i);
  });
});

describe("executeStep — an invented agent name falls back instead of throwing", () => {
  it("never throws 'Unknown agent' — falls back to a generic LLM step", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      executeStep({ agent: "Super Duper Agent 9000", task: "improvise", params: { prompt: "improvise" } }, [])
    ).resolves.toBe("some LLM text output");

    expect(llmComplete).toHaveBeenCalledTimes(1);
    const [messages] = llmComplete.mock.calls[0];
    expect(messages[1]).toEqual({ role: "user", content: "improvise" });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Super Duper Agent 9000"));

    warnSpy.mockRestore();
  });
});
