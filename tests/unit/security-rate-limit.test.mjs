import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    rateLimit: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security";

beforeEach(() => vi.clearAllMocks());

describe("checkRateLimit — anonymous (ip:) keys", () => {
  it("never touches the RateLimit table (which has a User FK)", async () => {
    const res = await checkRateLimit("ip:203.0.113.9", "/api/contact");
    expect(res.allowed).toBe(true);
    expect(prisma.rateLimit.findUnique).not.toHaveBeenCalled();
    expect(prisma.rateLimit.upsert).not.toHaveBeenCalled();
  });

  it("blocks after the configured max within the window", async () => {
    const key = "ip:198.51.100.7"; // unique per test — buckets are module state
    // /api/contact allows 5 per 10 minutes
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(key, "/api/contact");
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, "/api/contact");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("still uses the DB path for real user ids", async () => {
    prisma.rateLimit.findUnique.mockResolvedValue(null);
    prisma.rateLimit.upsert.mockResolvedValue({});
    const r = await checkRateLimit("user_abc", "/api/contact");
    expect(r.allowed).toBe(true);
    expect(prisma.rateLimit.upsert).toHaveBeenCalled();
  });
});
