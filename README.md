# Helmies Studio

AI creative SaaS — image/video/audio generation, brand kits, and agent-driven
workflows. Production: **https://studio.helmies.fi**

## Stack

- **Framework**: Next.js 16.2 (App Router), React 19, Framer Motion, Tailwind CSS 4
- **Language**: JavaScript (JSX) — application source is currently all `.js`/`.jsx`.
  `tsconfig.json` type-checks it (`npm run typecheck`) and new standalone modules may
  be authored in TypeScript going forward; existing `.js` files aren't being bulk-rewritten
- **Database**: PostgreSQL via Prisma 7.8 (`@prisma/adapter-pg` / `pg`), Supabase-hosted
  in production
- **Auth**: NextAuth v5 (beta) + `@auth/prisma-adapter`, JWT sessions, Google OAuth
- **Payments**: Stripe (one-time credit packs + recurring subscription plans)
- **AI providers**: KIE (primary media provider), Alibaba Cloud (Qwen/Wan, secondary),
  OpenRouter (LLM chat/agent orchestration)

Full architecture, directory layout, and lib module reference: **[AGENTS.md](./AGENTS.md)**.
Current-state functional reference (routes, auth levels, data model facts):
**[STUDIO_FUNCTIONALITY.md](./STUDIO_FUNCTIONALITY.md)**.

## Prerequisites

- Node.js 22.x (matches `node-version: 22` in `.github/workflows/ci.yml`; CI does not pin an npm version)
- A PostgreSQL database (Supabase or local Postgres). Local dev commonly runs Postgres
  on a non-default port — check `DATABASE_URL` in your `.env` rather than assuming 5432.
- Accounts/keys for the providers you intend to exercise locally: KIE, Alibaba Cloud,
  Stripe (test mode), Google OAuth client, OpenRouter. Everything else can run with
  those unset, but the corresponding features will fail at request time.

## Getting started

```bash
npm install
cp .env.example .env      # fill in real values — see "Environment variables" below
npm run db:generate       # generate the Prisma client
npm run db:migrate:dev    # apply migrations to your local database
npm run dev                # http://localhost:3003
```

`npm run dev` starts the dev server on **port 3003** (not Next's default 3000 —
`NEXTAUTH_URL`/`NEXT_PUBLIC_URL`/`APP_URL` in `.env.example` already assume this).

## Environment variables

Full list with inline comments lives in **[.env.example](./.env.example)**; copy it to
`.env` and fill in real values. Never commit `.env` — `.gitignore` excludes every
`.env*` file except `.env.example`. Categories:

| Group | Variables |
|---|---|
| Database | `DATABASE_URL` |
| NextAuth | `NEXTAUTH_URL`, `NEXTAUTH_SECRET` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Admin seed (`scripts/seed-admin.mjs` only) | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` |
| KIE (primary AI provider) | `KIE_KEY` |
| Alibaba Cloud (secondary provider) | `ALIBABA_KEY`, `ALIBABA_WORKSPACE_ID` |
| Stripe | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Stripe price IDs | `STRIPE_PRICE_STARTER[_YEARLY]`, `STRIPE_PRICE_STUDIO[_YEARLY]`, `STRIPE_PRICE_PRO[_YEARLY]` |
| LLM (agents/chat) | `OPENROUTER_KEY`, `LLM_MODEL`, `VISION_MODEL` |
| Automation | `CRON_SECRET`, `WEBHOOK_SECRET` (falls back to `CRON_SECRET` if unset) |
| Site URL / outbound allowlist | `NEXT_PUBLIC_URL`, `APP_URL` |

`npm run check:env` (`scripts/check-env.mjs`) verifies the required subset is present
in your environment and documented in `.env.example`.

## Scripts

All scripts below are defined in `package.json`; this table is exactly what's there —
run `npm run <script>`.

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev --port 3003` | Local dev server on port 3003 |
| `build` | `next build` | Production build — always run before `pm2 restart` |
| `start` | `next start` | Serve a production build |
| `lint` | `eslint . --max-warnings=0` | ESLint, zero warnings tolerated |
| `typecheck` | `tsc --noEmit` | Type-check via `tsconfig.json` |
| `test` | `vitest run` | Run the Vitest suite once |
| `test:watch` | `vitest` | Vitest in watch mode |
| `db:generate` | `prisma generate` | Regenerate the Prisma client from `prisma/schema.prisma` |
| `db:migrate:dev` | `prisma migrate dev` | Create/apply a migration against a dev database |
| `db:migrate:deploy` | `prisma migrate deploy` | Apply pending migrations (used in deploys/CI) |
| `check:dead-code` | `node scripts/dead-code.mjs` | Report unused exports/files |
| `check:env` | `node scripts/check-env.mjs` | Verify required env vars are set and documented in `.env.example` |

