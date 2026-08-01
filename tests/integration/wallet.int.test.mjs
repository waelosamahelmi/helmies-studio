import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createUserWithWallet } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

describe("reserveCredits under concurrency", () => {
  it("never over-spends: two concurrent 60-credit reserves on a 100-credit wallet → exactly one succeeds", async () => {
    const { reserveCredits } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);

    const results = await Promise.allSettled([
      reserveCredits(user.id, 60, "job-a"),
      reserveCredits(user.id, 60, "job-b"),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(40);
    expect(wallet.reserved).toBe(60);
    expect(wallet.available).toBeGreaterThanOrEqual(0);
  });
});

describe("reserve → settle / release invariants", () => {
  it("settling at less than reserved returns the difference and books the cost row", async () => {
    const { reserveCredits, settleReservation } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    await reserveCredits(user.id, 50, "job-1");
    await settleReservation(user.id, "job-1", 30);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(70); // 100 - 50 + 20 released
    expect(wallet.reserved).toBe(0);

    const rows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "asc" } });
    const movementSum = rows.filter((r) => r.type !== "generation").reduce((s, r) => s + r.amount, 0);
    expect(movementSum).toBe(-30); // net spend relative to opening 100... wallet started with no opening ledger row
    expect(wallet.available).toBe(100 + movementSum);
  });

  it("release restores the full amount and settlement afterwards is a no-op error", async () => {
    const { reserveCredits, releaseReservation, settleReservation } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    await reserveCredits(user.id, 50, "job-2");
    await releaseReservation(user.id, "job-2");

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);
    expect(wallet.reserved).toBe(0);

    await expect(settleReservation(user.id, "job-2", 50)).rejects.toThrow(/No active reservation/);
  });
});

describe("provisionNewUser — signup grants the opening ledger entry (Task 8)", () => {
  it("creates a wallet with a single 'signup' ledger row and a free subscription for a brand-new user", async () => {
    const { provisionNewUser } = await import("@/lib/auth-events");

    const user = await prisma.user.create({
      data: { email: `signup-${randomUUID()}@test.local`, role: "user" },
    });

    // No wallet exists yet — mirrors both signup paths' user.create, which no
    // longer nests a wallet/transactions create.
    expect(await prisma.creditWallet.findUnique({ where: { userId: user.id } })).toBeNull();

    await provisionNewUser(user.id);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);
    expect(wallet.lifetime).toBe(100);

    const rows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "signup", amount: 100, balanceAfter: 100 });

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription).toMatchObject({ userId: user.id, plan: "free", status: "active" });

    // The legacy CreditTransaction table must not receive a signup row —
    // /api/credits reads CreditLedger as of Task 7.
    const legacyRows = await prisma.creditTransaction.findMany({ where: { userId: user.id } });
    expect(legacyRows).toHaveLength(0);
  });

  it("promotes the very first user to admin and still grants exactly one wallet + ledger row", async () => {
    const { provisionNewUser } = await import("@/lib/auth-events");

    const user = await prisma.user.create({
      data: { email: `signup-admin-${randomUUID()}@test.local`, role: "user" },
    });

    await provisionNewUser(user.id, { firstUserAdmin: true });

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated.role).toBe("admin");

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);

    const rows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id } });
    expect(rows).toHaveLength(1);
  });

  it("does not double-create the subscription for a user who already has one (register-route shape)", async () => {
    const { provisionNewUser } = await import("@/lib/auth-events");

    const user = await prisma.user.create({
      data: { email: `signup-presub-${randomUUID()}@test.local`, role: "user" },
    });
    // Pre-existing subscription, e.g. from a retried call — upsert must not throw
    // a unique-constraint violation nor create a second row.
    await prisma.subscription.create({ data: { userId: user.id, plan: "free", status: "active" } });

    await provisionNewUser(user.id);

    const subs = await prisma.subscription.findMany({ where: { userId: user.id } });
    expect(subs).toHaveLength(1);
  });

  it("register-route shape: user.create + provisionNewUser composed in one $transaction still yields exactly one user/wallet/subscription/signup-row on the happy path", async () => {
    const { provisionNewUser } = await import("@/lib/auth-events");
    const email = `atomic-ok-${randomUUID()}@test.local`;

    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, role: "user" } });
      await provisionNewUser(user.id, { firstUserAdmin: false }, tx);
      return user.id;
    });

    expect(await prisma.user.count({ where: { email } })).toBe(1);
    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    expect(wallet.available).toBe(100);
    const rows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "signup", amount: 100, balanceAfter: 100 });
    const subs = await prisma.subscription.findMany({ where: { userId } });
    expect(subs).toHaveLength(1);
  });

  it("register-route shape: a genuine provisioning failure (FK violation) rolls back the user row too — no orphan, email stays retryable", async () => {
    const { provisionNewUser } = await import("@/lib/auth-events");
    const email = `atomic-fail-${randomUUID()}@test.local`;

    await expect(
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, role: "user" } });
        // Force a real provisioning failure: subscription.upsert's create
        // references a userId that doesn't exist, violating the
        // Subscription -> User foreign key (prisma/schema.prisma). This is
        // the same rollback path a real mid-provisioning failure (e.g. a
        // wallet-grant error) would take.
        await provisionNewUser("does-not-exist", { firstUserAdmin: false }, tx);
      })
    ).rejects.toThrow();

    // The user row must not have survived the rollback — retrying the same
    // email must be possible, not blocked by a 409 from an orphaned row.
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });
});

describe("DB CHECK constraints", () => {
  it("the database itself rejects a negative balance", async () => {
    const user = await createUserWithWallet(10);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "public"."CreditWallet" SET "available" = "available" - 50 WHERE "userId" = $1`, user.id
      )
    ).rejects.toThrow(/CreditWallet_available_nonnegative|check constraint/i);
  });
});
