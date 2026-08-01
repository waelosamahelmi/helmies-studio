import { describe, it, expect, vi, beforeEach } from "vitest";

// director-executor.js must route pipeline debits/refunds through the wallet
// ledger (getWallet/debitWallet/refundCredits), not the stale User.credits
// mirror and the legacy session.js debitCredits/creditUser helpers — those
// checked/wrote only the denormalized User.credits column, which
// session.js's syncUserCreditsFromWallet silently reverts on the user's
// next request, making director pipelines effectively free (or wrongly
// blocked) relative to the real wallet balance.

let pipelineState;

function makePipeline(overrides = {}) {
  return {
    id: "p1",
    userId: "u1",
    status: "quoted",
    plan: { shots: [] },
    brief: {},
    costEstimate: { totalCredits: 12, shotCosts: [] },
    stateMetadata: {},
    rerunHistory: [],
    ...overrides,
  };
}

vi.mock("@/lib/prisma", () => {
  const models = {
    directorPipeline: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    directorShot: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    generation: { create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  debitWallet: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUserWithCredits: vi.fn(),
  debitCredits: vi.fn(),
  creditUser: vi.fn(),
}));

vi.mock("@/lib/generation", () => ({
  generateImage: vi.fn(),
  generateI2I: vi.fn(),
  generateVideo: vi.fn(),
  generateI2V: vi.fn(),
  generateAudio: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  resolveProvider: vi.fn(),
  resolveProviderWithFallback: vi.fn(),
  brandError: vi.fn((e) => e),
  logProviderError: vi.fn(),
}));

vi.mock("@/lib/pricing-engine", () => ({
  estimateCredits: vi.fn(),
}));

vi.mock("@/lib/media-storage", () => ({
  storeMedia: vi.fn(),
}));

vi.mock("@/lib/video-assembly", () => ({
  assembleVideos: vi.fn(),
}));

vi.mock("@/lib/director-planner", () => ({
  validatePrompt: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { getWallet, debitWallet, refundCredits } from "@/lib/wallet";
import { debitCredits, creditUser } from "@/lib/session";
import { generateImage, generateI2V } from "@/lib/generation";
import { resolveProvider } from "@/lib/providers";
import { storeMedia } from "@/lib/media-storage";
import { assembleVideos } from "@/lib/video-assembly";
import { executeProductionPipeline } from "@/lib/director-executor";

beforeEach(() => {
  vi.clearAllMocks();
  pipelineState = makePipeline();

  prisma.directorPipeline.findFirst.mockImplementation(async () => ({ ...pipelineState }));
  prisma.directorPipeline.findUnique.mockImplementation(async () => ({ ...pipelineState }));
  prisma.directorPipeline.update.mockImplementation(async ({ data }) => {
    Object.assign(pipelineState, data);
    return { ...pipelineState };
  });
  prisma.directorShot.findUnique.mockResolvedValue(null);
  prisma.directorShot.upsert.mockResolvedValue({});
  prisma.directorShot.update.mockResolvedValue({});
  prisma.generation.create.mockResolvedValue({});

  getWallet.mockResolvedValue({ available: 1000 });
  debitWallet.mockResolvedValue({});
  refundCredits.mockResolvedValue({});
  resolveProvider.mockResolvedValue("mock-provider");
  storeMedia.mockImplementation(async (url) => url);
  assembleVideos.mockResolvedValue("https://cdn.example/assembled.mp4");
});

describe("executeProductionPipeline — wallet ledger debit", () => {
  it("checks affordability via the wallet, not the stale User.credits mirror", async () => {
    const result = await executeProductionPipeline("p1", "u1", {});

    expect(result.success).toBe(true);
    expect(getWallet).toHaveBeenCalledWith("u1");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("debits the wallet for the pipeline cost estimate, tagged with the pipeline reference", async () => {
    await executeProductionPipeline("p1", "u1", {});

    expect(debitWallet).toHaveBeenCalledTimes(1);
    const [userId, amount, description, referenceId] = debitWallet.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(12);
    expect(description).toContain("Director");
    expect(referenceId).toBe("director:p1");

    expect(debitCredits).not.toHaveBeenCalled();
  });

  it("throws without debiting when the wallet balance is insufficient", async () => {
    getWallet.mockResolvedValue({ available: 1 });

    await expect(executeProductionPipeline("p1", "u1", {})).rejects.toThrow(/Insufficient credits/);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  it("refunds the remaining credits through the wallet ledger when a shot fails with stopOnFailure", async () => {
    Object.assign(
      pipelineState,
      makePipeline({
        plan: {
          shots: [{ id: "s1", index: 0, title: "Shot 1", imageStrategy: {}, videoStrategy: {}, durationSec: 5 }],
        },
        costEstimate: { totalCredits: 12, shotCosts: [{ total: 12 }] },
      })
    );

    generateImage.mockRejectedValue(new Error("provider exploded"));

    const result = await executeProductionPipeline("p1", "u1", { stopOnFailure: true });

    expect(result.success).toBe(false);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    const [userId, amount, referenceId, reason] = refundCredits.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(12);
    expect(referenceId).toBe("director:p1");
    expect(typeof reason).toBe("string");

    expect(creditUser).not.toHaveBeenCalled();
  });

  // Task 6b: VALID_TRANSITIONS[GENERATING_IMAGES] didn't allow ASSEMBLING or
  // COMPLETED, so every non-failing run threw "Invalid state transition"
  // after the debit had already gone through, with no refund. Fixed by (1)
  // extending the transition table to match the real flow and (2) wrapping
  // the post-debit body in a crash safety net that refunds the un-consumed
  // remainder and marks the pipeline FAILED before rethrowing.
  it("completes the full run across multiple shots, transitioning through ASSEMBLING to COMPLETED", async () => {
    Object.assign(
      pipelineState,
      makePipeline({
        plan: {
          shots: [
            { id: "s1", index: 0, title: "Shot 1", imageStrategy: {}, videoStrategy: {}, durationSec: 5 },
            { id: "s2", index: 1, title: "Shot 2", imageStrategy: {}, videoStrategy: {}, durationSec: 5 },
          ],
        },
        costEstimate: { totalCredits: 12, shotCosts: [{ total: 6 }, { total: 6 }] },
      })
    );

    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });
    generateI2V.mockResolvedValue({ url: "https://cdn.example/vid.mp4" });

    const result = await executeProductionPipeline("p1", "u1", {});

    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    // The last transitionPipeline call to land was COMPLETED — proven via
    // the shared fixture state that every directorPipeline.update mutates.
    expect(pipelineState.status).toBe("completed");
    expect(assembleVideos).toHaveBeenCalledTimes(1);
  });

  it("refunds the un-consumed remainder and marks the pipeline FAILED when the run crashes after the debit", async () => {
    Object.assign(
      pipelineState,
      makePipeline({
        plan: {
          shots: [{ id: "s1", index: 0, title: "Shot 1", imageStrategy: {}, videoStrategy: {}, durationSec: 5 }],
        },
        costEstimate: { totalCredits: 12, shotCosts: [{ total: 12 }] },
      })
    );

    // directorShot.upsert is called outside executeShotImage's own
    // try/catch, so rejecting it simulates an unhandled crash mid-run —
    // distinct from a shot generation failure, which is caught internally
    // and returns { success: false } instead of throwing.
    prisma.directorShot.upsert.mockRejectedValue(new Error("DB write failed"));

    await expect(executeProductionPipeline("p1", "u1", {})).rejects.toThrow("DB write failed");

    expect(refundCredits).toHaveBeenCalledTimes(1);
    const [userId, amount, referenceId, reason] = refundCredits.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(12);
    expect(referenceId).toBe("director:p1");
    expect(typeof reason).toBe("string");

    expect(pipelineState.status).toBe("failed");
  });
});
