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
    directorPipeline: { create: vi.fn() },
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
  createProductionPlan, DirectorPlanError, isValidPlanShape, extractJsonObject, PRODUCTION_TYPE_PRESETS,
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
