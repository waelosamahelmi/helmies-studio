# Production Excellence Roadmap — Contract Execution Map

**Source contract:** `01_HELMIES_STUDIO_PRODUCTION_EXCELLENCE_AND_QA.md` (2026-07-31)
**Companion docs:** `HELMIES_STUDIO_MASTER_UPGRADE.md` (product vision), `STUDIO_FUNCTIONALITY.md` (current-state reference, verified 2026-07-28 — partially stale; see "Verified current state" below)
**Rule:** each phase is its own implementation plan in `docs/superpowers/plans/`, produces working, testable software, and merges only when its gate-relevant checks pass. Landing page (`/` marketing site) is off-limits throughout.

## Verified current state (2026-08-01, HEAD `6ee1eea`)

Baseline audit results:

- `npm run build` — **passes** (exit 0)
- `npm run lint` — **broken** (`next lint` removed in Next 16)
- `npx tsc --noEmit` — **cannot run** (no `tsconfig.json`)
- No `prisma/migrations/` — schema managed by `db push`
- No test runner, no ESLint config, no `.github/` CI
- 3 of 4 files in `tests/` reference deleted source files and throw on load
- `ssh.md` is NOT git-tracked (stale doc claim); `.env` not tracked; SSRF allowlist (`src/lib/net-allowlist.js`) already validates redirects + DNS

Highest-severity open defects (from 2026-08-01 code audit):

| # | Defect | Where |
|---|---|---|
| M1 | Agent credit debits bypass wallet, silently reverted by `syncUserCreditsFromWallet` → agent runs are free | `src/lib/agents.js:584-596` vs `src/lib/session.js:22-27` |
| M2 | `debitCredits`/`creditUser` mutate wallet without transaction or ledger entry | `src/lib/session.js:45-75` (used by generation webhooks, director executor) |
| M3 | Over-spend race in `reserveCredits`: stale-read guard, no conditional update, no DB check constraint | `src/lib/wallet.js:46-52` |
| M4 | Stripe idempotency marker written AFTER grants — crash between grant and marker double-grants on retry | `src/app/api/stripe/webhook/route.js:52` vs `:148` |
| M5 | Under-billing: models without a `ModelPricing` row bill at flat tool default; `body.endpoint` can select model when `body.model` omitted | `src/lib/generation-handler.js:54,148-157` |
| M6 | Admin plan/pack editors are decorative — billing reads env/hardcoded constants only | `stripe/checkout`, `stripe/topup`, `src/lib/plan-constants.js` |
| S1 | `GET /api/admin/providers` returns plaintext `ProviderConfig.apiKey` to browser | `src/app/api/admin/providers/route.js:8-9` |
| S2 | Public `/api/models/catalog` exposes `providerCost` + raw `pricingRules` (margin disclosure) | `src/lib/model-catalog.js:83-111` |
| R1 | All canvas writes 500: route uses `content`/`version`, schema has `data`/no version column | `src/app/api/canvas/route.js`, `canvas/versions/route.js` |
| R2 | Anonymous contact form 500s: `ip:<addr>` passed as `RateLimit.userId` which has an FK to `User` | `src/app/api/contact/route.js:24`, `src/lib/security.js:52-80` |
| R3 | Admin model test reads nonexistent `model.credits`/`model.provider` fields | `src/app/api/admin/models/test/route.js:47,56,66` |
| A1 | No queue: sync generate routes hold HTTP request through in-process polling up to ~9 min | `src/lib/generation.js`, `src/lib/providers.js:208-245` |
| A2 | Media on local disk (`public/media`, `public/uploads`) — not durable, not multi-instance safe | `src/lib/media-storage.js` |

## Phases

### Phase 1 — Foundation & stabilization *(plan: `2026-08-01-phase1-foundation-stabilization.md`)*
Contract §1, §8.1 (partial), quick-win fixes R1–R3, S1–S2.
ESLint (zero warnings) + tsconfig/typecheck + Vitest + CI + prisma migrations baseline + `check-env` + repo hygiene + the five small runtime/security fixes, each test-first. → Gate A substantially.

