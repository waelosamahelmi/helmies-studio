import { describe, it, expect, vi, beforeEach } from "vitest";

// EDITSv1 E3.2 — honored plan approvals. The critical money contract:
//   - an approved plan IS the executed plan (the planner is never re-run)
//   - the debit ceiling is the approved estimate.total
//   - a fallback model swap re-quotes; if it would push the running total
//     above the approved total, the STEP FAILS instead of overspending
//   - /api/agent/step's core debits exactly one step's server quote, and a
//     model override re-quotes server-side
// Net invariant, asserted below: total debits minus refunds never exceed
// the user-approved total.

vi.mock("@/lib/prisma", () => {
  const models = {
    agentRun: { create: vi.fn(), update: vi.fn() },
    generation: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    modelPricing: { findUnique: vi.fn(), findFirst: vi.fn() },
    agentSession: { update: vi.fn() },
    agentMessage: { create: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  debitWallet: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/security", () => ({ detectAbuse: vi.fn() }));

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
  brandForUser: vi.fn((m) => m || "An unexpected error occurred. Please try again."),
}));

// Full control over server-side quoting — the tests below choose exactly
// what each (tool, model) pair costs.
vi.mock("@/lib/pricing-engine", () => ({
  estimateCredits: vi.fn(),
  estimateAgentTask: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { getWallet, debitWallet, refundCredits } from "@/lib/wallet";
import { detectAbuse } from "@/lib/security";
import { generateImage } from "@/lib/generation";
import { llmComplete, llmStream, resolveProvider } from "@/lib/providers";
import { estimateCredits, estimateAgentTask } from "@/lib/pricing-engine";
import { executeAgentRunStream, executeAgentRun, executeAgentStep } from "@/lib/agents";

const IMAGE_STEP = {
  agent: "image",
  task: "Generate a hero image",
  params: { model: "custom-model-x", endpoint: "custom-model-x", prompt: "a kettle", aspect_ratio: "1:1" },
};

function approvedPlan({ total = 2, steps = [IMAGE_STEP], breakdown } = {}) {
  return {
    steps,
    summary: "One hero image",
    estimate: {
      total,
      breakdown: breakdown || steps.map((s, i) => ({ step: s.task, tool: "image", model: s.params?.model, credits: total / steps.length })),
    },
  };
}

async function drainStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  return buf
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

// Net spend must never exceed the approved total, whatever happened inside.
function netDebits() {
  const debited = debitWallet.mock.calls.reduce((a, c) => a + c[1], 0);
  const refunded = refundCredits.mock.calls.reduce((a, c) => a + c[1], 0);
  return debited - refunded;
}

beforeEach(() => {
  vi.clearAllMocks();
  detectAbuse.mockResolvedValue({ flagged: false });
  prisma.agentRun.create.mockResolvedValue({ id: "run1" });
  prisma.agentRun.update.mockResolvedValue({});
  prisma.generation.create.mockResolvedValue({ id: "gen1" });
  prisma.agentSession.update.mockResolvedValue({});
  prisma.agentMessage.create.mockResolvedValue({ id: "m1" });
  // Every step's named model resolves as active/non-deprecated/runnable by
  // default (URGENT production fix: executeStepWithRetry/executeAgentStep
  // now validate a step's model against the live catalog before executing/
  // debiting it) — these tests exercise the E3.2 money invariants (approved
  // budget ceilings, re-quoting, refunds), not model-catalog resolution, so
  // the new runnable-model gate must never trigger a substitution here.
  // Catalog gate/substitution behavior itself is covered by
  // tests/unit/agent-model-selection.test.mjs.
  prisma.modelPricing.findUnique.mockImplementation(async ({ where }) => ({
    modelId: where.modelId,
    isActive: true,
    isDeprecated: false,
    endpoint: where.modelId,
    providerModelId: where.modelId,
    providerName: "KIE",
    creditsCost: 2,
  }));
  getWallet.mockResolvedValue({ available: 1000 });
  debitWallet.mockResolvedValue({});
  refundCredits.mockResolvedValue({});
  resolveProvider.mockResolvedValue({ name: "kie" });
  // Default server quote: 2 credits for any step/model.
  estimateCredits.mockResolvedValue(2);
  estimateAgentTask.mockImplementation(async (steps) => ({
    total: steps.length * 2,
    breakdown: steps.map((s) => ({ step: s.task, tool: "image", model: s.params?.model, credits: 2 })),
  }));
});

describe("executeAgentRunStream — honored approval", () => {
  it("executes the approved plan verbatim: the planner LLM is never called and the approved model runs", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const plan = approvedPlan({ total: 2 });
    const { stream } = await executeAgentRunStream("u1", "ignored", {}, { precomputedPlan: plan });
    const events = await drainStream(stream);

    expect(llmComplete).not.toHaveBeenCalled();
    expect(llmStream).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage.mock.calls[0][0]).toMatchObject({ endpoint: "custom-model-x", prompt: "a kettle" });

    const complete = events.find((e) => e.type === "run_complete");
    expect(complete.success).toBe(true);
    expect(debitWallet).toHaveBeenCalledTimes(1);
    expect(debitWallet.mock.calls[0][1]).toBe(2);
    expect(netDebits()).toBeLessThanOrEqual(2);
  });

  it("rejects a plan whose server re-quote exceeds the client-approved total (nothing debited)", async () => {
    // Server says the steps cost 10; the client claims an approved total of 2.
    estimateAgentTask.mockResolvedValue({ total: 10, breakdown: [{ credits: 10 }] });

    const plan = approvedPlan({ total: 2 });
    const result = await executeAgentRunStream("u1", "ignored", {}, { precomputedPlan: plan });

    expect(result.stream).toBeNull();
    expect(result.errorCode).toBe("quote_changed");
    expect(debitWallet).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("rejects a malformed approved plan (no steps / no numeric total)", async () => {
    const noSteps = await executeAgentRunStream("u1", "x", {}, { precomputedPlan: { steps: [], estimate: { total: 2 } } });
    expect(noSteps.errorCode).toBe("invalid_plan");
    const noTotal = await executeAgentRunStream("u1", "x", {}, { precomputedPlan: { steps: [IMAGE_STEP], estimate: {} } });
    expect(noTotal.errorCode).toBe("invalid_plan");
    expect(debitWallet).not.toHaveBeenCalled();
  });

  it("total debits never exceed the approved total — an over-budget fallback re-quote fails the step instead of overspending", async () => {
    // The approved model fails; every fallback re-quotes at 50 credits,
    // far above the approved 2. The step must FAIL (original error) and the
    // 2 debited credits must come back — never a 50-credit execution.
    generateImage.mockRejectedValue(new Error("provider down"));
    estimateCredits.mockImplementation(async (tool, model) => (model === "custom-model-x" ? 2 : 50));

    const plan = approvedPlan({ total: 2 });
    const { stream } = await executeAgentRunStream("u1", "ignored", {}, { precomputedPlan: plan });
    const events = await drainStream(stream);

    const complete = events.find((e) => e.type === "run_complete");
    expect(complete.success).toBe(false);

    // Only the approved model was ever executed — no fallback ran.
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(debitWallet).toHaveBeenCalledTimes(1);
    expect(debitWallet.mock.calls[0][1]).toBe(2);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits.mock.calls[0][1]).toBe(2);
    expect(netDebits()).toBeLessThanOrEqual(2);
    expect(netDebits()).toBe(0); // failed run costs nothing
  });

  it("an affordable fallback re-quote executes and the run still never exceeds the approved total", async () => {
    // Original model fails once; the first fallback quotes at 1 credit
    // (within the approved 2) and succeeds. Unused budget is refunded.
    generateImage
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce({ url: "https://cdn.example/img2.png" });
    estimateCredits.mockImplementation(async (tool, model) => (model === "custom-model-x" ? 2 : 1));

    const plan = approvedPlan({ total: 2 });
    const { stream } = await executeAgentRunStream("u1", "ignored", {}, { precomputedPlan: plan });
    const events = await drainStream(stream);

    const complete = events.find((e) => e.type === "run_complete");
    expect(complete.success).toBe(true);
    expect(complete.creditsUsed).toBe(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    // Debited the approved total up-front, refunded the unused credit.
    expect(debitWallet.mock.calls[0][1]).toBe(2);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits.mock.calls[0][1]).toBe(1);
    expect(netDebits()).toBe(1);
    expect(netDebits()).toBeLessThanOrEqual(2);
  });

  it("ties the run to the session and persists run/outputs messages when sessionId is given", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const plan = approvedPlan({ total: 2 });
    const { stream } = await executeAgentRunStream("u1", "ignored", {}, { precomputedPlan: plan, sessionId: "sess1" });
    await drainStream(stream);

    expect(prisma.agentRun.create.mock.calls[0][0].data.sessionId).toBe("sess1");
    const kinds = prisma.agentMessage.create.mock.calls.map((c) => c[0].data.kind);
    expect(kinds).toContain("run");
    expect(kinds).toContain("outputs");
  });
});

describe("executeAgentRun (non-stream) — honored approval", () => {
  it("skips the planner and debits the approved total", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });
    const plan = approvedPlan({ total: 2 });
    const result = await executeAgentRun("u1", "ignored", {}, { precomputedPlan: plan });
    expect(result.success).toBe(true);
    expect(llmComplete).not.toHaveBeenCalled();
    expect(debitWallet.mock.calls[0][1]).toBe(2);
    expect(netDebits()).toBeLessThanOrEqual(2);
  });
});

