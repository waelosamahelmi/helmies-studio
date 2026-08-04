import { describe, it, expect, vi, beforeEach } from "vitest";

// Final-review finding: the blanket authzResponse conversion in the route's
// catch block swallowed the "Insufficient credits" business error thrown by
// executeWorkflow (workflows.js:91) into a generic 500 "Internal error" — a
// low-balance user got an opaque server error instead of a clean 402. This
// route must special-case that error into a 402 with the message visible,
// while any other thrown error still falls through to authzResponse's
// generic 500.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/security", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/workflows", () => ({
  executeWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  publishWorkflow: vi.fn(),
}));

import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { executeWorkflow, deleteWorkflow, updateWorkflow } from "@/lib/workflows";
import { POST, DELETE, PATCH } from "@/app/api/workflows/[id]/run/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/workflows/w1/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// Next 15+ hands route handlers a PROMISE for params. Reading `.id` straight
// off it — which is what these handlers used to do — yields undefined, and
// this is the shape that actually reaches them at runtime.
const asyncParams = (id) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/workflows/[id]/run — business errors reach the user", () => {
  it("maps an insufficient-credits throw to 402 with the message visible", async () => {
    executeWorkflow.mockRejectedValue(new Error("Insufficient credits"));

    const res = await POST(jsonReq({ inputs: {} }), { params: { id: "w1" } });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient credits/);
  });

  it("still returns a generic 500 'Internal error' for any other thrown error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    executeWorkflow.mockRejectedValue(new Error("DB exploded"));

    const res = await POST(jsonReq({ inputs: {} }), { params: { id: "w1" } });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ code: "internal" });
    expect(typeof body.error).toBe("string");
    errSpy.mockRestore();
  });
});

// Found by the E5.2 e2e journey, which was the first thing ever to drive
// these three handlers end to end: they read `params.id` directly, but Next
// 15+ hands route handlers a PROMISE for params, so the id was always
// undefined. Prisma drops an undefined field from a where clause rather than
// matching nothing, which turned:
//   POST   → run whichever workflow the user touched most recently
//   PATCH  → write this payload over EVERY workflow the user owns
//   DELETE → delete EVERY workflow the user owns
// The sibling publish route already awaited params; these did not.
describe("workflow routes resolve the id from an async params promise", () => {
  it("POST runs the workflow named in the URL, not whatever Prisma matches first", async () => {
    executeWorkflow.mockResolvedValue({ success: true, outputs: [], stepResults: [] });

    const res = await POST(jsonReq({ inputs: { prompt: "go" } }), asyncParams("wf_123"));

    expect(res.status).toBe(200);
    expect(executeWorkflow).toHaveBeenCalledWith("wf_123", "u1", { prompt: "go" });
  });

  it("PATCH updates only the workflow named in the URL", async () => {
    updateWorkflow.mockResolvedValue({ count: 1 });

    const res = await PATCH(jsonReq({ name: "Renamed" }), asyncParams("wf_123"));

    expect(res.status).toBe(200);
    expect(updateWorkflow).toHaveBeenCalledWith("wf_123", "u1", { name: "Renamed" });
  });

  it("DELETE removes only the workflow named in the URL", async () => {
    deleteWorkflow.mockResolvedValue({ count: 1 });

    const res = await DELETE(jsonReq({}), asyncParams("wf_123"));

    expect(res.status).toBe(200);
    expect(deleteWorkflow).toHaveBeenCalledWith("wf_123", "u1");
  });

  it("refuses outright when the id is missing rather than acting on everything", async () => {
    const res = await DELETE(jsonReq({}), asyncParams(undefined));

    expect(res.status).toBe(400);
    expect(deleteWorkflow).not.toHaveBeenCalled();
  });
});
