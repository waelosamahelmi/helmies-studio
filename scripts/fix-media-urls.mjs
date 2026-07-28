import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Fix records that got set to PLACEHOLDER by the earlier bad updateMany
const gens = await prisma.generation.findMany({
  where: { outputUrl: "PLACEHOLDER" },
  select: { id: true, outputUrl: true },
});

console.log(`Found ${gens.length} generations with PLACEHOLDER`);
for (const g of gens) {
  // We know the file is f6ef5c6e3f5da5c4-f62f1c2e.jpg (the only completed gen)
  await prisma.generation.update({
    where: { id: g.id },
    data: { outputUrl: "/api/media/local/f6ef5c6e3f5da5c4-f62f1c2e.jpg" },
  });
  console.log(`  Fixed PLACEHOLDER: ${g.id}`);
}

// Also check if there are any /media/ ones left
const mediaGens = await prisma.generation.findMany({
  where: { outputUrl: { startsWith: "/media/" } },
  select: { id: true, outputUrl: true },
});
console.log(`\nFound ${mediaGens.length} generations with /media/ URLs`);
for (const g of mediaGens) {
  const newUrl = g.outputUrl.replace("/media/", "/api/media/local/");
  await prisma.generation.update({ where: { id: g.id }, data: { outputUrl: newUrl } });
  console.log(`  Fixed /media/: ${g.id}: → ${newUrl}`);
}

await pool.end();