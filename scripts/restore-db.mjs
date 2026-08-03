#!/usr/bin/env node
// Helmies Studio — restore a pg_dump backup (Phase 8 Task A1)
//
// Restores a --file dump into an explicit --target connection URL — NEVER
// defaults to DATABASE_URL, so a bare `node scripts/restore-db.mjs` can
// never accidentally touch whatever the environment happens to point at.
// Refuses to run without --yes (pg_restore --clean drops existing objects
// in the target first — this is a destructive operation) and refuses a
// target that resolves to the SAME host and database as the configured
// production DATABASE_URL, unless --allow-production is passed explicitly.
// That flag is the escape hatch a controller uses when a production restore
// is genuinely, deliberately intended (disaster recovery) — never something
// an implementer reaches for; see docs/runbook-backup.md.
//
// Prints a row-count summary of a few key tables afterward so the operator
// can eyeball that the restore actually contains data. `main()` also
// propagates pg_restore's own exit code as this script's exit code — a
// partially failed restore (e.g. `--clean` dropped objects but a later
// statement errored) must never be reported as a clean success just because
// row counts were printed.
//
// SECURITY (post-review hardening — see the header note on
// assertRestoreTargetAllowed below for the full history of what an
// executed, adversarial review round found and forced fixed here):
//   - .env is loaded from a path relative to THIS SCRIPT FILE, never
//     process.cwd() — an operator running this from the backup directory
//     (docs/runbook-backup.md's dumps live in /root/backups/db, not the
//     app directory) must get the exact same guard as running it from the
//     repo root.
//   - The production-host guard resolves BOTH the target and production
//     hosts to their real IP address(es) and also normalizes legacy IPv4
//     literal forms (127.1, decimal, octal) by hand — dns.lookup alone does
//     NOT resolve those on every platform (confirmed empirically: it
//     ENOTFOUNDs all three on this dev machine), so a bare hostname-string
//     compare or a DNS-lookup-only compare both under-detect "this is
//     actually the same server" the way a determined or careless operator
//     can trigger by accident.
//   - The guard FAILS CLOSED: if production's identity cannot be
//     established at all (DATABASE_URL unset/empty/unparseable), it
//     refuses rather than silently skipping the check. A safety interlock
//     on a destructive operation must never quietly disable itself.
import { config as loadDotenv } from "dotenv";
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { pgEnvFromUrl } from "./backup-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Script-relative, NOT process.cwd()-relative — see the CRITICAL 2 note
// above. scripts/ is always one level below the repo root, where .env
// lives (see .env.example).
loadDotenv({ path: path.join(__dirname, "..", ".env") });

// Tables whose row counts are printed after a restore — a mix of the
// user/money/queue tables that, together, tell an operator at a glance
// whether the restore genuinely contains real data or came back empty.
export const KEY_TABLES = ["User", "Generation", "CreditWallet", "GenerationJob"];

function normalizeHost(h) {
  // Lowercase, and strip a single trailing "." — an FQDN's absolute form
  // ("localhost.") is the same name as "localhost" per DNS, and a bare
  // string compare must treat them identically rather than as a bypass.
  return (h || "").toLowerCase().replace(/\.$/, "");
}

function parseIntPart(s) {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]+$/.test(s)) return parseInt(s, 8); // leading zero, more digits -> octal
  if (/^0$/.test(s)) return 0;
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  return null;
}

