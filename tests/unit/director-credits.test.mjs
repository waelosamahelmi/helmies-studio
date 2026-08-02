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

vi.mock("@/lib/storage/ingest", () => ({
  ingestFromUrl: vi.fn(),
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
import { generateImage, generateI2V, generateAudio } from "@/lib/generation";
import { resolveProvider } from "@/lib/providers";
import { ingestFromUrl } from "@/lib/storage/ingest";
import { assembleVideos } from "@/lib/video-assembly";
import { executeProductionPipeline, rerunShot, VALID_RERUN_TYPES } from "@/lib/director-executor";

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
  // ingestFromUrl's return shape is the richer { url, key, bytes, sha256 }
  // (Phase 4B Task 4) — director-executor.js only uses .url; the pass-through
  // mock mirrors storeMedia's old pass-through-the-url test double exactly.
  ingestFromUrl.mockImplementation(async (url) => ({ url, key: "k", bytes: 1, sha256: "a".repeat(64) }));
  assembleVideos.mockResolvedValue("https://cdn.example/assembled.mp4");
  generateAudio.mockResolvedValue({ url: "https://cdn.example/audio.mp3" });
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

  // Review finding on Task 6b: the refundCredits call in the crash catch
  // block was unguarded, unlike the transitionPipeline call below it. If
  // refundCredits itself throws (e.g. a transient DB error), that exception
  // would unwind the catch immediately — skipping the FAILED-transition
  // attempt and masking the original crash error with the refund error.
  it("still attempts the FAILED transition and rethrows the ORIGINAL error when the crash refund itself fails", async () => {
    Object.assign(
      pipelineState,
      makePipeline({
        plan: {
          shots: [{ id: "s1", index: 0, title: "Shot 1", imageStrategy: {}, videoStrategy: {}, durationSec: 5 }],
        },
        costEstimate: { totalCredits: 12, shotCosts: [{ total: 12 }] },
      })
    );

    prisma.directorShot.upsert.mockRejectedValue(new Error("DB write failed"));
    refundCredits.mockRejectedValue(new Error("wallet DB unreachable"));

    await expect(executeProductionPipeline("p1", "u1", {})).rejects.toThrow("DB write failed");

    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(pipelineState.status).toBe("failed");
  });
});

// rerunShot bypasses executeProductionPipeline's upfront pipeline debit — a
// rerun on an already-billed pipeline was previously free. It must now debit
// its own charge through the wallet before regenerating.
describe("rerunShot — charges before regenerating", () => {
  beforeEach(() => {
    Object.assign(
      pipelineState,
      makePipeline({
        plan: {
          shots: [{ id: "s1", index: 0, title: "Shot 1", imageStrategy: {}, videoStrategy: {}, durationSec: 5 }],
        },
        costEstimate: {
          totalCredits: 20,
          shotCosts: [{ costs: { image: 2, video: 10, audio: 3 } }],
        },
      })
    );
    prisma.directorShot.findUnique.mockResolvedValue({
      id: "s1",
      imageResult: { url: "https://cdn.example/old.png" },
      videoResult: { url: "https://cdn.example/old.mp4" },
    });
    generateImage.mockResolvedValue({ url: "https://cdn.example/new.png" });
    generateI2V.mockResolvedValue({ url: "https://cdn.example/new.mp4" });
  });

  it("debits the summed image+video+audio cost for a full rerun before regenerating", async () => {
    await rerunShot("p1", "u1", "s1", "full");

    expect(debitWallet).toHaveBeenCalledTimes(1);
    const [userId, amount, description, referenceId] = debitWallet.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(15); // 2 + 10 + 3
    expect(description).toContain("Director shot rerun");
    expect(description).toContain("full");
    expect(referenceId).toBe("director:p1:rerun");
  });

  it("debits only the per-type cost for a single-stage (image) rerun", async () => {
    await rerunShot("p1", "u1", "s1", "image");

    expect(debitWallet).toHaveBeenCalledWith("u1", 2, expect.stringContaining("image"), "director:p1:rerun");
  });

  it("debits only the per-type cost for a single-stage (video) rerun", async () => {
    await rerunShot("p1", "u1", "s1", "video");

    expect(debitWallet).toHaveBeenCalledWith("u1", 10, expect.stringContaining("video"), "director:p1:rerun");
  });

  it("debits only the per-type cost for a single-stage (audio) rerun", async () => {
    await rerunShot("p1", "u1", "s1", "audio");

    expect(debitWallet).toHaveBeenCalledWith("u1", 3, expect.stringContaining("audio"), "director:p1:rerun");
  });

  // Task 8 review finding: the cost path only special-cased `=== "full"`
  // while the execution switch's `default` treated anything unrecognized as
  // a full rerun — so an unvalidated bogus rerunType billed the cheap
  // fallback average while performing the expensive full rerun. rerunShot
  // now validates against VALID_RERUN_TYPES defensively (it is exported and
  // callable outside the HTTP route, which also validates) and throws before
  // ever debiting.
  it("throws on a bogus rerunType without debiting the wallet or regenerating anything", async () => {
    await expect(rerunShot("p1", "u1", "s1", "bogus")).rejects.toThrow(/Invalid rerunType/);

    expect(debitWallet).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("VALID_RERUN_TYPES is exactly the four types the cost path and execution switch both understand", () => {
    expect(VALID_RERUN_TYPES).toEqual(["image", "video", "audio", "full"]);
  });

  it("falls back to an even per-shot split of totalCredits when no per-type cost is recorded", async () => {
    Object.assign(pipelineState, { costEstimate: { totalCredits: 20, shotCosts: [] } });

    await rerunShot("p1", "u1", "s1", "full");

    // 1 shot in the plan -> Math.ceil(20 / 1) = 20
    expect(debitWallet).toHaveBeenCalledWith("u1", 20, expect.any(String), "director:p1:rerun");
  });

  it("propagates the wallet's insufficient-credit error without regenerating anything", async () => {
    debitWallet.mockRejectedValue(new Error("Insufficient credits"));

    await expect(rerunShot("p1", "u1", "s1", "full")).rejects.toThrow(/Insufficient credits/);
    expect(generateImage).not.toHaveBeenCalled();
  });

  // Regression guard for the audioResult.success check added to
  // executeFullShot below: the shot fixture in this describe block's
  // beforeEach has no `audio` field and brief.type is not "music_video", so
  // executeShotAudio short-circuits to { success: true, audioUrl: null }
  // without ever calling generateAudio. A full rerun of a shot that
  // legitimately has no audio must keep succeeding — the success check must
  // never fire on "no audio requested", only on "audio was attempted and
  // failed".
  it("a full rerun still succeeds when the shot has no audio requested", async () => {
    const { success } = await rerunShot("p1", "u1", "s1", "full");

    expect(success).toBe(true);
    expect(generateAudio).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  // Final-review finding: rerunShot charges via debitWallet above, then the
  // execution switch could throw on provider failure with no refund path —
  // unlike executeProductionPipeline, which refunds unexecuted work on both
  // its stopOnFailure and crash paths. A user reruns a shot, the provider
  // errors, and the user was left permanently billed for work that never
  // happened.
  describe("rerunShot — refunds on execution failure", () => {
    it("refunds the debited cost and rethrows the ORIGINAL error when the provider fails mid-rerun", async () => {
      const providerError = new Error("provider exploded");
      generateImage.mockRejectedValue(providerError);

      await expect(rerunShot("p1", "u1", "s1", "image")).rejects.toThrow("provider exploded");

      expect(refundCredits).toHaveBeenCalledTimes(1);
      const [userId, amount, referenceId, reason] = refundCredits.mock.calls[0];
      expect(userId).toBe("u1");
      expect(amount).toBe(2); // the debited image-only cost
      expect(referenceId).toBe("director:p1:rerun");
      expect(typeof reason).toBe("string");
    });

    it("still rethrows the ORIGINAL error when the refund itself also fails", async () => {
      const providerError = new Error("provider exploded");
      generateImage.mockRejectedValue(providerError);
      refundCredits.mockRejectedValue(new Error("wallet DB unreachable"));

      await expect(rerunShot("p1", "u1", "s1", "image")).rejects.toThrow("provider exploded");
      expect(refundCredits).toHaveBeenCalledTimes(1);
    });

    it("does not refund when the rerun succeeds", async () => {
      await rerunShot("p1", "u1", "s1", "image");

      expect(refundCredits).not.toHaveBeenCalled();
    });
  });

  // Re-review finding: unlike the image/video cases, rerunShot's "audio" case
  // and executeFullShot never checked audioResult.success before reporting
  // success — executeShotAudio swallows a provider failure internally and
  // returns { success: false, error } with no audioUrl (never throws), so
  // the failure was silently masked: the pipeline was marked COMPLETED,
  // success:true, despite the audio never being generated, and the refund
  // net built above never fired because nothing ever threw. These shots all
  // set `audio` so executeShotAudio actually attempts generation instead of
  // short-circuiting to { success: true, audioUrl: null }.
  describe("rerunShot — audio failure must refund, not report false success", () => {
    beforeEach(() => {
      Object.assign(
        pipelineState,
        makePipeline({
          plan: {
            shots: [{
              id: "s1", index: 0, title: "Shot 1",
              imageStrategy: {}, videoStrategy: {}, durationSec: 5,
              audio: { dialogue: "Hello" },
            }],
          },
          costEstimate: {
            totalCredits: 20,
            shotCosts: [{ costs: { image: 2, video: 10, audio: 3 } }],
          },
        })
      );
      prisma.directorShot.findUnique.mockResolvedValue({
        id: "s1",
        imageResult: { url: "https://cdn.example/old.png" },
        videoResult: { url: "https://cdn.example/old.mp4" },
      });
      generateImage.mockResolvedValue({ url: "https://cdn.example/new.png" });
      generateI2V.mockResolvedValue({ url: "https://cdn.example/new.mp4" });
      generateAudio.mockRejectedValue(new Error("audio provider exploded"));
    });

    it("audio-only rerun: refunds the debited cost, rethrows the original error, and never marks the pipeline completed", async () => {
      await expect(rerunShot("p1", "u1", "s1", "audio")).rejects.toThrow(/audio provider exploded/);

      expect(refundCredits).toHaveBeenCalledTimes(1);
      const [userId, amount, referenceId, reason] = refundCredits.mock.calls[0];
      expect(userId).toBe("u1");
      expect(amount).toBe(3); // the debited audio-only cost
      expect(referenceId).toBe("director:p1:rerun");
      expect(typeof reason).toBe("string");

      expect(prisma.directorPipeline.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) })
      );
    });

    it("full rerun: refunds and rethrows when only the audio leg fails, and never marks the pipeline completed", async () => {
      await expect(rerunShot("p1", "u1", "s1", "full")).rejects.toThrow(/audio provider exploded/);

      expect(refundCredits).toHaveBeenCalledTimes(1);
      const [userId, amount, referenceId] = refundCredits.mock.calls[0];
      expect(userId).toBe("u1");
      expect(amount).toBe(15); // 2 + 10 + 3 summed cost for a full rerun
      expect(referenceId).toBe("director:p1:rerun");

      expect(prisma.directorPipeline.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) })
      );
    });
  });
});
