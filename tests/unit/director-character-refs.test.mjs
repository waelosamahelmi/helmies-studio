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
    // The executor loads a shot's cast to pull their references.
    studioEntity: { findMany: vi.fn(async () => []) },
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
import { generateImage, generateI2I, generateI2V, generateVideo } from "@/lib/generation";
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

describe("what a shot is decides which references it gets", () => {
  // "It didn't keep the room." Every shot was asking for "default" and
  // taking two references per entity, so a WIDE establishing shot of a
  // bedroom got two photographs of a face and one of the room — and the
  // room came back different every time.
  const room = {
    id: "env1", kind: "environment", userId: "u1",
    references: [
      { kind: "wide", url: "https://cdn/room-wide.png" },
      { kind: "viewpoint", url: "https://cdn/room-reverse.png" },
      { kind: "detail", url: "https://cdn/room-corner.png" },
    ],
  };
  const person = {
    id: "ch1", kind: "character", userId: "u1",
    references: [
      { kind: "face_front", url: "https://cdn/face.png" },
      { kind: "full_body", url: "https://cdn/body.png" },
    ],
  };

  const runShot = async (shot) => {
    prisma.studioEntity.findMany.mockResolvedValue([person, room]);
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "edit", inputSchema: { fields: { prompt: {}, image_urls: {} } },
    });
    pipelineState = makePipeline({ plan: { shots: [shot] } });
    prisma.directorPipeline.findFirst.mockImplementation(async () => ({ ...pipelineState }));
    generateI2I.mockResolvedValue({ url: "https://cdn/out.png" });
    ingestFromUrl.mockResolvedValue({ url: "https://cdn/local.png" });
    await generateShotAsset("p1", "u1", shot.id, "image");
    return generateI2I.mock.calls[0][0];
  };

  it("leads a wide shot with the room, so the same room comes back", async () => {
    const params = await runShot({
      id: "s1", index: 0, entityIds: ["ch1", "env1"],
      camera: { framing: "wide shot" },
      imageStrategy: { mode: "generate", prompt: "the bedroom at night", references: [] },
    });
    expect(params.image_url).toBe("https://cdn/room-wide.png");
    expect(params.image_urls.filter((u) => u.includes("room")).length).toBe(2);
  });

  it("leads a close-up with the face, but never drops the room entirely", async () => {
    // Losing the place completely is the other way continuity breaks.
    const params = await runShot({
      id: "s1", index: 0, entityIds: ["ch1", "env1"],
      camera: { framing: "close-up" },
      imageStrategy: { mode: "generate", prompt: "close-up of his eyes", references: [] },
    });
    expect(params.image_url).toContain("face");
    expect(params.image_urls.some((u) => u.includes("room"))).toBe(true);
  });
});

describe("carrying the last frame across a cut", () => {
  // "The next shot should also have the last frame of the last shot as a
  // reference." Two cases, and the difference is a cut versus a
  // continuation.
  const runVideoShot = async (shot, allShots, previousRow) => {
    prisma.studioEntity.findMany.mockResolvedValue([]);
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "seedance",
      inputSchema: { fields: { prompt: {}, duration: {}, first_frame_url: {}, reference_image_urls: {}, return_last_frame: {} } },
    });
    prisma.directorShot.findUnique.mockImplementation(async ({ where }) =>
      where.id.endsWith(previousRow?.id || "__none__") ? previousRow?.row ?? null : null);
    pipelineState = makePipeline({ plan: { shots: allShots } });
    prisma.directorPipeline.findFirst.mockImplementation(async () => ({ ...pipelineState }));
    generateI2V.mockResolvedValue({ url: "https://cdn/out.mp4" });
    generateVideo.mockResolvedValue({ url: "https://cdn/out.mp4" });
    ingestFromUrl.mockResolvedValue({ url: "https://cdn/local.mp4" });
    await generateShotAsset("p1", "u1", shot.id, "video");
    return (generateI2V.mock.calls[0] || generateVideo.mock.calls[0])?.[0];
  };

  const shots = [
    { id: "s1", index: 0, videoStrategy: { prompt: "one" }, camera: {} },
    { id: "s2", index: 1, videoStrategy: { prompt: "two" }, camera: {}, continuity: [] },
    { id: "s3", index: 2, videoStrategy: { prompt: "three" }, camera: {}, continuity: ["s2"] },
  ];
  const endedOn = (id) => ({ id, row: { videoResult: { lastFrameUrl: "https://cdn/last.png" } } });

  it("asks the model to hand back the frame it ended on", async () => {
    // Without this there is nothing to carry forward at all.
    const params = await runVideoShot(shots[0], shots, null);
    expect(params.return_last_frame).toBe(true);
  });

  it("STARTS on the last frame when the shot continues the motion", async () => {
    // s3 declares continuity from s2.
    const params = await runVideoShot(shots[2], shots, endedOn("s2"));
    expect(params.first_frame_url).toBe("https://cdn/last.png");
  });

  it("starts on the last frame even on a plain cut", async () => {
    // Every shot begins where the last one ended, not only the ones the
    // breakdown marked as continuing: a new angle in the same room still
    // starts from what was actually there, which is the only thing that
    // keeps the light, the props and the furniture from being re-invented
    // at every cut.
    // s2 declares no continuity; its neighbour is s1.
    const params = await runVideoShot(shots[1], shots, endedOn("s1"));
    expect(params.first_frame_url).toBe("https://cdn/last.png");
  });

  it("carries nothing into the first shot of a scene", async () => {
    const params = await runVideoShot(shots[0], shots, null);
    expect(params.first_frame_url).toBeUndefined();
  });
});

