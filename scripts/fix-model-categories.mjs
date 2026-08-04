#!/usr/bin/env node
// Backfill: recompute ModelPricing.modelType (and, for KIE rows, the
// slug-derived displayName), recovering a null/unmapped capability where
// possible, from what's already on each row.
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
// A first version of this fix treated a bare "video"/"image" capability as
// unmapped/uncategorized — a read-only preview against the REAL production
// catalog caught that this would have HIDDEN 28 genuinely working models
// (14 image, 14 video) that legitimately use that coarse-but-valid value.
// "image" and "video" are now mapped directly (see CAPABILITY_TO_MODEL_TYPE).
// For the null-capability rows that preview also found (and anything else
// this mapping still doesn't recognize, e.g. the sync's own "media"
// fallback), this script tries inferCapabilityFromRow (model-catalog-
// core.mjs) — modalities first, then the same text-based inference every
// other synced model already gets its capability from — before giving up
// and reporting the row as needing attention.
//
// Dry-run by default: reports every row whose modelType disagrees with its
// (possibly recovered) capability, every capability this recovers, every
// stale KIE displayName (the "Bytedance Seedance 1 5 Pro" / "Generate 4 O
// Image" class of bug), every OTHER provider's displayName still leaking a
// "<providerName>:" prefix (the "Alibaba:qwen3 TTS Flash" class of bug —
// see sanitizeDisplayName in model-catalog-core.mjs), and every row that's
// STILL null/unmapped after recovery is attempted — those are NEVER
// auto-fixed with a guess; they're written/kept as UNCATEGORIZED and
// reported as needing a human to assign a real capability at the sync
// source.
//
// Also recovers a row STUCK under the coarse "video" capability when its own
// id/endpoint now carries an unambiguous short-form direction marker
// ("-i2v"/"-v2v"/"-t2v" — see inferCapability's header in model-catalog-
// core.mjs) — a bug fix distinct from the paragraph above: coarse "video"
// already maps to a real modelType, so those rows were never even looked at
// for a more precise capability, no matter how unambiguous their own id
// later became. Restricted to the three precise video directions; a row
// with no such marker (kling/*, bytedance/seedance-*, wan-animate-*) is left
// exactly as "video".
//
// `--apply --yes` writes the recomputed modelType/displayName/capability
// for every row this can safely fix. Idempotent: run it again right after
// and every list comes back empty (a row it already fixed matches on the
// next scan; a row still genuinely uncategorized stays that way —
// unchanged — until its capability itself changes).
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
import { modelTypeForCapability, slugToTitle, inferCapabilityFromRow, UNCATEGORIZED_MODEL_TYPE, sanitizeCatalogDescription, sanitizeDisplayName, curatedSchemaEntry, schemaForModel } from "../src/lib/model-catalog-core.mjs";

