import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A9 — the planner contract. Owner defects pinned here:
//   2. one-step plans ("keep steps minimal" is GONE; the prompt demands the
//      COMPLETE production: every asset + assembly + export),
//   1. instruction-shaped voiceover text (the prompt carries the few-shot
//      WRONG/RIGHT pair; the heuristic composes real narration),
//   plus the silent-degradation fix (LLM failure retries once with a
//   strict-JSON hint, then falls back to a MARKED heuristic plan) and the
//   session-defaults contract (task 5).

vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/wallet", () => ({ getWallet: vi.fn(), debitWallet: vi.fn(), refundCredits: vi.fn() }));
vi.mock("@/lib/security", () => ({ detectAbuse: vi.fn() }));
vi.mock("@/lib/agent-sessions", () => ({ appendMessage: vi.fn() }));
vi.mock("@/lib/generation", () => ({
  generateImage: vi.fn(), generateI2I: vi.fn(), generateVideo: vi.fn(), generateI2V: vi.fn(),
  processLipSync: vi.fn(), generateAudio: vi.fn(), processRecast: vi.fn(),
  runClipping: vi.fn(), runMotionGraphics: vi.fn(), generateMarketingAd: vi.fn(),
}));
vi.mock("@/lib/video-assembly", () => ({ assembleVideos: vi.fn() }));
vi.mock("@/lib/pricing-engine", () => ({
  estimateCredits: vi.fn(async () => 5),
  estimateAgentTask: vi.fn(async (steps) => ({
    total: steps.length * 5,
    breakdown: steps.map((s) => ({ step: s.task, tool: s.agent, model: s.params?.model || s.agent, credits: 5 })),
  })),
}));
vi.mock("@/lib/providers", () => ({
  llmComplete: vi.fn(),
  llmStream: vi.fn(),
  resolveProvider: vi.fn(async () => ({ name: "kie" })),
  brandForUser: vi.fn((m) => m),
}));
vi.mock("@/lib/model-catalog", () => ({
  resolveRunnableModel: vi.fn(async (id) => ({ modelId: id })),
  getRunnableModelsForType: vi.fn(),
}));

import { llmComplete } from "@/lib/providers";
import { getRunnableModelsForType } from "@/lib/model-catalog";
import { planTask, buildHeuristicPlan, briefSubject, extractPlanJson } from "@/lib/agents";
import { isVoiceoverInstruction } from "@/lib/voiceover-guard";

// The live catalog the planner hint reads. Audio deliberately mixes a
// composer, a TTS reader and an enhancement utility so the per-kind split
// (music vs voiceover pools via audioKind) is actually exercised.
const CATALOG = {
  image: [{ modelId: "img-alpha", capability: "text-to-image" }],
  video: [{ modelId: "vid-alpha", capability: "text-to-video" }],
  audio: [
    { modelId: "boost-music-style", capability: "audio" },      // enhancement — must appear in NO pool
    { modelId: "generate-music", capability: "audio" },          // composer → music pool
    { modelId: "elevenlabs-text-to-speech", capability: "text-to-speech" }, // reader → voiceover pool
  ],
};

// A complete music-video plan, the shape the new contract demands.
const MUSIC_VIDEO_PLAN = {
  steps: [
    { agent: "video", task: "Clip 1", params: { model: "vid-alpha", prompt: "Neon-soaked street at night, slow push-in, rain reflections, cinematic." }, estimatedCredits: 15 },
    { agent: "video", task: "Clip 2", params: { model: "vid-alpha", prompt: "Retro sports car drifting through fog, low angle, dramatic side light." }, estimatedCredits: 15 },
    { agent: "music", task: "Track", params: { model: "generate-music", prompt: "Dreamy synthwave, 100 BPM, warm analog pads, nostalgic night-drive energy." }, estimatedCredits: 8 },
    { agent: "voiceover", task: "Intro line", params: { model: "elevenlabs-text-to-speech", text: "The city never sleeps. Neither do we." }, estimatedCredits: 5 },
    { agent: "assembly", task: "Join the clips", params: {} },
    { agent: "export", task: "Final music video", params: { name: "Music video" } },
  ],
  summary: "Complete music video: two clips, an original track, an intro line, assembled.",
  totalCredits: 48,
  maxCredits: 55,
};

