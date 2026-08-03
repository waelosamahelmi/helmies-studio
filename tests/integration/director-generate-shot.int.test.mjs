import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

// E4.2 integration: generateShotAsset against the REAL database and the REAL
// generation/providers modules, with the same double-locked E2E provider
// mock the Playwright harness uses (env var + localhost DATABASE_URL — see
// src/lib/providers.js). This is the closest thing to the production inline
// path that can run without dialing a provider: real wallet ledger rows,
// real DirectorPipeline/DirectorShot/Generation writes.

let prisma;
let generateShotAsset;

const SHOT = {
  id: "int_shot_1",
  index: 0,
  title: "Integration Shot",
  durationSec: 5,
  imageStrategy: { prompt: "a static skyline at dusk", references: [] },
  videoStrategy: { prompt: "slow dolly across the skyline" },
  transition: "cut",
  dialogue: null,
  audioCues: null,
};

async function createPipeline(userId) {
  return prisma.directorPipeline.create({
    data: {
      userId,
      title: "Integration Production",
      type: "commercial",
      status: "planning",
      plan: { shots: [SHOT], globalStyle: {} },
      brief: { type: "commercial", aspectRatio: "16:9" },
      costEstimate: {
        totalCredits: 20,
        shotCosts: [{ shotId: SHOT.id, shotIndex: 0, costs: { image: 3, video: 11, audio: 0 }, total: 14 }],
      },
    },
  });
}

beforeAll(async () => {
  // Must be set BEFORE src/lib/providers.js is first imported — its mock
  // gate is computed at module load.
  vi.stubEnv("E2E_MOCK_PROVIDERS", "1");
  ({ generateShotAsset } = await import("@/lib/director-executor"));
});

beforeEach(async () => {
  prisma = await resetDb();
  await prisma.$executeRawUnsafe(`TRUNCATE "public"."DirectorPipeline", "public"."DirectorShot" RESTART IDENTITY CASCADE`);
});

describe("generateShotAsset — real DB, mocked provider", () => {
  it("generates a per-shot image: DirectorShot row created, Generation recorded, wallet debited exactly the quoted image cost", async () => {
    const user = await createUserWithWallet(100);
    const pipeline = await createPipeline(user.id);

    const result = await generateShotAsset(pipeline.id, user.id, SHOT.id, "image");

    expect(result.creditsUsed).toBe(3);
    expect(result.imageUrl).toBeTruthy();

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(97); // exactly the quoted image cost

    const shotRow = await prisma.directorShot.findUnique({ where: { id: SHOT.id } });
    expect(shotRow).toBeTruthy();
    expect(shotRow.imageResult?.url).toBeTruthy();

    const generations = await prisma.generation.findMany({ where: { userId: user.id } });
    expect(generations).toHaveLength(1);
    expect(generations[0].tool).toBe("image");
    expect(generations[0].creditsUsed).toBe(3);
    // The resolved provider adapter (function values + API key) must never
    // be persisted — Prisma 7 crashed on the functions, and the key is a
    // secret. Regression guard for the persistableParams fix.
    expect(generations[0].params._provider).toBeUndefined();
    expect(JSON.stringify(generations[0].params)).not.toContain("apiKey");

    const fresh = await prisma.directorPipeline.findUnique({ where: { id: pipeline.id } });
    expect(fresh.status).toBe("planning"); // never left planning — no full execution
  });

  it("refuses when the wallet cannot cover the shot's quoted cost, leaving the balance untouched", async () => {
    const user = await createUserWithWallet(1);
    const pipeline = await createPipeline(user.id);

    await expect(generateShotAsset(pipeline.id, user.id, SHOT.id, "image")).rejects.toThrow(/Insufficient credits/i);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1);
  });
});
