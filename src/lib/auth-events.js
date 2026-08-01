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

// `db`: pass an already-open transaction client (e.g. from prisma.$transaction)
// to compose provisioning into a caller's own transaction — this is how the
// register route makes "create the user" + "provision it" atomic, so a
// mid-provisioning failure rolls back the User row instead of leaving an
// orphan the client can never re-register (email uniqueness would otherwise
// 409 on retry). Omit it (default null) to run standalone against the
// top-level client — the OAuth events.createUser path does this; grantCredits
// then opens its own transaction internally, matching its pre-existing
// standalone behavior.
export async function provisionNewUser(userId, { firstUserAdmin = false } = {}, db = null) {
  const client = db ?? prisma;
  if (firstUserAdmin) {
    await client.user.update({ where: { id: userId }, data: { role: "admin" } });
  }
  // Subscription.userId is @unique (prisma/schema.prisma) — safe to upsert so
  // a caller that already created the row (or a retry) never double-creates.
  await client.subscription.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "free", status: "active" },
  });
  await grantCredits(userId, SIGNUP_CREDITS, "signup", "Welcome bonus: 100 free credits", null, db);
}
