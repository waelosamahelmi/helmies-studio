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
let shotRowId;

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

// Same shape as createPipeline, but with an overridable plan-local shot id
// and title — used by the shotRowId collision regression below, where two
// SEPARATE pipelines each plan a shot with the identical plan-local id
// (mirroring "shot_000", which every heuristic-planned production uses for
// its first shot in production).
async function createPipelineWithShot(userId, { shotId, title }) {
  const shot = { ...SHOT, id: shotId };
  return prisma.directorPipeline.create({
    data: {
      userId,
      title,
      type: "commercial",
      status: "planning",
      plan: { shots: [shot], globalStyle: {} },
      brief: { type: "commercial", aspectRatio: "16:9" },
      costEstimate: {
        totalCredits: 20,
        shotCosts: [{ shotId, shotIndex: 0, costs: { image: 3, video: 11, audio: 0 }, total: 14 }],
      },
    },
  });
}

beforeAll(async () => {
  // Must be set BEFORE src/lib/providers.js is first imported — its mock
  // gate is computed at module load.
  vi.stubEnv("E2E_MOCK_PROVIDERS", "1");
  ({ generateShotAsset, shotRowId } = await import("@/lib/director-executor"));
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

    const shotRow = await prisma.directorShot.findUnique({ where: { id: shotRowId(pipeline.id, SHOT.id) } });
    expect(shotRow).toBeTruthy();
    expect(shotRow.pipelineId).toBe(pipeline.id);
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

// Regression for the DirectorShot row-id collision bug: `DirectorShot.id`
// used to be written as the bare PLAN-LOCAL shot id ("shot_000", "shot_001",
// …), which is IDENTICAL across every pipeline ever planned. A second
// pipeline generating its own "shot_000" therefore upserted straight into
// the FIRST pipeline's row — matched on id, took the `update` branch — and
// silently repointed that row's data at the new pipeline's generation while
// leaving `pipelineId` unchanged, so the first production's own status poll
// still resolved to a row whose imageResult a completely different
// pipeline (even a different user's) had just clobbered, and the second
// production's status poll saw zero shots. Confirmed by execution against
// this exact test DB before the fix (see director-executor.js's shotRowId
// doc comment). shotRowId(pipelineId, shotId) closes it by namespacing the
// row id, while the plan-local id keeps working as the client-facing
// identifier (asserted here via generateShotAsset's own shotId param).
describe("generateShotAsset — DirectorShot row id collision across pipelines (shotRowId regression)", () => {
  it("two different pipelines each generating their own shot_000 produce two distinct rows, neither overwriting the other", async () => {
    const userA = await createUserWithWallet(100);
    const userB = await createUserWithWallet(100);
    const pipelineA = await createPipelineWithShot(userA.id, { shotId: "shot_000", title: "Production A" });
    const pipelineB = await createPipelineWithShot(userB.id, { shotId: "shot_000", title: "Production B" });

    const resultA = await generateShotAsset(pipelineA.id, userA.id, "shot_000", "image");
    const resultB = await generateShotAsset(pipelineB.id, userB.id, "shot_000", "image");

    expect(resultA.imageUrl).toBeTruthy();
    expect(resultB.imageUrl).toBeTruthy();

    // Two rows exist in total — not one clobbered into the other.
    const allShotRows = await prisma.directorShot.findMany();
    expect(allShotRows).toHaveLength(2);

    const rowA = await prisma.directorShot.findUnique({ where: { id: shotRowId(pipelineA.id, "shot_000") } });
    const rowB = await prisma.directorShot.findUnique({ where: { id: shotRowId(pipelineB.id, "shot_000") } });
    expect(rowA).toBeTruthy();
    expect(rowB).toBeTruthy();
    expect(rowA.id).not.toBe(rowB.id);
    expect(rowA.pipelineId).toBe(pipelineA.id);
    expect(rowB.pipelineId).toBe(pipelineB.id);

    // The exact status-route query (findMany by pipelineId) sees ONLY its
    // own pipeline's shot, carrying that pipeline's own generated image —
    // this is precisely the query that used to return shots:[] for the
    // second pipeline while the first pipeline's row silently held the
    // second pipeline's overwritten data.
    const shotsForA = await prisma.directorShot.findMany({ where: { pipelineId: pipelineA.id } });
    const shotsForB = await prisma.directorShot.findMany({ where: { pipelineId: pipelineB.id } });
    expect(shotsForA).toHaveLength(1);
    expect(shotsForB).toHaveLength(1);
    expect(shotsForA[0].imageResult?.url).toBe(resultA.imageUrl);
    expect(shotsForB[0].imageResult?.url).toBe(resultB.imageUrl);
    expect(shotsForA[0].plan?.id).toBe("shot_000");
    expect(shotsForB[0].plan?.id).toBe("shot_000");
  });
});
