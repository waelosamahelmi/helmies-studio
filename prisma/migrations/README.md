# Migrations

The schema was historically applied with `prisma db push`; `0_init` is the
baseline snapshot of that state (generated 2026-08-01 via `prisma migrate diff`).

## One-time production adoption (next deploy)
The production database already has this schema, so mark the baseline as
applied instead of running it:

    npx prisma migrate resolve --applied 0_init

## Every schema change after the baseline
1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate:dev -- --name <change>` against a development database.
3. Commit the generated migration folder together with the schema change.
4. Deploys run `npm run db:migrate:deploy` (`prisma migrate deploy`) before
   `pm2 restart`. Never `db push`, never `--force-reset`, never edit an
   applied migration.

Destructive changes use expand-and-contract: add the new shape, backfill,
switch readers, then drop the old shape in a later migration.

## Phase 2 adoption
The Phase 2 migrations (starting 20260801120000) add two CHECK constraints on
CreditWallet.available and CreditWallet.reserved, plus one nullable column
SubscriptionPlan.stripePriceIdYearly. These are additive, non-destructive
changes — no data rewrite, instant on this dataset.

Run the resolve command once on the server before deploying Phase 2, then all
subsequent deploys apply new migrations via `npx prisma migrate deploy`.

## Phase 3 Task 4 adoption
`20260801130000_anon_rate_limit` adds one new table, `AnonRateLimit` (no FKs,
no existing data affected) — the durable, hashed-IP backing store for
`checkAnonLimit` in `src/lib/rate-limit.js`, replacing the old in-process
`anonBuckets` Map and the register route's local `attempts` Map. Purely
additive; applies via the normal `npx prisma migrate deploy` step.
