import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getWallet } from "@/lib/wallet";

async function resolveSession() {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    return session;
  } catch { return null; }
}

export async function getCurrentUser() {
  const session = await resolveSession();
  if (!session?.user?.id) return null;
  return session.user;
}

// Sync the legacy `User.credits` column with the authoritative `CreditWallet`.
// The wallet is the source of truth; `User.credits` is kept as a denormalized
// mirror so existing UI/queries that read `user.credits` keep working.
async function syncUserCreditsFromWallet(userId, tx = prisma) {
  const wallet = await tx.creditWallet.findUnique({ where: { userId } });
  if (!wallet) return 0;
  await tx.user.update({ where: { id: userId }, data: { credits: wallet.available } });
  return wallet.available;
}

export async function getCurrentUserWithCredits() {
  const session = await resolveSession();
  if (!session?.user?.id) return null;
  // Wallet is the source of truth; sync the legacy column then return it.
  const available = await syncUserCreditsFromWallet(session.user.id);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, image: true, credits: true },
  });
  // Ensure the returned credits reflect the wallet even if sync raced.
  if (user) user.credits = available;
  return user;
}

// Debit immediately (synchronous, non-refundable path). For generation jobs that
// may fail, prefer the wallet's reserve/settle flow in lib/wallet.js instead.
export async function debitCredits(userId, amount) {
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet || wallet.available < amount) throw new Error("Insufficient credits");
  const updated = await prisma.creditWallet.update({
    where: { userId },
    data: { available: { decrement: amount }, lifetimeDebited: { increment: amount } },
  });
  // mirror to legacy column
  await prisma.user.update({ where: { id: userId }, data: { credits: updated.available } });
  await prisma.creditTransaction.create({
    data: {
      userId,
      amount: -amount,
      type: "generation",
      description: `Generation cost: ${amount} credits`,
    },
  });
  return true;
}

export async function creditUser(userId, amount, type, description) {
  const wallet = await prisma.creditWallet.upsert({
    where: { userId },
    update: { available: { increment: amount }, lifetimeCredited: { increment: amount } },
    create: { userId, available: amount, lifetimeCredited: amount },
  });
  await prisma.user.update({ where: { id: userId }, data: { credits: wallet.available } });
  await prisma.creditTransaction.create({
    data: { userId, amount, type, description },
  });
}

export async function requireAdmin() {
  const session = await resolveSession();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true },
  });
  if (!user || user.role !== "admin") return null;
  return user;
}
