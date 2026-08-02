// Helmies Studio — E2E direct-DB test helper (Phase 5 Task 2)
//
// A handful of journeys need to inspect or mutate database state the UI
// itself has no one-step path to (draining a wallet to an exact balance,
// minting a dedicated user so a money-mutating test never shares wallet
// state with another test running concurrently). Every export here opens
// its OWN short-lived Prisma client via withTestDb and closes it again —
// same safety guard, and the same "why not import src/lib/prisma.js"
// rationale, as fixtures/seed.mjs's header (Playwright Test's loader
// mis-transpiles src/lib/*.js — see that file for the full explanation).
// Byte-for-byte the same client/adapter construction as seed.mjs.
export const TEST_DATABASE_URL = "postgresql://postgres:test@localhost:55432/test";

const testDbHost = new URL(TEST_DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1"].includes(testDbHost)) {
  throw new Error(`Refusing to touch the E2E database at non-local host "${testDbHost}".`);
}
process.env.DATABASE_URL = TEST_DATABASE_URL;

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { SEED_PASSWORD } from "./seed.mjs";

// Runs `fn(prisma)` against a fresh client + pool, always closing both
// afterwards — a spec must never leak a connection across tests.
export async function withTestDb(fn) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}

// A brand-new, uniquely-emailed, fully-funded user. Money-mutating journeys
// (generate, duplicate submit, insufficient credits, failure refund) each
// get their OWN user rather than sharing Task 1's seeded e2e-user@test.local
// — playwright.config.mjs runs `fullyParallel: true`, so two tests spending
// from the SAME wallet at once would race each other's balance assertions.
// Ledger-safe (mirrors src/lib/wallet.js's grantCredits shape) so
// scripts/reconcile-credits.mjs's invariant holds for these users too.
export async function createIsolatedUser(prisma, { credits = 500, label = "e2e" } = {}) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  // Cost 4, not the real app's 10 (src/app/api/auth/register/route.js,
  // src/lib/auth.js's authorize). These accounts never carry real risk and
  // this repo's bcryptjs is the pure-JS implementation (no native
  // bindings) — under the E2E suite's own concurrent load (several of
  // these created per money-mutating test, run fullyParallel), cost 10
  // here was measurably contributing to the app process's bcrypt queue and
  // causing unrelated requests (including real cost-10 hashes on the
  // actual login/register forms) to queue behind it. bcrypt.compare's cost
  // is read from the hash itself, so the real-form login these users go
  // through afterwards (fixtures/login.mjs) is just as fast to verify —
  // only the disposable test fixture gets cheaper, nothing product-facing.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "user", emailVerified: new Date() },
  });
  const wallet = await prisma.creditWallet.create({
    data: { userId: user.id, available: credits, reserved: 0, lifetime: credits },
  });
  await prisma.creditLedger.create({
    data: {
      walletId: wallet.id,
      amount: credits,
      type: "signup",
      description: "E2E isolated user opening balance",
      balanceAfter: wallet.available,
    },
  });
  return { id: user.id, email, password: SEED_PASSWORD };
}

// Sets a wallet straight to an exact balance for a deterministic
// insufficient-credits scenario. Writes both the wallet (source of truth)
// and the legacy User.credits mirror so a route that reads either sees the
// same number immediately — src/lib/session.js's getCurrentUserWithCredits
// re-syncs from the wallet on every call regardless, but there is no reason
// to leave the mirror stale in the meantime.
export async function setWalletAvailable(prisma, userId, amount) {
  await prisma.creditWallet.update({ where: { userId }, data: { available: amount } });
  await prisma.user.update({ where: { id: userId }, data: { credits: amount } });
}