`scripts/` also has standalone utility scripts not wired into `package.json` (seeding,
provider diagnostics, media cleanup, etc.) — run those directly with
`node scripts/<name>.mjs`.

## Testing

```bash
npm test          # vitest run — unit tests in tests/unit/**/*.test.{js,mjs,ts}
npm run test:watch
```

Tests run against the `@` path alias (`src/`) with `environment: "node"` — see
`vitest.config.mjs`. Add new tests under `tests/unit/`.

## Database & migrations

Schema is Prisma-managed with a real migration history under `prisma/migrations/`
(baseline `0_init`, adopted 2026-08-01 — the schema was previously applied with
`prisma db push`). For the full workflow (baseline adoption, how to add a migration,
expand-and-contract for destructive changes), see
**[prisma/migrations/README.md](./prisma/migrations/README.md)**. Short version:

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate:dev -- --name <change>` against a dev database.
3. Commit the generated migration folder with the schema change.
4. Deploys apply it with `npm run db:migrate:deploy`. Never `prisma db push` in a
   deploy path, never `--force-reset`, never hand-edit an applied migration.

## Deployment

Production runs behind Nginx at `studio.helmies.fi`, reverse-proxied to a PM2 process
named `helmies-studio` on port 3010. The deploy sequence — pull `main`, install
dependencies if the lockfile moved, regenerate the Prisma client, apply schema
changes, `npm run build`, `pm2 restart helmies-studio --update-env`, then health-check
— is codified in `scripts/deploy.sh` (run on the server). CI (`.github/workflows/ci.yml`)
runs lint, typecheck, tests, a production build, a migration-deploy dry run against a
disposable Postgres, and a dependency audit on every push to `main` and every PR.

Note: `scripts/deploy.sh` still runs `prisma db push --skip-generate` for the schema
step, which predates the Prisma Migrate workflow adopted in
`prisma/migrations/README.md` (2026-08-01) — that doc is the current source of truth
for how schema changes should ship; treat `deploy.sh`'s db-push step as due for an
update to `prisma migrate deploy`.

### Seeding subscription plans and credit packs

Checkout, top-up, and the Stripe webhook read pricing/credit amounts from the
`SubscriptionPlan` and `CreditPack` tables — the admin Plans/Credit Packs editors
write these rows and now genuinely drive billing (they used to be decorative).
Run `node scripts/seed-plans.mjs` once at deploy to create/refresh the default
rows, and again any time a `STRIPE_PRICE_*` env var changes (it reads
`DATABASE_URL` and the `STRIPE_PRICE_*` vars from the environment, and upserts —
safe to re-run, never duplicates rows). A missing or inactive plan/pack row makes
checkout and top-up return 400; a missing `SubscriptionPlan` row for a webhook
event grants 0 credits (logged loudly) rather than crashing the webhook.

Full architecture and deploy context: **[AGENTS.md](./AGENTS.md)**.

## Current quality work

Phase 1 of an ongoing production-excellence effort (foundation stabilization: lint,
typecheck, tests, CI, migrations baseline, env checks, repo hygiene, targeted
runtime/security fixes) is tracked in
**[docs/superpowers/plans/2026-08-01-production-excellence-roadmap.md](./docs/superpowers/plans/2026-08-01-production-excellence-roadmap.md)**,
which also maps the remaining phases (money correctness, security hardening, durable
jobs, UX/accessibility, templates, admin/observability).

## Security

See **[SECURITY.md](./SECURITY.md)** for how to report a vulnerability.

## Contributing

- Read `AGENTS.md` before making structural changes — it documents conventions
  (ES modules, `"use client"`, admin route guarding, the credit/wallet system) that
  aren't obvious from the code alone.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before
  opening a PR — see `.github/PULL_REQUEST_TEMPLATE.md` for the required evidence.
- The landing page (`/`, marketing site) is out of scope for the current stabilization
  effort described above.
