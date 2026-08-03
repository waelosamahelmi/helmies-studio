#!/usr/bin/env node
// Helmies Studio — production database backup (Phase 8 Task A1)
//
// pg_dump --format=custom of DATABASE_URL, written under BACKUP_DIR (default
// /root/backups/db) as helmies-studio-<ISO-date>-<HHMM>.dump. Prunes dumps
// older than BACKUP_RETENTION_DAYS (default 14) but never the single newest
// file on disk, even if that file is itself past the retention window (a
// paused/broken backup cron must never leave zero dumps behind). Prints the
// resulting path and byte size on success; NEVER prints the connection
// string. Exits non-zero on any failure so a systemd unit records it
// (`systemctl status` / `journalctl -u <unit>` show a failed run) — see
// docs/runbook-backup.md for the timer text and the rehearsed restore proof.
//
// Runs under plain `node` (not bundled by Next), so every local import is a
// RELATIVE path with an explicit ".js"/".mjs" extension — same convention
// as scripts/worker.mjs and scripts/reconcile-credits.mjs (see worker.mjs's
// header for the full rationale: Node has no knowledge of the app's "@/..."
// bundler alias). Env vars are loaded from a path relative to THIS SCRIPT
// FILE (fileURLToPath(import.meta.url)), never process.cwd() — a bare
// `import "dotenv/config"` is cwd-relative, so running this script from any
// directory other than the repo root (e.g. `cd /root/backups/db && node
// /root/helmies-studio/scripts/backup-db.mjs`) would silently see an empty
// environment. restore-db.mjs shares this same fix for the identical
// reason, but there it is safety-critical (a missing DATABASE_URL there
// used to fail its production-host guard OPEN, not just fail to back up).
//
// SAFETY: reads DATABASE_URL straight from the environment, same as
// scripts/reconcile-credits.mjs — on the production server that IS the
// production database, by design (that's the entire point of a backup
// script). It has no built-in host allowlist of its own; the
// destructive-direction guard lives in restore-db.mjs, which never defaults
// to DATABASE_URL and refuses a target that looks like production.
//
// The connection is passed to pg_dump via PG* environment variables
// (pgEnvFromUrl below), never as a CLI argument — a connection string on
// argv is visible to any other local user via `ps`/`/proc/<pid>/cmdline`;
// env vars handed directly to a child process are not.

import { config as loadDotenv } from "dotenv";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, "..", ".env") });

export const DEFAULT_BACKUP_DIR = "/root/backups/db";
export const DEFAULT_RETENTION_DAYS = 14;

// ── Pure, unit-tested logic (tests/unit/backup-args.test.mjs) ──────────────

// Deterministic filename for a fixed clock: helmies-studio-<ISO-date>-<HHMM>.dump.
// Built from now.toISOString() (always UTC) rather than local Date getters —
// a server and a developer's laptop in different timezones must never
// produce a different name for "the same instant".
export function buildBackupPath(now, dir) {
  const iso = now.toISOString(); // "2026-08-02T14:30:07.123Z"
  const date = iso.slice(0, 10); // "2026-08-02"
  const hhmm = iso.slice(11, 16).replace(":", ""); // "1430"
  return path.join(dir, `helmies-studio-${date}-${hhmm}.dump`);
}

function toMs(mtime) {
  return mtime instanceof Date ? mtime.getTime() : Number(mtime);
}

// Given the existing dump files in BACKUP_DIR (as { name, mtime } — mtime a
// Date or epoch-ms), returns the ones eligible for deletion: strictly older
// than retentionDays AND never the single newest file on disk.
export function prunableFiles(files, now, retentionDays) {
  if (!files || files.length === 0) return [];
  const nowMs = now.getTime();
  const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
  const sorted = [...files].sort((a, b) => toMs(b.mtime) - toMs(a.mtime)); // newest first
  const [, ...rest] = sorted; // drop the newest unconditionally
  return rest.filter((f) => nowMs - toMs(f.mtime) > cutoffMs);
}