beforeEach(() => {
  vi.clearAllMocks();
  getRunnableModelsForType.mockImplementation(async (type) => CATALOG[type] || []);
  vi.stubEnv("OPENROUTER_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the planner system prompt (contract)", () => {
  it("demands the complete production and never says 'keep steps minimal'", async () => {
    llmComplete.mockResolvedValueOnce(JSON.stringify(MUSIC_VIDEO_PLAN));
    await planTask("Make a music video for my synthwave track");

    const [messages] = llmComplete.mock.calls[0];
    const system = messages[0].content;
    expect(system).not.toMatch(/keep steps minimal/i);
    expect(system).toMatch(/PLAN THE COMPLETE PRODUCTION/);
    expect(system).toMatch(/assembly/);
    expect(system).toMatch(/export/);
    // The few-shot instruction-vs-content pair for TTS (defect 1).
    expect(system).toContain("Generate a warm voiceover about our linen bedding");
    expect(system).toMatch(/WRONG/);
    expect(system).toMatch(/RIGHT/);
    expect(system).toMatch(/FINISHED CONTENT, NEVER INSTRUCTIONS/);
  });

  it("feeds per-kind runnable pools: music gets composers, voiceover gets readers, enhancements get neither", async () => {
    llmComplete.mockResolvedValueOnce(JSON.stringify(MUSIC_VIDEO_PLAN));
    await planTask("Make a music video for my synthwave track");

    const system = llmComplete.mock.calls[0][0][0].content;
    expect(system).toMatch(/- music: generate-music/);
    expect(system).toMatch(/- voiceover: elevenlabs-text-to-speech/);
    expect(system).not.toMatch(/- music:.*boost-music-style/);
    expect(system).not.toMatch(/- voiceover:.*boost-music-style/);
  });

  it("passes session defaults (E3 settings) to the planner", async () => {
    llmComplete.mockResolvedValueOnce(JSON.stringify(MUSIC_VIDEO_PLAN));
    await planTask("Make a music video", {
      settings: { videoModel: "vid-preferred", quality: "1080p", aspect: "9:16" },
    });

    const system = llmComplete.mock.calls[0][0][0].content;
    expect(system).toMatch(/Session defaults/);
    expect(system).toContain("vid-preferred");
    expect(system).toContain("1080p");
    expect(system).toContain("9:16");
  });

  it("plans from the FULL conversation when one is supplied", async () => {
    llmComplete.mockResolvedValueOnce(JSON.stringify(MUSIC_VIDEO_PLAN));
    await planTask("ok", {
      conversation: [
        { role: "user", content: "I want a music video for my synthwave track" },
        { role: "assistant", content: "What mood — neon night drive or sunset beach?" },
        { role: "user", content: "Neon night drive" },
      ],
    });

    const user = llmComplete.mock.calls[0][0][1].content;
    expect(user).toMatch(/Conversation so far/);
    expect(user).toContain("neon night drive".replace("neon", "Neon"));
    expect(user).toContain("Request: ok");
  });
});

describe("planTask with a working LLM", () => {
  it("a music-video request yields the complete plan: ≥4 steps incl. music + assembly, script-shaped voiceover text", async () => {
    llmComplete.mockResolvedValueOnce(JSON.stringify(MUSIC_VIDEO_PLAN));
    const plan = await planTask("Make a music video for my synthwave track");

    expect(plan.planSource).toBe("llm");
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    const agents = plan.steps.map((s) => s.agent);
    expect(agents).toContain("music");
    expect(agents).toContain("assembly");
    const vo = plan.steps.find((s) => s.agent === "voiceover");
    expect(vo.params.text.length).toBeGreaterThan(10);
    expect(isVoiceoverInstruction(vo.params.text)).toBe(false);
    // Server-computed estimate attached.
    expect(plan.estimate.total).toBe(plan.steps.length * 5);
  });

  it("tolerates fences and commentary around the JSON", async () => {
    llmComplete.mockResolvedValueOnce(
      "Here is your plan!\n```json\n" + JSON.stringify(MUSIC_VIDEO_PLAN) + "\n```\nEnjoy!",
    );
    const plan = await planTask("Make a music video");
    expect(plan.planSource).toBe("llm");
    expect(plan.steps).toHaveLength(6);
  });

  it("retries ONCE with a strict-JSON hint when the first reply is unparseable", async () => {
    llmComplete
      .mockResolvedValueOnce("Sure! I'd love to help you plan that production.")
      .mockResolvedValueOnce(JSON.stringify(MUSIC_VIDEO_PLAN));
    const plan = await planTask("Make a music video");

    expect(llmComplete).toHaveBeenCalledTimes(2);
    expect(llmComplete.mock.calls[1][0][1].content).toMatch(/ONLY one valid JSON object/);
    expect(plan.planSource).toBe("llm");
    expect(plan.steps).toHaveLength(6);
  });

  it("falls back to a MARKED heuristic plan when both attempts fail — never silently", async () => {
    llmComplete.mockRejectedValue(new Error("upstream 500"));
    const plan = await planTask("Make a music video about a night drive");

    expect(llmComplete).toHaveBeenCalledTimes(2);
    expect(plan.planSource).toBe("heuristic");
    expect(plan.degraded).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("requests enough tokens for a complete plan (the 2000-token truncation caused real one-step degradations)", async () => {
    llmComplete.mockResolvedValueOnce(JSON.stringify(MUSIC_VIDEO_PLAN));
    await planTask("Make a music video");
    const [, options] = llmComplete.mock.calls[0];
    expect(options.maxTokens).toBeGreaterThanOrEqual(8000);
  });
});

describe("buildHeuristicPlan — complete multi-step productions", () => {
  it("music video → ≥4 steps: clips + music + assembly + export, with runnable models", async () => {
    const plan = await buildHeuristicPlan("Make a music video for my synthwave track");
    const agents = plan.steps.map((s) => s.agent);
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(agents.filter((a) => a === "video").length).toBeGreaterThanOrEqual(2);
    expect(agents).toContain("music");
    expect(agents).toContain("assembly");
    expect(agents).toContain("export");
    for (const step of plan.steps.filter((s) => ["video", "music"].includes(s.agent))) {
      expect(step.params.model).toBeTruthy();
    }
    const music = plan.steps.find((s) => s.agent === "music");
    expect(music.params.model).toBe("generate-music"); // the composer, never the enhancement utility
    expect(music.params.prompt).not.toMatch(/^make music/i);
  });

  it("a launch-film brief with an 'Audio:' section label is a FILM production, not one audio step (production incident)", async () => {
    const plan = await buildHeuristicPlan(
      "Create a 30-second launch film for a linen bedding brand. Visual style: warm, soft morning light. Audio: Natural ambient sounds, calm narration. Message: rest, redesigned.",
    );
    const agents = plan.steps.map((s) => s.agent);
    expect(plan.steps.length).toBeGreaterThanOrEqual(5);
    expect(agents).toContain("image");
    expect(agents.filter((a) => a === "video").length).toBeGreaterThanOrEqual(2);
    expect(agents).toContain("voiceover");
    expect(agents).toContain("music");
    expect(agents).toContain("assembly");
    expect(agents).toContain("export");

    // The voiceover carries a composed script a voice can speak — never an
    // instruction (defect 1), and never the raw brief.
    const vo = plan.steps.find((s) => s.agent === "voiceover");
    expect(vo.params.text.length).toBeGreaterThan(20);
    expect(isVoiceoverInstruction(vo.params.text)).toBe(false);
  });

  it("a product ad is a complete production too", async () => {
    const plan = await buildHeuristicPlan("Plan a product ad for our ceramic kettle");
    const agents = plan.steps.map((s) => s.agent);
    expect(agents).toContain("voiceover");
    expect(agents).toContain("music");
    expect(agents).toContain("assembly");
  });

  it("a plain image brief stays a single image step (no gold-plating)", async () => {
    const plan = await buildHeuristicPlan("Create a hero shot of a ceramic kettle");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].agent).toBe("image");
  });

  it("video briefs lead with a storyboard step — the clip animates the storyboard-matched still (storyboard-first, 2026-08-06)", async () => {
    const plan = await buildHeuristicPlan("Create a hero shot of a ceramic kettle and animate it as a video clip");
    const agents = plan.steps.map((s) => s.agent);
    expect(agents.slice(0, 3)).toEqual(["storyboard", "image", "video"]);
    expect(agents).toContain("export");
    // The still (step 2) is generated from the storyboard's accepted JSON
    // (the ${storyboard} token), and the clip (step 3) animates that still.
    expect(plan.steps[0].params.storyboard).toBeTruthy();
    expect(plan.steps[0].params.storyboard.scenes).toHaveLength(1);
    expect(plan.steps[1].params.prompt).toContain("${storyboard}");
    expect(plan.steps[2].params.image_url).toBe("$STEP_2_OUTPUT");
  });

  it("session settings win over the catalog default (task 5)", async () => {
    const plan = await buildHeuristicPlan("Make a music video for my band", {
      settings: { videoModel: "vid-preferred", audioModel: "music-preferred", aspect: "9:16" },
    });
    const video = plan.steps.find((s) => s.agent === "video");
    const music = plan.steps.find((s) => s.agent === "music");
    expect(video.params.model).toBe("vid-preferred");
    expect(video.params.aspect_ratio).toBe("9:16");
    expect(music.params.model).toBe("music-preferred");
  });

  it("a voice-only brief becomes a voiceover step whose text is the user's content", async () => {
    const plan = await buildHeuristicPlan("Narrate a calm bedtime story about the sea");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].agent).toBe("voiceover");
    expect(plan.steps[0].params.text).toBeTruthy();
  });
});

