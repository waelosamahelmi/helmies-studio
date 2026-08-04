import { describe, it, expect, vi, beforeEach } from "vitest";

// E4.1: /api/director/plan/[id] — the first caller of the previously-orphaned
// getProductionPlan/updateProductionPlan pair. GET returns the stored plan;
// PATCH { plan } re-runs cost estimation server-side (never trusting a
// client-sent cost) and refuses edits while the pipeline is executing or
// completed.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/director-planner", () => ({
  getProductionPlan: vi.fn(),
  updateProductionPlan: vi.fn(),
}));

import { getCurrentUser } from "@/lib/session";
import { getProductionPlan, updateProductionPlan } from "@/lib/director-planner";
import { GET, PATCH } from "@/app/api/director/plan/[id]/route.js";

const getReq = () => new Request("http://test/api/director/plan/p1");
const patchReq = (body) =>
  new Request("http://test/api/director/plan/p1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "p1" }) };

const PIPELINE = {
  id: "p1",
  status: "planning",
  plan: { shots: [{ id: "shot_000", index: 0 }] },
  brief: { concept: "x" },
  costEstimate: { totalCredits: 10 },
  validationResults: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  getProductionPlan.mockResolvedValue({ ...PIPELINE });
  updateProductionPlan.mockResolvedValue({
    pipelineId: "p1",
    plan: { shots: [{ id: "shot_000", index: 0 }, { id: "shot_001", index: 1 }] },
    costEstimate: { totalCredits: 20 },
    validation: { allValid: true, results: [] },
    status: "planning",
  });
});

describe("GET /api/director/plan/[id]", () => {
  it("returns the stored pipeline plan, scoped to the caller", async () => {
    const res = await GET(getReq(), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline).toMatchObject({ id: "p1", status: "planning" });
    expect(body.pipeline.plan.shots).toHaveLength(1);
    expect(getProductionPlan).toHaveBeenCalledWith("p1", "u1");
  });

  it("404s with the envelope when the pipeline is missing or another user's", async () => {
    getProductionPlan.mockResolvedValue(null);

    const res = await GET(getReq(), ctx);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
  });

  it("401s with the envelope when there is no session", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await GET(getReq(), ctx);

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthorized");
  });
});

describe("PATCH /api/director/plan/[id]", () => {
  it("applies the edit through updateProductionPlan and returns the recomputed cost + validation", async () => {
    const edited = { shots: [{ id: "shot_000", index: 0 }, { id: "shot_001", index: 1 }] };

    const res = await PATCH(patchReq({ plan: edited }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.shots).toHaveLength(2);
    expect(body.costEstimate).toEqual({ totalCredits: 20 });
    expect(body.validation).toEqual({ allValid: true, results: [] });
    expect(updateProductionPlan).toHaveBeenCalledWith("p1", "u1", edited);
  });

  it("rejects a body with no plan object as invalid_params", async () => {
    const res = await PATCH(patchReq({}), ctx);

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_params");
    expect(updateProductionPlan).not.toHaveBeenCalled();
  });

  it("409s when the pipeline is executing or completed", async () => {
    updateProductionPlan.mockRejectedValue(new Error("Cannot edit plan in current state: executing"));

    const res = await PATCH(patchReq({ plan: { shots: [] } }), ctx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/executing|edited/i);
  });

  it("404s with the envelope when updateProductionPlan reports a missing pipeline", async () => {
    updateProductionPlan.mockRejectedValue(new Error("Pipeline not found"));

    const res = await PATCH(patchReq({ plan: { shots: [] } }), ctx);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
  });
});
