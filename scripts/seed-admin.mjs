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

  await prisma.creditWallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, available: 100, lifetime: 100 },
  });
  console.log("  ✓ Credit wallet ensured");

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
