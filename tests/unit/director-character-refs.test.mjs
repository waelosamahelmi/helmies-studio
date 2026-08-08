import { describe, it, expect, vi, beforeEach } from "vitest";

// E4.3: real image-anchored character consistency. Shot image references may
// carry $CHARACTER_<name> tokens; the executor resolves them to (1) the
// character's uploaded reference image, or (2) the pipeline's ROLLING
// reference — the first completed shot image containing that character,
// stored once on the pipeline row (stateMetadata.characterRefs) and reused
// by every later shot through the existing generateI2I path.
//
// These are executor-level tests (mirroring director-credits.test.mjs's mock
// set) rather than extensions of api-director-execute.test.mjs — that file
// mocks the whole executor away, so token resolution can't be observed there.

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
          imageStrategy: { prompt: "a static skyline", references: [] },
          videoStrategy: { prompt: "slow dolly" },
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
    /* The executor now asks the catalog whether the chosen model can be
       SHOWN a reference before it routes a shot through I2I — a
       text-to-image model handed an image is a provider 500. These cases
       are about reference routing, so the model here declares a reference
       slot. */
    modelPricing: {
      findUnique: vi.fn(async () => ({
        modelId: "seedream/5-pro-image-to-image",
        inputSchema: { fields: { prompt: {}, image_urls: {}, aspect_ratio: {} } },
      })),
    },
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
import { generateImage, generateI2I } from "@/lib/generation";
import { resolveProvider } from "@/lib/providers";
import { ingestFromUrl } from "@/lib/storage/ingest";
import { generateShotAsset, resolveCharacterReferences, characterSlug } from "@/lib/director-executor";

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
  generateImage.mockResolvedValue({ url: "https://cdn.example/generated.png" });
  generateI2I.mockResolvedValue({ url: "https://cdn.example/i2i.png" });
});

describe("characterSlug / resolveCharacterReferences — pure resolution", () => {
  it("slugs names to token-safe identifiers", () => {
    expect(characterSlug("Mara")).toBe("Mara");
    expect(characterSlug("The Night Courier")).toBe("The_Night_Courier");
    expect(characterSlug("  d'Artagnan!  ")).toBe("d_Artagnan");
  });

  it("resolves a token to the character's uploaded reference", () => {
    const { urls, pending } = resolveCharacterReferences(
      ["$CHARACTER_Mara"],
      [{ name: "Mara", description: "x", referenceUrl: "https://cdn.example/mara.png" }],
      {}
    );
    expect(urls).toEqual(["https://cdn.example/mara.png"]);
    expect(pending).toEqual([]);
  });

  it("falls back to the rolling reference when there is no upload", () => {
    const { urls, pending } = resolveCharacterReferences(
      ["$CHARACTER_Mara"],
      [{ name: "Mara", description: "x" }],
      { Mara: "https://cdn.example/rolling.png" }
    );
    expect(urls).toEqual(["https://cdn.example/rolling.png"]);
    expect(pending).toEqual([]);
  });

  it("reports an unresolvable token as pending (this shot seeds the rolling reference)", () => {
    const { urls, pending } = resolveCharacterReferences(
      ["$CHARACTER_Mara"],
      [{ name: "Mara", description: "x" }],
      {}
    );
    expect(urls).toEqual([]);
    expect(pending).toEqual(["Mara"]);
  });

  it("matches token to character case-insensitively and passes plain URLs through untouched", () => {
    const { urls } = resolveCharacterReferences(
      ["https://cdn.example/style.png", "$CHARACTER_mara"],
      [{ name: "Mara", referenceUrl: "https://cdn.example/mara.png" }],
      {}
    );
    expect(urls).toEqual(["https://cdn.example/style.png", "https://cdn.example/mara.png"]);
  });
});

