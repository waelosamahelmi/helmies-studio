import { describe, it, expect, vi, beforeEach } from "vitest";

// Final-review finding: the blanket authzResponse conversion in the route's
// catch block swallowed the "Insufficient credits" business error thrown by
// executeProductionPipeline (director-executor.js:338) into a generic 500
// "Internal error" — a low-balance user clicking Execute got an opaque
// server error instead of the clean 402 that generate/async returns. This
// route must special-case that error into a 402 with the message visible,
// while any other thrown error still falls through to authzResponse's
// generic 500.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/director-executor", () => ({
  executeProductionPipeline: vi.fn(),
}));

import { getCurrentUser } from "@/lib/session";
import { executeProductionPipeline } from "@/lib/director-executor";
import { POST } from "@/app/api/director/execute/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/director/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("POST /api/director/execute — business errors reach the user", () => {
  it("maps an insufficient-credits throw to 402 with the message visible", async () => {
    executeProductionPipeline.mockRejectedValue(
      new Error("Insufficient credits: need 12, have 3")
    );

    const res = await POST(jsonReq({ planId: "p1" }));

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient credits/);
  });

  it("still returns a generic 500 'Internal error' for any other thrown error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    executeProductionPipeline.mockRejectedValue(new Error("DB exploded"));

    const res = await POST(jsonReq({ planId: "p1" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal error" });
    errSpy.mockRestore();
  });
});
