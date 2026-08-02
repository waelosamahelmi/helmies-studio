#!/usr/bin/env node
// Helmies Studio — restore a pg_dump backup (Phase 8 Task A1)
//
// Restores a --file dump into an explicit --target connection URL — NEVER
// defaults to DATABASE_URL, so a bare `node scripts/restore-db.mjs` can
// never accidentally touch whatever the environment happens to point at.
// Refuses to run without --yes (pg_restore --clean drops existing objects
// in the target first — this is a destructive operation) and refuses a
// target whose hostname matches the configured production DATABASE_URL's
// hostname unless --allow-production is passed explicitly. That flag is the
// escape hatch a controller uses when a production restore is genuinely,
// deliberately intended (disaster recovery) — never something an
// implementer reaches for; see docs/runbook-backup.md.
//
// Prints a row-count summary of a few key tables afterward so the operator
// can eyeball that the restore actually contains data, not just that
// pg_restore exited 0 (pg_restore commonly exits non-zero on harmless
// ownership/privilege warnings even with --no-owner — the row counts, not
// the raw exit code, are the authoritative signal here).
//
// Runs under plain `node`; see backup-db.mjs's header for the relative-
// import / "dotenv/config" convention this file shares with it.

import "dotenv/config";
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { pgEnvFromUrl } from "./backup-db.mjs";

// Tables whose row counts are printed after a restore — a mix of the
// user/money/queue tables that, together, tell an operator at a glance
// whether the restore genuinely contains real data or came back empty.
export const KEY_TABLES = ["User", "Generation", "CreditWallet", "GenerationJob"];

// ── Pure guard — no I/O, fully unit-testable (tests/unit/backup-args.test.mjs) ──
export function assertRestoreTargetAllowed(
  targetUrl,
  { yes = false, allowProduction = false, productionUrl = process.env.DATABASE_URL } = {}
) {
  if (!targetUrl) {
    throw new Error("--target is required — restore-db.mjs never defaults to DATABASE_URL.");
  }
  if (!yes) {
    throw new Error("Refusing to restore without --yes (this is a destructive operation).");
  }
  let targetHost;
  try {
    targetHost = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    throw new Error('--target is not a valid Postgres connection URL (expected "postgresql://user:pass@host:port/db").');
  }
  if (!allowProduction && productionUrl) {
    let prodHost = null;
    try {
      prodHost = new URL(productionUrl).hostname.toLowerCase();
    } catch {
      prodHost = null; // an unparsable DATABASE_URL can't be matched against — fail open on the guard, not on startup
    }
    if (prodHost && targetHost === prodHost) {
      throw new Error(
        `Refusing to restore into "${targetHost}" — it matches the configured production DATABASE_URL host. ` +
          "Pass --allow-production only when a production restore is deliberately intended."
      );
    }
  }
  return { targetHost };
}

// ── The actual restore (child process — exercised for real by the rehearsal
// in docs/runbook-backup.md, not by the unit suite) ─────────────────────────
function runPgRestore(env, srcPath, { bin = process.env.PG_RESTORE_BIN || "pg_restore" } = {}) {
  return new Promise((resolve, reject) => {
    // shell:true — see the matching comment in backup-db.mjs's runPgDump;
    // every argument here is either a static, hardcoded flag or the target
    // database NAME (no credentials — those stay in env, never argv).
    // --dbname is required: unlike pg_dump, pg_restore only reads
    // PGHOST/PGPORT/PGUSER/PGPASSWORD from the environment for the
    // connection it makes on your behalf, but still needs to be told
    // explicitly to restore direct-to-database (vs. its default of writing
    // a plain-SQL script) — "one of -d/--dbname and -f/--file must be
    // specified" is what pg_restore says without it.
    const child = spawn(
      bin,
      ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--dbname", env.PGDATABASE],
      {
        env: { ...process.env, ...env },
        stdio: ["pipe", "inherit", "pipe"],
        shell: true,
      }
    );
    createReadStream(srcPath).pipe(child.stdin);
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    child.on("error", reject); // only a genuinely missing/unspawnable binary is fatal here
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

async function rowCounts(targetUrl) {
  const client = new Client({ connectionString: targetUrl });
  await client.connect();
  const counts = {};
  try {
    for (const table of KEY_TABLES) {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM "public"."${table}"`);
      counts[table] = rows[0].count;
    }
  } finally {
    await client.end();
  }
  return counts;
}

export async function restoreDatabase({ file, target, yes, allowProduction, productionUrl } = {}) {
  assertRestoreTargetAllowed(target, { yes, allowProduction, productionUrl });
  if (!file || !existsSync(file)) {
    throw new Error(`--file "${file}" does not exist.`);
  }
  const env = pgEnvFromUrl(target);
  const { code, stderr } = await runPgRestore(env, file);
  const counts = await rowCounts(target);
  return { code, stderr, counts };
}

function parseArgs(argv) {
  const out = { yes: false, allowProduction: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") out.yes = true;
    else if (a === "--allow-production") out.allowProduction = true;
    else if (a === "--target") out.target = argv[++i];
    else if (a.startsWith("--target=")) out.target = a.slice("--target=".length);
    else if (a === "--file") out.file = argv[++i];
    else if (a.startsWith("--file=")) out.file = a.slice("--file=".length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await restoreDatabase(args);
  console.log(`pg_restore exit code: ${result.code}`);
  console.log("Row counts after restore:");
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`  ${table}: ${count}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`restore-db failed: ${err.message}`);
    process.exit(1);
  });
}