// Pure planning function — no DB access, so it's directly unit-testable
// against plain row arrays (tests/unit/fix-model-categories.test.mjs).
export function planFixes(rows) {
  const modelTypeFixes = [];
  const displayNameFixes = [];
  const capabilityFixes = [];
  const descriptionFixes = [];
  const schemaFixes = [];
  const needsAttention = [];

  for (const row of rows) {
    let capability = row.capability;
    let mappedType = modelTypeForCapability(capability);

    if (mappedType === null) {
      const inferred = inferCapabilityFromRow(row);
      if (inferred) {
        capabilityFixes.push({
          modelId: row.modelId,
          providerName: row.providerName,
          from: row.capability ?? null,
          to: inferred,
        });
        capability = inferred;
        mappedType = modelTypeForCapability(inferred);
      }
    } else if (capability === "video") {
      // BUG FIX: production Text-to-Video listed models that cannot do
      // text-to-video. Coarse "video" already maps to a real modelType (the
      // branch above never runs for it), so a row stuck there was NEVER
      // re-examined for a more precise direction — even after the id/
      // endpoint text-inference fix (inferCapability, model-catalog-
      // core.mjs) started recognizing short-form "-i2v"/"-v2v"/"-t2v"
      // markers, a row synced BEFORE that fix (or before its next sync)
      // kept its stale coarse "video" forever. Re-run the SAME
      // inferCapabilityFromRow every null-capability row above already goes
      // through — a marked id (e.g. "wan-2.6-v2v") now resolves to its real
      // direction; an unmarked one (kling/*, bytedance/seedance-*,
      // wan-animate-*) comes back exactly "video" again, a no-op, not a
      // guess. Restricted to the three precise directions on purpose — if
      // inferCapabilityFromRow ever recovered something else entirely for a
      // "video" row (e.g. reference-to-video), that's outside this fix's
      // scope and is left alone rather than silently reclassified.
      const refined = inferCapabilityFromRow(row);
      if (["image-to-video", "video-to-video", "text-to-video"].includes(refined) && refined !== capability) {
        capabilityFixes.push({
          modelId: row.modelId,
          providerName: row.providerName,
          from: row.capability ?? null,
          to: refined,
        });
        capability = refined;
        mappedType = modelTypeForCapability(refined);
      }
    }

    const correctType = mappedType || UNCATEGORIZED_MODEL_TYPE;

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
    // displayNameFor), so recomputing it wholesale is always safe there.
    // Every other provider's displayName is hand-authored and never
    // rewritten wholesale here — but IS checked for the narrower,
    // provider-agnostic "<providerName>:" prefix leak (measured production
    // bug: two Alibaba audio rows persisted as "Alibaba:qwen3 TTS Flash" /
    // "Alibaba:qwen3 TTS Instruct Flash"), using the exact same
    // sanitizeDisplayName the live public serializer already calls
    // (model-catalog-core.mjs), so both agree on what counts as a leaked
    // prefix and how the remainder gets re-cased. Idempotent: once fixed,
    // the remainder no longer starts with "<providerName>:" so a second
    // pass reports nothing.
    if (row.providerName === "KIE") {
      const correctName = slugToTitle(row.modelId, { capability });
      if (correctName && correctName !== row.displayName) {
        displayNameFixes.push({
          modelId: row.modelId,
          providerName: row.providerName,
          from: row.displayName ?? null,
          to: correctName,
        });
      }
    } else {
      const sanitized = sanitizeDisplayName(row.displayName, row.providerName);
      if (sanitized && sanitized !== row.displayName) {
        displayNameFixes.push({
          modelId: row.modelId,
          providerName: row.providerName,
          from: row.displayName ?? null,
          to: sanitized,
        });
      }
    }

    // Persistently rewrite a description that still leaks the upstream
    // provider identity (measured production bug: kie-sync.js used to write
    // `${displayName} via the KIE Market API.` for every synced row — see
    // sanitizeCatalogDescription's header in model-catalog-core.mjs, the
    // SAME function the live public serializer calls, so both agree on
    // what a "provider token" is and what's too degenerate to keep). Only a
    // description that actually changes is reported/written — a row with no
    // provider token in its description (or none at all) is left alone,
    // which is also what makes a second run a no-op.
    if (row.description) {
      const cleaned = sanitizeCatalogDescription(row.description);
      if (cleaned !== row.description) {
        descriptionFixes.push({
          modelId: row.modelId,
          providerName: row.providerName,
          from: row.description,
          to: cleaned,
        });
      }
    }

    // EDITSv1 E1.2: rows synced before the curated-schema fix carry the
    // generic `{ prompt }` audio schema, so the studios' schema-gated
    // controls (style/title/instrumental/voice/stability…) never render
    // for them. Rewrite the stored inputSchema for CURATED ids only —
    // schemaForModel merges the curated fields over the generic default
    // for the (possibly recovered) capability, exactly what a fresh sync
    // would write. A model with no curated entry is NEVER touched (no
    // invented parameters), which is also what keeps this idempotent: once
    // the stored schema equals the curated merge, nothing is reported.
    if (curatedSchemaEntry(row.modelId)) {
      const expected = schemaForModel(row.modelId, capability || row.capability || "audio");
      if (JSON.stringify(row.inputSchema ?? null) !== JSON.stringify(expected)) {
        schemaFixes.push({
          modelId: row.modelId,
          providerName: row.providerName,
          from: row.inputSchema ?? null,
          to: expected,
        });
      }
    }
  }

  return { modelTypeFixes, displayNameFixes, capabilityFixes, descriptionFixes, schemaFixes, needsAttention };
}

