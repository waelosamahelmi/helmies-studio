import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });

const deactivated = await p.providerConfig.updateMany({
  where: { name: { in: ["WaveSpeed", "Atlas Cloud"] } },
  data: { isActive: false },
});
const repointed = await p.modelPricing.updateMany({
  where: { providerName: { in: ["WaveSpeed", "Atlas Cloud"] } },
  data: { providerName: "KIE" },
});
const provs = await p.providerConfig.findMany({
  select: { name: true, isActive: true, markup: true },
});
const total = await p.modelPricing.count();
const active = await p.modelPricing.count({ where: { isActive: true } });
const kie = await p.modelPricing.count({ where: { providerName: "KIE", isActive: true } });
const alibaba = await p.modelPricing.count({ where: { providerName: "Alibaba", isActive: true } });
console.log(JSON.stringify({ deactivated: deactivated.count, repointed: repointed.count, provs, total, active, kie, alibaba }, null, 1));
await p.$disconnect();
