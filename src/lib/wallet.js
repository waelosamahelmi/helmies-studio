// Helmies Studio — Credit Wallet Service
// Per AGENTS.md Phase 12: available+reserved balance, ledger, reservations
//
// Ledger semantics (invariant contract — do not violate):
//   Every CreditLedger row EXCEPT type "generation" moves `available` by
//   exactly `amount` (positive = credit in, negative = debit out). Rows of
//   type "generation" are informational cost records written at reservation
//   settlement — they document what a job actually cost but do NOT themselves
//   move `available` (the settlement math already reconciled `available` via
//   the reservation release delta).
//   Invariants that must hold at all times:
//     available == Σ amount WHERE type != 'generation'   (post-anchor, i.e.
//       from the last balance-defining event such as migration_opening_balance)
//     reserved  == Σ amount of active CreditReservation rows
//
// All mutating operations below accept a trailing `db` parameter: pass an
// already-open transaction client to compose the wallet mutation into a
// caller's own transaction, or omit it to let the function open its own.
// Balance-affecting decrements always use a conditional `updateMany` guarded
// by `available: { gte: … }` so concurrent spends can never drive the
// balance negative, even without a surrounding transaction.

import prisma from "./prisma";

// Run `fn` inside the given client (already a transaction) or a fresh one.
function withDb(db, fn) {
  return db ? fn(db) : prisma.$transaction(fn);
}

// ── Wallet Operations ────────────────────────────────────────

export async function getWallet(userId) {
  let wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) {
    // Migrate from legacy User.credits if no wallet exists
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    wallet = await prisma.creditWallet.create({
      data: { userId, available: user?.credits || 0, reserved: 0, lifetime: user?.credits || 0 },
    });
    if (user?.credits) {
      await addLedgerEntry(userId, user.credits, user.credits, 0, "migration_opening_balance", "Initial balance from legacy credits");
    }
  }
  return wallet;
}

// ── Ledger ───────────────────────────────────────────────────

const LEDGER_TYPES = ["signup", "subscription_grant", "topup", "promo", "reservation", "reservation_release", "generation", "debit", "refund", "admin_adjustment", "migration_opening_balance"];

// Low-level ledger write. CreditLedger columns: walletId, amount, type,
// description, referenceId, balanceAfter. Always goes through the provided
// client so it can participate in the caller's transaction.
function writeLedger(client, walletId, amount, balanceAfter, type, description, referenceId) {
  return client.creditLedger.create({
    data: { walletId, amount, type, description, referenceId: referenceId || null, balanceAfter: balanceAfter || 0 },
  });
}

export async function addLedgerEntry(userId, delta, balanceAfter, reservedAfter, type, description, refType, refId, metadata = {}) {
  if (!LEDGER_TYPES.includes(type)) throw new Error(`Invalid ledger type: ${type}`);
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error(`No credit wallet for user ${userId}`);
  return writeLedger(prisma, wallet.id, delta, balanceAfter, type, description, refId);
}

// ── Reservation ──────────────────────────────────────────────

export async function reserveCredits(userId, amount, jobId, expiresInMinutes = 30, db = null) {
  return withDb(db, async (tx) => {
    const claimed = await tx.creditWallet.updateMany({
      where: { userId, available: { gte: amount } },
      data: { available: { decrement: amount }, reserved: { increment: amount } },
    });
    if (claimed.count === 0) {
      const w = await tx.creditWallet.findUnique({ where: { userId } });
      throw new Error(`Insufficient credits: need ${amount}, have ${w?.available ?? 0}`);
    }
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });

    // CreditReservation columns: walletId, amount, generationId, status.
    // The job id is the Generation id and is stored in generationId.
    const reservation = await tx.creditReservation.create({
      data: { walletId: wallet.id, generationId: jobId, amount, status: "active" },
    });

    await writeLedger(tx, wallet.id, -amount, wallet.available, "reservation", `Reserved for job ${jobId}`, jobId);

    return { wallet, reservation };
  });
}

async function findActiveReservation(tx, userId, jobId) {
  return tx.creditReservation.findFirst({
    where: { wallet: { userId }, generationId: jobId, status: "active" },
  });
}

export async function settleReservation(userId, jobId, actualCredits, db = null) {
  return withDb(db, async (tx) => {
    const reservation = await findActiveReservation(tx, userId, jobId);
    if (!reservation) throw new Error("No active reservation found");

    const release = reservation.amount - actualCredits;
    const wallet = await tx.creditWallet.update({
      where: { userId },
      data: { reserved: { decrement: reservation.amount }, available: { increment: release } },
    });

    await tx.creditReservation.update({
      where: { id: reservation.id },
      data: { status: "settled", releasedAt: new Date() },
    });

    await writeLedger(tx, wallet.id, -actualCredits, wallet.available, "generation", `Generation job ${jobId}`, jobId);

    if (release > 0) {
      await writeLedger(tx, wallet.id, release, wallet.available, "reservation_release", `Unused reservation released for job ${jobId}`, jobId);
    }

    return wallet;
  });
}

