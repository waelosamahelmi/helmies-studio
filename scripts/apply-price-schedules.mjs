#!/usr/bin/env node
/* Write the provider's real price schedules onto the catalog.
 *
 * src/lib/kie-price-schedules.mjs holds what KIE actually bills — per second,
 * per resolution, per tier. Until it existed every active row carried one flat
 * price, 14 models lost money at their default settings and 61 at settings the
 * studio offers (see that file's header for the ledger evidence).
 *
 * For every ACTIVE row with a schedule this sets:
 *   pricingRules  the schedule
 *   billingUnit   its unit
 *   providerCost / creditsCost   the model at its DEFAULT settings — the "from"
 *                 price a model card shows. Computed through the same
 *                 fill → quote path a real run takes, so card and meter agree.
 * The same numbers are already in models/dictionary.json, so a later
 * dictionary-reconcile does not move them back.
 *
 *   node --env-file=.env scripts/apply-price-schedules.mjs            # report only
 *   node --env-file=.env scripts/apply-price-schedules.mjs --apply    # write
 *
 * DEPLOY ORDER: build and restart the app with this code FIRST. The running
 * build must already fill priced settings (duration, resolution) before it
 * quotes; an older build quoting a per-second rule with no duration throws.
 *
 * Rows without a schedule are listed and left exactly as they are.
 */
import prisma from "../src/lib/prisma.js";
import { KIE_PRICE_SCHEDULES } from "../src/lib/kie-price-schedules.mjs";
import { defaultVariantCost, providerCostToCredits } from "../src/lib/model-catalog-core.mjs";

const apply = process.argv.includes("--apply");

const rows = await prisma.modelPricing.findMany({
  where: { isActive: true, isDeprecated: false },
  select: { modelId: true, inputSchema: true, pricingRules: true, providerCost: true, creditsCost: true, billingUnit: true },
  orderBy: { modelId: "asc" },
});

let changed = 0;
const unscheduled = [];
for (const row of rows) {
  const schedule = KIE_PRICE_SCHEDULES[row.modelId];
  if (!schedule) { unscheduled.push(`${row.modelId} (${row.creditsCost}cr)`); continue; }

  const providerCost = defaultVariantCost(schedule.pricing, row.inputSchema, row.modelId);
  const creditsCost = providerCostToCredits(providerCost);
  const same = JSON.stringify(row.pricingRules) === JSON.stringify(schedule.pricing)
    && Math.abs(row.providerCost - providerCost) < 1e-6 && row.creditsCost === creditsCost;
  if (same) continue;

  changed++;
  const arrow = creditsCost > row.creditsCost ? "↑" : creditsCost < row.creditsCost ? "↓" : "=";
  console.log(`${arrow} ${row.modelId.padEnd(42)} from ${String(row.creditsCost).padStart(4)}cr → ${String(creditsCost).padStart(4)}cr   (${schedule.pricing.rules.length} rule${schedule.pricing.rules.length === 1 ? "" : "s"}, per ${schedule.pricing.unit})`);
  if (apply) {
    await prisma.modelPricing.update({
      where: { modelId: row.modelId },
      data: { pricingRules: schedule.pricing, billingUnit: schedule.pricing.unit, providerCost, creditsCost },
    });
  }
}

const missing = Object.keys(KIE_PRICE_SCHEDULES).filter((id) => !rows.some((r) => r.modelId === id));
console.log(`\n${changed} of ${rows.length} active rows ${apply ? "updated" : "would change"}.`);
if (missing.length) console.log(`Scheduled but not active in the catalog (nothing written): ${missing.join(", ")}`);
console.log(`\nNo schedule — flat stored price kept (${unscheduled.length}): ${unscheduled.join(", ")}`);
if (!apply) console.log("\nReport only. Pass --apply to write.");
await prisma.$disconnect();
