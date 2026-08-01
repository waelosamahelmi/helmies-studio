import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || null;

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  console.log(`Seeding admin user: ${email}`);
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Idempotent: never duplicate; never demote. Only refresh credentials/role.
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        role: "admin",
        emailVerified: existing.emailVerified ?? new Date(),
        ...(name ? { name } : {}),
      },
    });
    console.log("  ✓ Existing user updated (passwordHash refreshed, role ensured admin)");
  } else {
    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "admin",
        emailVerified: new Date(),
      },
    });
    console.log("  ✓ Admin user created");
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, plan: "free", status: "active" },
  });
  console.log("  ✓ Free subscription ensured");

  // Ledger-safe grant: creating a wallet with no matching CreditLedger row
  // makes reconcile-credits.mjs report drift on every run (driftAvailable
  // != 0, since the ledger movement sum can never catch up to a balance
  // that was never booked as a ledger entry). This mirrors
  // src/lib/wallet.js's grantCredits(userId, 100, "signup", ...) inline —
  // wallet.js can't be imported directly here because its own `./prisma`
  // import is extensionless, which Node's strict ESM resolver refuses under
  // plain `node` (this script isn't bundled by Next/Vite); see
  // src/lib/reconciliation.js for the same constraint documented in situ.
  // Idempotent like the rest of this script: only grants once, on first
  // creation — a rerun against an already-seeded admin leaves the wallet
  // (and its ledger history) untouched rather than re-granting.
  const existingWallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
  if (!existingWallet) {
    const signupGrant = 100;
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.create({
        data: { userId: user.id, available: signupGrant, lifetime: signupGrant },
      });
      await tx.creditLedger.create({
        data: {
          walletId: wallet.id,
          amount: signupGrant,
          type: "signup",
          description: "Seed admin initial balance",
          balanceAfter: wallet.available,
        },
      });
    });
    console.log(`  ✓ Credit wallet created with signup ledger entry (${signupGrant} credits)`);
  } else {
    console.log("  ✓ Credit wallet already exists (left untouched)");
  }

  console.log("\nDone.");
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  prisma.$disconnect();
  pool.end();
  process.exit(1);
});
