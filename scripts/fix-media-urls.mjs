import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Fix old generation records that have /media/ URLs → /api/media/local/
const result = await prisma.generation.updateMany({
  where: { outputUrl: { startsWith: "/media/" } },
  data: { outputUrl: "PLACEHOLDER" }, // Will fix below with raw SQL
});

// Actually, Prisma doesn't support string replacement in updateMany.
// Let's do it manually.
const gens = await prisma.generation.findMany({
  where: { outputUrl: { startsWith: "/media/" } },
  select: { id: true, outputUrl: true },
});

console.log(`Found ${gens.length} generations with /media/ URLs`);
for (const g of gens) {
  const newUrl = g.outputUrl.replace("/media/", "/api/media/local/");
  await prisma.generation.update({ where: { id: g.id }, data: { outputUrl: newUrl } });
  console.log(`  ${g.id}: ${g.outputUrl} → ${newUrl}`);
}

await pool.end();