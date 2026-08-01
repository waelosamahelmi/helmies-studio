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
