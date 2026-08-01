import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    rateLimit: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
// checkRateLimit's `ip:` path is a thin delegate onto @/lib/rate-limit
// (Phase 3 Task 4, durable hashed-IP store) — mock it as a black box here;
// its own algorithm is exercised in tests/unit/rate-limit.test.mjs.
vi.mock("@/lib/rate-limit", () => ({ checkAnonLimit: vi.fn() }));

import prisma from "@/lib/prisma";
import { checkAnonLimit } from "@/lib/rate-limit";
import { checkRateLimit } from "@/lib/security";

beforeEach(() => vi.clearAllMocks());

describe("checkRateLimit — anonymous (ip:) keys delegate to checkAnonLimit", () => {
  it("never touches the RateLimit table (which has a User FK)", async () => {
    checkAnonLimit.mockResolvedValue({ allowed: true });

    const res = await checkRateLimit("ip:203.0.113.9", "/api/contact");

    expect(res.allowed).toBe(true);
    expect(prisma.rateLimit.findUnique).not.toHaveBeenCalled();
    expect(prisma.rateLimit.upsert).not.toHaveBeenCalled();
  });

  it("strips the 'ip:' prefix and passes the endpoint's configured window/max", async () => {
    checkAnonLimit.mockResolvedValue({ allowed: true });

    await checkRateLimit("ip:198.51.100.7", "/api/contact");

    // /api/contact is configured in RATE_LIMITS as { window: 600000, max: 5 }
    expect(checkAnonLimit).toHaveBeenCalledWith("198.51.100.7", "/api/contact", {
      windowMs: 600000,
      max: 5,
    });
  });

  it("preserves the { allowed, retryAfter } contract the /api/contact route depends on", async () => {
    checkAnonLimit.mockResolvedValue({ allowed: false, retryAfter: 42 });

    const res = await checkRateLimit("ip:198.51.100.8", "/api/contact");

    expect(res).toEqual({ allowed: false, retryAfter: 42 });
  });

  it("still uses the DB path for real user ids", async () => {
    prisma.rateLimit.findUnique.mockResolvedValue(null);
    prisma.rateLimit.upsert.mockResolvedValue({});

    const r = await checkRateLimit("user_abc", "/api/contact");

    expect(r.allowed).toBe(true);
    expect(prisma.rateLimit.upsert).toHaveBeenCalled();
    expect(checkAnonLimit).not.toHaveBeenCalled();
  });
});