function printPlan({ modelTypeFixes, displayNameFixes, capabilityFixes, descriptionFixes, schemaFixes, needsAttention }, { apply }) {
  console.log("");
  if (capabilityFixes.length === 0) {
    console.log("capability: no null/unmapped rows were recoverable from modalities/endpoint.");
  } else {
    console.log(`capability: ${capabilityFixes.length} row(s) ${apply ? "were" : "would be"} recovered from modalities/endpoint inference:`);
    for (const f of capabilityFixes) {
      console.log(`  ${f.modelId} (${f.providerName}): capability ${JSON.stringify(f.from)} -> ${JSON.stringify(f.to)}`);
    }
  }

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
    console.log("displayName: no stale KIE-derived names or provider-prefix leaks found.");
  } else {
    console.log(`displayName: ${displayNameFixes.length} row(s) ${apply ? "were" : "would be"} renamed:`);
    for (const f of displayNameFixes) {
      console.log(`  ${f.modelId} (${f.providerName}): ${JSON.stringify(f.from)} -> ${JSON.stringify(f.to)}`);
    }
  }

  console.log("");
  if (descriptionFixes.length === 0) {
    console.log("description: no provider-identity-leaking descriptions found.");
  } else {
    console.log(`description: ${descriptionFixes.length} row(s) ${apply ? "were" : "would be"} rewritten to remove the upstream provider identity:`);
    for (const f of descriptionFixes) {
      console.log(`  ${f.modelId} (${f.providerName}): ${JSON.stringify(f.from)} -> ${JSON.stringify(f.to)}`);
    }
  }

  console.log("");
  if (schemaFixes.length === 0) {
    console.log("inputSchema: every curated model's stored schema already matches its curated parameter set.");
  } else {
    console.log(`inputSchema: ${schemaFixes.length} curated row(s) ${apply ? "were" : "would be"} rewritten to their real parameter schema (curated fields over the generic default):`);
    for (const f of schemaFixes) {
      const fields = Object.keys(f.to?.fields || {}).join(", ");
      console.log(`  ${f.modelId} (${f.providerName}): -> fields [${fields}]`);
    }
  }

  console.log("");
  if (needsAttention.length === 0) {
    console.log("needs attention: none — every row's capability maps to a modelType (directly or via recovery).");
  } else {
    console.log(`needs attention: ${needsAttention.length} row(s) have a null/unmapped capability that inference could NOT recover. These are NOT guessed — they are written/kept as "${UNCATEGORIZED_MODEL_TYPE}" and stay invisible to end users until a human assigns a real capability at the sync source:`);
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
    select: {
      id: true, modelId: true, providerName: true, capability: true, modelType: true, displayName: true,
      description: true, inputModalities: true, outputModalities: true, endpoint: true, providerModelId: true,
      inputSchema: true,
    },
  });

  const plan = planFixes(rows);
  console.log(`Scanned ${rows.length} ModelPricing row(s).`);
  printPlan(plan, { apply });

  if (!apply) {
    console.log(`Dry run only — no changes made. Re-run with --apply --yes to write the ${plan.capabilityFixes.length} capability fix(es), ${plan.modelTypeFixes.length} modelType fix(es), ${plan.displayNameFixes.length} displayName fix(es), ${plan.descriptionFixes.length} description fix(es), and ${plan.schemaFixes.length} inputSchema fix(es) above.`);
    return { ...plan, applied: 0 };
  }

  const modelIds = new Set([
    ...plan.modelTypeFixes.map((f) => f.modelId),
    ...plan.displayNameFixes.map((f) => f.modelId),
    ...plan.capabilityFixes.map((f) => f.modelId),
    ...plan.descriptionFixes.map((f) => f.modelId),
    ...plan.schemaFixes.map((f) => f.modelId),
  ]);

  let applied = 0;
  for (const modelId of modelIds) {
    const typeFix = plan.modelTypeFixes.find((f) => f.modelId === modelId);
    const nameFix = plan.displayNameFixes.find((f) => f.modelId === modelId);
    const capFix = plan.capabilityFixes.find((f) => f.modelId === modelId);
    const descFix = plan.descriptionFixes.find((f) => f.modelId === modelId);
    const schemaFix = plan.schemaFixes.find((f) => f.modelId === modelId);
    const data = {};
    if (typeFix) data.modelType = typeFix.to;
    if (nameFix) data.displayName = nameFix.to;
    if (capFix) data.capability = capFix.to;
    if (descFix) data.description = descFix.to;
    if (schemaFix) data.inputSchema = schemaFix.to;
    await prisma.modelPricing.update({ where: { modelId }, data });
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
