// Helmies Studio — Credit Wallet Service
// Per AGENTS.md Phase 12: available+reserved balance, ledger, reservations

import prisma from "./prisma";

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

const LEDGER_TYPES = ["signup", "subscription_grant", "topup", "promo", "reservation", "reservation_release", "generation", "refund", "admin_adjustment", "migration_opening_balance"];

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

export async function reserveCredits(userId, amount, jobId, expiresInMinutes = 30) {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    if (!wallet || wallet.available < amount) throw new Error(`Insufficient credits: need ${amount}, have ${wallet?.available || 0}`);

    const updated = await tx.creditWallet.update({
      where: { userId },
      data: { available: { decrement: amount }, reserved: { increment: amount } },
    });

    // CreditReservation columns: walletId, amount, generationId, status.
    // The job id is the Generation id and is stored in generationId.
    const reservation = await tx.creditReservation.create({
      data: { walletId: wallet.id, generationId: jobId, amount, status: "active" },
    });

    await writeLedger(tx, wallet.id, -amount, updated.available, "reservation", `Reserved for job ${jobId}`, jobId);

    return { wallet: updated, reservation };
  });
}

async function findActiveReservation(tx, userId, jobId) {
  return tx.creditReservation.findFirst({
    where: { wallet: { userId }, generationId: jobId, status: "active" },
  });
}

export async function settleReservation(userId, jobId, actualCredits) {
  return prisma.$transaction(async (tx) => {
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

export async function releaseReservation(userId, jobId) {
  return prisma.$transaction(async (tx) => {
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

export async function grantCredits(userId, amount, type = "admin_adjustment", description = "Admin credit grant", referenceId = null) {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { userId },
      update: { available: { increment: amount }, lifetime: { increment: amount } },
      create: { userId, available: amount, lifetime: amount },
    });
    await writeLedger(tx, wallet.id, amount, wallet.available, type, description, referenceId);
    return wallet;
  });
}

export async function refundCredits(userId, amount, jobId, reason = "Generation refund") {
  return grantCredits(userId, amount, "refund", `${reason} — job ${jobId}`);
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
