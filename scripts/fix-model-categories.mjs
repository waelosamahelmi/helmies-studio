#!/usr/bin/env node
// Backfill: recompute ModelPricing.modelType (and, for KIE rows, the
// slug-derived displayName) from what's already on each row.
//
// URGENT production fix — modelType used to be computed INDEPENDENTLY of
// capability at sync time (see model-catalog-core.mjs's
// CAPABILITY_TO_MODEL_TYPE / modelTypeForCapability header for the full
// story). kie-sync.js's own inferModelType(path) guessed a modelType
// straight from the URL text, completely separately from the capability
// inferKieModelFromUrl derived from that SAME text, and the two disagreed
// constantly — every Bytedance Seedance model landed with
// capability="video" but modelType="image" (inferModelType's regex list had
// no case for "seedance" and fell through to its "image" default), so 14
// video models were showing up in Image mode. Both sync paths
// (kie-sync.js, alibaba-catalog.js) now write modelType through
// modelTypeForCapability at write time going forward — this script is for
// every row that was written BEFORE that fix landed (or edited by hand) and
// hasn't been re-synced since.
//
// Dry-run by default: reports every row whose modelType disagrees with
// modelTypeForCapability(capability) (and, for KIE rows, whose displayName
// disagrees with the fixed slugToTitle — the "Bytedance Seedance 1 5 Pro" /
// "Generate 4 O Image" class of bug), plus every row whose capability is
// null/unmapped. That last category is reported as NEEDING ATTENTION, never
// auto-fixed — a bare/generic capability (e.g. "video" with no direction)
// is exactly how a sync's own best-guess fallback produced this bug in the
// first place, so this script does not guess a modelType for it either; it
// writes UNCATEGORIZED and the row stays invisible to end users (see
// model-catalog.js's serializeCatalogModel/getCatalogModels) until a human
// fixes its capability at the sync source.
//
// `--apply --yes` writes the recomputed modelType/displayName for every
// row this can safely fix. Idempotent: run it again right after and both
// lists come back empty (a mismatch it already fixed matches on the next
// scan; an UNCATEGORIZED row stays UNCATEGORIZED — unchanged — until its
// capability itself changes).
//
// SAFETY: like scripts/reconcile-credits.mjs, this reads DATABASE_URL
// straight from the environment and has no built-in host allowlist — that
// is the operator's responsibility. It IS safe to run against production
// (dry-run makes no writes at all, and --apply only ever recomputes a
// column from data already sitting on that same row, never invents one),
// but only the owner runs it there; this session only ever points it at
// the disposable test container:
//   DATABASE_URL="postgresql://postgres:test@localhost:55432/test" node scripts/fix-model-categories.mjs
//   DATABASE_URL="postgresql://postgres:test@localhost:55432/test" node scripts/fix-model-categories.mjs --apply --yes

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../src/lib/prisma.js";
import { modelTypeForCapability, slugToTitle, UNCATEGORIZED_MODEL_TYPE } from "../src/lib/model-catalog-core.mjs";

// Pure planning function — no DB access, so it's directly unit-testable
// against plain row arrays (tests/unit/fix-model-categories.test.mjs).
export function planFixes(rows) {
  const modelTypeFixes = [];
  const displayNameFixes = [];
  const needsAttention = [];

  for (const row of rows) {
    const correctType = modelTypeForCapability(row.capability) || UNCATEGORIZED_MODEL_TYPE;

    if (correctType === UNCATEGORIZED_MODEL_TYPE) {
      needsAttention.push({
        modelId: row.modelId,
        providerName: row.providerName,
        capability: row.capability ?? null,
        currentModelType: row.modelType,
      });
    }

    if (row.modelType !== correctType) {
      modelTypeFixes.push({
        modelId: row.modelId,
        providerName: row.providerName,
        capability: row.capability ?? null,
        from: row.modelType,
        to: correctType,
      });
    }

    // KIE's displayName is always auto-derived from its docs-URL slug (no
    // admin path ever writes a custom one — see model-catalog.js's
    // displayNameFor), so recomputing it is always safe there. Alibaba's is
    // hand-authored in alibaba-catalog.js and must never be touched here.
    if (row.providerName === "KIE") {
      const correctName = slugToTitle(row.modelId, { capability: row.capability });
      if (correctName && correctName !== row.displayName) {
        displayNameFixes.push({
          modelId: row.modelId,
          providerName: row.providerName,
          from: row.displayName ?? null,
          to: correctName,
        });
      }
    }
  }

  return { modelTypeFixes, displayNameFixes, needsAttention };
}

