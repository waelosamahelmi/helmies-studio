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

vi.mock("@/lib/video-assembly", () => ({
  assembleVideos: vi.fn(),
}));

import {
  generateImage, generateI2I, generateVideo, generateI2V, generateAudio,
} from "@/lib/generation";
import { llmComplete, resolveProvider } from "@/lib/providers";
import { assembleVideos } from "@/lib/video-assembly";
import { executeStep, getAgentList, normalizeAgentKey } from "@/lib/agents";

beforeEach(() => {
  vi.clearAllMocks();
  resolveProvider.mockResolvedValue("kie");
  generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });
  generateI2I.mockResolvedValue({ url: "https://cdn.example/img2.png" });
  generateVideo.mockResolvedValue({ url: "https://cdn.example/vid.mp4" });
  generateI2V.mockResolvedValue({ url: "https://cdn.example/vid2.mp4" });
  generateAudio.mockResolvedValue({ url: "https://cdn.example/audio.mp3" });
  assembleVideos.mockResolvedValue("/api/media/local/assembled_abc.mp4");
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

  // The prior outputs are what a step this far into a plan would really
  // have: one still and one clip. Every persona ignores them; the `assembly`
  // key — whose whole job is "join clips, produce deliverables" — stopped
  // being an LLM completion in E5.1 and now genuinely joins them, so a bare
  // [] would be asking it to assemble nothing. Its empty case is asserted
  // explicitly further down.
  const priorOutputs = ["https://cdn.example/still.png", "https://cdn.example/clip.mp4"];

  it.each(ids)("agent %s executes and returns a result", async (id) => {
    const step = { agent: id, task: "do the thing", params: { prompt: "do the thing", model: "flux-dev", endpoint: "flux-dev" } };
    await expect(executeStep(step, priorOutputs)).resolves.toBeDefined();
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

// ── EDITSv1 E5.1 — the workflow step kinds ───────────────────────────────
// WorkflowStudio's STEP_KINDS are stored verbatim as the step's `agent`, so
// every kind the builder offers must have a real executeStep case behind it.
// Before E5.1 only image/video/audio/website/marketing/coding did: i2v,
// upscale, music, voiceover, assembly and export would all have fallen
// through to the generic-LLM default and quietly produced prose instead of
// the media the user paid for.
describe("executeStep — i2v takes its still frame from the previous step", () => {
  it("passes the previous step's image forward as image_url with no wiring", async () => {
    const out = await executeStep(
      { agent: "i2v", task: "animate it", params: { prompt: "drift in", model: "kling-x", endpoint: "kling-x" } },
      ["https://cdn.example/hero.png"],
    );

    expect(out).toBe("https://cdn.example/vid2.mp4");
    expect(generateI2V).toHaveBeenCalledTimes(1);
    expect(generateI2V.mock.calls[0][0]).toMatchObject({
      image_url: "https://cdn.example/hero.png",
      endpoint: "kling-x",
      prompt: "drift in",
    });
    expect(generateVideo).not.toHaveBeenCalled();
  });

  it("honors an explicit $STEP_N_OUTPUT reference over the newest output", async () => {
    await executeStep(
      { agent: "i2v", task: "animate the first frame", params: { image_url: "$STEP_1_OUTPUT", model: "kling-x" } },
      ["https://cdn.example/first.png", "https://cdn.example/second.png"],
    );

    expect(generateI2V.mock.calls[0][0].image_url).toBe("https://cdn.example/first.png");
  });

  it("skips video and audio outputs when looking backwards for a still", async () => {
    await executeStep(
      { agent: "i2v", task: "animate", params: { model: "kling-x" } },
      ["https://cdn.example/hero.png", "https://cdn.example/clip.mp4", "https://cdn.example/track.mp3"],
    );

    expect(generateI2V.mock.calls[0][0].image_url).toBe("https://cdn.example/hero.png");
  });

  it("fails with a plain-language message — never a provider name — when there is no image", async () => {
    const err = await executeStep({ agent: "i2v", task: "animate", params: { model: "kling-x" } }, []).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/image/i);
    expect(err.message).not.toMatch(/kie|alibaba|dashscope|openrouter/i);
    expect(generateI2V).not.toHaveBeenCalled();
  });
});

describe("executeStep — upscale runs the previous image through an image-to-image model", () => {
  it("feeds the previous step's image to generateI2I", async () => {
    const out = await executeStep(
      { agent: "upscale", task: "sharpen it", params: { model: "image-upscale-x", endpoint: "image-upscale-x" } },
      ["https://cdn.example/hero.png"],
    );

    expect(out).toBe("https://cdn.example/img2.png");
    expect(generateI2I).toHaveBeenCalledTimes(1);
    expect(generateI2I.mock.calls[0][0]).toMatchObject({
      image_url: "https://cdn.example/hero.png",
      endpoint: "image-upscale-x",
    });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("refuses to run without an image to work from", async () => {
    await expect(
      executeStep({ agent: "upscale", task: "sharpen", params: { model: "image-upscale-x" } }, [])
    ).rejects.toThrow(/image/i);
  });
});

describe("executeStep — music and voiceover run as audio generations", () => {
  it("music calls the audio path with its own model", async () => {
    const out = await executeStep(
      { agent: "music", task: "score it", params: { model: "suno-v5", endpoint: "suno-v5", prompt: "warm synth bed", duration: 60 } },
      [],
    );

    expect(out).toBe("https://cdn.example/audio.mp3");
    expect(generateAudio).toHaveBeenCalledTimes(1);
    expect(generateAudio.mock.calls[0][0]).toMatchObject({ endpoint: "suno-v5", prompt: "warm synth bed", duration: 60 });
    expect(llmComplete).not.toHaveBeenCalled();
  });

  it("voiceover sends the step prompt as the text to speak", async () => {
    const out = await executeStep(
      { agent: "voiceover", task: "read the line", params: { model: "tts-x", endpoint: "tts-x", prompt: "Welcome to the studio." } },
      [],
    );

    expect(out).toBe("https://cdn.example/audio.mp3");
    expect(generateAudio.mock.calls[0][0]).toMatchObject({ endpoint: "tts-x", prompt: "Welcome to the studio." });
  });
});

describe("executeStep — assembly joins every earlier video, server-side", () => {
  it("collects the prior video outputs in order and returns the assembled url", async () => {
    const out = await executeStep(
      { agent: "assembly", task: "cut it together", params: {} },
      [
        "https://cdn.example/hero.png",
        "https://cdn.example/shot1.mp4",
        "https://cdn.example/track.mp3",
        "https://cdn.example/shot2.mp4",
      ],
    );

    expect(out).toBe("/api/media/local/assembled_abc.mp4");
    expect(assembleVideos).toHaveBeenCalledTimes(1);
    expect(assembleVideos.mock.calls[0][0]).toEqual([
      "https://cdn.example/shot1.mp4",
      "https://cdn.example/shot2.mp4",
    ]);
  });

  it("passes a chosen transition through to the assembler", async () => {
    await executeStep(
      { agent: "assembly", task: "cut it together", params: { transition: "fade" } },
      ["https://cdn.example/a.mp4", "https://cdn.example/b.mp4"],
    );

    expect(assembleVideos.mock.calls[0][1]).toMatchObject({ transition: "fade" });
  });

  it("never dials a provider and fails clearly when nothing earlier produced video", async () => {
    await expect(
      executeStep({ agent: "assembly", task: "cut it together", params: {} }, ["https://cdn.example/hero.png"])
    ).rejects.toThrow(/video/i);

    expect(assembleVideos).not.toHaveBeenCalled();
    expect(generateVideo).not.toHaveBeenCalled();
    expect(llmComplete).not.toHaveBeenCalled();
  });
});

describe("executeStep — export names the deliverable and manifests everything", () => {
  it("returns the assembled cut plus a manifest entry per earlier output", async () => {
    const out = await executeStep(
      { agent: "export", task: "Final cut", params: { name: "Launch film" } },
      [
        "https://cdn.example/hero.png",
        "https://cdn.example/shot1.mp4",
        "/api/media/local/assembled_abc.mp4",
        "a written caption",
      ],
    );

    expect(out).toMatchObject({ kind: "export", name: "Launch film", url: "/api/media/local/assembled_abc.mp4" });
    expect(out.manifest).toHaveLength(4);
    expect(out.manifest[0]).toMatchObject({ step: 1, type: "image", url: "https://cdn.example/hero.png" });
    expect(out.manifest[1]).toMatchObject({ step: 2, type: "video" });
    expect(out.manifest[2]).toMatchObject({ step: 3, type: "video" });
    expect(out.manifest[3]).toMatchObject({ step: 4, type: "text" });
  });

  it("falls back to the step name and the newest output when nothing was assembled", async () => {
    const out = await executeStep(
      { agent: "export", task: "Deliverable", params: {} },
      ["https://cdn.example/hero.png"],
    );

    expect(out).toMatchObject({ name: "Deliverable", url: "https://cdn.example/hero.png" });
  });

  it("spends nothing — no provider and no LLM is touched", async () => {
    await executeStep({ agent: "export", task: "Deliverable", params: {} }, ["https://cdn.example/hero.png"]);

    expect(generateImage).not.toHaveBeenCalled();
    expect(generateVideo).not.toHaveBeenCalled();
    expect(generateAudio).not.toHaveBeenCalled();
    expect(assembleVideos).not.toHaveBeenCalled();
    expect(llmComplete).not.toHaveBeenCalled();
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
