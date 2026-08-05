// ── Alibaba retirement backfill (EDITSv1 M2 — owner decision: KIE-only) ────
// Deactivates every Alibaba/DashScope ModelPricing row (and the Alibaba
// ProviderConfig row, so getProviderActivity's kill-switch path agrees) with
// a verification note under constraints.verification — the same storage
// scripts/verify-catalog.mjs uses, so verificationAllowsActive() and the
// admin UI read it the same way. Code-side, providers.js's RETIRED_ADAPTERS
// already keeps NEW generations off Alibaba regardless of row state, and
// model-catalog.js's syncAlibabaModels now converges on this state instead
// of resurrecting rows; this script makes the catalog itself honest.
//
// SAFETY: dry-run by default; writes require BOTH --apply AND --yes.
// Old Generation rows / in-flight polls are untouched — retirement is a
// catalog + resolution change, never a data delete.
//
// Usage:
//   node scripts/retire-alibaba.mjs                # dry-run (default)
//   node scripts/retire-alibaba.mjs --apply --yes  # write
// MUST be the side-effect import — ES module imports are hoisted, so a
// config() call after imports runs AFTER prisma.js has read an empty
// DATABASE_URL (fails on the server with "SASL: client password must be a
// string"). Same fix as verify-catalog.mjs.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../src/lib/prisma.js";
import { writeVerification } from "../src/lib/catalog-verification.mjs";

export const RETIREMENT_REASON = "provider retired";

function isAlibabaRow(row) {
  const name = String(row.providerName || "").toLowerCase();
  return (
    name.includes("alibaba") ||
    name.includes("dashscope") ||
    String(row.modelId || "").toLowerCase().startsWith("alibaba:")
  );
}

export function retirementUpdate(row, { now = new Date() } = {}) {
  const verification = {
    status: "verified",
    verdict: "not-callable",
    callable: false,
    reason: RETIREMENT_REASON,
    checkedAt: now.toISOString(),
  };
  return {
    isActive: false,
    isDeprecated: true,
    constraints: writeVerification(row.constraints, verification),
  };
}

export async function run({ apply = false, yes = false, now = new Date() } = {}) {
  if (apply && !yes) {
    throw new Error("Refusing to write without --yes. Re-run with --apply --yes.");
  }

  const rows = await prisma.modelPricing.findMany({
    select: { id: true, modelId: true, providerName: true, isActive: true, constraints: true },
  });
  const targets = rows.filter(isAlibabaRow);
  const active = targets.filter((row) => row.isActive === true);

  console.log(`Found ${targets.length} Alibaba/DashScope row(s); ${active.length} still active.`);
  for (const row of targets) {
    console.log(`  ${row.modelId} (${row.providerName}) isActive=${row.isActive}${row.isActive ? " -> false" : ""}`);
  }

  let applied = 0;
  if (apply) {
    // Every target row (not just the active ones) gets the verification
    // note, so an already-inactive row still records WHY it is dead.
    for (const row of targets) {
      await prisma.modelPricing.update({
        where: { id: row.id },
        data: retirementUpdate(row, { now }),
      });
      applied++;
    }
    // Flip the ProviderConfig row too — getProviderActivity() reads it, and
    // classifyProviderConfigName guarantees this matches the same row
    // setProviderDisabled would.
    const configs = await prisma.providerConfig.findMany({ select: { id: true, name: true, isActive: true } });
    for (const config of configs) {
      const n = String(config.name || "").toLowerCase();
      if ((n.includes("alibaba") || n.includes("qwen") || n.includes("dashscope")) && config.isActive !== false) {
        await prisma.providerConfig.update({ where: { id: config.id }, data: { isActive: false } });
        console.log(`ProviderConfig "${config.name}" deactivated.`);
      }
    }
    console.log(`Applied retirement to ${applied} ModelPricing row(s).`);
  } else {
    console.log("Dry run only — no changes made. Re-run with --apply --yes to write.");
  }

  return { targets: targets.length, active: active.length, applied };
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
