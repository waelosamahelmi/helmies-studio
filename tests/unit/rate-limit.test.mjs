import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("@/lib/prisma", () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
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
  it("never puts the raw IP in the query text or its bound parameters", async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 1, windowStart: new Date() }]);
    const ip = "203.0.113.77";

    await checkAnonLimit(ip, "/api/contact", { windowMs: 60000, max: 5 });

    const call = prisma.$queryRawUnsafe.mock.calls[0];
    expect(JSON.stringify(call)).not.toContain(ip);
  });

  it("keys by sha256(salt + ip + ':' + endpoint) as a bound parameter", async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 1, windowStart: new Date() }]);
    const ip = "198.51.100.4";
    const endpoint = "/api/auth/register";

    await checkAnonLimit(ip, endpoint, { windowMs: 60000, max: 5 });

    const [, ...params] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(params).toContain(expectedKey(SALT, ip, endpoint));
  });

  it("falls back to NEXTAUTH_SECRET when RATE_LIMIT_SALT is unset", async () => {
    delete process.env.RATE_LIMIT_SALT;
    process.env.NEXTAUTH_SECRET = "fallback-secret";
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 1, windowStart: new Date() }]);
    const ip = "198.51.100.9";
    const endpoint = "/api/contact";

    await checkAnonLimit(ip, endpoint, { windowMs: 60000, max: 5 });

    const [, ...params] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(params).toContain(expectedKey("fallback-secret", ip, endpoint));
  });
});

describe("checkAnonLimit — single atomic statement (Fix 1: no read-then-write gap)", () => {
  it("issues exactly one $queryRawUnsafe call: an INSERT .. ON CONFLICT .. RETURNING against AnonRateLimit", async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 1, windowStart: new Date() }]);

    await checkAnonLimit("203.0.113.1", "/api/contact", { windowMs: 60000, max: 5 });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, key, now, cutoff] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO "AnonRateLimit"/);
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO UPDATE/);
    expect(sql).toMatch(/RETURNING "count", "windowStart"/);
    expect(typeof key).toBe("string");
    expect(now).toBeInstanceOf(Date);
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff.getTime()).toBeLessThan(now.getTime());
  });

  it("makes no second call — the allow/block decision comes only from the single statement's return value", async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 3, windowStart: new Date() }]);

    const res = await checkAnonLimit("203.0.113.2", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res).toEqual({ allowed: true });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});

describe("checkAnonLimit — allowed/blocked from the returned count", () => {
  it("allows when the returned count is at or below max", async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 5, windowStart: new Date() }]);

    const res = await checkAnonLimit("203.0.113.3", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res).toEqual({ allowed: true });
  });

  it("blocks with a positive retryAfter when the returned count exceeds max", async () => {
    const windowStart = new Date(Date.now() - 10000); // 10s ago; window is 60s -> still fresh
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 6, windowStart }]);

    const res = await checkAnonLimit("203.0.113.5", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBeGreaterThan(0);
  });

  it("handles a stringified windowStart (raw driver rows aren't guaranteed to return Date instances)", async () => {
    const windowStart = new Date(Date.now() - 10000).toISOString();
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 6, windowStart }]);

    const res = await checkAnonLimit("203.0.113.6", "/api/contact", { windowMs: 60000, max: 5 });

    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBeGreaterThan(0);
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
