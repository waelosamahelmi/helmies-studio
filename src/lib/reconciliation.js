// Helmies Studio — Wallet/Ledger Reconciliation
//
// Verifies the two MONEY invariants documented at the top of src/lib/wallet.js:
//   available == Σ CreditLedger.amount WHERE type != 'generation'
//   reserved  == Σ CreditReservation.amount WHERE status = 'active'
// reconcileWallet(userId) computes all drifts read-only — it never mutates
// anything — and reports a third, informational value on the legacy mirror
// column: mirrorCredits (User.credits) vs CreditWallet.available.
//
// `ok` vs `mirrorStale` — these are NOT the same kind of thing:
//   ok          = driftAvailable === 0 && driftReserved === 0
//   mirrorStale = driftMirror !== 0
// `ok` covers the two money invariants above — if either is nonzero, real
// credits are unaccounted for and that's a bug to fix. `driftMirror` is
// deliberately excluded from `ok`: per AGENTS.md, "lib/wallet.js is
// authoritative — User.credits is a denormalized mirror only," synced
// opportunistically by call sites (src/lib/session.js's
// syncUserCreditsFromWallet, src/lib/generation-handler.js's
// syncLegacyCredits, etc.) on the next session read or generation
// completion — never by wallet.js's core mutators (grantCredits,
// reserveCredits, settleReservation, releaseReservation, debitWallet). A
// wallet that just had a reservation settled will show mirrorStale: true
// until the user's next session read, and that is expected, not a bug —
// it self-heals. Treating it as `ok: false` would make reconciliation a
// permanent false-positive machine on most active wallets. mirrorCredits/
// driftMirror/mirrorStale are still reported for visibility (a mirror that
// stays stale for a long time can indicate a stuck sync path worth a look),
// they just don't gate `ok` or the reconcile-credits.mjs exit code.
//
// anchorWallet(userId) books a single admin_adjustment CreditLedger row so
// the ledger's movement sum catches up to the wallet's `available` balance
// (the wallet, i.e. CreditWallet.available, is always authoritative — this
// never edits history and never changes available or reserved). It only
// remediates driftAvailable: driftReserved has no ledger-based repair
// (reserved is derived from CreditReservation rows, not booked as a ledger
// delta) and must be investigated by hand if it occurs; driftMirror isn't a
// money invariant at all, so anchorWallet never touches it — it self-heals
// via the normal sync call sites instead.

// Explicit ".js" extension (unlike wallet.js's "./prisma"): this module is
// also imported directly by scripts/reconcile-credits.mjs under plain
// `node` (not bundled by Next/Vite), and Node's strict ESM resolver
// requires relative specifiers to include their extension.
import prisma from "./prisma.js";

export async function reconcileWallet(userId) {
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error(`No credit wallet for user ${userId}`);

  const [ledgerRows, activeReservations, user] = await Promise.all([
    prisma.creditLedger.findMany({ where: { walletId: wallet.id }, select: { amount: true, type: true } }),
    prisma.creditReservation.findMany({ where: { walletId: wallet.id, status: "active" }, select: { amount: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
  ]);

  const ledgerMovementSum = ledgerRows
    .filter((row) => row.type !== "generation")
    .reduce((sum, row) => sum + row.amount, 0);
  const activeReservationSum = activeReservations.reduce((sum, row) => sum + row.amount, 0);
  const mirrorCredits = user?.credits ?? 0;

  const driftAvailable = wallet.available - ledgerMovementSum;
  const driftReserved = wallet.reserved - activeReservationSum;
  const driftMirror = mirrorCredits - wallet.available;

  return {
    userId,
    available: wallet.available,
    reserved: wallet.reserved,
    ledgerMovementSum,
    activeReservationSum,
    mirrorCredits,
    driftAvailable,
    driftReserved,
    driftMirror,
    // Money invariants only — see header. Mirror staleness is informational.
    mirrorStale: driftMirror !== 0,
    ok: driftAvailable === 0 && driftReserved === 0,
  };
}

// Books one admin_adjustment CreditLedger row per drifted wallet so the
// ledger's movement sum matches the wallet's `available` going forward.
// amount === driftAvailable (the exact gap), so the anchor makes
// ledgerMovementSum + amount == available. No-op (anchored: false) when
// driftAvailable is already 0 — including when the wallet still has
// reserved/mirror drift, since neither of those is fixable via a ledger row.
export async function anchorWallet(userId) {
  const report = await reconcileWallet(userId);
  if (report.driftAvailable === 0) return { anchored: false, amount: 0, report };

  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error(`No credit wallet for user ${userId}`);

  await prisma.creditLedger.create({
    data: {
      walletId: wallet.id,
      amount: report.driftAvailable,
      type: "admin_adjustment",
      description: "reconciliation anchor",
      balanceAfter: wallet.available,
    },
  });

  return { anchored: true, amount: report.driftAvailable, report };
}

// Streams a reconcileWallet() report for every wallet in the system,
// cursor-paginated so the whole table is never held in memory at once.
export async function* reconcileAll(batchSize = 100) {
  let cursor;
  for (;;) {
    const wallets = await prisma.creditWallet.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, userId: true },
    });
    if (wallets.length === 0) return;

    for (const w of wallets) {
      yield await reconcileWallet(w.userId);
    }

    if (wallets.length < batchSize) return;
    cursor = wallets[wallets.length - 1].id;
  }
}
