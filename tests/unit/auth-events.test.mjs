import { describe, it, expect, vi, beforeEach } from "vitest";

// provisionNewUser (src/lib/auth-events.js) is the single place that provisions
// a new account for both signup paths: it upserts the free Subscription and
// grants the welcome bonus through the wallet ledger (grantCredits), never a
// legacy CreditTransaction row. See tests/unit/signup-ledger.test.mjs for the
// black-box tests of the two call sites (register route + auth.js event).

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { update: vi.fn() },
    subscription: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/wallet", () => ({
  grantCredits: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { grantCredits } from "@/lib/wallet";
import { provisionNewUser, SIGNUP_CREDITS } from "@/lib/auth-events";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.subscription.upsert.mockResolvedValue({});
  prisma.user.update.mockResolvedValue({});
  grantCredits.mockResolvedValue({});
});

describe("provisionNewUser", () => {
  it("exposes SIGNUP_CREDITS as 100", () => {
    expect(SIGNUP_CREDITS).toBe(100);
  });

  it("upserts the free subscription and grants the wallet signup ledger entry; skips role update by default", async () => {
    await provisionNewUser("u1");

    expect(prisma.subscription.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      update: {},
      create: { userId: "u1", plan: "free", status: "active" },
    });
    // referenceId is always null for a signup grant; db is null here because
    // no tx client was passed — grantCredits opens its own transaction.
    expect(grantCredits).toHaveBeenCalledWith("u1", 100, "signup", "Welcome bonus: 100 free credits", null, null);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("promotes the user to admin first when firstUserAdmin is true", async () => {
    await provisionNewUser("u1", { firstUserAdmin: true });

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "admin" } });
    expect(prisma.subscription.upsert).toHaveBeenCalled();
    expect(grantCredits).toHaveBeenCalled();
  });

  it("does not promote to admin when firstUserAdmin is omitted (defaults false)", async () => {
    await provisionNewUser("u2", {});
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("provisionNewUser — tx composability (trailing db param)", () => {
  it("routes every write through the provided tx client, not the top-level prisma client", async () => {
    const tx = {
      user: { update: vi.fn().mockResolvedValue({}) },
      subscription: { upsert: vi.fn().mockResolvedValue({}) },
    };

    await provisionNewUser("u1", { firstUserAdmin: true }, tx);

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "admin" } });
    expect(tx.subscription.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      update: {},
      create: { userId: "u1", plan: "free", status: "active" },
    });
    // The top-level (non-tx) client must never be touched when a tx is supplied.
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    // grantCredits is tx-composable (src/lib/wallet.js withDb) — passing the
    // tx through as its trailing db arg makes the wallet grant part of the
    // same transaction instead of opening a nested one.
    expect(grantCredits).toHaveBeenCalledWith("u1", 100, "signup", "Welcome bonus: 100 free credits", null, tx);
  });
});