function printPlan({ modelTypeFixes, displayNameFixes, needsAttention }, { apply }) {
  console.log("");
  if (modelTypeFixes.length === 0) {
    console.log("modelType: no mismatches found.");
  } else {
    console.log(`modelType: ${modelTypeFixes.length} row(s) ${apply ? "were" : "would be"} recategorized:`);
    for (const f of modelTypeFixes) {
      console.log(`  ${f.modelId} (${f.providerName}): "${f.from}" -> "${f.to}" (capability=${JSON.stringify(f.capability)})`);
    }
  }

  console.log("");
  if (displayNameFixes.length === 0) {
    console.log("displayName: no stale KIE-derived names found.");
  } else {
    console.log(`displayName: ${displayNameFixes.length} KIE row(s) ${apply ? "were" : "would be"} renamed:`);
    for (const f of displayNameFixes) {
      console.log(`  ${f.modelId}: ${JSON.stringify(f.from)} -> ${JSON.stringify(f.to)}`);
    }
  }

  console.log("");
  if (needsAttention.length === 0) {
    console.log("needs attention: none — every row's capability maps to a modelType.");
  } else {
    console.log(`needs attention: ${needsAttention.length} row(s) have a null/unmapped capability. These are NOT auto-fixed — they are written/kept as "${UNCATEGORIZED_MODEL_TYPE}" and stay invisible to end users until a human assigns a real capability at the sync source:`);
    for (const n of needsAttention) {
      console.log(`  ${n.modelId} (${n.providerName}): capability=${JSON.stringify(n.capability)}, currently stored modelType=${JSON.stringify(n.currentModelType)}`);
    }
  }
  console.log("");
}

export async function run({ apply, yes }) {
  if (apply && !yes) {
    throw new Error("Refusing --apply without --yes (safety guard) — no changes made. Re-run with both flags to write fixes.");
  }

  const rows = await prisma.modelPricing.findMany({
    select: { id: true, modelId: true, providerName: true, capability: true, modelType: true, displayName: true },
  });

  const plan = planFixes(rows);
  console.log(`Scanned ${rows.length} ModelPricing row(s).`);
  printPlan(plan, { apply });

  if (!apply) {
    console.log(`Dry run only — no changes made. Re-run with --apply --yes to write the ${plan.modelTypeFixes.length} modelType fix(es) and ${plan.displayNameFixes.length} displayName fix(es) above.`);
    return { ...plan, applied: 0 };
  }

  let applied = 0;
  for (const f of plan.modelTypeFixes) {
    const nameFix = plan.displayNameFixes.find((n) => n.modelId === f.modelId);
    await prisma.modelPricing.update({
      where: { modelId: f.modelId },
      data: { modelType: f.to, ...(nameFix ? { displayName: nameFix.to } : {}) },
    });
    applied++;
  }
  // Any displayName fix on a row that did NOT also need a modelType fix.
  for (const n of plan.displayNameFixes) {
    if (plan.modelTypeFixes.some((f) => f.modelId === n.modelId)) continue;
    await prisma.modelPricing.update({ where: { modelId: n.modelId }, data: { displayName: n.to } });
    applied++;
  }

  console.log(`Applied ${applied} fix(es).`);
  return { ...plan, applied };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const yes = args.includes("--yes");
  try {
    await run({ apply, yes });
    await prisma.$disconnect();
  } catch (e) {
    console.error(e.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}
