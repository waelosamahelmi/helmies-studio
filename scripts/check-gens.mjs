import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const gens = await prisma.generation.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    userId: true,
    tool: true,
    model: true,
    status: true,
    prompt: true,
    outputUrl: true,
    requestId: true,
    error: true,
    createdAt: true,
  },
});

console.log("=== RECENT GENERATIONS ===");
for (const g of gens) {
  console.log(`\n${g.id} | ${g.status} | ${g.tool}/${g.model}`);
  console.log(`  prompt: ${(g.prompt || "").substring(0, 80)}`);
  console.log(`  requestId: ${g.requestId || "none"}`);
  console.log(`  output: ${g.outputUrl ? g.outputUrl.substring(0, 80) : "NONE"}`);
  console.log(`  error: ${g.error ? g.error.substring(0, 120) : "none"}`);
  console.log(`  created: ${g.createdAt}`);
}

await pool.end();