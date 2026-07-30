// Seed pre-built templates into the database
// Usage: node scripts/seed-templates.mjs

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { TEMPLATE_SEEDS } from "../src/lib/template-seed.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(`Seeding ${TEMPLATE_SEEDS.length} templates...`);

  for (const tpl of TEMPLATE_SEEDS) {
    const existing = await prisma.template.findUnique({
      where: { slug: tpl.slug },
    });

    if (existing) {
      // Update existing (idempotent — preserves id, purchases, timestamps)
      await prisma.template.update({
        where: { slug: tpl.slug },
        data: {
          name: tpl.name,
          description: tpl.description,
          thumbnailUrl: tpl.thumbnailUrl,
          category: tpl.category,
          toolType: tpl.toolType,
          pricingModel: tpl.pricingModel,
          oneTimePrice: tpl.oneTimePrice,
          stripePriceId: tpl.stripePriceId,
          config: tpl.config,
          isPublished: tpl.isPublished,
          isFeatured: tpl.isFeatured,
        },
      });
      console.log(`  ✓ Updated: ${tpl.slug}`);
    } else {
      await prisma.template.create({ data: tpl });
      console.log(`  ✓ Created: ${tpl.slug}`);
    }
  }

  console.log(`\nDone. Seeded ${TEMPLATE_SEEDS.length} templates.`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  prisma.$disconnect();
  pool.end();
  process.exit(1);
});
