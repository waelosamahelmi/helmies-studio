import { describe, it, expect, vi, beforeEach } from "vitest";

// Both signup paths (credentials /api/auth/register and the OAuth
// events.createUser handler) must provision new accounts through the shared
// src/lib/auth-events.js#provisionNewUser helper, which grants the welcome
// bonus via grantCredits() so it lands as a CreditLedger row (type "signup").
// Neither path should write nested wallet/transactions on user.create, or a
// legacy CreditTransaction row directly — /api/credits reads the ledger
// (Task 7), so a signup provisioned the old way never shows a welcome-bonus
// row in the user's history.
//
// provisionNewUser itself is exercised for real in tests/unit/auth-events.test.mjs
// (this file mocks it as a black box, since vi.mock is hoisted per-file and
// mixing a mocked and a real import of the same module in one file is fragile).

vi.mock("@/lib/prisma", () => {
  const models = {
    user: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    subscription: { upsert: vi.fn(), create: vi.fn() },
  };
  return { default: models };
});

vi.mock("@/lib/auth-events", () => ({
  provisionNewUser: vi.fn(),
  SIGNUP_CREDITS: 100,
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-pw"), compare: vi.fn() },
}));

// auth.js calls NextAuth(config) at module load time; capture the config
// object so events.createUser is reachable without hitting a real provider.
let capturedAuthConfig;
vi.mock("next-auth", () => ({
  default: (config) => {
    capturedAuthConfig = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn(() => ({})) }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }));

import prisma from "@/lib/prisma";
import { provisionNewUser } from "@/lib/auth-events";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register — provisions via the wallet, not nested creates", () => {
  const jsonReq = (body) =>
    new Request("http://test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "new-user-1" });
    provisionNewUser.mockResolvedValue();
  });

  it("creates the user with no nested wallet/transactions/subscriptions, then calls provisionNewUser", async () => {
    prisma.user.count.mockResolvedValue(5); // not the first user
    const { POST } = await import("@/app/api/auth/register/route.js");

    const res = await POST(jsonReq({ email: "fresh@test.local", password: "password123" }));
    expect(res.status).toBe(200);

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data).not.toHaveProperty("wallet");
    expect(createArg.data).not.toHaveProperty("transactions");
    expect(createArg.data).not.toHaveProperty("subscriptions");
    expect(createArg.data.role).toBe("user");

    expect(provisionNewUser).toHaveBeenCalledWith("new-user-1", { firstUserAdmin: false });
  });

  it("first registrant still gets role admin set directly on user.create (unrelated to provisionNewUser's own admin flag)", async () => {
    prisma.user.count.mockResolvedValue(0); // first user ever
    const { POST } = await import("@/app/api/auth/register/route.js");

    const res = await POST(jsonReq({ email: "first@test.local", password: "password123" }));
    expect(res.status).toBe(200);

    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.role).toBe("admin");
    // Role was already set on create; provisionNewUser must not redundantly re-promote.
    expect(provisionNewUser).toHaveBeenCalledWith("new-user-1", { firstUserAdmin: false });
  });
});

describe("auth.js events.createUser — delegates to provisionNewUser", () => {
  it("passes firstUserAdmin: true when this is the 1st user post-creation (userCount === 1)", async () => {
    await import("@/lib/auth.js");
    prisma.user.count.mockResolvedValue(1);
    provisionNewUser.mockResolvedValue();

    await capturedAuthConfig.events.createUser({ user: { id: "oauth-user-1" } });

    expect(provisionNewUser).toHaveBeenCalledWith("oauth-user-1", { firstUserAdmin: true });
  });

  it("passes firstUserAdmin: false for subsequent users (userCount !== 1)", async () => {
    await import("@/lib/auth.js");
    prisma.user.count.mockResolvedValue(4);
    provisionNewUser.mockResolvedValue();

    await capturedAuthConfig.events.createUser({ user: { id: "oauth-user-2" } });

    expect(provisionNewUser).toHaveBeenCalledWith("oauth-user-2", { firstUserAdmin: false });
  });
});
