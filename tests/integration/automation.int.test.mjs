import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

// Regression test for the production 500: `having: { _count: { gte } }`
// (unscoped) is rejected by the real Prisma 7 engine with "Unknown argument
// `_count`" — a mocked unit test can't catch this because the mock never
// validates the query shape against the actual query engine. This test runs
// the real query against real Postgres, which is exactly what would have
// caught the bug before it reached production.
describe("autoDisableFailingModels — groupBy having clause against a real database", () => {
  it("runs without throwing and returns checked/disabled without matching rows", async () => {
    const { autoDisableFailingModels } = await import("@/lib/automation");

    const result = await autoDisableFailingModels();

    expect(result).toEqual({ disabled: [], checked: 0 });
  });

  it("disables a model once its failure count in the window meets the threshold", async () => {
    const { autoDisableFailingModels } = await import("@/lib/automation");

    const user = await prisma.user.create({ data: { email: "t-automation@test.local", credits: 0 } });
    // ModelPricing has no FK to User, so resetDb()'s TRUNCATE ... CASCADE
    // doesn't touch it — upsert so this test is safe to rerun against a
    // container that already has a "flaky-model" row from a prior run.
    await prisma.modelPricing.upsert({
      where: { modelId: "flaky-model" },
      create: {
        modelId: "flaky-model",
        modelType: "image",
        providerName: "test",
        providerCost: 0,
        creditsCost: 1,
        isActive: true,
      },
      update: { isActive: true },
    });

    for (let i = 0; i < 5; i++) {
      await prisma.generation.create({
        data: {
          userId: user.id,
          tool: "image",
          model: "flaky-model",
          prompt: "automation integration test prompt",
          status: "failed",
        },
      });
    }

    const result = await autoDisableFailingModels();

    expect(result).toEqual({ disabled: ["flaky-model"], checked: 1 });
    const pricing = await prisma.modelPricing.findUnique({ where: { modelId: "flaky-model" } });
    expect(pricing.isActive).toBe(false);
  });
});

describe("autoSuspendAbusiveUsers — groupBy having clause against a real database", () => {
  it("runs without throwing and returns checked/suspended without matching rows", async () => {
    const { autoSuspendAbusiveUsers } = await import("@/lib/automation");

    const result = await autoSuspendAbusiveUsers();

    expect(result).toEqual({ suspended: [], checked: 0 });
  });
});
