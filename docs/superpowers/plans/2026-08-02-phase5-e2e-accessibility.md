# Phase 5 — E2E, Accessibility & Resilient States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove the product works for a real user in a real browser — critical journeys under Playwright, axe-clean core pages, and honest empty/loading/error/offline states — instead of trusting unit tests.

**Architecture:** Playwright drives a production build against the disposable test Postgres, with credential-login storage-state fixtures (no OAuth in CI) and provider calls intercepted at the network layer so journeys are deterministic and cost nothing. `@axe-core/playwright` runs on the same pages inside the same specs. A small `states/` audit converts the four required page states from ad-hoc to shared components.

**Tech Stack:** Next 16, Playwright (+ `@axe-core/playwright`) — **the only new dev dependencies this phase**.

## Global Constraints

- Branch `feat/phase5-e2e-a11y` off `main`. Landing page (`src/components/landing/*`, `src/app/page.js`) must not change visually — a11y fixes there are limited to attributes/labels that don't alter layout or copy.
- NEVER run prisma migrate/db push against `.env` DATABASE_URL. E2E and integration use `TEST_DATABASE_URL` (`postgresql://postgres:test@localhost:55432/test`, container `helmies-test-pg`). Never print `.env` values.
- **E2E must never call a real provider or Stripe.** All external HTTP is intercepted via `page.route()`; a test that would spend money or credits against a live API is a plan violation.
- Gates each task: `npm run lint` (0 warnings), `npm run typecheck`, `npm test`, `npm run build`; `npm run test:e2e` once it exists.
- Existing suites must stay green (361 unit + 49 integration at branch point).
- Accessibility target: **zero axe violations of impact `serious` or `critical`** on the pages covered. Moderate/minor are recorded, not necessarily fixed.
- Commit convention + standard footers as prior phases.

## File Structure

```
playwright.config.mjs             (projects: setup → chromium; webServer runs the built app)
tests/e2e/fixtures/auth.setup.mjs (seeds users via Prisma, logs in, saves storageState)
tests/e2e/fixtures/seed.mjs       (deterministic users/plans/models/wallets)
tests/e2e/fixtures/intercept.mjs  (provider + Stripe network stubs)
tests/e2e/*.spec.mjs              (journeys, grouped by area)
tests/e2e/a11y.spec.mjs           (axe over the core page set)
src/components/states/            (EmptyState, ErrorState, LoadingSkeleton, OfflineBanner)
src/app/global-error.js / error.js (route-level boundaries — verify what exists first)
package.json                      (test:e2e, test:a11y scripts)
.github/workflows/ci.yml          (e2e job)
docs/runbook-e2e.md
```

---

### Task 1: Playwright harness — build, seed, log in, intercept

**Files:** create `playwright.config.mjs`, `tests/e2e/fixtures/{seed.mjs,auth.setup.mjs,intercept.mjs}`, `tests/e2e/smoke.spec.mjs`; modify `package.json`, `.gitignore` (playwright artifacts)

**Interfaces (later tasks depend on these exactly):**
- `seedE2E()` from `fixtures/seed.mjs` → creates and returns `{ user, admin }` — a credentials user (email `e2e-user@test.local`, password `E2ePassw0rd!test`, wallet 5000 credits) and an admin (`e2e-admin@test.local`, same password, `role:"admin"`), plus one active `ModelPricing` row `e2e-image-model` (image, 10 credits) and the four `SubscriptionPlan`/`CreditPack` rows. Idempotent — safe to call repeatedly.
- `auth.setup.mjs` is a Playwright *setup project* that runs `seedE2E()`, logs each user in through the real `/login` form, and writes `tests/e2e/.auth/user.json` and `.auth/admin.json` storage states.
- `stubProviders(page)` from `fixtures/intercept.mjs` → routes every request to `api.kie.ai` / `dashscope.aliyuncs.com` / `api.stripe.com` to deterministic fixtures, and makes the app's own `/api/generate/async` provider leg resolve without network. Any un-stubbed external host must **fail the test loudly**, not silently pass — add a catch-all route that throws.
- `playwright.config.mjs`: `webServer` runs `npm run build && npm run start -- -p 3399` with `DATABASE_URL` pointed at the test DB, `NEXTAUTH_URL=http://localhost:3399`; `baseURL` matches; `projects: [setup, chromium (deps: setup, storageState per-spec)]`; retries 1 in CI, 0 locally; trace on first retry.

- [ ] **Step 1: Install** `npm i -D @playwright/test @axe-core/playwright && npx playwright install --with-deps chromium`.
- [ ] **Step 2: Write the fixtures and config** per the interfaces above. `seedE2E` must use the same Prisma client the app uses and must NOT truncate — it upserts, so it can run against a DB that already has integration-test data.
- [ ] **Step 3: Write `smoke.spec.mjs`** — three assertions that prove the harness: (a) the landing page loads and returns 200; (b) an authenticated visit to `/studio` renders the studio shell (not a redirect to `/login`); (c) an unauthenticated visit to `/studio` DOES redirect to `/login`.
- [ ] **Step 4: Run `npm run test:e2e`** (script: `playwright test`) — all three pass. This is the gate for the whole phase; do not proceed until green.
- [ ] **Step 5: Commit** — `test: playwright harness with seeded auth and provider interception`

---

### Task 2: Money and auth journeys

**Files:** `tests/e2e/auth.spec.mjs`, `tests/e2e/generation.spec.mjs`, `tests/e2e/billing.spec.mjs`

**Interfaces:** consumes `seedE2E`, the storage states, and `stubProviders` from Task 1.

