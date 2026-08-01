import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

// Builds a wallet through nothing but real src/lib/wallet.js calls — no
// direct CreditWallet/CreditLedger writes — mirroring a real signup +
// generation flow: grant the 100-credit signup bonus, reserve 30 for a job,
// settle it at an actual cost of 20 (releasing the unused 10 back).
async function buildWalletViaRealWalletCalls() {
  const { grantCredits, reserveCredits, settleReservation } = await import("@/lib/wallet");
  const user = await prisma.user.create({
    data: { email: `recon-${randomUUID()}@test.local`, role: "user" },
  });
  await grantCredits(user.id, 100, "signup", "Welcome bonus: 100 free credits");
  await reserveCredits(user.id, 30, "job-1");
  await settleReservation(user.id, "job-1", 20);
  return user;
}

describe("reconcileWallet — the load-bearing invariant proof (Task 12)", () => {
  it("reports ok:true for a wallet built purely through real wallet.js calls (grant 100 -> reserve 30 -> settle 20)", async () => {
    const { reconcileWallet } = await import("@/lib/reconciliation");
    const user = await buildWalletViaRealWalletCalls();

    const report = await reconcileWallet(user.id);

    // The two MONEY invariants (src/lib/wallet.js header) hold exactly —
    // this is what `ok` means and it must be true here.
    expect(report.available).toBe(80); // 100 - 30 + 10 released back on settle
    expect(report.reserved).toBe(0);
    expect(report.ledgerMovementSum).toBe(80);
    expect(report.activeReservationSum).toBe(0);
    expect(report.driftAvailable).toBe(0);
    expect(report.driftReserved).toBe(0);
    expect(report.ok).toBe(true);

    // The legacy User.credits mirror is NOT synced by wallet.js's core
    // mutators (grantCredits/reserveCredits/settleReservation) — only by
    // call-site glue such as session.js's syncUserCreditsFromWallet and
    // generation-handler.js's syncLegacyCredits (see AGENTS.md: "User.credits
    // is a denormalized mirror only"). So it's expected to still read the
    // Prisma schema default (100) here, disagreeing with available (80).
    // That's mirrorStale — informational — and must NOT affect `ok`.
    expect(report.mirrorCredits).toBe(100);
    expect(report.driftMirror).toBe(20);
    expect(report.mirrorStale).toBe(true);
  });
});

describe("anchorWallet --fix path against real Postgres", () => {
  it("detects simulated legacy drift (+15 raw UPDATE) and repairs it via a reconciliation anchor, restoring ok:true", async () => {
    const { reconcileWallet, anchorWallet } = await import("@/lib/reconciliation");
    const user = await buildWalletViaRealWalletCalls();

    // Simulate a legacy drift: inflate `available` directly, bypassing the
    // ledger entirely. The +15 increment stays non-negative so the DB's
    // CHECK constraint (CreditWallet_available_nonnegative) allows it, even
    // though nothing books a matching ledger row — exactly the bug class
    // this feature exists to catch.
    await prisma.$executeRawUnsafe(
      `UPDATE "public"."CreditWallet" SET "available" = "available" + 15 WHERE "userId" = $1`, user.id
    );

    const drifted = await reconcileWallet(user.id);
    expect(drifted.available).toBe(95);
    expect(drifted.driftAvailable).toBe(15);
    expect(drifted.ok).toBe(false);

    const fixResult = await anchorWallet(user.id);
    expect(fixResult.anchored).toBe(true);
    expect(fixResult.amount).toBe(15);

    // The anchor books a ledger row — it never touches the wallet's own
    // available/reserved columns (the wallet stays authoritative).
    const walletAfter = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(walletAfter.available).toBe(95);
    expect(walletAfter.reserved).toBe(0);

    const anchorRow = await prisma.creditLedger.findFirst({
      where: { walletId: walletAfter.id, type: "admin_adjustment", description: "reconciliation anchor" },
    });
    expect(anchorRow).toMatchObject({ amount: 15, type: "admin_adjustment", description: "reconciliation anchor" });

    const repaired = await reconcileWallet(user.id);
    expect(repaired.driftAvailable).toBe(0);
    expect(repaired.driftReserved).toBe(0);
    expect(repaired.ok).toBe(true);
  });
});
