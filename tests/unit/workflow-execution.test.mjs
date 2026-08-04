import { describe, it, expect, vi, beforeEach } from "vitest";

// EDITSv1 E5.1 — executeWorkflow's own behaviour.
//
// Two defects this locks down:
//   1. executeWorkflow called executeStep directly, so the FALLBACKS chain in
//      agents.js (which every agent run has always had) never applied to a
//      workflow run — one flaky provider call killed the whole chain and the
//      user's remaining steps with it.
//   2. WorkflowRun.outputs was written ONCE, at the very end. A run that died
//      on step four left no record of steps one to three, so nothing could
//      show per-step results or resume from them.
//
// Written against the real executeWorkflow with its collaborators mocked —
// tests/unit/api-workflows-run.test.mjs mocks @/lib/workflows wholesale to
// exercise the ROUTE, which makes it structurally unable to test the module
// itself; that is why this is its own file.

const prismaMock = vi.hoisted(() => ({
  workflow: { findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  workflowRun: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  user: { update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

vi.mock("@/lib/agents", () => ({
  executeStep: vi.fn(),
  executeStepWithRetry: vi.fn(),
}));
vi.mock("@/lib/pricing-engine", () => ({ estimateAgentTask: vi.fn() }));
vi.mock("@/lib/security", () => ({ detectAbuse: vi.fn() }));
vi.mock("@/lib/wallet", () => ({
  reserveCredits: vi.fn(),
  settleReservation: vi.fn(),
  releaseReservation: vi.fn(),
  getWallet: vi.fn(),
}));

import { executeStep, executeStepWithRetry } from "@/lib/agents";
import { estimateAgentTask } from "@/lib/pricing-engine";
import { detectAbuse } from "@/lib/security";
import { reserveCredits, settleReservation, releaseReservation, getWallet } from "@/lib/wallet";
import { executeWorkflow, updateWorkflow, deleteWorkflow, regenerateStep } from "@/lib/workflows";

const STEPS = [
  { agent: "image", task: "Hero frame", params: { prompt: "a hero", model: "m1" } },
  { agent: "i2v", task: "Animate", params: { prompt: "drift", model: "m2" } },
  { agent: "assembly", task: "Cut it together", params: {} },
];

beforeEach(() => {
  vi.clearAllMocks();
  detectAbuse.mockResolvedValue({ flagged: false });
  getWallet.mockResolvedValue({ available: 500 });
  prismaMock.workflow.findFirst.mockResolvedValue({ id: "wf1", userId: "u1", steps: STEPS });
  prismaMock.workflowRun.create.mockResolvedValue({ id: "run1" });
  prismaMock.workflowRun.update.mockResolvedValue({});
  prismaMock.user.update.mockResolvedValue({});
  estimateAgentTask.mockResolvedValue({
    total: 30,
    breakdown: [{ credits: 10 }, { credits: 15 }, { credits: 5 }],
  });
  reserveCredits.mockResolvedValue({});
  settleReservation.mockResolvedValue({});
  releaseReservation.mockResolvedValue({});
});

// Every WorkflowRun.update call's `outputs` payload, in order.
const outputWrites = () =>
  prismaMock.workflowRun.update.mock.calls
    .map((c) => c[0]?.data?.outputs)
    .filter(Boolean);

describe("executeWorkflow — steps go through the retry/fallback path", () => {
  // Regression: executeStepWithRetry returns { output, credits, model }, not a
  // bare string. A rebase once left executeWorkflow storing the whole object,
  // so every later $STEP_N_OUTPUT interpolated "[object Object]" and no output
  // ever rendered. Assert the RECORDED output is the unwrapped url.
  it("stores the unwrapped output url, never the { output, credits, model } envelope", async () => {
    executeStepWithRetry
      .mockResolvedValueOnce({ output: "https://cdn.example/hero.png", credits: 2, model: "m" })
      .mockResolvedValueOnce({ output: "https://cdn.example/clip.mp4", credits: 10, model: "m" })
      .mockResolvedValueOnce({ output: "/api/media/local/assembled_x.mp4", credits: 5, model: "m" });

    const result = await executeWorkflow("wf1", "u1", {});

    expect(result.success).toBe(true);
    for (const o of result.outputs) {
      expect(typeof o).toBe("string");
      expect(o).not.toContain("object Object");
    }
    expect(result.outputs).toContain("https://cdn.example/hero.png");
  });

  it("runs every step via executeStepWithRetry, never executeStep directly", async () => {
    executeStepWithRetry
      .mockResolvedValueOnce({ output: "https://cdn.example/hero.png", credits: 1, model: "m" })
      .mockResolvedValueOnce({ output: "https://cdn.example/clip.mp4", credits: 1, model: "m" })
      .mockResolvedValueOnce({ output: "/api/media/local/assembled_x.mp4", credits: 1, model: "m" });

    const result = await executeWorkflow("wf1", "u1", {});

    expect(result.success).toBe(true);
    expect(executeStepWithRetry).toHaveBeenCalledTimes(3);
    expect(executeStep).not.toHaveBeenCalled();
  });

  it("hands each step the outputs produced so far", async () => {
    // The outputs array is appended to as the loop runs, and a mock records
    // it by reference — so snapshot what each call actually SAW rather than
    // reading mock.calls afterwards, when every entry points at the same
    // fully-populated array.
    const seen = [];
    const results = [
      { output: "https://cdn.example/hero.png", credits: 1, model: "m" },
      { output: "https://cdn.example/clip.mp4", credits: 1, model: "m" },
      { output: "/api/media/local/assembled_x.mp4", credits: 1, model: "m" },
    ];
    executeStepWithRetry.mockImplementation(async (_step, previousOutputs) => {
      seen.push([...previousOutputs]);
      return results[seen.length - 1];
    });

    await executeWorkflow("wf1", "u1", {});

    expect(seen[0]).toEqual([]);
    expect(seen[1]).toEqual(["https://cdn.example/hero.png"]);
    expect(seen[2]).toEqual(["https://cdn.example/hero.png", "https://cdn.example/clip.mp4"]);
  });
});

describe("executeWorkflow — per-step status is recorded as the run progresses", () => {
  it("writes an incremental record after every completed step, not just at the end", async () => {
    executeStepWithRetry
      .mockResolvedValueOnce({ output: "https://cdn.example/hero.png", credits: 1, model: "m" })
      .mockResolvedValueOnce({ output: "https://cdn.example/clip.mp4", credits: 1, model: "m" })
      .mockResolvedValueOnce({ output: "/api/media/local/assembled_x.mp4", credits: 1, model: "m" });

    await executeWorkflow("wf1", "u1", {});

    const writes = outputWrites();
    // One per step plus the terminal write.
    expect(writes.length).toBeGreaterThanOrEqual(4);
    expect(writes[0].stepResults).toHaveLength(1);
    expect(writes[0].stepResults[0]).toMatchObject({ step: 1, agent: "image", status: "completed" });
    expect(writes[1].stepResults).toHaveLength(2);
    expect(writes[2].stepResults).toHaveLength(3);

    const final = writes[writes.length - 1];
    expect(final.outputs).toEqual([
      "https://cdn.example/hero.png",
      "https://cdn.example/clip.mp4",
      "/api/media/local/assembled_x.mp4",
    ]);
  });

  it("keeps the completed steps' outputs on the record when a later step fails", async () => {
    executeStepWithRetry
      .mockResolvedValueOnce({ output: "https://cdn.example/hero.png", credits: 1, model: "m" })
      .mockRejectedValueOnce(new Error("the clip did not render"));

    const result = await executeWorkflow("wf1", "u1", {});

    expect(result.success).toBe(false);
    const writes = outputWrites();
    const final = writes[writes.length - 1];
    expect(final.outputs).toEqual(["https://cdn.example/hero.png"]);
    expect(final.stepResults).toHaveLength(2);
    expect(final.stepResults[1]).toMatchObject({ step: 2, status: "failed" });
  });
});

// Prisma drops an `undefined` field from a where clause instead of matching
// nothing, so `{ id: undefined, userId }` selects EVERY workflow the user
// owns. That is how a lost id (see the route tests) turned "run this one"
// into "run whichever came back first" and "delete this one" into "delete
// them all". These entry points refuse the shape rather than trusting every
// caller to have the id.
describe("workflow lookups refuse a missing id instead of widening to the whole collection", () => {
  it.each([undefined, null, ""])("executeWorkflow rejects %p without touching the wallet", async (badId) => {
    await expect(executeWorkflow(badId, "u1", {})).rejects.toThrow(/not found/i);
    expect(prismaMock.workflow.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.workflowRun.create).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("updateWorkflow and deleteWorkflow refuse a missing id", async () => {
    await expect(updateWorkflow(undefined, "u1", { name: "x" })).rejects.toThrow(/not found/i);
    await expect(deleteWorkflow(undefined, "u1")).rejects.toThrow(/not found/i);
    expect(prismaMock.workflow.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.workflow.deleteMany).not.toHaveBeenCalled();
  });

  it("regenerateStep refuses a missing id before it can charge anything", async () => {
    await expect(regenerateStep(undefined, "u1", 0, {})).rejects.toThrow(/not found/i);
    expect(reserveCredits).not.toHaveBeenCalled();
  });
});

describe("executeWorkflow — money: one reservation, one settlement", () => {
  it("reserves the quoted total once and settles it once on success", async () => {
    executeStepWithRetry.mockResolvedValue({ output: "https://cdn.example/out.png", credits: 1, model: "m" });

    await executeWorkflow("wf1", "u1", {});

    expect(reserveCredits).toHaveBeenCalledTimes(1);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 30, "run1");
    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith("u1", "run1", 30);
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it("settles only the steps that ran when the chain breaks part-way", async () => {
    executeStepWithRetry
      .mockResolvedValueOnce({ output: "https://cdn.example/hero.png", credits: 1, model: "m" })
      .mockRejectedValueOnce(new Error("the clip did not render"));

    await executeWorkflow("wf1", "u1", {});

    expect(settleReservation).toHaveBeenCalledTimes(1);
    // Step one of three ran: floor(1 * 30/3) = 10.
    expect(settleReservation).toHaveBeenCalledWith("u1", "run1", 10);
  });
});
