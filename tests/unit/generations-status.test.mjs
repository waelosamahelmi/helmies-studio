import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase 4A Task 6 — /api/generations/status gains additive-only keys:
// jobStatus, attempts, queuedAt (null for a legacy generation with no
// GenerationJob row). No existing key changes type or disappears.

vi.mock("@/lib/prisma", () => {
  const models = {
    generation: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    generationJob: { findUnique: vi.fn(), findMany: vi.fn() },
  };
  return { default: models };
});
vi.mock("@/lib/session", () => ({ getCurrentUserWithCredits: vi.fn() }));

import prisma from "@/lib/prisma";
import { getCurrentUserWithCredits } from "@/lib/session";
import { GET } from "@/app/api/generations/status/route.js";

const req = (qs = "") => new Request(`http://test/api/generations/status${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserWithCredits.mockResolvedValue({ id: "u1" });
});

describe("GET /api/generations/status?id=... — additive job keys", () => {
  it("returns jobStatus/attempts/queuedAt from the job row when one exists", async () => {
    prisma.generation.findFirst.mockResolvedValue({
      id: "gen1", status: "pending", outputUrl: null, error: null, creditsUsed: 5,
      createdAt: new Date("2026-08-01T00:00:00Z"), model: "m1", prompt: "x",
    });
    const jobCreatedAt = new Date("2026-08-01T00:00:01Z");
    prisma.generationJob.findUnique.mockResolvedValue({ status: "running", attempts: 2, maxAttempts: 3, createdAt: jobCreatedAt });

    const res = await GET(req("?id=gen1"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toMatchObject({
      id: "gen1", status: "pending", creditsUsed: 5, // existing keys unchanged in type/value
      jobStatus: "running", attempts: 2, maxAttempts: 3,
    });
    expect(new Date(json.queuedAt).toISOString()).toBe(jobCreatedAt.toISOString());
    expect(prisma.generationJob.findUnique).toHaveBeenCalledWith({
      where: { generationId: "gen1" },
      select: { status: true, attempts: true, maxAttempts: true, createdAt: true },
    });
  });

  it("returns null for jobStatus/attempts/queuedAt on a legacy generation with no job row", async () => {
    prisma.generation.findFirst.mockResolvedValue({
      id: "gen2", status: "completed", outputUrl: "/x.png", error: null, creditsUsed: 3,
      createdAt: new Date(), model: "m1", prompt: "x",
    });
    prisma.generationJob.findUnique.mockResolvedValue(null);

    const res = await GET(req("?id=gen2"));
    const json = await res.json();

    expect(json.jobStatus).toBeNull();
    expect(json.attempts).toBeNull();
    expect(json.maxAttempts).toBeNull();
    expect(json.queuedAt).toBeNull();
    // No existing key disappeared or changed type.
    expect(json.status).toBe("completed");
    expect(json.outputUrl).toBe("/x.png");
    expect(json.creditsUsed).toBe(3);
  });

  it("still 404s when the generation doesn't exist or isn't the caller's, without querying the job table", async () => {
    prisma.generation.findFirst.mockResolvedValue(null);
    const res = await GET(req("?id=missing"));
    expect(res.status).toBe(404);
    expect(prisma.generationJob.findUnique).not.toHaveBeenCalled();
  });

  it("401s when unauthenticated, without touching the DB", async () => {
    getCurrentUserWithCredits.mockResolvedValue(null);
    const res = await GET(req("?id=gen1"));
    expect(res.status).toBe(401);
    expect(prisma.generation.findFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/generations/status (list) — additive job keys batched across the page", () => {
  it("attaches each row's job fields via a single batched lookup", async () => {
    prisma.generation.findMany.mockResolvedValue([
      { id: "gen1", status: "pending", outputUrl: null, error: null, creditsUsed: 5, createdAt: new Date(), model: "m1", prompt: "x", tool: "image" },
      { id: "gen2", status: "completed", outputUrl: "/y.png", error: null, creditsUsed: 2, createdAt: new Date(), model: "m1", prompt: "y", tool: "image" },
    ]);
    prisma.generationJob.findMany.mockResolvedValue([
      { generationId: "gen1", status: "running", attempts: 1, createdAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    prisma.generation.count.mockResolvedValue(2);

    const res = await GET(req(""));
    const json = await res.json();

    expect(prisma.generationJob.findMany).toHaveBeenCalledTimes(1);
    expect(json.generations[0]).toMatchObject({ id: "gen1", jobStatus: "running", attempts: 1 });
    expect(json.generations[1]).toMatchObject({ id: "gen2", jobStatus: null, attempts: null, queuedAt: null });
  });

  it("skips the job lookup entirely when there are no generations on the page", async () => {
    prisma.generation.findMany.mockResolvedValue([]);
    prisma.generation.count.mockResolvedValue(0);

    const res = await GET(req(""));
    const json = await res.json();

    expect(json.generations).toEqual([]);
    expect(prisma.generationJob.findMany).not.toHaveBeenCalled();
  });
});
