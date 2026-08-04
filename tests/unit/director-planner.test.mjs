import { describe, it, expect, vi, beforeEach } from "vitest";

// Production crash chain:
//   "[DirectorPlanner] LLM plan failed, using heuristic: Expected
//   double-quoted property name in JSON at position 14251"
//   → TypeError: e.shots is not iterable
//
// Root causes fixed here:
//  1. src/app/api/director/plan/route.js called estimateDirectorCost(plan,
//     brief) where `plan` was actually createProductionPlan's WRAPPER return
//     value ({ plan, costEstimate, validation, pipelineId, ... }), not the
//     raw { shots, ... } plan — so `plan.shots` was always undefined there,
//     regardless of whether the LLM JSON parsed. That is the literal
//     "e.shots is not iterable" (minified `plan` -> `e`).
//  2. createProductionPlan's LLM JSON parsing was fragile (no fence
//     stripping beyond a loose regex, no outermost-object extraction, no
//     retry), and neither path validated its own output shape before
//     handing it to the caller.
//
// This file locks in: a malformed LLM response still yields a valid,
// iterable `shots` plan via the heuristic; a well-formed LLM response is
// used as-is (normalized, not discarded); and when truly no valid plan can
// be produced, the route answers 422 with a public message + errorId —
// never an unhandled 500.

process.env.OPENROUTER_KEY = "test-openrouter-key";

vi.mock("@/lib/prisma", () => ({
  default: {
    directorPipeline: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/pricing-engine", () => ({
  estimateCredits: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  llmComplete: vi.fn(),
  resolveProvider: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  verifyOrigin: vi.fn(() => true),
}));

import prisma from "@/lib/prisma";
import { estimateCredits } from "@/lib/pricing-engine";
import { llmComplete } from "@/lib/providers";
import { getCurrentUser } from "@/lib/session";
import {
  createProductionPlan, updateProductionPlan, DirectorPlanError, isValidPlanShape, extractJsonObject, PRODUCTION_TYPE_PRESETS,
} from "@/lib/director-planner";

const BRIEF = { title: "Test Track", type: "music_video", duration: 30, concept: "A neon-lit night drive" };

function jsonRequest(body) {
  return new Request("http://test/api/director/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  estimateCredits.mockResolvedValue(2);
  prisma.directorPipeline.create.mockResolvedValue({ id: "pipeline_1", createdAt: new Date("2024-01-01T00:00:00Z") });
  getCurrentUser.mockResolvedValue({ id: "u1", email: "u1@test.local" });
});

describe("extractJsonObject — hardened JSON extraction", () => {
  it("strips markdown code fences", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts the outermost {...} span even with leading/trailing commentary", () => {
    expect(extractJsonObject('Sure, here is the plan:\n{"a":1}\nHope that helps!')).toBe('{"a":1}');
  });

  it("returns null when there is no {...} span at all", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject(null)).toBeNull();
  });
});

describe("isValidPlanShape", () => {
  it("rejects a missing/empty/non-array shots field", () => {
    expect(isValidPlanShape(null)).toBe(false);
    expect(isValidPlanShape({})).toBe(false);
    expect(isValidPlanShape({ shots: [] })).toBe(false);
    expect(isValidPlanShape({ shots: "not an array" })).toBe(false);
  });

  it("accepts a non-empty array of shot objects", () => {
    expect(isValidPlanShape({ shots: [{ id: "shot_000" }] })).toBe(true);
  });
});

describe("createProductionPlan — malformed LLM JSON falls back to a valid, iterable plan", () => {
  it("retries once, then uses the heuristic plan when both attempts are unparseable", async () => {
    // Same shape as the production trigger: text that LOOKS like it's headed
    // toward JSON but breaks partway through (unquoted property name).
    llmComplete.mockResolvedValue('{"shots": [ { title: "Broken" ');

    const result = await createProductionPlan(BRIEF, "u1");

    expect(llmComplete).toHaveBeenCalledTimes(2); // initial attempt + one retry
    expect(Array.isArray(result.plan.shots)).toBe(true);
    expect(result.plan.shots.length).toBeGreaterThan(0);
    // A plan a downstream consumer can actually iterate/validate/cost.
    for (const shot of result.plan.shots) {
      expect(typeof shot.id).toBe("string");
      expect(typeof shot.durationSec).toBe("number");
    }
    expect(result.costEstimate).toBeDefined();
    expect(prisma.directorPipeline.create).toHaveBeenCalledTimes(1);
  });
});