describe("helpers", () => {
  it("briefSubject peels production-speak off the front", () => {
    expect(briefSubject("Create a 30-second launch film for a linen bedding brand")).toBe("a linen bedding brand");
    expect(briefSubject("Make a music video for my synthwave track")).toBe("my synthwave track");
    expect(briefSubject("a ceramic kettle")).toBe("ceramic kettle");
  });

  it("extractPlanJson takes the outermost object and survives fences", () => {
    expect(extractPlanJson('prose ```json\n{"a":1}\n``` more prose')).toBe('{"a":1}');
    expect(extractPlanJson("no json here")).toBeNull();
    expect(extractPlanJson(null)).toBeNull();
  });
});

// ── Storyboard-first film productions (2026-08-06) ─────────────────────────
describe("buildHeuristicPlan — storyboard-first video productions", () => {
  it("a launch film leads with the storyboard, then character/scene stills, then clips animating the stills", async () => {
    const plan = await buildHeuristicPlan("Plan a 30-second launch film for a linen bedding brand");
    const agents = plan.steps.map((s) => s.agent);
    expect(agents[0]).toBe("storyboard");
    expect(agents).toContain("voiceover");
    expect(agents).toContain("music");
    expect(agents).toContain("assembly");
    expect(agents).toContain("export");

    const sb = plan.steps[0].params.storyboard;
    expect(sb.scenario.length).toBeGreaterThan(10);
    expect(Array.isArray(sb.scenes)).toBe(true);
    expect(sb.scenes.length).toBeGreaterThanOrEqual(2);
    // Every scene carries the full shot vocabulary the card renders.
    for (const scene of sb.scenes) {
      expect(scene.title).toBeTruthy();
      expect(scene.description).toBeTruthy();
      expect(scene.camera).toBeTruthy();
    }
    // Every still embeds the ${storyboard} token; every clip animates its
    // own still via $STEP_N_OUTPUT.
    const stills = plan.steps.filter((s) => s.agent === "image");
    expect(stills.length).toBeGreaterThanOrEqual(2);
    for (const still of stills) expect(still.params.prompt).toContain("${storyboard}");
    const clips = plan.steps.filter((s) => s.agent === "video");
    expect(clips.length).toBe(2);
    for (const clip of clips) expect(clip.params.image_url).toMatch(/^\$STEP_\d+_OUTPUT$/);
  });

  it("a music video gets the same storyboard-first treatment", async () => {
    const plan = await buildHeuristicPlan("Make a music video for my band");
    const agents = plan.steps.map((s) => s.agent);
    expect(agents[0]).toBe("storyboard");
    expect(plan.steps[0].params.storyboard.scenes).toHaveLength(3);
    expect(plan.steps.filter((s) => s.agent === "image").length).toBe(3); // one still per scene
    expect(plan.steps.filter((s) => s.agent === "video").length).toBe(3); // one clip per still
  });
});