describe("executeAgentStep — one step at a time", () => {
  it("debits exactly the step's server quote and returns output + assembled", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });
    estimateCredits.mockResolvedValue(7);

    const plan = approvedPlan({ total: 7 });
    const result = await executeAgentStep("u1", { plan, stepIndex: 0 });

    expect(debitWallet).toHaveBeenCalledTimes(1);
    expect(debitWallet.mock.calls[0][1]).toBe(7);
    expect(result.creditsUsed).toBe(7);
    expect(result.output).toContain("/api/media/proxy?url=");
    expect(result.assembled.images).toHaveLength(1);
    expect(prisma.generation.create).toHaveBeenCalledTimes(1);
    expect(prisma.generation.create.mock.calls[0][0].data.creditsUsed).toBe(7);
    expect(netDebits()).toBe(7);
  });

  it("re-quotes server-side when the model is overridden (regenerate with override)", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });
    estimateCredits.mockImplementation(async (tool, model) => (model === "override-model" ? 9 : 2));

    const plan = approvedPlan({ total: 2 });
    const result = await executeAgentStep("u1", {
      plan,
      stepIndex: 0,
      regenerate: true,
      paramOverrides: { model: "override-model", prompt: "closer crop" },
    });

    // The quote used the OVERRIDE model, not the plan's original.
    expect(estimateCredits).toHaveBeenCalledWith("image", "override-model", expect.objectContaining({ model: "override-model" }));
    expect(debitWallet.mock.calls[0][1]).toBe(9);
    expect(result.creditsUsed).toBe(9);
    expect(generateImage.mock.calls[0][0]).toMatchObject({ endpoint: "override-model", prompt: "closer crop" });
  });

  it("refunds the step quote in full when the step fails (a failed step costs nothing)", async () => {
    generateImage.mockRejectedValue(new Error("provider down"));
    // Fallback re-quotes are over this step's own budget — they must not run.
    estimateCredits.mockImplementation(async (tool, model) => (model === "custom-model-x" ? 3 : 50));

    const plan = approvedPlan({ total: 3 });
    await expect(executeAgentStep("u1", { plan, stepIndex: 0 })).rejects.toThrow("provider down");

    expect(debitWallet.mock.calls[0][1]).toBe(3);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits.mock.calls[0][1]).toBe(3);
    expect(netDebits()).toBe(0);
  });

  it("refuses to run without enough credits — nothing debited", async () => {
    getWallet.mockResolvedValue({ available: 1 });
    estimateCredits.mockResolvedValue(5);
    const plan = approvedPlan({ total: 5 });
    await expect(executeAgentStep("u1", { plan, stepIndex: 0 })).rejects.toMatchObject({ code: "insufficient_credits" });
    expect(debitWallet).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range step index", async () => {
    const plan = approvedPlan({ total: 2 });
    await expect(executeAgentStep("u1", { plan, stepIndex: 5 })).rejects.toMatchObject({ code: "invalid_plan" });
    await expect(executeAgentStep("u1", { plan, stepIndex: -1 })).rejects.toMatchObject({ code: "invalid_plan" });
  });

  it("resolves $STEP_N_OUTPUT references from caller-supplied previous outputs", async () => {
    const { generateI2V } = await import("@/lib/generation");
    generateI2V.mockResolvedValue({ url: "https://cdn.example/vid.mp4" });
    const videoStep = {
      agent: "video",
      task: "Animate it",
      params: { model: "vid-model", endpoint: "vid-model", image_url: "$STEP_1_OUTPUT", prompt: "animate" },
    };
    const plan = { steps: [IMAGE_STEP, videoStep], summary: "s", estimate: { total: 4, breakdown: [{ credits: 2 }, { credits: 2 }] } };

    await executeAgentStep("u1", { plan, stepIndex: 1, previousOutputs: ["https://cdn.example/img.png"] });
    expect(generateI2V.mock.calls[0][0]).toMatchObject({ image_url: "https://cdn.example/img.png" });
  });
});
