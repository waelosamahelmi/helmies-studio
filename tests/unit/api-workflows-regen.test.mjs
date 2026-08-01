import { describe, it, expect, vi, beforeEach } from "vitest";

// Final-review finding: the blanket authzResponse conversion in the route's
// catch block swallowed the "Insufficient credits" business error thrown by
// regenerateStep (workflows.js:182) into a generic 500 "Internal error" — a
// low-balance user got an opaque server error instead of a clean 402. This
// route must special-case that error into a 402 with the message visible,
// while any other thrown error still falls through to authzResponse's
// generic 500.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/security", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/workflows", () => ({
  regenerateStep: vi.fn(),
}));

import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { regenerateStep } from "@/lib/workflows";
import { POST } from "@/app/api/workflows/[id]/regen/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/workflows/w1/regen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/workflows/[id]/regen — business errors reach the user", () => {
  it("maps an insufficient-credits throw to 402 with the message visible", async () => {
    regenerateStep.mockRejectedValue(new Error("Insufficient credits"));

    const res = await POST(jsonReq({ stepIndex: 0, newParams: {} }), { params: { id: "w1" } });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient credits/);
  });

  it("still returns a generic 500 'Internal error' for any other thrown error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    regenerateStep.mockRejectedValue(new Error("DB exploded"));

    const res = await POST(jsonReq({ stepIndex: 0, newParams: {} }), { params: { id: "w1" } });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal error" });
    errSpy.mockRestore();
  });
});
