import prisma from "@/lib/prisma";
import { cookies } from "next/headers";

async function resolveSession() {
  try {
    const store = await cookies();
    const token = store.get("next-auth.session-token")?.value || store.get("__Secure-next-auth.session-token")?.value;
    if (!token) return null;

    const dbSession = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    });

    if (dbSession && dbSession.expires > new Date()) {
      return { user: dbSession.user };
    }
  } catch {}

  return null;
}

export async function getCurrentUser() {
  const session = await resolveSession();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function getCurrentUserWithCredits() {
  const session = await resolveSession();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, image: true, credits: true },
  });
  return user;
}

export async function debitCredits(userId, amount) {
  const result = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  if (result.count === 0) throw new Error("Insufficient credits");
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
  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: amount } },
  });
  await prisma.creditTransaction.create({
    data: { userId, amount, type, description },
  });
}