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
  workflow: { findFirst: vi.fn() },
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
import { executeWorkflow } from "@/lib/workflows";

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
  it("runs every step via executeStepWithRetry, never executeStep directly", async () => {
    executeStepWithRetry
      .mockResolvedValueOnce("https://cdn.example/hero.png")
      .mockResolvedValueOnce("https://cdn.example/clip.mp4")
      .mockResolvedValueOnce("/api/media/local/assembled_x.mp4");

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
      "https://cdn.example/hero.png",
      "https://cdn.example/clip.mp4",
      "/api/media/local/assembled_x.mp4",
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
      .mockResolvedValueOnce("https://cdn.example/hero.png")
      .mockResolvedValueOnce("https://cdn.example/clip.mp4")
      .mockResolvedValueOnce("/api/media/local/assembled_x.mp4");

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
      .mockResolvedValueOnce("https://cdn.example/hero.png")
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

describe("executeWorkflow — money: one reservation, one settlement", () => {
  it("reserves the quoted total once and settles it once on success", async () => {
    executeStepWithRetry.mockResolvedValue("https://cdn.example/out.png");

    await executeWorkflow("wf1", "u1", {});

    expect(reserveCredits).toHaveBeenCalledTimes(1);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 30, "run1");
    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith("u1", "run1", 30);
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it("settles only the steps that ran when the chain breaks part-way", async () => {
    executeStepWithRetry
      .mockResolvedValueOnce("https://cdn.example/hero.png")
      .mockRejectedValueOnce(new Error("the clip did not render"));

    await executeWorkflow("wf1", "u1", {});

    expect(settleReservation).toHaveBeenCalledTimes(1);
    // Step one of three ran: floor(1 * 30/3) = 10.
    expect(settleReservation).toHaveBeenCalledWith("u1", "run1", 10);
  });
});
