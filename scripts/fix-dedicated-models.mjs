// ── Dedicated-API row fixes (EDITSv1 M2, audit class E) ────────────────────
// The seven dedicated-API ModelPricing rows (4o Image, Flux Kontext, Runway,
// Runway extend, Aleph, Veo3, Veo3 extend) shipped mis-typed (three of them
// literally modelType "image" / capability "text-to-image" for VIDEO
// generators), with fabricated generic schemas, and — for extend-video — a
// 75-credit price that was never validated against anything. This backfill
// makes each row honest:
//
//   • capability/modelType corrected (the video rows become video-typed).
//   • inputSchema rewritten to the real curated schema (schemaForModel —
//     the same fields the adapters in image-payload-core.mjs /
//     video-payload-core.mjs translate onto the wire).
//   • generate-4-o-image, generate-or-edit-image, generate-ai-video,
//     generate-aleph-video, generate-veo-3-video stay/become ACTIVE — the
//     adapters now route them correctly and every input they require has a
//     studio affordance (Aleph's source video arrives via the ordinary
//     video-upload -> video_url path in the v2v pool).
//   • extend-video and extend-ai-video become INACTIVE with a verification
//     note: both hard-require the taskId of a PRIOR generation, an
//     affordance no studio surface offers yet — a model users cannot
//     actually run must never be surfaced (adapter support already exists,
//     so activating them later is a row flip, not a code change).
//   • extend-video's creditsCost outlier (75) is re-derived: KIE prices
//     Veo3.1 at "25% of official Google pricing" and extend runs the fast
//     engine by default, producing one more fast-mode segment — the same
//     provider work as a generate-veo-3-video fast call, whose live row is
//     8 credits. 75 had no traceable origin (neither KIE_PRICING_OVERRIDES
//     nor DEFAULT_PRICING carries an extend-video entry), so it is priced
//     at parity with the generate row: 8 credits.
//
// SAFETY: dry-run by default; writes require BOTH --apply AND --yes.
//
// Usage:
//   node scripts/fix-dedicated-models.mjs                # dry-run
//   node scripts/fix-dedicated-models.mjs --apply --yes  # write
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../src/lib/prisma.js";
import { schemaForModel } from "../src/lib/model-catalog-core.mjs";
import { writeVerification } from "../src/lib/catalog-verification.mjs";

export const EXTEND_NO_UI_REASON =
  "requires the taskId of a prior generation; no studio affordance yet — reactivate once the extend UI exists";

export const EXTEND_VIDEO_CREDITS = 8;

// One entry per row this script owns. `activate` is tri-state: true forces
// active, false forces inactive (with the no-UI verification note), and
// undefined leaves the stored flag alone.
export const DEDICATED_ROW_FIXES = {
  "generate-4-o-image": { capability: "text-to-image", modelType: "image", activate: true },
  // Primary/default mode is text-to-image; the reference image is optional
  // (edit mode only when present) — the old image-to-image/i2i filing hid it
  // from the t2i pool entirely.
  "generate-or-edit-image": { capability: "text-to-image", modelType: "image", activate: true },
  "generate-ai-video": { capability: "text-to-video", modelType: "video", activate: true },
  "generate-aleph-video": { capability: "video-to-video", modelType: "v2v", activate: true },
  "generate-veo-3-video": { capability: "text-to-video", modelType: "video", activate: true },
  "extend-video": { capability: "video-to-video", modelType: "v2v", activate: false, creditsCost: EXTEND_VIDEO_CREDITS },
  "extend-ai-video": { capability: "video-to-video", modelType: "v2v", activate: false },
};

export function fixForRow(row, { now = new Date() } = {}) {
  const fix = DEDICATED_ROW_FIXES[row.modelId];
  if (!fix) return null;
  const data = {};
  if (row.capability !== fix.capability) data.capability = fix.capability;
  if (row.modelType !== fix.modelType) data.modelType = fix.modelType;
  const expectedSchema = schemaForModel(row.modelId, fix.capability);
  if (JSON.stringify(row.inputSchema ?? null) !== JSON.stringify(expectedSchema)) {
    data.inputSchema = expectedSchema;
  }
  if (fix.creditsCost != null && row.creditsCost !== fix.creditsCost) data.creditsCost = fix.creditsCost;
  if (fix.activate === true && row.isActive !== true) {
    data.isActive = true;
    data.isDeprecated = false;
  }
  if (fix.activate === false) {
    if (row.isActive !== false) data.isActive = false;
    data.constraints = writeVerification(row.constraints, {
      status: "verified",
      verdict: "blocked-no-ui",
      callable: false,
      reason: EXTEND_NO_UI_REASON,
      checkedAt: now.toISOString(),
    });
  }
  return Object.keys(data).length ? data : null;
}

export async function run({ apply = false, yes = false, now = new Date() } = {}) {
  if (apply && !yes) {
    throw new Error("Refusing to write without --yes. Re-run with --apply --yes.");
  }
  const rows = await prisma.modelPricing.findMany({
    where: { modelId: { in: Object.keys(DEDICATED_ROW_FIXES) } },
    select: { id: true, modelId: true, capability: true, modelType: true, inputSchema: true, creditsCost: true, isActive: true, constraints: true },
  });

  const plans = [];
  for (const row of rows) {
    const data = fixForRow(row, { now });
    if (data) plans.push({ row, data });
  }

  console.log(`Found ${rows.length} dedicated-API row(s); ${plans.length} need fixes.`);
  for (const { row, data } of plans) {
    const parts = Object.keys(data).map((k) => (k === "inputSchema" || k === "constraints" ? k : `${k}=${JSON.stringify(data[k])}`));
    console.log(`  ${row.modelId}: ${parts.join(", ")}`);
  }

  let applied = 0;
  if (apply) {
    for (const { row, data } of plans) {
      await prisma.modelPricing.update({ where: { id: row.id }, data });
      applied++;
    }
    console.log(`Applied ${applied} fix(es).`);
  } else {
    console.log("Dry run only — no changes made. Re-run with --apply --yes to write.");
  }
  return { scanned: rows.length, planned: plans.length, applied };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  run({ apply: args.has("--apply"), yes: args.has("--yes") })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
