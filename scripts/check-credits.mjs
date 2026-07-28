import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const users = await prisma.user.findMany({
  select: { id: true, email: true, name: true, credits: true, createdAt: true },
  orderBy: { createdAt: "desc" },
  take: 10,
});
console.log("=== USERS ===");
console.log(JSON.stringify(users, null, 2));

for (const u of users) {
  const wallet = await prisma.creditWallet.findUnique({ where: { userId: u.id } });
  const txs = await prisma.creditTransaction.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { amount: true, type: true, description: true, createdAt: true },
  });
  console.log(`\n=== ${u.email} ===`);
  console.log("User.credits:", u.credits);
  console.log("Wallet:", JSON.stringify(wallet));
  console.log("Recent txs:", JSON.stringify(txs, null, 2));
}

await pool.end();