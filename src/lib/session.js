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
  // getWallet() migrates from legacy User.credits if no wallet exists yet.
  const wallet = await getWallet(userId);
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

