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
import { executeWorkflow } from "@/lib/workflows";
import { POST } from "@/app/api/workflows/[id]/run/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/workflows/w1/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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
    expect(body).toEqual({ error: "Internal error" });
    errSpy.mockRestore();
  });
});
