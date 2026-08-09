import { describe, it, expect, vi, beforeEach } from "vitest";

const created = [];
const breakdowns = [];
let scenes = [];

vi.mock("../../src/lib/prisma.js", () => ({
  default: { studioEntity: { updateMany: vi.fn(async () => ({ count: 2 })) } },
}));
vi.mock("../../src/lib/projects.js", () => ({
  createProject: vi.fn(async (userId, body) => {
    const row = { id: "proj_1", name: body.name, brief: body.brief, userId };
    created.push({ userId, body });
    return row;
  }),
  listScenes: vi.fn(async () => scenes),
  normalizeSettings: (s) => ({ kind: "movie", aspectRatio: "16:9", ...s }),
}));
vi.mock("../../src/lib/screenplay-breakdown.js", () => ({
  runBreakdown: vi.fn(async (args) => { breakdowns.push(args); }),
}));

const SCRIPT = `INT. BEDROOM - NIGHT

WAEL lies awake, staring at the ceiling. The clock reads 3:14.

WAEL
Not tonight.

He rises, crosses to the window, and looks out at the beam of light.

WILL (O.S.)
You always say that.`;

const load = async () => (await import("../../src/lib/production-step.js")).runProductionStep;

describe("the production step", () => {
  beforeEach(() => {
    vi.resetModules();
    created.length = 0;
    breakdowns.length = 0;
    scenes = [{ shots: 4, seconds: 22 }, { shots: 6, seconds: 31 }];
  });

  it("builds a project from the screenplay and reads it into scenes", async () => {
    const run = await load();
    const out = await run({ title: "Two Lives", screenplay: SCRIPT, entityIds: ["e1", "e2"] }, { userId: "u1" });
    expect(created[0].body.brief).toBe(SCRIPT);
    expect(breakdowns[0]).toMatchObject({ projectId: "proj_1", userId: "u1", replace: true });
    expect(out).toMatchObject({ projectId: "proj_1", scenes: 2, shots: 10 });
  });

  it("REFUSES a summary — reading one invents the whole shot list", async () => {
    const run = await load();
    await expect(run({ title: "x", screenplay: "A film about a man in a room." }, { userId: "u1" }))
      .rejects.toThrow(/actual screenplay/i);
  });

  it("refuses to build a production for nobody", async () => {
    const run = await load();
    await expect(run({ screenplay: SCRIPT }, {})).rejects.toThrow(/belong to somebody/i);
  });

  it("says plainly that nothing has been rendered", async () => {
    // The difference between "your film is made" and "your film is ready to
    // shoot" is several hundred credits, and the plan card shows this text.
    const run = await load();
    const out = await run({ title: "Two Lives", screenplay: SCRIPT }, { userId: "u1" });
    expect(out.summary).toMatch(/Nothing has been rendered yet/);
  });

  it("fails loudly when the read produced no scenes", async () => {
    scenes = [];
    const run = await load();
    await expect(run({ title: "x", screenplay: SCRIPT }, { userId: "u1" })).rejects.toThrow(/no scenes/i);
  });
});
