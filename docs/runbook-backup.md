# Runbook: database backup and restore

Phase 8 Task A1 adds `scripts/backup-db.mjs` (`pg_dump --format=custom`) and
`scripts/restore-db.mjs` (`pg_restore`, target-explicit and guarded). Both
are plain `node` scripts (not bundled by Next — see `scripts/worker.mjs`'s
header for why every local import uses a relative, `.js`/`.mjs`-extended
path) and both load `.env` via `dotenv/config` the same way
`scripts/reconcile-credits.mjs` does.

**The restore rehearsal below is the actual deliverable of this task** — a
backup script that has never restored anything is not a backup. It was run
for real, in this environment, against the disposable test container only;
the exact commands and before/after row counts are recorded verbatim.

## Manual backup

```bash
BACKUP_DIR=/root/backups/db BACKUP_RETENTION_DAYS=14 node scripts/backup-db.mjs
```

Reads `DATABASE_URL` from the environment (via `.env` on the server, exactly
like every other script in `scripts/`). Writes
`<BACKUP_DIR>/helmies-studio-<ISO-date>-<HHMM>.dump` (UTC, custom pg format),
prints the resulting path and byte size, prunes dumps older than
`BACKUP_RETENTION_DAYS` days (**never the single newest dump on disk**, even
if it is itself past the retention window — a paused/broken backup cron must
never leave zero dumps behind), and **never prints the connection string**.
Exits non-zero on any failure (including an empty/zero-byte dump, treated as
a failed backup) so the systemd unit below records it.

The connection is handed to `pg_dump` via `PGHOST`/`PGPORT`/`PGUSER`/
`PGPASSWORD`/`PGDATABASE` environment variables (parsed from `DATABASE_URL`
by `pgEnvFromUrl`), never as a `--dbname=<url>` argument — a connection
string on argv is visible to any other local user via `ps`/
`/proc/<pid>/cmdline`; env vars handed directly to a child process are not.

## Restore to a scratch database

`restore-db.mjs` **never** defaults to `DATABASE_URL` — `--target` is always
required explicitly, so a bare invocation can never accidentally touch
whatever the environment happens to point at:

```bash
node scripts/restore-db.mjs \
  --target "postgresql://postgres:PASSWORD@HOST:PORT/scratch_db" \
  --file /root/backups/db/helmies-studio-2026-08-02-1125.dump \
  --yes
```

`--yes` is mandatory (a restore is destructive — `pg_restore --clean
--if-exists` drops existing objects in the target first). The script also
refuses a `--target` whose hostname matches the configured production
`DATABASE_URL` host, **unless** `--allow-production` is also passed (see
below) — `assertRestoreTargetAllowed` (exported, unit-tested in
`tests/unit/backup-args.test.mjs`) is the guard. On success it prints
`pg_restore`'s exit code plus a row-count summary of `User`, `Generation`,
`CreditWallet`, and `GenerationJob` so the operator can eyeball that the
restore genuinely contains data — **the row counts, not the raw exit code,
are the authoritative signal**: `pg_restore` commonly exits non-zero on
harmless ownership/privilege warnings even with `--no-owner` against a
target whose roles don't exactly match the source.

## Restore to production (destructive — read this twice)

**This overwrites every row currently in the production database with
whatever the dump contains.** Only run this as a deliberate disaster-recovery
action, never as a rehearsal, never speculatively:

```bash
node scripts/restore-db.mjs \
  --target "$DATABASE_URL" \
  --file /root/backups/db/helmies-studio-<timestamp>.dump \
  --yes --allow-production
```

