// Compare the checked-in dictionary against the live catalog.
//
//   node --env-file=.env scripts/dictionary-reconcile.mjs           (report)
//   node --env-file=.env scripts/dictionary-reconcile.mjs --apply   (write)
//
// The direction is one-way ON PURPOSE: the dictionary is the authority and
// the database follows it. A row the dictionary does not describe is
// DEACTIVATED rather than deleted — deleting loses the generations that
// point at it — and it is never activated by this script, because the
// whole failure being fixed is a catalog that grew rows nobody chose.
import prisma from "../src/lib/prisma.js";
import { reconcile, modelEntry, mayActivate } from "../src/lib/model-dictionary.mjs";

const apply = process.argv.includes("--apply");

const rows = await prisma.modelPricing.findMany({
  select: {
    modelId: true, displayName: true, modelType: true, capability: true,
    providerCost: true, creditsCost: true, isActive: true,
  },
});

const drift = reconcile(rows);
const byKind = new Map();
for (const d of drift) {
  if (!byKind.has(d.kind)) byKind.set(d.kind, []);
  byKind.get(d.kind).push(d);
}

console.log(`${rows.length} rows in the catalog, ${drift.length} disagreements\n`);
for (const [kind, items] of byKind) {
  console.log(`── ${kind} (${items.length})`);
  for (const d of items.slice(0, 25)) {
    console.log(d.field
      ? `   ${d.modelId}.${d.field}: db=${d.db} dictionary=${d.dictionary}`
      : `   ${d.modelId} — ${d.detail}`);
  }
  if (items.length > 25) console.log(`   …and ${items.length - 25} more`);
  console.log("");
}

if (!apply) {
  console.log("Report only. Pass --apply to make the catalog match.");
  process.exit(0);
}

let updated = 0;
let deactivated = 0;

for (const d of drift) {
  if (d.kind === "unknown_and_active") {
    await prisma.modelPricing.updateMany({ where: { modelId: d.modelId }, data: { isActive: false } });
    deactivated++;
    continue;
  }
  if (d.kind === "should_not_be_active") {
    await prisma.modelPricing.updateMany({ where: { modelId: d.modelId }, data: { isActive: false } });
    deactivated++;
    continue;
  }
  if (d.kind === "field") {
    const entry = modelEntry(d.modelId);
    if (!entry) continue;
    const data = {
      displayName: entry.name,
      modelType: entry.category,
      capability: entry.capability,
      providerCost: entry.cost,
      creditsCost: entry.credits,
    };
    await prisma.modelPricing.updateMany({ where: { modelId: d.modelId }, data });
    updated++;
  }
  // "missing_from_db" is deliberately NOT created here. A dictionary entry
  // is a description, not a licence to add a live model — adding one needs
  // the schema and the routing the sync owns.
}

console.log(`\n${updated} field corrections, ${deactivated} deactivated.`);
const stillWrong = reconcile(await prisma.modelPricing.findMany({
  select: { modelId: true, displayName: true, modelType: true, capability: true, providerCost: true, creditsCost: true, isActive: true },
})).filter((d) => d.kind !== "missing_from_db");
console.log(`${stillWrong.length} disagreements remain (excluding described-but-absent).`);
process.exit(0);