describe("executeShotImage (via generateShotAsset) — token resolution end to end", () => {
  it("an uploaded character reference routes the shot through I2I with that image", async () => {
    pipelineState = makePipeline({
      brief: {
        type: "commercial",
        characters: [{ name: "Mara", description: "a woman in a red coat", referenceUrl: "https://cdn.example/mara.png" }],
      },
    });
    pipelineState.plan.shots[0].imageStrategy.references = ["$CHARACTER_Mara"];

    await generateShotAsset("p1", "u1", "s1", "image");

    expect(generateI2I).toHaveBeenCalledTimes(1);
    expect(generateI2I.mock.calls[0][0].image_url).toBe("https://cdn.example/mara.png");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("with no upload and no rolling reference, generates T2I and seeds the rolling reference ONCE", async () => {
    pipelineState = makePipeline({
      brief: { type: "commercial", characters: [{ name: "Mara", description: "a woman in a red coat" }] },
    });
    pipelineState.plan.shots[0].imageStrategy.references = ["$CHARACTER_Mara"];

    await generateShotAsset("p1", "u1", "s1", "image");

    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateI2I).not.toHaveBeenCalled();

    // The completed image became Mara's rolling reference on the pipeline row.
    const metaWrite = prisma.directorPipeline.update.mock.calls
      .map(([args]) => args.data?.stateMetadata?.characterRefs)
      .find(Boolean);
    expect(metaWrite).toBeTruthy();
    expect(metaWrite.Mara).toBe("https://cdn.example/generated.png");
  });

  it("a later shot reuses the rolling reference via I2I and never overwrites it", async () => {
    pipelineState = makePipeline({
      brief: { type: "commercial", characters: [{ name: "Mara", description: "a woman in a red coat" }] },
      stateMetadata: { characterRefs: { Mara: "https://cdn.example/rolling.png" } },
    });
    pipelineState.plan.shots[0].imageStrategy.references = ["$CHARACTER_Mara"];

    await generateShotAsset("p1", "u1", "s1", "image");

    expect(generateI2I).toHaveBeenCalledTimes(1);
    expect(generateI2I.mock.calls[0][0].image_url).toBe("https://cdn.example/rolling.png");

    // Set once: no update rewrote characterRefs.
    const metaWrites = prisma.directorPipeline.update.mock.calls
      .map(([args]) => args.data?.stateMetadata?.characterRefs)
      .filter(Boolean);
    expect(metaWrites).toEqual([]);
    expect(pipelineState.stateMetadata.characterRefs.Mara).toBe("https://cdn.example/rolling.png");
  });

  it("a brief with no characters behaves exactly as before — T2I, no metadata writes", async () => {
    await generateShotAsset("p1", "u1", "s1", "image");

    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateI2I).not.toHaveBeenCalled();
    const metaWrites = prisma.directorPipeline.update.mock.calls
      .map(([args]) => args.data?.stateMetadata?.characterRefs)
      .filter(Boolean);
    expect(metaWrites).toEqual([]);
  });
});

describe("a reference is never sent to a model that cannot be shown one", () => {
  // Three of scene 1's four shots failed with a provider 500 while the one
  // shot WITHOUT references succeeded: the shot had a face to show and the
  // chosen model was text-to-image. Sending it anyway renders a stranger
  // and bills for it.
  it("renders without the references rather than handing them to a text-to-image model", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "seedream/5-pro-text-to-image",
      inputSchema: { fields: { prompt: {}, aspect_ratio: {} } }, // no reference slot
    });
    pipelineState = makePipeline({
      plan: { shots: [{ id: "s1", index: 0, imageStrategy: { mode: "generate", prompt: "a room", references: ["https://cdn.example/face.png"] } }] },
    });
    prisma.directorPipeline.findFirst.mockImplementation(async () => ({ ...pipelineState }));
    generateImage.mockResolvedValue({ url: "https://cdn.example/out.png" });
    ingestFromUrl.mockResolvedValue({ url: "https://cdn.example/local.png" });

    await generateShotAsset("p1", "u1", "s1", "image");

    expect(generateI2I).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledTimes(1);
  });
});