`--allow-production` is the one flag that bypasses the production-host
guard — its absence is exactly what makes every other invocation of this
script safe by default. Confirm you are restoring the **correct** dump
(check its filename's timestamp) before running this; there is no undo.

## Retention policy and where dumps live

- **Location:** `BACKUP_DIR`, default `/root/backups/db` (root-owned, on the
  same server as the app — see `scripts/deploy.sh`'s `APP_DIR=/root/helmies-studio`).
  Off-box replication (rsync to another host, object storage, etc.) is not
  configured by this task — see the "not covered" note at the end of this
  doc.
- **Filename:** `helmies-studio-<ISO-date>-<HHMM>.dump`, UTC, custom `pg_dump`
  format (`buildBackupPath`, unit-tested).
- **Retention:** `BACKUP_RETENTION_DAYS`, default 14. Pruning always keeps
  the single newest dump regardless of its age (`prunableFiles`,
  unit-tested) — the retention sweep can never reduce the on-disk backup
  count to zero, even if the timer has been silently broken for weeks.

## Systemd unit + timer (nightly) — text only; **the controller installs these on the server**, not this task

`/etc/systemd/system/helmies-backup.service`:

```ini
[Unit]
Description=Helmies Studio nightly database backup
After=network.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/root/helmies-studio
ExecStart=/usr/bin/node scripts/backup-db.mjs
Environment=BACKUP_DIR=/root/backups/db
Environment=BACKUP_RETENTION_DAYS=14
```

`/etc/systemd/system/helmies-backup.timer`:

```ini
[Unit]
Description=Run helmies-backup.service nightly

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

`Persistent=true` means a backup still runs on the next boot if the server
was down at 03:15 (e.g. during a deploy/reboot window) rather than silently
skipping that day. Enable with:

```bash
systemctl daemon-reload
systemctl enable --now helmies-backup.timer
systemctl list-timers | grep helmies-backup   # confirm it's scheduled
journalctl -u helmies-backup.service --since "1 day ago"   # confirm it ran, or see why it failed
```

A failed run (non-zero exit from `backup-db.mjs`) is a `systemctl status
helmies-backup.service` failure, visible the same way any other systemd
service failure is — there is no separate alert wired to this yet (see
`RELEASE_STATUS.md` Gate F and `docs/runbook-ops.md`'s alert-threshold
table: backup failure has no threshold defined because, before this task,
there was no backup process to threshold at all).

---

## The rehearsal (the actual deliverable)

Run for real in this environment, against `helmies-test-pg`
(`postgresql://postgres:test@localhost:55432/test`) — **never** against the
`.env` `DATABASE_URL` (production). This sandbox has no native `pg_dump`/
`pg_restore` binaries (Windows dev box), so the rehearsal routes them through
`docker exec helmies-test-pg pg_dump/pg_restore` via two tiny wrapper
scripts placed ahead of `pg_dump`/`pg_restore` on `PATH` (`PG_DUMP_BIN`/
`PG_RESTORE_BIN` env vars also exist for an explicit override, but a bare
`PATH` shim was enough here). **Production has real `pg_dump`/`pg_restore`
installed alongside Postgres and never needs this** — the wrapper exists
purely so this rehearsal could run somewhere at all.

### 1. Seed recognizable rows into the test database

```bash
node -e '
import("pg").then(async ({ Client }) => {
  const c = new Client({ connectionString: "postgresql://postgres:test@localhost:55432/test" });
  await c.connect();
  for (let i = 1; i <= 3; i++) {
    await c.query(
      `INSERT INTO "User" (id, email, credits, "createdAt", "updatedAt") VALUES ($1, $2, 42, now(), now())`,
      [`rehearsal-user-${i}`, `backup-rehearsal-${i}@test.local`]
    );
  }
  await c.end();
});'
```

**Row counts before seeding:** marker rows (`email LIKE 'backup-rehearsal-%'`) = **0**.
Table totals: `User`=1, `Generation`=1, `CreditWallet`=1, `GenerationJob`=0.

**Row counts after seeding:** marker rows = **3**.
Table totals: `User`=**4**, `Generation`=1, `CreditWallet`=1, `GenerationJob`=0.

### 2. Back up the test database

```bash
DATABASE_URL="postgresql://postgres:test@localhost:55432/test" \
BACKUP_DIR="/c/tmp/helmies-backup-rehearsal" \
BACKUP_RETENTION_DAYS=14 \
node scripts/backup-db.mjs
```

Output:

```
Backup written: C:\tmp\helmies-backup-rehearsal\helmies-studio-2026-08-02-1125.dump (96434 bytes)
```

Exit code `0`. Dump file confirmed on disk at that path, 96,434 bytes.

### 3. Drop and recreate the test database (destructive — proves the dump is a full recreate, not just a data copy)

```bash
docker exec helmies-test-pg psql -U postgres -d postgres -c "DROP DATABASE test WITH (FORCE);"
docker exec helmies-test-pg psql -U postgres -d postgres -c "CREATE DATABASE test;"
```

Confirmed the fresh database has **zero tables at all**, not just zero rows:

```bash
$ docker exec helmies-test-pg psql -U postgres -d test -c 'SELECT COUNT(*) FROM "User";'
ERROR:  relation "User" does not exist
```

### 4. Restore

```bash
DATABASE_URL="postgresql://postgres:test@prod-placeholder.invalid:5432/prod" \
node scripts/restore-db.mjs \
  --target "postgresql://postgres:test@localhost:55432/test" \
  --file "/c/tmp/helmies-backup-rehearsal/helmies-studio-2026-08-02-1125.dump" \
  --yes
```

(`DATABASE_URL` was deliberately set to an unresolvable placeholder host here
— not the real `.env` value — purely so `assertRestoreTargetAllowed`'s
production-host comparison has a genuinely different host to compare the
`--target` against, without ever reading or connecting to the real
production URL. In normal operator use, `DATABASE_URL` is simply whatever
the server's `.env` already has, and this comparison happens automatically.)

Output:

```
pg_restore exit code: 0
Row counts after restore:
  User: 4
  Generation: 1
  CreditWallet: 1
  GenerationJob: 0
```

### 5. Proof the seeded rows came back

```bash
$ docker exec helmies-test-pg psql -U postgres -d test -c "SELECT id, email, credits FROM \"User\" WHERE email LIKE 'backup-rehearsal-%' ORDER BY id;"
        id        |             email             | credits
------------------+-------------------------------+---------
 rehearsal-user-1 | backup-rehearsal-1@test.local |      42
 rehearsal-user-2 | backup-rehearsal-2@test.local |      42
 rehearsal-user-3 | backup-rehearsal-3@test.local |      42
(3 rows)

$ docker exec helmies-test-pg psql -U postgres -d test -c "SELECT COUNT(*) FROM _prisma_migrations;"
 count
-------
    10
(1 row)
```

**Result: all 3 recognizable marker rows came back exactly (id, email, and
credits=42 all intact), the table totals after restore (User=4,
Generation=1, CreditWallet=1, GenerationJob=0) exactly match the pre-drop
totals, and the `_prisma_migrations` table (10 rows) proves the dump
restored the full schema from nothing — not merely a data copy into an
already-migrated database.**

The 3 marker rows were deleted afterward (`DELETE FROM "User" WHERE email
LIKE 'backup-rehearsal-%'`) to leave the test container clean for the
integration suite, which truncates and reseeds its own fixtures per test
regardless.

### What this proves, and what it doesn't

Proves: the dump format captures the full schema + data, the restore
pipeline (`pg_dump` → file → `pg_restore`) round-trips real rows correctly,
and both scripts' CLI wiring (env-var connection passing, `--target`/`--file`/
`--yes` parsing, the production-host guard) works end-to-end, not just in
the unit suite's mocked argument tests.

Does **not** prove: behavior against the real production database's size/
load (this test database is tiny), or an actual disaster-recovery scenario
against the live server. Those require the owner running this against
production infrastructure directly — see `RELEASE_STATUS.md` Gate B.

## Not covered by this task

- **Off-box replication** of the backup directory (rsync/object storage) —
  `BACKUP_DIR` is local disk on the same server the database itself is on,
  so a full server loss (not just a bad migration/deploy) still loses both
  the database and its backups together. Closing this needs an off-server
  destination, which needs the owner's choice of where (S3-compatible
  bucket, a second box, etc.) — out of scope here.
- **Paging on backup failure** — see `docs/runbook-ops.md`'s alert-threshold
  table; `journalctl -u helmies-backup.service` is the only signal today.
