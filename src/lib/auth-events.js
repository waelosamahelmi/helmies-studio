// Shared post-signup provisioning for both signup paths:
//   - the credentials POST /api/auth/register route
//   - the OAuth events.createUser handler in src/lib/auth.js
//
// Both paths must end with exactly one Subscription row, one CreditWallet,
// and one "signup" CreditLedger row — this is the single place that does it,
// so the welcome bonus always lands in the wallet ledger (which is what
// /api/credits reads) rather than a legacy CreditTransaction row.

import prisma from "@/lib/prisma";
import { grantCredits } from "@/lib/wallet";

export const SIGNUP_CREDITS = 100;

export async function provisionNewUser(userId, { firstUserAdmin = false } = {}) {
  if (firstUserAdmin) {
    await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });
  }
  // Subscription.userId is @unique (prisma/schema.prisma) — safe to upsert so
  // a caller that already created the row (or a retry) never double-creates.
  await prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "free", status: "active" },
  });
  await grantCredits(userId, SIGNUP_CREDITS, "signup", "Welcome bonus: 100 free credits");
}
