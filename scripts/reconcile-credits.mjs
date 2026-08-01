#!/usr/bin/env node
// Wallet/ledger reconciliation sweep.
//
// Read-only by default: walks every CreditWallet via reconcileAll(), prints
// a drift table (userId only — never emails) for wallets that fail the two
// MONEY invariants (available == ledger movement sum, reserved == active
// reservation sum), and exits 1 if any of those are unfixed (0 when clean).
//
// Mirror staleness (User.credits vs CreditWallet.available) is a SEPARATE,
// informational concern — see src/lib/reconciliation.js header. It never
// affects the exit code; it's summarized as a single WARNING count line
// instead of a per-wallet row, because it's expected to self-heal on the
// user's next session read and is not something `--fix` (or an on-call
// human) needs to act on the same way as real drift.
//
// `--fix --yes` additionally books a "reconciliation anchor" admin_adjustment
// ledger row on every wallet with driftAvailable != 0 (see
// src/lib/reconciliation.js — it never edits the wallet's available/reserved
// columns, only brings the ledger's movement sum in line with them) and
// re-checks each fixed wallet afterward. `--fix` without `--yes` refuses
// to run and makes no database writes — this is the safety guard against a
// bare `node scripts/reconcile-credits.mjs --fix` accidentally mutating
// production data.
//
// SAFETY: like scripts/seed-plans.mjs, this reads DATABASE_URL straight
// from the environment — it has no built-in host allowlist. Never invoke it
// with a production DATABASE_URL casually; against the disposable test
// container it's:
//   DATABASE_URL="postgresql://postgres:test@localhost:55432/test" node scripts/reconcile-credits.mjs

import "dotenv/config";
import { reconcileWallet, reconcileAll, anchorWallet } from "../src/lib/reconciliation.js";

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const yes = args.includes("--yes");

if (fix && !yes) {
  console.error("Refusing --fix without --yes (safety guard) — no changes made. Re-run with both flags to apply anchors.");
  process.exit(1);
}

const col = (v, w) => String(v).padEnd(w);
console.log(col("userId", 30), col("available", 10), col("reserved", 9), col("driftAvail", 11), col("driftRes", 9));

let total = 0;
let initiallyDrifted = 0;
let anchored = 0;
let finalDrift = 0;
let mirrorStaleCount = 0;

for await (const initial of reconcileAll()) {
  total++;
  if (initial.mirrorStale) mirrorStaleCount++;

  if (initial.ok) continue; // money invariants hold — mirror staleness alone is not drift

  initiallyDrifted++;
  let report = initial;

  if (fix && yes) {
    const result = await anchorWallet(initial.userId);
    if (result.anchored) anchored++;
    report = await reconcileWallet(initial.userId);
  }

  if (!report.ok) {
    finalDrift++;
    console.log(
      col(report.userId, 30),
      col(report.available, 10),
      col(report.reserved, 9),
      col(report.driftAvailable, 11),
      col(report.driftReserved, 9)
    );
  }
}

console.log("");
console.log(
  `${total} wallet(s) checked, ${initiallyDrifted} drifted (available/reserved)` +
    (fix && yes ? `, ${anchored} anchored, ${finalDrift} still drifted after fix.` : ".")
);
if (mirrorStaleCount > 0) {
  console.log(
    `WARNING: ${mirrorStaleCount} wallet(s) have a stale User.credits mirror ` +
      "(informational only — self-heals on the user's next session read; does not affect the exit code)."
  );
}

process.exit(finalDrift > 0 ? 1 : 0);
