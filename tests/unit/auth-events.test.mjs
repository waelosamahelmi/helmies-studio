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
    expect(grantCredits).toHaveBeenCalledWith("u1", 100, "signup", "Welcome bonus: 100 free credits");
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