Journeys (each an independent `test()`, each asserting on user-visible DOM, not implementation):
1. **Register → land in studio** — a fresh email registers, is logged in, and sees a 100-credit balance.
2. **Login → logout → protected route redirects** — after logout, `/studio` sends you to `/login`.
3. **Generate an image end-to-end** — pick the seeded model, submit, the stubbed provider returns an output, the UI shows the result and the balance drops by exactly 10.
4. **Insufficient credits** — set the wallet to 3 credits via Prisma, submit, assert a clear, non-generic error is shown and the balance is unchanged.
5. **Duplicate submit** — double-click submit; assert only ONE generation appears in the library and the balance drops once (this is the idempotency window from Phase 4A, proven at the UI level).
6. **Generation failure refunds** — stub the provider to fail; assert the UI reports failure and the balance returns to its starting value.
7. **Cross-user isolation** — user A creates a generation; user B (second storage state) cannot see it in `/gallery` and a direct `GET /api/generations/status?id=<A's id>` returns 404.

- [ ] **Step 1: Write all seven specs.** For balance assertions, read the balance from the DOM the user actually sees, and poll (Playwright `expect.poll`) rather than sleeping.
- [ ] **Step 2: Run; fix ONLY test-side problems.** If a spec exposes a genuine product bug, STOP and report it — do not paper over it with a weakened assertion.
- [ ] **Step 3: Commit** — `test: end-to-end money and auth journeys`

---

### Task 3: Accessibility pass

**Files:** `tests/e2e/a11y.spec.mjs`; whatever component fixes it forces

**Interfaces:** one spec that runs `new AxeBuilder({ page }).analyze()` on: `/` (landing), `/login`, `/pricing`, `/studio` (authed), `/studio/image` (authed), `/settings` (authed), `/gallery` (authed), and the studio's open model-picker sheet (to cover the overlay). Fails on any violation with `impact` of `serious` or `critical`.

- [ ] **Step 1: Write the spec and run it** — record the full violation list in the report BEFORE fixing anything.
- [ ] **Step 2: Fix serious/critical violations** in the components. Most likely: missing accessible names on icon-only buttons, form inputs without labels, insufficient contrast, and `aria-*` on the Sheet. **On the landing page, attribute-only fixes** (`aria-label`, `alt`, `role`) — no layout or copy changes.
- [ ] **Step 3: Keyboard traversal test** — add one test that tabs through `/studio/image` and asserts focus reaches the prompt field, the model picker, and the submit button, and that opening the model-picker sheet moves focus into it and Escape returns focus to the trigger.
- [ ] **Step 4: Re-run to zero serious/critical; commit** — `fix: accessibility violations on core journeys` (or `test:` if no fixes were needed — state which).

---

### Task 4: The four states, honestly

**Files:** create `src/components/states/{EmptyState.js,ErrorState.js,LoadingSkeleton.js,OfflineBanner.js}`; wire into `/gallery`, `/studio` asset/library surfaces, and `/settings`; `tests/e2e/states.spec.mjs`

**Interfaces:**
- `<EmptyState title action={{label, onClick}} />`, `<ErrorState message onRetry />`, `<LoadingSkeleton variant="grid|list|panel" />`, `<OfflineBanner />` (listens to `window.online/offline`).
- Before building: **grep for existing empty/error markup and reuse the visual language already in `src/components/studio/kit/`** — this is consolidation, not a redesign.

- [ ] **Step 1: E2E specs first** — with an empty DB for that user, `/gallery` shows the empty state with a working action; with the API forced to 500 via `page.route`, the page shows the error state and a retry that re-requests; with `context.setOffline(true)`, the offline banner appears and disappears on reconnect.
- [ ] **Step 2: Run (they fail), implement, re-run.**
- [ ] **Step 3: Commit** — `feat: shared empty, error, loading and offline states`

---

### Task 5: CI + gate + PR

- [ ] **Step 1: Add an `e2e` job** to `.github/workflows/ci.yml`: postgres:16 service, `npx prisma migrate deploy`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, and upload the Playwright report as an artifact on failure.
- [ ] **Step 2: Local full gates** + `npm run test:e2e` green; landing diff shows only attribute-level changes (`git diff main -- src/components/landing src/app/page.js` — review every hunk and confirm no layout/copy change).
- [ ] **Step 3: `docs/runbook-e2e.md`** — how to run locally (start the test container, `npm run test:e2e`), how to debug (`--headed`, `--ui`, trace viewer), and the rule that E2E never touches real providers.
- [ ] **Step 4: PR**, Risk level Medium (test-only plus scoped UI fixes), with the axe before/after counts and any product bug the journeys uncovered.

---

## Self-Review

1. **Coverage vs contract §6/§8.2:** Playwright harness → T1; journeys 1–7 cover the contract's money/auth/generation-critical subset → T2; axe + keyboard + overlay focus → T3; empty/loading/error/offline → T4; CI → T5. **Explicitly deferred with reasons, to be stated in the PR:** the full 30-journey list (workflow/director/canvas/template/admin journeys) — those surfaces change in Phase 6, so writing their E2E now would be rework; the multi-browser matrix (Firefox/WebKit/mobile) and visual regression — chromium first, matrix once journeys are stable; VoiceOver/NVDA manual passes and 200%/400% zoom — need a human operator; CSP nonce and admin re-auth (carried from Phase 3's deferrals) — nonce needs the `layout.js` inline-script refactor, which belongs with the UI work in Phase 6.
2. **Placeholders:** T3 Step 1 deliberately records the violation list before fixing (the list can't be known in advance — that's the point of the step). T4 Step 1 requires grepping existing markup first. No TBDs.
3. **Type consistency:** `seedE2E()`, `stubProviders(page)`, storage-state paths, and the four state-component prop shapes are used identically across T1–T4.