describe("createProductionPlan — a well-formed LLM response is used as-is", () => {
  it("normalizes but preserves the LLM's own shot content, no retry needed", async () => {
    const wellFormed = {
      shots: [
        {
          id: "shot_custom",
          title: "My Custom Shot",
          durationSec: 7,
          section: "chorus",
          camera: { framing: "extreme close-up", angle: "low angle", lens: "85mm", movement: "dolly in", intensity: "intense" },
          imageStrategy: { mode: "generate", prompt: "static prompt", references: [] },
          videoStrategy: { mode: "t2v", prompt: "video prompt", modelRoute: "wan-2.6", keyframes: [], windows: [] },
        },
      ],
      globalStyle: { visualStyle: "Neon noir", colorPalette: "Magenta and teal", pace: "dynamic", transition: "cut" },
      estimatedDuration: 7,
      conceptSummary: "A neon-lit night drive",
    };
    llmComplete.mockResolvedValue("```json\n" + JSON.stringify(wellFormed) + "\n```");

    const result = await createProductionPlan(BRIEF, "u1");

    expect(llmComplete).toHaveBeenCalledTimes(1); // well-formed first try — no retry
    expect(result.plan.shots).toHaveLength(1);
    expect(result.plan.shots[0]).toMatchObject({
      id: "shot_custom",
      title: "My Custom Shot",
      durationSec: 7,
      camera: expect.objectContaining({ framing: "extreme close-up" }),
    });
    expect(result.plan.conceptSummary).toBe("A neon-lit night drive");
  });
});

// E4.1: the plan route always sent `shots` in the brief, but buildUserPrompt
// never read brief.shots — the user's sketched outline silently never reached
// the LLM. Characters and aspect ratio had planner support but were never
// passed by the route. These lock in that all three land in the user prompt.
describe("createProductionPlan — the sketched outline, characters and aspect ratio reach the LLM", () => {
  const VALID_PLAN = {
    shots: [{ id: "shot_000", title: "Opening", durationSec: 5 }],
    globalStyle: {}, estimatedDuration: 5, conceptSummary: "x",
  };

  it("includes the user's sketched shot outline verbatim in the user prompt", async () => {
    llmComplete.mockResolvedValue(JSON.stringify(VALID_PLAN));

    await createProductionPlan({
      ...BRIEF,
      shots: [
        { index: 0, title: "City wakes", description: "Aerial pass over rooftops at dawn" },
        { index: 1, title: "The chase", description: "Handheld sprint through a market" },
      ],
    }, "u1");

    const messages = llmComplete.mock.calls[0][0];
    const userPrompt = messages.find((m) => m.role === "user").content;
    expect(userPrompt).toContain("City wakes");
    expect(userPrompt).toContain("Aerial pass over rooftops at dawn");
    expect(userPrompt).toContain("The chase");
    expect(userPrompt).toContain("Handheld sprint through a market");
  });

  it("includes named characters and the aspect ratio in the user prompt", async () => {
    llmComplete.mockResolvedValue(JSON.stringify(VALID_PLAN));

    await createProductionPlan({
      ...BRIEF,
      aspectRatio: "16:9",
      characters: [{ name: "Mara", description: "a woman in a red trench coat" }],
    }, "u1");

    const messages = llmComplete.mock.calls[0][0];
    const userPrompt = messages.find((m) => m.role === "user").content;
    expect(userPrompt).toContain("Mara");
    expect(userPrompt).toContain("a woman in a red trench coat");
    expect(userPrompt).toContain("16:9");
  });
});

