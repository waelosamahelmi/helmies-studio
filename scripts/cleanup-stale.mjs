import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Mark stale pending generations as failed
const result = await prisma.generation.updateMany({
  where: { status: "pending" },
  data: { status: "failed", error: "Stale pending generation (pre-fix), marked as failed" },
});

console.log(`Marked ${result.count} stale pending generations as failed`);

// Also release any credit reservations for those generations
const staleGens = await prisma.generation.findMany({
  where: { status: "failed", error: { startsWith: "Stale pending" } },
  select: { id: true },
});

for (const g of staleGens) {
  try {
    const reservation = await prisma.creditReservation.findFirst({
      where: { generationId: g.id, status: "active" },
    });
    if (reservation) {
      const wallet = await prisma.creditWallet.update({
        where: { id: reservation.walletId },
        data: { reserved: { decrement: reservation.amount }, available: { increment: reservation.amount } },
      });
      await prisma.creditReservation.update({
        where: { id: reservation.id },
        data: { status: "released", releasedAt: new Date() },
      });
      console.log(`  Released ${reservation.amount} credits for gen ${g.id}`);
    }
  } catch (e) {
    console.log(`  No reservation for gen ${g.id}: ${e.message}`);
  }
}

await pool.end();