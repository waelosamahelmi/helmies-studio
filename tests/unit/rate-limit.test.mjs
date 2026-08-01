import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("@/lib/prisma", () => ({
  default: {
    anonRateLimit: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { checkAnonLimit, clientIp } from "@/lib/rate-limit";

const SALT = "unit-test-salt";

function expectedKey(salt, ip, endpoint) {
  return crypto.createHash("sha256").update(`${salt}${ip}:${endpoint}`).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RATE_LIMIT_SALT = SALT;
  delete process.env.NEXTAUTH_SECRET;
});

describe("checkAnonLimit — key hashing (privacy contract §4.4)", () => {
  it("never puts the raw IP in any prisma call argument", async () => {
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 1 });
    const ip = "203.0.113.77";

    await checkAnonLimit(ip, "/api/contact", { windowMs: 60000, max: 5 });

    const allCalls = JSON.stringify([
      ...prisma.anonRateLimit.updateMany.mock.calls,
      ...prisma.anonRateLimit.findUnique.mock.calls,
      ...prisma.anonRateLimit.upsert.mock.calls,
    ]);
    expect(allCalls).not.toContain(ip);
  });

  it("keys by sha256(salt + ip + ':' + endpoint)", async () => {
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 1 });
    const ip = "198.51.100.4";
    const endpoint = "/api/auth/register";

    await checkAnonLimit(ip, endpoint, { windowMs: 60000, max: 5 });

    const arg = prisma.anonRateLimit.updateMany.mock.calls[0][0];
    expect(arg.where.key).toBe(expectedKey(SALT, ip, endpoint));
  });

  it("falls back to NEXTAUTH_SECRET when RATE_LIMIT_SALT is unset", async () => {
    delete process.env.RATE_LIMIT_SALT;
    process.env.NEXTAUTH_SECRET = "fallback-secret";
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 1 });
    const ip = "198.51.100.9";
    const endpoint = "/api/contact";

    await checkAnonLimit(ip, endpoint, { windowMs: 60000, max: 5 });

    const arg = prisma.anonRateLimit.updateMany.mock.calls[0][0];
    expect(arg.where.key).toBe(expectedKey("fallback-secret", ip, endpoint));
  });
});

describe("checkAnonLimit — increment-first shape", () => {
  it("tries an atomic updateMany first: count:{lt:max}, windowStart:{gte:cutoff}, increment data", async () => {
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 1 });

    await checkAnonLimit("203.0.113.1", "/api/contact", { windowMs: 60000, max: 5 });

    expect(prisma.anonRateLimit.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.anonRateLimit.updateMany.mock.calls[0][0];
    expect(arg.where.count).toEqual({ lt: 5 });
    expect(arg.where.windowStart.gte).toBeInstanceOf(Date);
    expect(arg.data).toEqual({ count: { increment: 1 } });
  });

  it("when the atomic increment lands (count===1), it is allowed and never reads or upserts", async () => {
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 1 });

    const res = await checkAnonLimit("203.0.113.2", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res).toEqual({ allowed: true });
    expect(prisma.anonRateLimit.findUnique).not.toHaveBeenCalled();
    expect(prisma.anonRateLimit.upsert).not.toHaveBeenCalled();
  });
});

describe("checkAnonLimit — stale window reset", () => {
  it("resets (count:1, windowStart:now) when no row exists yet", async () => {
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 0 });
    prisma.anonRateLimit.findUnique.mockResolvedValue(null);
    prisma.anonRateLimit.upsert.mockResolvedValue({});

    const res = await checkAnonLimit("203.0.113.3", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res.allowed).toBe(true);
    expect(prisma.anonRateLimit.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.anonRateLimit.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ key: expect.any(String) });
    expect(arg.create).toMatchObject({ count: 1 });
    expect(arg.update).toMatchObject({ count: 1 });
    expect(arg.create.windowStart).toBeInstanceOf(Date);
  });

  it("resets when the existing row's window has gone stale", async () => {
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 0 });
    prisma.anonRateLimit.findUnique.mockResolvedValue({
      key: "irrelevant-in-this-test",
      count: 5,
      windowStart: new Date(Date.now() - 120000), // 2 min ago; window is 60s
    });
    prisma.anonRateLimit.upsert.mockResolvedValue({});

    const res = await checkAnonLimit("203.0.113.4", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res.allowed).toBe(true);
    expect(prisma.anonRateLimit.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("checkAnonLimit — max block", () => {
  it("blocks with a positive retryAfter when the window is fresh and already at max", async () => {
    prisma.anonRateLimit.updateMany.mockResolvedValue({ count: 0 });
    const windowStart = new Date(Date.now() - 10000); // 10s ago; window is 60s -> still fresh
    prisma.anonRateLimit.findUnique.mockResolvedValue({
      key: "irrelevant-in-this-test",
      count: 5,
      windowStart,
    });

    const res = await checkAnonLimit("203.0.113.5", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBeGreaterThan(0);
    expect(prisma.anonRateLimit.upsert).not.toHaveBeenCalled();
  });
});

describe("clientIp", () => {
  function req(headers) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { headers: { get: (name) => lower[name.toLowerCase()] ?? null } };
  }

  it("prefers x-real-ip over x-forwarded-for (nginx sets it on this deployment)", () => {
    const r = req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientIp(r)).toBe("9.9.9.9");
  });

  it("falls back to the first x-forwarded-for hop when x-real-ip is absent", () => {
    const r = req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientIp(r)).toBe("1.1.1.1");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const r = req({});
    expect(clientIp(r)).toBe("unknown");
  });
});