// Parses a postgres connection URL into the PG* env vars libpq-based tools
// (pg_dump/pg_restore) read automatically — exported so restore-db.mjs
// reuses the exact same parsing (one implementation, not two).
export function pgEnvFromUrl(urlStr) {
  const u = new URL(urlStr);
  const env = {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username || ""),
    PGDATABASE: u.pathname.replace(/^\//, ""),
  };
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  return env;
}

// ── The actual dump (child process — not unit-tested directly; exercised by
// the rehearsal in docs/runbook-backup.md against the real test container) ──
//
// Resolves only once BOTH the child process has closed AND the destination
// WriteStream has actually finished flushing to disk — `child.on("close")`
// alone does NOT guarantee that: it fires once the child's own stdio
// descriptors close, which can race ahead of a piped WriteStream's buffered
// writes landing on disk (more likely on a slow disk or a large dump). A
// caller that trusted "close" alone could statSync() the file before the
// last bytes were actually written, under-reporting its size — the
// size===0 branch in backupDatabase() below would then delete a real,
// merely-not-yet-fully-flushed dump. `out` also gets its own "error"
// handler (e.g. ENOSPC/EACCES) — Node throws an uncaught exception for an
// "error" event with no listener, which an earlier version of this
// function left unhandled entirely.
function runPgDump(env, destPath, { bin = process.env.PG_DUMP_BIN || "pg_dump" } = {}) {
  return new Promise((resolve, reject) => {
    // shell:true so a `.cmd`/`.bat` shim (e.g. a Windows dev box with no
    // native pg_dump — see docs/runbook-backup.md's rehearsal section) can
    // be found the same way a real Linux binary is; safe here because
    // every argument is a static, hardcoded flag, never caller/user input.
    const child = spawn(bin, ["--format=custom", "--no-owner", "--no-privileges"], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    const out = createWriteStream(destPath);

    let stderr = "";
    let settled = false;
    let childCode = null;
    let childClosed = false;
    let outFinished = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const maybeResolve = () => {
      if (settled || !childClosed || !outFinished) return;
      settled = true;
      if (childCode === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${childCode}${stderr ? `: ${stderr.trim()}` : ""}`));
    };

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", fail);
    out.on("error", fail);
    child.on("close", (code) => {
      childCode = code;
      childClosed = true;
      maybeResolve();
    });
    out.on("finish", () => {
      outFinished = true;
      maybeResolve();
    });

    child.stdout.pipe(out);
  });
}

export async function backupDatabase({
  databaseUrl = process.env.DATABASE_URL,
  dir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR,
  retentionDays = Number(process.env.BACKUP_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS,
  now = new Date(),
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set — nothing to back up.");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const destPath = buildBackupPath(now, dir);
  const env = pgEnvFromUrl(databaseUrl);
  await runPgDump(env, destPath);

  const size = statSync(destPath).size;
  if (size === 0) {
    unlinkSync(destPath);
    throw new Error("pg_dump produced an empty file — treating this as a failed backup.");
  }

  const existing = readdirSync(dir)
    .filter((name) => name.startsWith("helmies-studio-") && name.endsWith(".dump"))
    .map((name) => ({ name, mtime: statSync(path.join(dir, name)).mtime }));
  const toPrune = prunableFiles(existing, now, retentionDays);
  for (const f of toPrune) unlinkSync(path.join(dir, f.name));

  return { path: destPath, bytes: size, pruned: toPrune.map((f) => f.name) };
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────
async function main() {
  const result = await backupDatabase({});
  console.log(`Backup written: ${result.path} (${result.bytes} bytes)`);
  if (result.pruned.length > 0) {
    console.log(`Pruned ${result.pruned.length} old dump(s): ${result.pruned.join(", ")}`);
  }
}

// Only run the CLI when this file is executed directly (`node
// scripts/backup-db.mjs`), never when imported (tests, or restore-db.mjs
// importing pgEnvFromUrl) — path.resolve()/fileURLToPath() comparison is
// Windows-path-safe, unlike a raw string compare against import.meta.url.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`backup-db failed: ${err.message}`);
    process.exit(1);
  });
}