// E4.3: character consistency is image-anchored, not just prompt text. With
// named characters in the brief, the LLM contract switches from a
// hard-coded `"references": []` to $CHARACTER_<name> tokens the executor
// resolves to real images (upload or rolling reference), and the heuristic
// builder emits the same tokens.
describe("character reference tokens in the planner", () => {
  const VALID_PLAN = {
    shots: [{ id: "shot_000", title: "x", durationSec: 5 }],
    globalStyle: {}, estimatedDuration: 5, conceptSummary: "x",
  };

  it("with characters, the system prompt teaches the $CHARACTER_<name> token and lists the cast", async () => {
    llmComplete.mockResolvedValue(JSON.stringify(VALID_PLAN));

    await createProductionPlan({
      ...BRIEF,
      characters: [{ name: "The Night Courier", description: "a wiry rider in a scuffed helmet" }],
    }, "u1");

    const systemPrompt = llmComplete.mock.calls[0][0].find((m) => m.role === "system").content;
    expect(systemPrompt).toContain("$CHARACTER_The_Night_Courier");
    expect(systemPrompt).toContain("a wiry rider in a scuffed helmet");
  });

  it("without characters, the contract keeps the empty references array", async () => {
    llmComplete.mockResolvedValue(JSON.stringify(VALID_PLAN));

    await createProductionPlan(BRIEF, "u1");

    const systemPrompt = llmComplete.mock.calls[0][0].find((m) => m.role === "system").content;
    expect(systemPrompt).toContain('"references": []');
    expect(systemPrompt).not.toContain("$CHARACTER_");
  });

  it("the heuristic builder emits the character token in every shot's image references", async () => {
    llmComplete.mockResolvedValue("not json at all"); // -> heuristic path

    const result = await createProductionPlan({
      ...BRIEF,
      characters: [{ name: "Mara", description: "a woman in a red trench coat" }],
    }, "u1");

    for (const shot of result.plan.shots) {
      expect(shot.imageStrategy.references).toContain("$CHARACTER_Mara");
    }
  });
});

// E4.2: the shot shape gains per-shot `transition` (consumed by assembly),
// `dialogue` (text -> TTS) and `audioCues` — in the LLM contract, the
// normalizer, and the heuristic builder (which also previously omitted
// continuityTracker entirely).
describe("shot shape — transition, dialogue, audioCues", () => {
  it("normalizes LLM-provided transition/dialogue/audioCues and defaults them to null/cut when absent", async () => {
    llmComplete.mockResolvedValue(JSON.stringify({
      shots: [
        {
          id: "shot_a", title: "With extras", durationSec: 5,
          transition: "dissolve", dialogue: '"Hold on."', audioCues: "rising wind, distant thunder",
        },
        { id: "shot_b", title: "Bare", durationSec: 5 },
      ],
      globalStyle: {}, estimatedDuration: 10, conceptSummary: "x",
    }));

    const result = await createProductionPlan(BRIEF, "u1");

    expect(result.plan.shots[0].transition).toBe("dissolve");
    expect(result.plan.shots[0].dialogue).toBe('"Hold on."');
    expect(result.plan.shots[0].audioCues).toBe("rising wind, distant thunder");

    expect(result.plan.shots[1].transition).toBe("cut");
    expect(result.plan.shots[1].dialogue).toBeNull();
    expect(result.plan.shots[1].audioCues).toBeNull();
  });

  it("rejects an unknown transition value back to the cut default", async () => {
    llmComplete.mockResolvedValue(JSON.stringify({
      shots: [{ id: "shot_a", title: "x", durationSec: 5, transition: "star-wipe-deluxe" }],
      globalStyle: {}, estimatedDuration: 5, conceptSummary: "x",
    }));

    const result = await createProductionPlan(BRIEF, "u1");

    expect(result.plan.shots[0].transition).toBe("cut");
  });

  it("tells the LLM about the new fields in the system prompt contract", async () => {
    llmComplete.mockResolvedValue(JSON.stringify({
      shots: [{ id: "shot_a", title: "x", durationSec: 5 }],
      globalStyle: {}, estimatedDuration: 5, conceptSummary: "x",
    }));

    await createProductionPlan(BRIEF, "u1");

    const systemPrompt = llmComplete.mock.calls[0][0].find((m) => m.role === "system").content;
    expect(systemPrompt).toContain('"transition"');
    expect(systemPrompt).toContain('"dialogue"');
    expect(systemPrompt).toContain('"audioCues"');
  });

  it("the heuristic builder emits transition/dialogue/audioCues AND a filled continuityTracker", async () => {
    // Both LLM attempts unparseable -> heuristic path.
    llmComplete.mockResolvedValue("not json at all");

    const result = await createProductionPlan(BRIEF, "u1");

    for (const shot of result.plan.shots) {
      expect(["cut", "fade", "dissolve"]).toContain(shot.transition);
      expect(shot.dialogue).toBeNull();
      expect(shot.audioCues).toBeNull();
      expect(shot.continuityTracker).toBeTruthy();
      expect(typeof shot.continuityTracker.characterIdentity).toBe("string");
      expect(typeof shot.continuityTracker.previousEndingFrame).toBe("string");
    }
    expect(result.plan.shots[0].continuityTracker.previousEndingFrame).toBe("first shot");
  });
});