### Phase 2 — Money correctness
Contract §2.2, §4. Fixes M1–M6.
Single wallet authority (delete `session.js` debit/credit + `agents.js` private helpers + direct `User.credits` writes in admin/automation); atomic conditional reserve + `available >= 0` DB constraint + concurrency tests; opening ledger entries on both signup paths; Stripe webhook grant+marker in one transaction; submit idempotency keys; kill under-billing (require pricing row or explicit static-cost policy; reject endpoint-only selection); checkout/topup read `SubscriptionPlan`/`CreditPack` tables; reconciliation script comparing wallet↔ledger↔reservations↔Stripe. Integration tests against a real Postgres (CI service container). → Gate B.

### Phase 3 — Security hardening
Contract §3, §9. Unified `requireUser`/`requireAdmin` with correct 401/403 (today: two implementations, admin routes return 401 for everything); machine-readable route security manifest + CI check; negative ownership tests per resource; upload validation (size/MIME/magic bytes, SVG rejection); CSRF/origin checks; CSP nonce + HSTS + global headers (today only on middleware-matched pages); atomic + cross-instance rate limiting; mass-assignment allowlists (`api/templates`, `admin/plans`, `admin/credit-packs` pass raw `body` today); encrypt-or-drop `ProviderConfig.apiKey` (runtime never reads it — likely drop, keep last4 display field); admin re-auth for dangerous ops; ZAP authenticated scan. → Gate C.

### Phase 4 — Durable jobs & media storage
Contract §2.3, §2.4, §5. DB-backed job queue + separate PM2 worker (Redis optional later); provider adapter interface (`validateInput/quote/submit/getStatus/cancel/normalizeWebhook/normalizeError/healthCheck`); route all 14 generation surfaces through the queue; retries/backoff/lease/dead-letter/cancel; S3-compatible object storage with signed reads, ingest-before-complete, lifecycle rules; delete `public/` persistence dependency; failure UX states (§5.3). → Gate D substantially.

### Phase 5 — UX, accessibility & browser QA
Contract §6, §7, §8.2 E2E journeys, §8.3 visual regression. One overlay system (extend `src/components/studio/kit/Sheet.js`; fold in `AuthModal`, `CommandPalette`); four states per page; onboarding; Playwright bootstrap + the 30 journeys + browser/viewport matrix + axe + visual regression. → Gates D, E.

### Phase 6 — Templates A–L & marketplace
Contract §11, §12. Versioned executable workflow templates over the Phase 4 queue + Phase 2 quote engine; the 12 templates with acceptance tests; library/publish/rollback UX; publish gates. Existing `/api/templates/*` surface is the starting point.

### Phase 7 — Admin, observability, ops & release
Contract §10, §13, §14, §15. Structured logs/metrics/alerts; admin completeness (reconciliation view, risk dashboard, kill switch, maintenance mode); runbooks + docs set (§1.2 remainder); rollback rehearsal; `RELEASE_STATUS.md` with per-gate PASS/FAIL. → Gate F, final release report.

## Sequencing rationale

Phase 1 first because TDD on everything else requires a working test runner and CI, and the contract's own baseline (§1.1) is currently red. Phase 2 before 3/4 because money defects (free agent runs, double-grants, negative balances) are live-revenue bugs. Phase 4 before 6 because templates are defined as durable workflows. Playwright waits for Phase 5 because E2E needs stable auth fixtures and a test DB story (built in Phase 2).

## Standing deviations from the contract (documented, not silent)

1. Contract §1.1's full scripts block includes `test:integration`, `test:e2e`, `test:a11y`, `test:security`, `test:contract`. Scripts are added in the phase that makes them real — a script pointing at nothing is a prohibited stub (§0.2).
2. `AGENTS.md` says "No TypeScript"; contract §1.1 says TS for new production code. Resolution: new standalone lib/test modules may be TS once `tsconfig.json` lands (Phase 1); edits to existing `.js` files stay JS. No bulk rewrite.
3. WaveSpeed: `.env` still has `WAVESPEED_KEY` but no code references it (providers are KIE + Alibaba + OpenRouter-for-LLM). Provider docs/runbooks will describe the real set.