export async function releaseReservation(userId, jobId, db = null) {
  return withDb(db, async (tx) => {
    const reservation = await findActiveReservation(tx, userId, jobId);
    if (!reservation) return null;

    const wallet = await tx.creditWallet.update({
      where: { userId },
      data: { reserved: { decrement: reservation.amount }, available: { increment: reservation.amount } },
    });

    await tx.creditReservation.update({
      where: { id: reservation.id },
      data: { status: "released", releasedAt: new Date() },
    });
    await writeLedger(tx, wallet.id, reservation.amount, wallet.available, "reservation_release", `Refund for job ${jobId}`, jobId);

    return wallet;
  });
}

// ── Credit Operations ────────────────────────────────────────

export async function grantCredits(userId, amount, type = "admin_adjustment", description = "Admin credit grant", referenceId = null, db = null) {
  return withDb(db, async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { userId },
      update: { available: { increment: amount }, lifetime: { increment: amount } },
      create: { userId, available: amount, lifetime: amount },
    });
    await writeLedger(tx, wallet.id, amount, wallet.available, type, description, referenceId);
    return wallet;
  });
}

export async function refundCredits(userId, amount, jobId, reason = "Generation refund", db = null) {
  return grantCredits(userId, amount, "refund", `${reason} — job ${jobId}`, null, db);
}

// NEW: atomic direct spend (no reservation). Conditionally decrements
// `available` and writes a "debit" ledger row. Use for immediate,
// non-reserved charges (e.g. agent actions) where there's no preflight
// reserve/settle cycle.
export async function debitWallet(userId, amount, description, referenceId, db = null) {
  return withDb(db, async (tx) => {
    const claimed = await tx.creditWallet.updateMany({
      where: { userId, available: { gte: amount } },
      data: { available: { decrement: amount } },
    });
    if (claimed.count === 0) throw new Error("Insufficient credits");
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    await writeLedger(tx, wallet.id, -amount, wallet.available, "debit", description, referenceId);
    return wallet;
  });
}

// NEW: sets `available` to an absolute target value via a delta
// "admin_adjustment" ledger row, and mirrors the result onto the legacy
// User.credits column. Negative deltas (clamping a balance down) go through
// a conditional update and throw on a race-induced shortfall; positive
// deltas (topping a balance up) are unconditional increments.
export async function adjustWalletTo(userId, targetAvailable, description, adminId = null, db = null) {
  return withDb(db, async (tx) => {
    // Ensure the wallet row exists, then read the authoritative pre-mutation
    // snapshot via a fresh findUnique (upsert's returned row is not a
    // reliable source of the current balance on the update: {} no-op path).
    await tx.creditWallet.upsert({
      where: { userId }, update: {}, create: { userId, available: 0, reserved: 0, lifetime: 0 },
    });
    const before = await tx.creditWallet.findUnique({ where: { userId } });
    const delta = targetAvailable - before.available;
    if (delta === 0) return { wallet: before, delta: 0 };

    // Compare-and-set on the exact snapshot we just read: the WHERE clause
    // pins `available` to `before.available`, not just a `gte` threshold, so
    // a concurrent writer that changes the balance between our read and this
    // write causes the update to match zero rows instead of silently
    // landing the wallet on a stale target. Callers retry on the error.
    const claimed = await tx.creditWallet.updateMany({
      where: { userId, available: before.available },
      data: {
        available: targetAvailable,
        ...(delta > 0 ? { lifetime: { increment: delta } } : {}),
      },
    });
    if (claimed.count === 0) throw new Error("Wallet changed concurrently — retry the adjustment");

    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    await writeLedger(tx, wallet.id, delta, wallet.available,
      "admin_adjustment", `${description}${adminId ? ` (by ${adminId})` : ""}`, null);
    await tx.user.update({ where: { id: userId }, data: { credits: wallet.available } });
    return { wallet, delta };
  });
}

// ── Balance Check ────────────────────────────────────────────

export async function canAfford(userId, amount) {
  const wallet = await getWallet(userId);
  return wallet.available >= amount;
}

// ── Quote Preflight ──────────────────────────────────────────

export async function preflightQuote(userId, estimatedCredits, maximumCredits) {
  const wallet = await getWallet(userId);
  const canAffordEstimated = wallet.available >= estimatedCredits;
  const canAffordMaximum = wallet.available >= maximumCredits;

  return {
    estimatedCredits,
    maximumCredits,
    balance: wallet.available,
    reserved: wallet.reserved,
    balanceAfterEstimated: wallet.available - estimatedCredits,
    balanceAfterMaximum: wallet.available - maximumCredits,
    canAfford: canAffordEstimated,
    canAffordMaximum,
    warnings: !canAffordEstimated ? ["Insufficient credits for estimated cost"] : !canAffordMaximum ? ["Maximum cost exceeds balance"] : [],
  };
}
