import { describe, it, expect, vi, beforeEach } from "vitest";

// Task 8 review finding: POST /api/director/rerun passed body.rerunType
// straight through with no validation. director-executor's cost path and
// execution switch disagreed on what an unrecognized rerunType meant (cheap
// average billed, expensive full rerun performed) — an under-charge. The
// route now rejects anything outside VALID_RERUN_TYPES with a 400 before
// rerunShot (which validates the same list defensively) is ever called.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/director-executor", () => ({
  rerunShot: vi.fn(),
  VALID_RERUN_TYPES: ["image", "video", "audio", "full"],
}));

import { getCurrentUser } from "@/lib/session";
import { verifyOrigin } from "@/lib/origin-check";
import { rerunShot } from "@/lib/director-executor";
import { POST } from "@/app/api/director/rerun/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/director/rerun", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  rerunShot.mockResolvedValue({ success: true, result: { shotId: "s1" } });
});

describe("POST /api/director/rerun — rerunType validation", () => {
  it("rejects an unrecognized rerunType with 400 before calling rerunShot", async () => {
    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", rerunType: "bogus" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid rerunType" });
    expect(rerunShot).not.toHaveBeenCalled();
  });

  it("defaults to 'full' when rerunType is omitted", async () => {
    const res = await POST(jsonReq({ planId: "p1", shotId: "s1" }));

    expect(res.status).toBe(200);
    expect(rerunShot).toHaveBeenCalledWith("p1", "u1", "s1", "full");
  });

  it.each(["image", "video", "audio", "full"])("accepts the valid rerunType %s", async (rerunType) => {
    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", rerunType }));

    expect(res.status).toBe(200);
    expect(rerunShot).toHaveBeenCalledWith("p1", "u1", "s1", rerunType);
  });

  it("still enforces auth and origin checks before validating rerunType", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await POST(jsonReq({ planId: "p1", shotId: "s1", rerunType: "bogus" }));

    expect(res.status).toBe(401);
    expect(verifyOrigin).not.toHaveBeenCalled();
    expect(rerunShot).not.toHaveBeenCalled();
  });
});