// E4.1: updateProductionPlan existed but was called by nothing. Now that the
// PATCH route uses it, its contract is load-bearing: it recomputes the cost
// server-side from the edited shots, re-runs the shot validators, persists
// both, and refuses edits while executing/completed.
describe("updateProductionPlan — server-side recompute on every edit", () => {
  const storedPipeline = {
    id: "p1", userId: "u1", status: "planning",
    plan: { shots: [{ id: "shot_000", index: 0, durationSec: 5 }], globalStyle: {} },
    brief: { type: "music_video" },
  };

  it("recomputes the cost estimate from the edited shots and returns validation results", async () => {
    prisma.directorPipeline.findFirst.mockResolvedValue({ ...storedPipeline });
    prisma.directorPipeline.update.mockResolvedValue({});

    const result = await updateProductionPlan("p1", "u1", {
      shots: [
        { id: "shot_000", index: 0, durationSec: 5, imageStrategy: { prompt: "a static skyline at dusk" } },
        { id: "shot_001", index: 1, durationSec: 5, imageStrategy: { prompt: "a static close-up of rain on glass" } },
      ],
    });

    // 2 shots x (image 2 + video 2 + audio 2 [music_video]) + assembly 5
    expect(result.costEstimate.totalCredits).toBe(17);
    expect(result.plan.shots).toHaveLength(2);
    expect(result.validation).toBeDefined();
    expect(Array.isArray(result.validation.results)).toBe(true);
    expect(result.validation.results).toHaveLength(2);

    // Persisted, not just returned.
    expect(prisma.directorPipeline.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          plan: expect.objectContaining({ shots: expect.any(Array) }),
          costEstimate: expect.objectContaining({ totalCredits: 17 }),
        }),
      })
    );
  });

  it.each(["executing", "completed"])("refuses edits while the pipeline is %s", async (status) => {
    prisma.directorPipeline.findFirst.mockResolvedValue({ ...storedPipeline, status });

    await expect(updateProductionPlan("p1", "u1", { shots: [] })).rejects.toThrow(/Cannot edit plan/);
    expect(prisma.directorPipeline.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/director/plan — 422 (not 500) when no valid plan can be produced", () => {
  it("returns a structured 422 with a public message and an errorId, never an unhandled 500", async () => {
    // Force BOTH paths to fail: the LLM never returns parseable JSON, and
    // the heuristic builder — whose only per-type variable is
    // shotsPerSection — is given a preset with no sections to iterate,
    // which is exactly the "genuinely cannot produce a plan" case the 422
    // path exists for. Restored immediately after so no other test in this
    // file (or file order) is affected.
    llmComplete.mockResolvedValue("not json at all");
    const originalShotsPerSection = PRODUCTION_TYPE_PRESETS.music_video.shotsPerSection;
    PRODUCTION_TYPE_PRESETS.music_video.shotsPerSection = undefined;

    try {
      await expect(createProductionPlan(BRIEF, "u1")).rejects.toBeInstanceOf(DirectorPlanError);

      const { POST } = await import("@/app/api/director/plan/route.js");
      const res = await POST(jsonRequest({ title: "Test Track", type: "music_video", duration: 30 }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
      expect(typeof body.errorId).toBe("string");
      expect(body.errorId.length).toBeGreaterThan(0);
      expect(prisma.directorPipeline.create).not.toHaveBeenCalled();
    } finally {
      PRODUCTION_TYPE_PRESETS.music_video.shotsPerSection = originalShotsPerSection;
    }
  });
});
