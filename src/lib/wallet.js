// Helmies Studio — Credit Wallet Service
// Per AGENTS.md Phase 12: available+reserved balance, ledger, reservations

import { prisma } from "./prisma";

// ── Wallet Operations ────────────────────────────────────────

export async function getWallet(userId) {
  let wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) {
    // Migrate from legacy User.credits if no wallet exists
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    wallet = await prisma.creditWallet.create({
      data: { userId, available: user?.credits || 0, reserved: 0, lifetimeCredited: user?.credits || 0, lifetimeDebited: 0 },
    });
    if (user?.credits) {
      await addLedgerEntry(userId, user.credits, user.credits, 0, "migration_opening_balance", "Initial balance from legacy credits");
    }
  }
  return wallet;
}

// ── Ledger ───────────────────────────────────────────────────

const LEDGER_TYPES = ["signup", "subscription_grant", "topup", "promo", "reservation", "reservation_release", "generation", "refund", "admin_adjustment"];

export async function addLedgerEntry(userId, delta, balanceAfter, reservedAfter, type, description, refType, refId, metadata = {}) {
  if (!LEDGER_TYPES.includes(type)) throw new Error(`Invalid ledger type: ${type}`);
  return prisma.creditLedger.create({
    data: { userId, delta, balanceAfter: balanceAfter || 0, reservedAfter: reservedAfter || 0, type, description, referenceType: refType, referenceId: refId, metadata },
  });
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

    const reservation = await tx.creditReservation.create({
      data: { userId, jobId, amount, status: "active", expiresAt: new Date(Date.now() + expiresInMinutes * 60000) },
    });

    await addLedgerEntry(userId, -amount, updated.available, updated.reserved, "reservation", `Reserved for job ${jobId}`, "job", jobId);

    return { wallet: updated, reservation };
  });
}

export async function settleReservation(userId, jobId, actualCredits) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.creditReservation.findUnique({ where: { jobId } });
    if (!reservation || reservation.status !== "active") throw new Error("No active reservation found");

    const release = reservation.amount - actualCredits;
    const wallet = await tx.creditWallet.update({
      where: { userId },
      data: { reserved: { decrement: reservation.amount }, available: { increment: release }, lifetimeDebited: { increment: actualCredits } },
    });

    await tx.creditReservation.update({ where: { jobId }, data: { status: "settled", settledAt: new Date() } });

    await addLedgerEntry(userId, -actualCredits, wallet.available, wallet.reserved, "generation", `Generation job ${jobId}`, "job", jobId);

    if (release > 0) {
      await addLedgerEntry(userId, release, wallet.available, wallet.reserved, "reservation_release", `Unused reservation released for job ${jobId}`, "job", jobId);
    }

    return wallet;
  });
}

export async function releaseReservation(userId, jobId) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.creditReservation.findUnique({ where: { jobId } });
    if (!reservation || reservation.status !== "active") return null;

    const wallet = await tx.creditWallet.update({
      where: { userId },
      data: { reserved: { decrement: reservation.amount }, available: { increment: reservation.amount } },
    });

    await tx.creditReservation.update({ where: { jobId }, data: { status: "released", settledAt: new Date() } });
    await addLedgerEntry(userId, reservation.amount, wallet.available, wallet.reserved, "reservation_release", `Refund for job ${jobId}`, "job", jobId);

    return wallet;
  });
}

// ── Credit Operations ────────────────────────────────────────

export async function grantCredits(userId, amount, type = "admin_adjustment", description = "Admin credit grant") {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { userId },
      update: { available: { increment: amount }, lifetimeCredited: { increment: amount } },
      create: { userId, available: amount, lifetimeCredited: amount },
    });
    await addLedgerEntry(userId, amount, wallet.available, wallet.reserved, type, description);
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