describe("sound is continuous, not absent", () => {
  // The first attempt at "four clips, four soundtracks" turned audio off
  // for any multi-shot scene. That fixed the inconsistency by removing the
  // sound, which is not a fix — a film with voice-over cannot be shot mute.
  const speaker = {
    id: "ch1", kind: "character", userId: "u1",
    references: [
      { kind: "face_front", url: "https://cdn/face.png" },
      { kind: "voice", url: "https://cdn/wael.mp3" },
    ],
  };

  const runAudioShot = async (shot) => {
    prisma.studioEntity.findMany.mockResolvedValue([speaker]);
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "seedance-2-5",
      inputSchema: { fields: { prompt: {}, duration: {}, generate_audio: {}, reference_audio_urls: {}, reference_image_urls: {} } },
    });
    prisma.directorShot.findUnique.mockResolvedValue(null);
    pipelineState = makePipeline({ plan: { shots: [shot, { id: "other", index: 1 }] } });
    prisma.directorPipeline.findFirst.mockImplementation(async () => ({ ...pipelineState }));
    generateVideo.mockResolvedValue({ url: "https://cdn/out.mp4" });
    generateI2V.mockResolvedValue({ url: "https://cdn/out.mp4" });
    ingestFromUrl.mockResolvedValue({ url: "https://cdn/local.mp4" });
    await generateShotAsset("p1", "u1", shot.id, "video");
    return (generateI2V.mock.calls[0] || generateVideo.mock.calls[0])?.[0];
  };

  it("asks for audio on a shot that has something to hear", async () => {
    const params = await runAudioShot({
      id: "s1", index: 0, entityIds: ["ch1"], camera: {},
      dialogue: "Wael: Who are you?", videoStrategy: { prompt: "he speaks" },
    });
    expect(params.generate_audio).toBe(true);
  });

  it("does NOT send a voice reference, because the provider refuses the request", async () => {
    // This used to assert the opposite, and it was right about what we
    // wanted: without a reference each clip invents its own speaker, which
    // is what made the sound change shot to shot. But Seedance rejects any
    // request carrying one —
    //   {"code":422,"msg":"Each reference audio must be between 2 and 30 seconds"}
    // — for an 18.4-second file it can fetch over https. Every shot with
    // dialogue died on submit. A film that will not render is worse than a
    // film whose voices are not anchored, so the reference is off until the
    // real constraint is known.
    const params = await runAudioShot({
      id: "s1", index: 0, entityIds: ["ch1"], camera: {},
      dialogue: "Wael: Who are you?", videoStrategy: { prompt: "he speaks" },
    });
    expect(params.reference_audio_urls).toBeUndefined();
    // Sound itself is still asked for — only the anchoring sample is gone.
    expect(params.generate_audio).toBe(true);
  });

  it("names what is heard and forbids invented music", async () => {
    const params = await runAudioShot({
      id: "s1", index: 0, entityIds: ["ch1"], camera: {},
      dialogue: "Wael: Who are you?", audioCues: "clock tick",
      videoStrategy: { prompt: "he speaks" },
    });
    expect(params.prompt).toContain("Who are you?");
    expect(params.prompt).toContain("clock tick");
    expect(params.prompt).toMatch(/no added music/i);
  });

  it("leaves a silent beat silent, because that is what the script asked for", async () => {
    const params = await runAudioShot({
      id: "s1", index: 0, entityIds: ["ch1"], camera: {},
      videoStrategy: { prompt: "he stares at the ceiling" },
    });
    expect(params.generate_audio).toBe(false);
    expect(params.reference_audio_urls).toBeUndefined();
  });
});
