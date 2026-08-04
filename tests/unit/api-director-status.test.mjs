import { describe, it, expect, vi, beforeEach } from "vitest";

// E4.1 bug fix: GET /api/director/status queried `prisma.project`, but
// director plans are written to `prisma.directorPipeline`
// (director-planner.js's createProductionPlan) with per-shot execution
// state in `prisma.directorShot`. Consequence in production:
// DirectorStudio.refresh() always 404'd (the poll's catch swallowed it),
// loadRecent() listed the wrong table, and load(id) could never reopen an
// earlier production. This file locks in: the status route reads the REAL
// tables and returns the exact shape DirectorStudio already parses
// (p.status / p.plan / p.costEstimate / p.assembledUrl / p.shots / p.brief).

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

// Deliberately NO `project` model on this mock — if the route still touches
// prisma.project, it throws and the test fails loudly.
vi.mock("@/lib/prisma", () => ({
  default: {
    directorPipeline: { findFirst: vi.fn(), findMany: vi.fn() },
    directorShot: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { GET } from "@/app/api/director/status/route.js";

const req = (qs = "") => new Request(`http://test/api/director/status${qs}`);

const PIPELINE = {
  id: "p1",
  userId: "u1",
  title: "Test Production",
  type: "music_video",
  status: "planning",
  plan: { shots: [{ id: "shot_000", index: 0 }] },
  brief: { concept: "neon night drive", title: "Test Production" },
  costEstimate: { totalCredits: 42, shotCosts: [] },
  assembledUrl: null,
  stateMetadata: {},
  rerunHistory: [],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

const SHOT_ROWS = [
  { id: "shot_000", pipelineId: "p1", index: 0, title: "Opening", status: "completed", plan: {}, imageResult: { url: "/img.png" }, videoResult: null, audioResult: null, error: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  prisma.directorPipeline.findFirst.mockResolvedValue({ ...PIPELINE });
  prisma.directorPipeline.findMany.mockResolvedValue([{ ...PIPELINE }]);
  prisma.directorShot.findMany.mockResolvedValue(SHOT_ROWS.map((s) => ({ ...s })));
});

describe("GET /api/director/status?pipelineId= — reads directorPipeline, not project", () => {
  it("returns the pipeline row plus its DirectorShot rows in the shape DirectorStudio parses", async () => {
    const res = await GET(req("?pipelineId=p1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    const p = body.pipeline;
    expect(p).toBeTruthy();
    expect(p.id).toBe("p1");
    expect(p.status).toBe("planning");
    expect(p.plan).toEqual(PIPELINE.plan);
    expect(p.costEstimate).toEqual(PIPELINE.costEstimate);
    expect(p.brief).toEqual(PIPELINE.brief);
    expect(Array.isArray(p.shots)).toBe(true);
    expect(p.shots[0]).toMatchObject({ id: "shot_000", status: "completed" });

    expect(prisma.directorPipeline.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", userId: "u1" } })
    );
    expect(prisma.directorShot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pipelineId: "p1" }, orderBy: { index: "asc" } })
    );
  });

  it("404s with the envelope when the pipeline does not exist (or belongs to someone else)", async () => {
    prisma.directorPipeline.findFirst.mockResolvedValue(null);

    const res = await GET(req("?pipelineId=nope"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("not_found");
    expect(typeof body.error).toBe("string");
  });
});

describe("GET /api/director/status — list reads directorPipeline", () => {
  it("lists the caller's 20 most recent pipelines", async () => {
    const res = await GET(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.pipelines)).toBe(true);
    expect(body.pipelines[0]).toMatchObject({ id: "p1", title: "Test Production", status: "planning" });

    expect(prisma.directorPipeline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
        take: 20,
      })
    );
  });

  it("401s with the envelope when there is no session", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthorized");
  });
});