// Manually normalizes the classic BSD inet_aton-style legacy IPv4 literal
// forms to a canonical dotted-quad, independent of the OS resolver —
// dns.lookup does NOT reliably normalize these across platforms (verified:
// it ENOTFOUNDs "127.1", "2130706433", and "0177.0.0.1" on this dev
// machine's resolver), so relying on DNS alone would silently miss exactly
// the bypass forms a code review found and executed against this guard:
//   - 4 parts "a.b.c.d": each an octet (decimal, 0x-hex, or 0-leading octal).
//   - 3 parts "a.b.c": a, b are octets; c is a 16-bit remainder.
//   - 2 parts "a.b": a is an octet; b is a 24-bit remainder ("127.1" -> 127.0.0.1).
//   - 1 part "a": the whole 32-bit address as one number ("2130706433" -> 127.0.0.1).
// Returns null (not an IPv4 literal in any of these forms — e.g. an
// ordinary hostname like "prod-db.example.com") when the input doesn't
// parse cleanly under these rules.
export function parseLegacyIPv4(input) {
  if (typeof input !== "string" || input.length === 0) return null;
  const parts = input.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums = [];
  for (const p of parts) {
    const n = parseIntPart(p);
    if (n === null || !Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  let value;
  if (nums.length === 4) {
    if (nums.some((n) => n > 255)) return null;
    value = (nums[0] * 2 ** 24) + (nums[1] * 2 ** 16) + (nums[2] * 2 ** 8) + nums[3];
  } else if (nums.length === 3) {
    if (nums[0] > 255 || nums[1] > 255 || nums[2] > 0xffff) return null;
    value = (nums[0] * 2 ** 24) + (nums[1] * 2 ** 16) + nums[2];
  } else if (nums.length === 2) {
    if (nums[0] > 255 || nums[1] > 0xffffff) return null;
    value = (nums[0] * 2 ** 24) + nums[1];
  } else {
    if (nums[0] > 0xffffffff) return null;
    value = nums[0];
  }
  value = value >>> 0;
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(".");
}

// Resolves `hostname` to a Set of IP address strings it could plausibly
// mean, combining the manual legacy-IPv4 parse above with a real DNS/
// getaddrinfo lookup (for genuine hostnames like "localhost" -> 127.0.0.1,
// which parseLegacyIPv4 correctly does NOT touch). Never throws — an
// unresolvable/non-existent host just yields an empty set, which simply
// fails to match anything (handled by the caller, not treated as fatal
// here; assertRestoreTargetAllowed's fail-closed behavior is about
// PRODUCTION's identity being unknown, not about a --target that happens
// not to resolve).
export async function resolveHostIps(hostname) {
  const ips = new Set();
  const legacy = parseLegacyIPv4(hostname);
  if (legacy) ips.add(legacy);
  try {
    const results = await dns.promises.lookup(hostname, { all: true });
    for (const r of results) ips.add(r.address);
  } catch {
    // not resolvable via DNS/getaddrinfo — fine, the legacy-IPv4 parse
    // (if any) still applies, and plain string equality is checked
    // separately by the caller regardless.
  }
  return ips;
}

// ── The guard (tests/unit/backup-args.test.mjs) ─────────────────────────────
//
// Refuses unless: --target is present, --yes is present, AND (the target is
// demonstrably NOT the production host+database, OR --allow-production is
// explicitly passed). "Demonstrably not production" requires BOTH the
// resolved host identity (string-normalized OR IP-set-intersecting) AND the
// database name to differ — comparing the database name too means a
// same-host restore into a clearly different (scratch) database name
// doesn't force operators into routinely reaching for --allow-production,
// while a same-host SAME-database-name target (the exact bypass an
// executed review proved: prod on "localhost", target on "127.0.0.1",
// identical database name) is still caught.
//
// FAILS CLOSED: if production's identity can't be established at all
// (DATABASE_URL unset, empty, or unparseable), this REFUSES rather than
// silently skipping the check — passing --allow-production is the only way
// to proceed in that case, exactly the same as an actual production match.
export async function assertRestoreTargetAllowed(
  targetUrl,
  { yes = false, allowProduction = false, productionUrl = process.env.DATABASE_URL } = {}
) {
  if (!targetUrl) {
    throw new Error("--target is required — restore-db.mjs never defaults to DATABASE_URL.");
  }
  if (!yes) {
    throw new Error("Refusing to restore without --yes (this is a destructive operation).");
  }

  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    throw new Error('--target is not a valid Postgres connection URL (expected "postgresql://user:pass@host:port/db").');
  }
  const targetHost = normalizeHost(target.hostname);
  const targetPort = target.port || "5432";
  const targetDb = target.pathname.replace(/^\//, "");

  if (allowProduction) {
    return { targetHost, targetDb, bypassed: true };
  }

  if (!productionUrl || !productionUrl.trim()) {
    throw new Error(
      "Refusing to restore: DATABASE_URL is not set, so the production-host guard cannot confirm --target is safe. " +
        "Pass --allow-production only when a production restore is deliberately intended."
    );
  }
  let prod;
  try {
    prod = new URL(productionUrl);
  } catch {
    throw new Error(
      "Refusing to restore: DATABASE_URL could not be parsed, so the production-host guard cannot confirm --target is safe. " +
        "Pass --allow-production only when a production restore is deliberately intended."
    );
  }
  const prodHost = normalizeHost(prod.hostname);
  const prodPort = prod.port || "5432";
  const prodDb = prod.pathname.replace(/^\//, "");

  let sameHost = targetHost === prodHost;
  if (!sameHost) {
    const [targetIps, prodIps] = await Promise.all([resolveHostIps(target.hostname), resolveHostIps(prod.hostname)]);
    for (const ip of targetIps) {
      if (prodIps.has(ip)) {
        sameHost = true;
        break;
      }
    }
  }

  if (sameHost && targetPort === prodPort && targetDb === prodDb) {
    throw new Error(
      `Refusing to restore into "${targetHost}:${targetPort}/${targetDb}" — it resolves to the same host, port, ` +
        "and database as the configured production DATABASE_URL. Pass --allow-production only when a production " +
        "restore is deliberately intended."
    );
  }

  return { targetHost, targetDb };
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
  await assertRestoreTargetAllowed(target, { yes, allowProduction, productionUrl });
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
  // Propagate a non-zero pg_restore exit code as this script's own exit
  // code — printing row counts must never read as "the restore succeeded"
  // when pg_restore itself reported a failure (e.g. a partial restore
  // after --clean --if-exists already dropped objects). process.exitCode
  // (not process.exit()) lets the console output above actually flush
  // first.
  if (result.code !== 0) {
    console.error(`pg_restore exited non-zero (${result.code}) — treat the row counts above as unreliable.`);
    process.exitCode = result.code;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`restore-db failed: ${err.message}`);
    process.exit(1);
  });
}
