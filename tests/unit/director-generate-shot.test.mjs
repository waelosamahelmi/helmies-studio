import { describe, it, expect, vi, beforeEach } from "vitest";

// E4.2: per-shot generation BEFORE full execution. generateShotAsset must
// uphold the same money invariants as executeProductionPipeline/rerunShot:
// debit EXACTLY that shot's server-quoted cost for that kind (never a
// client-sent number), refund on failure, and create the DirectorShot row
// when it doesn't exist yet (rerunShot requires an existing row; this is the
// path that runs before any execution has created one).

let pipelineState;

function makePipeline(overrides = {}) {
  return {
    id: "p1",
    userId: "u1",
    status: "planning",
    plan: {
      shots: [
        {
          id: "s1", index: 0, title: "Shot 1", durationSec: 5,
          imageStrategy: { prompt: "a static skyline" }, videoStrategy: { prompt: "slow dolly" },
        },
      ],
    },
    brief: { type: "commercial" },
    costEstimate: {
      totalCredits: 20,
      shotCosts: [{ shotId: "s1", shotIndex: 0, costs: { image: 3, video: 11, audio: 0 }, total: 14 }],
    },
    stateMetadata: {},
    rerunHistory: [],
    ...overrides,
  };
}

vi.mock("@/lib/prisma", () => {
  const models = {
    directorPipeline: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    directorShot: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    generation: { create: vi.fn() },
    modelPricing: { findUnique: vi.fn(async () => null) },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  debitWallet: vi.fn(),
  refundCredits: vi.fn(),
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

vi.mock("@/lib/pricing-engine", () => ({ estimateCredits: vi.fn() }));
vi.mock("@/lib/storage/ingest", () => ({ ingestFromUrl: vi.fn() }));
vi.mock("@/lib/video-assembly", () => ({ assembleVideos: vi.fn() }));
vi.mock("@/lib/director-planner", () => ({ validatePrompt: vi.fn() }));

import prisma from "@/lib/prisma";
import { debitWallet, refundCredits } from "@/lib/wallet";
import { generateImage, generateVideo, generateI2V, generateAudio } from "@/lib/generation";
import { resolveProvider } from "@/lib/providers";
import { ingestFromUrl } from "@/lib/storage/ingest";
import { generateShotAsset, rerunShot, shotRowId } from "@/lib/director-executor";

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
  prisma.directorShot.create.mockResolvedValue({});
  prisma.generation.create.mockResolvedValue({});

  debitWallet.mockResolvedValue({});
  refundCredits.mockResolvedValue({});
  resolveProvider.mockResolvedValue("mock-provider");
  ingestFromUrl.mockImplementation(async (url) => ({ url, key: "k", bytes: 1, sha256: "a".repeat(64) }));
  generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });
  generateVideo.mockResolvedValue({ url: "https://cdn.example/vid.mp4" });
  generateI2V.mockResolvedValue({ url: "https://cdn.example/i2v.mp4" });
});

describe("generateShotAsset — per-shot money invariant", () => {
  it("debits exactly the shot's quoted image cost for a per-shot image generation", async () => {
    const result = await generateShotAsset("p1", "u1", "s1", "image");

    expect(result.imageUrl).toBe("https://cdn.example/img.png");
    expect(result.creditsUsed).toBe(3);
    expect(debitWallet).toHaveBeenCalledTimes(1);
    const [userId, amount, description, referenceId] = debitWallet.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(3); // exactly costEstimate.shotCosts[s1].costs.image
    expect(description).toContain("image");
    expect(referenceId).toBe("director:p1:generate");
  });

  it("debits exactly the shot's quoted video cost for a per-shot video generation", async () => {
    await generateShotAsset("p1", "u1", "s1", "video");

    expect(debitWallet).toHaveBeenCalledWith("u1", 11, expect.stringContaining("video"), "director:p1:generate");
  });

  it("refunds the debited cost and rethrows when the provider fails", async () => {
    generateImage.mockRejectedValue(new Error("provider exploded"));

    await expect(generateShotAsset("p1", "u1", "s1", "image")).rejects.toThrow("provider exploded");

    expect(refundCredits).toHaveBeenCalledTimes(1);
    const [userId, amount, referenceId] = refundCredits.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(3);
    expect(referenceId).toBe("director:p1:generate");
  });

  it("throws on an invalid kind without debiting anything", async () => {
    await expect(generateShotAsset("p1", "u1", "s1", "audio-cassette")).rejects.toThrow(/Invalid kind/);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  it("throws when the shot is not in the plan, without debiting", async () => {
    await expect(generateShotAsset("p1", "u1", "nope", "image")).rejects.toThrow(/Shot not found/);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  it("refuses to run while the pipeline is executing, without debiting", async () => {
    pipelineState = makePipeline({ status: "generating_images" });

    await expect(generateShotAsset("p1", "u1", "s1", "image")).rejects.toThrow(/executing/i);
    expect(debitWallet).not.toHaveBeenCalled();
  });
});

describe("generateShotAsset — creates the DirectorShot row when missing", () => {
  it("image: creates/updates the row via the existing upsert path, keyed by the namespaced row id", async () => {
    await generateShotAsset("p1", "u1", "s1", "image");

    expect(prisma.directorShot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: shotRowId("p1", "s1") } })
    );
  });

  it("video with no existing row: creates the row first (namespaced id), then generates via T2V", async () => {
    prisma.directorShot.findUnique.mockResolvedValue(null);

    await generateShotAsset("p1", "u1", "s1", "video");

    expect(prisma.directorShot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: shotRowId("p1", "s1"), pipelineId: "p1" }) })
    );
    expect(generateVideo).toHaveBeenCalledTimes(1);
    expect(generateI2V).not.toHaveBeenCalled();
  });

  it("video with an existing shot image: animates that image via I2V", async () => {
    prisma.directorShot.findUnique.mockResolvedValue({
      id: "s1",
      imageResult: { url: "https://cdn.example/existing.png" },
    });

    await generateShotAsset("p1", "u1", "s1", "video");

    expect(generateI2V).toHaveBeenCalledTimes(1);
    expect(generateI2V.mock.calls[0][0].image_url).toBe("https://cdn.example/existing.png");
    expect(prisma.directorShot.create).not.toHaveBeenCalled();
  });
});

// E4.2: the shot shape gains `dialogue` — the executor previously only read
// the LLM-contract-forbidden shot.audio.dialogue (the contract says audio is
// null), so dialogue could never actually reach TTS.
describe("shot.dialogue reaches audio generation", () => {
  beforeEach(() => {
    pipelineState = makePipeline({
      plan: {
        shots: [{
          id: "s1", index: 0, title: "Shot 1", durationSec: 5,
          imageStrategy: {}, videoStrategy: {},
          dialogue: '"We leave at dawn."',
        }],
      },
      costEstimate: { totalCredits: 20, shotCosts: [{ shotId: "s1", shotIndex: 0, costs: { image: 2, video: 10, audio: 3 }, total: 15 }] },
    });
    prisma.directorShot.findUnique.mockResolvedValue({ id: "s1", imageResult: null, videoResult: null });
    generateAudio.mockResolvedValue({ url: "https://cdn.example/line.mp3" });
  });

  it("an audio rerun on a shot with dialogue (and no legacy audio field) generates from the dialogue text", async () => {
    const { success } = await rerunShot("p1", "u1", "s1", "audio");

    expect(success).toBe(true);
    expect(generateAudio).toHaveBeenCalledTimes(1);
    expect(generateAudio.mock.calls[0][0].prompt).toBe('"We leave at dawn."');
  });
});
