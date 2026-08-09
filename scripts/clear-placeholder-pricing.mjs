#!/usr/bin/env node
/* Strip the seed-default pricing rules that were being charged as prices.
 *
 * Audited 2026-08-09: 60 of 134 active models carried a SINGLE flat rule
 * whose price contradicted the row's own measured providerCost — and the
 * rule wins in every quote path, so the rule is what got charged:
 *
 *     generate-veo-3-video    cost $1.28   rule $0.03   42x UNDER-charged
 *     topaz/video-upscale     cost $0.025  rule $0.30   12x OVER-charged
 *
 * The tell is repetition: 0.03, 0.04 and 0.30 appear across dozens of
 * unrelated models of wildly different cost. They are import defaults.
 * providerCost and creditsCost agree with each other at a steady ~250
 * credits per dollar across the catalog — those are the measured numbers.
 *
 * src/lib/model-catalog-core.mjs's isPlaceholderPricing already refuses to
 * quote from these at runtime, so the money is correct with or without this
 * script. This removes the bad data as well, so the catalog stops carrying
 * a number that means nothing and nobody has to wonder which one is real.
 *
 *   node scripts/clear-placeholder-pricing.mjs            # report only
 *   node scripts/clear-placeholder-pricing.mjs --apply    # write
 *
 * Genuine schedules — several rules, per-second or per-megapixel units,
 * `when` conditions — are never touched.
 */
import prisma from "../src/lib/prisma.js";
import { isPlaceholderPricing } from "../src/lib/model-catalog-core.mjs";

const apply = process.argv.includes("--apply");

const rows = await prisma.modelPricing.findMany({
  where: { isActive: true, isDeprecated: false },
  select: { id: true, modelId: true, providerCost: true, creditsCost: true, pricingRules: true },
});

const bad = rows.filter((r) => isPlaceholderPricing(r.pricingRules, r.providerCost));

if (!bad.length) {
  console.log(`No placeholder pricing found across ${rows.length} active models.`);
  process.exit(0);
}

console.log(`${bad.length} of ${rows.length} active models carry placeholder pricing:\n`);
for (const r of bad) {
  const rule = r.pricingRules.rules[0].price;
  const ratio = (Math.max(rule, r.providerCost) / Math.min(rule, r.providerCost)).toFixed(1);
  const direction = rule < r.providerCost ? "UNDER" : "OVER";
  console.log(
    `  ${r.modelId.padEnd(36)} cost $${String(r.providerCost).padEnd(7)} rule $${String(rule).padEnd(6)} ${ratio}x ${direction}-charged  (${r.creditsCost} cr stored)`,
  );
}

if (!apply) {
  console.log(`\nReport only. Re-run with --apply to clear these rules.`);
  console.log(`Quotes are already correct at runtime — isPlaceholderPricing refuses them.`);
  process.exit(0);
}

let cleared = 0;
for (const r of bad) {
  await prisma.modelPricing.update({ where: { id: r.id }, data: { pricingRules: null } });
  cleared++;
}
console.log(`\nCleared ${cleared} placeholder pricing blocks. Every affected model now quotes from its stored creditsCost.`);
process.exit(0);
