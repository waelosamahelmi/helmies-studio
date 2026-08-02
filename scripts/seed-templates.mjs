// Seed the twelve contract templates (Phase 6 Task 4) into the database.
// Usage: node scripts/seed-templates.mjs
//
// Idempotent (upsert Template by slug, upsert TemplateVersion by
// templateId+version) and safe to run repeatedly in production: a template
// already published stays published (its graph is immutable per version —
// re-running this script never rewrites an existing TemplateVersion's
// `graph`, only ever creates version 1 once and re-evaluates the publish
// gate). A template that fails canPublish (e.g. a model went inactive since
// the last run) is left/kept as a draft and reported — it never crashes the
// whole run, so one broken template can't block the other eleven from
// seeding or re-publishing.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { TEMPLATE_SEEDS } from "../src/lib/template-seeds.js";
import { canPublish } from "../src/lib/template-quote.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TEMPLATE_FIELDS = (tpl) => ({
  name: tpl.name,
  description: tpl.description,
  thumbnailUrl: tpl.thumbnailUrl,
  category: tpl.category,
  toolType: tpl.toolType,
  pricingModel: tpl.pricingModel,
  oneTimePrice: tpl.oneTimePrice,
  stripePriceId: tpl.stripePriceId,
  config: tpl.config,
  isFeatured: tpl.isFeatured,
  usageLimit: tpl.usageLimit,
});

async function upsertTemplate(tpl) {
  const existing = await prisma.template.findUnique({ where: { slug: tpl.slug } });
  if (existing) {
    return prisma.template.update({ where: { slug: tpl.slug }, data: TEMPLATE_FIELDS(tpl) });
  }
  // isPublished starts false regardless of the seed's own flag — it only
  // ever flips true below, after canPublish actually passes for real,
  // exactly like the admin publish route (src/app/api/templates/[slug]/publish).
  return prisma.template.create({ data: { slug: tpl.slug, isPublished: false, ...TEMPLATE_FIELDS(tpl) } });
}

async function upsertVersion(template, tpl) {
  const existing = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId: template.id, version: 1 } },
  });
  if (existing) return existing; // graph is immutable once created — never rewritten by a re-run
  return prisma.templateVersion.create({
    data: { templateId: template.id, version: 1, graph: tpl.graph, status: "draft" },
  });
}

async function main() {
  console.log(`Seeding ${TEMPLATE_SEEDS.length} contract templates...`);

  const results = { created: 0, updated: 0, published: 0, blocked: [] };

  for (const tpl of TEMPLATE_SEEDS) {
    const existedBefore = await prisma.template.findUnique({ where: { slug: tpl.slug }, select: { id: true } });
    const template = await upsertTemplate(tpl);
    existedBefore ? results.updated++ : results.created++;

    const version = await upsertVersion(template, tpl);

    // MINOR-8 (found in review): `publishable === false` is a DELIBERATE,
    // seed-authored opt-out — a template whose graph passes canPublish's
    // structural/pricing gate but still cannot succeed for a real user yet
    // (e.g. needs a real user photo Task 5's UI has no form to collect).
    // Checked BEFORE canPublish so it always wins regardless of what the
    // gate says, and is never silently auto-published just because the
    // gate happened to pass.
    if (tpl.publishable === false) {
      results.blocked.push({ slug: tpl.slug, reasons: [tpl.graph?.blockedReason || "marked non-publishable in the seed"] });
      console.warn(`  ⏸ ${tpl.slug} — left as draft (seed-authored opt-out): ${tpl.graph?.blockedReason || "no reason recorded"}`);
      continue;
    }

    const gate = await canPublish(template.id, version.version);
    if (gate.ok) {
      if (version.status !== "published" || !template.isPublished) {
        await prisma.$transaction([
          prisma.templateVersion.update({ where: { id: version.id }, data: { status: "published" } }),
          prisma.template.update({ where: { id: template.id }, data: { isPublished: true } }),
        ]);
      }
      results.published++;
      console.log(`  ✓ ${tpl.slug} — published (v${version.version})`);
    } else {
      results.blocked.push({ slug: tpl.slug, reasons: gate.reasons });
      console.warn(`  ⚠ ${tpl.slug} — BLOCKED, left as draft:\n      ${gate.reasons.join("\n      ")}`);
    }
  }

  console.log(
    `\nDone. ${results.created} created, ${results.updated} updated, ${results.published} published, ${results.blocked.length} blocked.`
  );
  if (results.blocked.length) {
    console.warn(`Blocked templates (need a follow-up before they can serve users): ${results.blocked.map((b) => b.slug).join(", ")}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  prisma.$disconnect();
  pool.end();
  process.exit(1);
});
