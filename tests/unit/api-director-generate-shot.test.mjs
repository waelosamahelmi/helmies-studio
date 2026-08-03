import { describe, it, expect, vi, beforeEach } from "vitest";

// E4.2: POST /api/director/generate-shot — the route in front of
// generateShotAsset. Same envelope/validation/402 conventions as
// /api/director/rerun.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/director-executor", () => ({
  generateShotAsset: vi.fn(),
  VALID_SHOT_ASSET_KINDS: ["image", "video"],
}));

import { getCurrentUser } from "@/lib/session";
import { verifyOrigin } from "@/lib/origin-check";
import { generateShotAsset } from "@/lib/director-executor";
import { POST } from "@/app/api/director/generate-shot/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/director/generate-shot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  generateShotAsset.mockResolvedValue({ shotId: "s1", kind: "image", imageUrl: "/api/media/local/x.png", creditsUsed: 3 });
});

describe("POST /api/director/generate-shot", () => {
  it.each(["image", "video"])("runs a %s generation for the shot and returns the output", async (kind) => {
    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", kind }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result).toMatchObject({ shotId: "s1" });
    expect(generateShotAsset).toHaveBeenCalledWith("p1", "u1", "s1", kind);
  });

  it("rejects an unknown kind with 400 before calling the executor", async () => {
    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", kind: "hologram" }));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("bad_request");
    expect(generateShotAsset).not.toHaveBeenCalled();
  });

  it("rejects a missing planId/shotId with 400", async () => {
    const res = await POST(jsonReq({ kind: "image" }));

    expect(res.status).toBe(400);
    expect(generateShotAsset).not.toHaveBeenCalled();
  });

  it("401s with the envelope when there is no session", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", kind: "image" }));

    expect(res.status).toBe(401);
    expect(verifyOrigin).not.toHaveBeenCalled();
    expect(generateShotAsset).not.toHaveBeenCalled();
  });

  it("maps an insufficient-credits throw to 402 with the message visible", async () => {
    generateShotAsset.mockRejectedValue(new Error("Insufficient credits"));

    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", kind: "image" }));

    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/Insufficient credits/);
  });

  it("still returns a generic 500 internal envelope for any other thrown error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    generateShotAsset.mockRejectedValue(new Error("provider exploded"));

    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", kind: "image" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("provider exploded");
    errSpy.mockRestore();
  });
});
