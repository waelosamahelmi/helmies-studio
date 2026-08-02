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

// Explicit ".js" extension (see src/lib/reconciliation.js's header for the
// precedent): this module is also imported transitively by
// scripts/worker.mjs under plain `node` (Phase 4A Task 4, via
// src/lib/job-runner.js) — Node's strict ESM resolver requires relative
// specifiers to include their extension; the extensionless form only works
// when bundled by Next/Vite.
import prisma from "./prisma.js";

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

    // CreditReservation columns: walletId, amount, generationId, status,
    // expiresAt. The job id is the Generation id and is stored in
    // generationId. expiresAt lets sweepExpiredReservations (below) release
    // or settle a hold whose caller never came back to close it out.
    const reservation = await tx.creditReservation.create({
      data: {
        walletId: wallet.id,
        generationId: jobId,
        amount,
        status: "active",
        expiresAt: new Date(Date.now() + expiresInMinutes * 60000),
      },
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

    // Clamp: actualCredits is the generation's reported cost and should never
    // exceed what was reserved for it, but a charge above the reservation
    // would move `available` below what the ledger tracks — clamp
    // defensively and flag it, since it means the estimate/reservation was
    // wrong somewhere upstream.
    const charge = Math.min(actualCredits, reservation.amount);
    if (charge < actualCredits) {
      console.warn(
        `settleReservation: clamping charge for job ${jobId} — actualCredits ${actualCredits} exceeds reservation ${reservation.amount}`
      );
    }
    const release = reservation.amount - charge;

    // Conditional status flip is the concurrency gate: only one of two
    // overlapping settle/release calls on the same reservation can move it
    // out of "active". The loser gets count 0 here and throws before
    // touching the wallet — sweepExpiredReservations' per-item try/catch
    // (and any caller racing a webhook against the sweep) relies on this.
    const claimed = await tx.creditReservation.updateMany({
      where: { id: reservation.id, status: "active" },
      data: { status: "settled", releasedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error("No active reservation found");

    const wallet = await tx.creditWallet.update({
      where: { userId },
      data: { reserved: { decrement: reservation.amount }, available: { increment: release } },
    });

    await writeLedger(tx, wallet.id, -charge, wallet.available, "generation", `Generation job ${jobId}`, jobId);

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

    // Same conditional-transition concurrency gate as settleReservation
    // above — a second caller that raced past the read above and lost the
    // status flip gets count 0 and throws instead of double-releasing.
    const claimed = await tx.creditReservation.updateMany({
      where: { id: reservation.id, status: "active" },
      data: { status: "released", releasedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error("No active reservation found");

    const wallet = await tx.creditWallet.update({
      where: { userId },
      data: { reserved: { decrement: reservation.amount }, available: { increment: reservation.amount } },
    });

    await writeLedger(tx, wallet.id, reservation.amount, wallet.available, "reservation_release", `Refund for job ${jobId}`, jobId);

    return wallet;
  });
}

// A reservation is only ever created with an amount that was already
// deducted from `available` (see reserveCredits above) — every branch below
// resolves that hold one way or another so `reserved` cannot leak.
const RESERVATION_TERMINAL_STATUSES = ["failed", "cancelled"];

// Reservations created before expiresAt existed (pre-Phase-3-Task-9) have it
// NULL. A migration (20260801150000) backfills those to createdAt + 30
// minutes, matching reserveCredits' own default expiresInMinutes — but the
// sweep must not depend on every database having run that backfill: SQL
// comparisons against NULL are UNKNOWN, so `expiresAt: { lt: now }` alone
// silently excludes (not even counts) any row where expiresAt is still NULL,
// stranding it forever. Matching NULL rows directly against the same 30
// minute cutoff here means a legacy reservation can never be permanently
// invisible to the sweep even on a database where the backfill was missed.
const LEGACY_RESERVATION_TTL_MINUTES = 30;

// Find reservations whose expiresAt has passed and are still "active", then
// resolve each one against the state of whatever the reservation's key
// (CreditReservation.generationId — an overloaded field name; see the
// per-branch comments) actually names:
//   - a TemplateRun (Phase 6 — src/lib/template-runner.js reserves once per
//     run, keyed by the run's OWN id, not any Generation's) —
//       running                -> leave it alone; the run is genuinely
//                                  still in progress, however long the
//                                  clock says it's been (see the CRITICAL-2
//                                  fix note below)
//       completed               -> settle at the run's quoted total
//                                  (defensive only — advanceTemplateRun
//                                  already settles a completed run, which
//                                  flips the reservation out of "active"
//                                  and off this query entirely; only
//                                  reachable if that settle itself failed)
//       failed/cancelled/other  -> release
//   - a Generation (every other reservation) —
//       missing, failed, or cancelled -> release the hold
//       completed                     -> settle at its actual cost
//         (settleReservation's active-reservation lookup makes this
//         idempotent against a second sweep or a late webhook racing this
//         run)
//       still pending/processing      -> leave it alone; it hasn't really
//         finished yet even though the clock ran out
//
// CRITICAL-2 FIX (found in review, proven against the real test DB): before
// this function checked TemplateRun at all, a template run's reservation —
// keyed by the run's id, which matches no Generation row — always fell into
// the "generation missing -> release" branch the instant its TTL lapsed,
// even while the run was still genuinely mid-flight. That released hold
// then got refunded a SECOND time when the run's own advanceTemplateRun
// later failed or settled it for real, minting credits out of nothing
// (reconcileWallet cannot see this: it only compares ledger movements
// against the wallet's own `available`/`reserved` columns, and the extra
// refund IS a real ledger row — the invariant it checks held; the SECOND
// grant was still there). The TemplateRun lookup must happen before the
// Generation lookup, and "running" must be treated as genuinely not-yet-
// resolvable regardless of how long ago expiresAt passed — sizing the TTL
// generously (template-runner.js's reservationTTLMinutes) makes this rare,
// but this check is what actually prevents the double-grant if the TTL
// estimate is ever wrong, not the TTL sizing itself.
//
// Each reservation is handled in its own try/catch so one bad row (a
// transient DB error, a wallet CAS miss) can't abort the rest of the sweep —
// same defensive shape as autoSuspendAbusiveUsers above.
export async function sweepExpiredReservations() {
  const now = new Date();
  const legacyCutoff = new Date(now.getTime() - LEGACY_RESERVATION_TTL_MINUTES * 60000);
  const expired = await prisma.creditReservation.findMany({
    where: {
      status: "active",
      OR: [
        { expiresAt: { lt: now } },
        { expiresAt: null, createdAt: { lt: legacyCutoff } },
      ],
    },
    include: { wallet: true },
  });

  let released = 0;
  let settled = 0;
  let skipped = 0;

  for (const reservation of expired) {
    try {
      const userId = reservation.wallet.userId;
      const jobId = reservation.generationId;

      const templateRun = jobId ? await prisma.templateRun.findUnique({ where: { id: jobId } }) : null;

      if (templateRun) {
        if (templateRun.status === "running") {
          skipped++;
        } else if (templateRun.status === "completed") {
          await settleReservation(userId, jobId, templateRun.totalCredits);
          settled++;
        } else {
          await releaseReservation(userId, jobId);
          released++;
        }
        continue;
      }

      const generation = jobId
        ? await prisma.generation.findUnique({ where: { id: jobId } })
        : null;

      if (!generation || RESERVATION_TERMINAL_STATUSES.includes(generation.status)) {
        await releaseReservation(userId, jobId);
        released++;
      } else if (generation.status === "completed") {
        await settleReservation(userId, jobId, generation.creditsUsed);
        settled++;
      } else {
        // Still pending/processing — expired-but-live, leave it for the
        // next sweep once the generation actually finishes.
        skipped++;
      }
    } catch (err) {
      console.error(`sweepExpiredReservations: failed to process reservation ${reservation.id}:`, err);
      skipped++;
    }
  }

  return { released, settled, skipped };
}

// ── Credit Operations ────────────────────────────────────────

export async function grantCredits(userId, amount, type = "admin_adjustment", description = "Admin credit grant", referenceId = null, db = null) {
  if (!LEDGER_TYPES.includes(type)) throw new Error(`Invalid ledger type: ${type}`);
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
