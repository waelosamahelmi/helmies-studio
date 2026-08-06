import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/assets — the merged library view. 2026-08-06 owner defect: the
// generation merge only ran when type === "all", so the "Video" tab showed
// only uploads — never generated clips. The type filter now applies to the
// generation side of the merge too, through the same kind inference the
// client renders.

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/origin-check", () => ({
  verifyOrigin: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    asset: { findMany: vi.fn() },
    generation: { count: vi.fn(), findMany: vi.fn() },
  },
}));

import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { GET } from "@/app/api/assets/route";

const gen = (id, tool, createdAt) => ({
  id, tool, status: "succeeded", outputUrl: `https://cdn/${id}.mp4`,
  prompt: `prompt ${id}`, model: "m", creditsUsed: 3,
  createdAt: new Date(createdAt || Date.now()),
});

// The real DB applies the route's where clause; the mock must too, or the
// test would assert on rows the production query could never return.
let GEN_ROWS = [];
beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  prisma.asset.findMany.mockResolvedValue([]);
  prisma.generation.count.mockResolvedValue(0);
  prisma.generation.findMany.mockImplementation(async ({ where = {}, take }) => {
    let rows = GEN_ROWS;
    if (where.tool?.in) rows = rows.filter((g) => where.tool.in.includes(g.tool));
    if (where.tool?.notIn) rows = rows.filter((g) => !where.tool.notIn.includes(g.tool));
    return take ? rows.slice(0, take) : rows;
  });
});

const call = (type) => GET(new Request(`http://localhost/api/assets${type ? `?type=${type}` : ""}`));

describe("GET /api/assets — generations merge under EVERY filter (2026-08-06)", () => {
  it("type=video filters the generation query to video-capable tools — generated clips appear in the Video tab", async () => {
    GEN_ROWS = [
      gen("clip-1", "video"),
      gen("clip-2", "i2v"),
      gen("clip-3", "lipsync"),
      gen("song", "music"),
    ];

    const res = await call("video");
    const data = await res.json();

    // The DB-side filter: video kinds only, never audio/image rows.
    expect(prisma.generation.findMany.mock.calls[0][0].where.tool).toEqual({
      in: ["video", "i2v", "v2v", "lipsync", "recast"],
    });
    // What reaches the client is exactly the video-kind rows, asset-shaped.
    expect(data.assets.map((a) => a.id)).toEqual(["gen-clip-1", "gen-clip-2", "gen-clip-3"]);
    expect(data.assets.every((a) => a.type === "video")).toBe(true);
  });

  it("type=image excludes every video/audio tool from the generation query", async () => {
    const res = await call("image");
    expect(res.status).toBe(200);
    const where = prisma.generation.findMany.mock.calls[0][0].where;
    expect(where.tool).toEqual({
      notIn: ["video", "i2v", "v2v", "lipsync", "recast", "audio", "music", "voiceover"],
    });
  });

  it("no type still means every generation is merged", async () => {
    GEN_ROWS = [gen("clip", "video"), gen("still", "image"), gen("song", "music")];

    const res = await call(undefined);
    const data = await res.json();

    expect(prisma.generation.findMany.mock.calls[0][0].where.tool).toBeUndefined();
    const byId = Object.fromEntries(data.assets.map((a) => [a.id, a.type]));
    expect(byId["gen-clip"]).toBe("video");
    expect(byId["gen-still"]).toBe("image");
    expect(byId["gen-song"]).toBe("audio");
  });

  it("uploaded assets of the requested type merge alongside the generations", async () => {
    prisma.asset.findMany.mockResolvedValue([
      { id: "a1", type: "video", source: "upload", url: "https://cdn/u.mp4", createdAt: new Date() },
    ]);
    GEN_ROWS = [gen("clip", "video")];

    const res = await call("video");
    const data = await res.json();

    expect(data.assets.map((a) => a.id).sort()).toEqual(["a1", "gen-clip"]);
    // The upload query itself was typed too.
    expect(prisma.asset.findMany.mock.calls[0][0].where.type).toBe("video");
  });
});
