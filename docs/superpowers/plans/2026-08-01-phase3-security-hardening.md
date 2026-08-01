# Phase 3 — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the authorization, input-validation, rate-limiting, and money-hardening gaps from contract §3/§9 plus the Phase 2 risk register — with a machine-readable route manifest enforcing coverage in CI.

**Architecture:** A small central `src/lib/authz.js` (typed auth errors, correct 401/403) and `src/lib/origin-check.js` adopted by state-changing routes; a route-security manifest checked by a test that walks `src/app/api/**`; durable DB-backed anonymous rate limiting keyed by hashed IP; magic-byte upload sniffing; explicit field allowlists on admin CRUD; two small migrations (drop dead `ProviderConfig.apiKey`, add `CreditReservation.expiresAt`); money-hardening follow-ups in `wallet.js`/`director-executor.js`; threat-model doc.

**Tech Stack:** unchanged (Next 16 App Router JS, Prisma 7/Postgres, Vitest unit + integration harness from Phase 2, GitHub Actions).

## Global Constraints

- Branch `feat/phase3-security-hardening` off `main`. Landing page (`src/components/landing/*`, `src/app/page.js`) untouched.
- **NEVER run prisma migrate/db push against the `.env` DATABASE_URL** (production). Migrations authored offline; CI's clean Postgres validates; integration tests only via `TEST_DATABASE_URL` (localhost guard already enforced by `tests/integration/setup.mjs`). Production adoption happens at deploy via `migrate deploy` (runbook in PR).
- Gates after every task: `npm run lint` (0 warnings), `npm run typecheck`, `npm test`, `npm run build`; `npm run test:integration` where the task touches DB behavior (start Docker + `helmies-test-pg` postgres:16 on port 55432 if not running, `migrate deploy` against it first).
- Error responses never leak internals: no `e.message` pass-through on auth/authz failures; 401 = unauthenticated, 403 = authenticated but forbidden, 409 = retryable conflict.
- API-key-authenticated and webhook/cron requests are machine calls: origin checks apply only to cookie-session browser requests.
- No new dependencies unless a task names one explicitly (none do — magic-byte sniffing is hand-rolled for the 10 allowed types).
- Existing behavior preserved unless the task states the change; response-shape changes only where a task lists the consumers it verified.
- Commit convention as Phases 1–2 (feat/fix/test/chore + standard footers).

## File Structure

```
src/lib/authz.js                    (new: AuthzError, requireUser, requireAdminUser, authzResponse)
src/lib/origin-check.js             (new: verifyOrigin for cookie-session state changes)
src/lib/rate-limit.js               (new: unified atomic limiter, DB-backed, hashed-IP anon keys)
src/lib/upload-sniff.js             (new: magic-byte validation)
security/route-manifest.json        (new: every /api route registered)
tests/unit/route-manifest.test.mjs  (new: CI gate walking src/app/api/**)
src/lib/wallet.js                   (settle clamp, type validation, conditional reservation transitions)
src/lib/director-executor.js        (charge reruns, delete dead cancelPipeline)
src/lib/security.js                 (delegate to new modules; remove anonBuckets)
src/app/api/auth/register/route.js  (durable limiter)
src/app/api/upload/route.js         (sniff hook)
src/app/api/templates/*.js, admin/plans, admin/credit-packs (allowlists)
src/app/api/admin/providers/route.js (drop apiKey handling)
src/app/api/admin/users/route.js    (409 on CAS miss)
prisma/migrations/<ts>_drop_provider_apikey_add_reservation_expiry/
docs/security/threat-model.md
```

---

### Task 1: Central authz module — correct 401/403, no message leaks

**Files:**
- Create: `src/lib/authz.js`
- Modify: `src/lib/security.js` (`requireAdmin` delegates; keep export name), `src/lib/session.js` (delete its unused `requireAdmin` — verify zero importers first with `grep -rn "requireAdmin" src/ --include="*.js"`)
- Test: `tests/unit/authz.test.mjs`

**Interfaces:**
- Produces (from `@/lib/authz`):
  - `class AuthzError extends Error { constructor(status /*401|403*/, publicMessage) }`
  - `requireUser(req?)` → user object or throws `AuthzError(401, "Unauthorized")` (wraps `getCurrentUser`).
  - `requireAdminUser(req?)` → user or throws `AuthzError(401,…)` when unauthenticated, `AuthzError(403, "Forbidden")` when authenticated non-admin (DB role check like today's `security.js:38-44`).
  - `authzResponse(e)` → `NextResponse.json({ error: e.publicMessage }, { status: e.status })` for `AuthzError`; for any other error returns `NextResponse.json({ error: "Internal error" }, { status: 500 })` and `console.error`s the real error server-side.
- `security.js`'s exported `requireAdmin` becomes a thin wrapper calling `requireAdminUser` (21 admin routes keep working unchanged), BUT its throw is now `AuthzError` — every admin route's `catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }) }` must switch to `authzResponse(e)`. Sweep all of `src/app/api/admin/*` (grep for `status: 401` catch blocks) in this task.

- [ ] **Step 1: Failing tests** — `tests/unit/authz.test.mjs` (mock `@/lib/session` getCurrentUser + `@/lib/prisma` user.findUnique): unauthenticated `requireAdminUser` → AuthzError 401; authenticated non-admin → 403 (and the response body says "Forbidden", never the user's role or a stack); admin passes; `authzResponse(new Error("db exploded"))` → 500 `{error:"Internal error"}` with the real message only console.error'd.
- [ ] **Step 2: Implement + sweep the admin routes' catch blocks.** After the sweep, `grep -rn "e.message" src/app/api/admin` must return only non-auth places that are safe (list them in the report; expected: near zero).
- [ ] **Step 3: Gates + commit** — `fix: central authz with correct 401/403 and no error-message leaks`

---

### Task 2: Route security manifest + CI gate (§9.2)

**Files:**
- Create: `security/route-manifest.json`, `tests/unit/route-manifest.test.mjs`

**Interfaces:**
- Manifest entry shape (one per route file):
```json
{ "path": "/api/stripe/checkout", "file": "src/app/api/stripe/checkout/route.js",
  "methods": ["POST"], "auth": "user", "originCheck": true,
  "rateLimit": "none|<key>", "stateChanging": true, "notes": "" }
```
  `auth` ∈ `public | user | admin | webhook | cron | mixed(user+apikey)`.
- The test: `glob` all `src/app/api/**/route.js`, parse exported methods (`grep`-style regex on `export async function (GET|POST|PUT|PATCH|DELETE)`), and FAIL if (a) any route file is missing from the manifest, (b) any manifest entry points at a nonexistent file, (c) any entry with `stateChanging: true` has `auth: "public"` without a `notes` justification (only `stripe/webhook`, `webhooks/*`, `auth/register`, `contact` qualify).

- [ ] **Step 1: Write the failing test first** (empty manifest → fails listing every unregistered route).
- [ ] **Step 2: Build the manifest by enumerating the actual tree** (~90 route files — Phase 1's audit counted 88 plus templates/quote additions). Classify honestly: this file IS the security review; wrong labels are worse than missing ones. Cross-check `auth` labels against each file's first ~15 lines (requireAdmin/getCurrentUser/authenticateApiKey/secret checks).
- [ ] **Step 3: Gates + commit** — `feat: machine-readable route security manifest enforced in CI`

---

### Task 3: Origin verification for cookie-session state changes

**Files:**
- Create: `src/lib/origin-check.js`, `tests/unit/origin-check.test.mjs`
- Modify: the routes the manifest (Task 2) marks `originCheck: true` — at minimum: `stripe/checkout`, `stripe/topup` (POST), `stripe/portal`, `user/keys` (POST/DELETE), `admin/users` (PATCH), `admin/providers` (POST), `templates/purchase`, `canvas` (POST/PATCH/DELETE), `brand-kits` (POST/PATCH/DELETE), `memory` (POST/DELETE), `workflows` (POST + [id] routes), `generate/async` (cookie-session branch only).

**Interfaces:**
- `verifyOrigin(req, { allowMissing = false } = {})` → `true` or throws `AuthzError(403, "Cross-origin request rejected")`. Logic: derive expected host from `process.env.NEXTAUTH_URL`; read `Origin` header (fall back to `Referer`'s origin); missing header → allowed only when `allowMissing` (server-to-server/api-key callers); mismatch → throw. In `generate/async`, run it only when the request authenticated via session cookie, not via `authenticateApiKey`.

- [ ] **Step 1: Failing tests** — same-origin passes; evil-origin 403s; missing origin passes only with allowMissing; Referer fallback works; response body is the generic message.
- [ ] **Step 2: Implement + wire the listed routes** (one line near the top of each state-changing handler, after auth, `verifyOrigin(req)` inside the existing try, catch via `authzResponse`). Update the manifest's `originCheck` flags to match reality.
- [ ] **Step 3: Gates + commit** — `feat: origin verification on cookie-session state-changing routes`

---

### Task 4: Durable, atomic rate limiting (anon + register)

**Files:**
- Create: `src/lib/rate-limit.js`, migration `prisma/migrations/<ts>_anon_rate_limit/` (new model), `tests/unit/rate-limit.test.mjs`, integration cases in `tests/integration/rate-limit.int.test.mjs`
- Modify: `prisma/schema.prisma` (add model), `src/lib/security.js` (checkRateLimit delegates; DELETE anonBuckets), `src/app/api/auth/register/route.js` (replace in-memory map)

**Interfaces:**
- New model:
```prisma
model AnonRateLimit {
  key         String   @id            // sha256(salt + ip + ":" + endpoint)
  count       Int      @default(1)
  windowStart DateTime @default(now())
  @@schema("public")
}
```
- `checkAnonLimit(ip, endpoint, { windowMs, max })` (from `@/lib/rate-limit`): key = `sha256((process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET) + ip + ":" + endpoint)` — raw IPs are never stored (privacy per contract §4.4). Atomicity: try `updateMany({ where: { key, windowStart: { gte: cutoff }, count: { lt: max } }, data: { count: { increment: 1 } } })`; if count===1 → allowed. Else read the row: none or stale → `upsert` reset (`count: 1, windowStart: now`) → allowed; fresh and `count >= max` → `{ allowed:false, retryAfter }`. No read-then-write race can exceed `max` by more than the single in-flight increment (document this bound in the file header).
- `clientIp(req)`: prefer `x-real-ip` (nginx sets it on this deployment), else first `x-forwarded-for` hop, else `"unknown"` — the Phase 2 review's header-rotation note.
- `security.js` `checkRateLimit(userId, endpoint)`: `ip:` keys now call `checkAnonLimit`; user path unchanged this task.
- Register route: replace the in-memory `attempts` map with `checkAnonLimit(clientIp(req), "/api/auth/register", { windowMs: 600000, max: 10 })`.

- [ ] **Step 1: Failing unit tests** (mock prisma): key is hashed (no raw IP in any query arg); increment-first shape; stale window resets; max blocks. Integration: real DB — N sequential calls allow exactly `max`, the next blocks; two concurrent calls at `count = max-1` admit at most one over the limit bound documented.
- [ ] **Step 2: Author migration offline** (same `migrate diff` procedure as Phase 2 Task 2; CREATE TABLE + PK only), implement, wire, delete the two old in-memory limiters.
- [ ] **Step 3: Gates + integration + commit** — `feat: durable hashed-ip anonymous rate limiting`

---

### Task 5: Upload magic-byte sniffing

**Files:**
- Create: `src/lib/upload-sniff.js`, `tests/unit/upload-sniff.test.mjs`
- Modify: `src/app/api/upload/route.js` (after the existing MIME/size checks, before write)

**Interfaces:**
- `sniffMatchesMime(buffer, mimeType)` → boolean. Signatures (first bytes unless noted): `image/jpeg` FF D8 FF; `image/png` 89 50 4E 47 0D 0A 1A 0A; `image/webp` "RIFF"+bytes 8-11 "WEBP"; `image/gif` "GIF87a"|"GIF89a"; `video/mp4` "ftyp" at offset 4; `video/webm` 1A 45 DF A3; `audio/mpeg`|`audio/mp3` "ID3" or FF Ex/FF Fx frame sync; `audio/wav`|`audio/x-wav` "RIFF"+"WAVE" at 8-11. Unknown MIME → false.
- Route: mismatch → 400 `{ error: "File content does not match its declared type" }`, nothing written, no Asset row.

- [ ] **Step 1: Failing tests** — one crafted valid buffer per type passes; a PNG buffer declared as `image/jpeg` fails; an HTML `<script>` payload declared as any image type fails; truncated (<12 byte) buffer fails safe.
- [ ] **Step 2: Implement + wire.** The route already holds the bytes (it writes them) — sniff the same buffer, zero extra I/O.
- [ ] **Step 3: Gates + commit** — `fix: uploads must match their declared type at the byte level`

---

### Task 6: Mass-assignment allowlists on admin CRUD

**Files:**
- Modify: `src/app/api/templates/route.js:36`, `src/app/api/templates/[slug]/route.js:42`, `src/app/api/admin/plans/route.js:14`, `src/app/api/admin/credit-packs/route.js:14` (all currently `data: body`)
- Test: `tests/unit/mass-assignment.test.mjs`

**Interfaces:**
- `pick(body, fields)` helper local to each route (3 lines, no shared util needed). Allowlists:
  - SubscriptionPlan: `name, slug, price, credits, stripePriceId, stripePriceIdYearly, features, isActive, sortOrder`
  - CreditPack: `name, credits, price, stripePriceId, isActive, sortOrder`
  - Template create/update: derive from the `Template` model in `prisma/schema.prisma` — every scalar/Json column EXCEPT `id`, `createdAt`, `updatedAt`, and any owner/creator id field (list the final allowlist verbatim in your report; the reviewer re-derives it).
- Unknown/blocked keys are silently dropped (admin-only routes; 400-on-extra would break loose admin UI payloads).

- [ ] **Step 1: Failing tests** — POST with `{ id: "attacker", createdAt: "1970-01-01", price: 900, ... }` → prisma create called WITHOUT id/createdAt; template update cannot change its owner field.
- [ ] **Step 2: Implement all four.** **Step 3: Gates + commit** — `fix: field allowlists replace raw-body writes on admin CRUD`

---

### Task 7: Drop the dead plaintext ProviderConfig.apiKey column

**Files:**
- Modify: `prisma/schema.prisma` (remove `apiKey` from ProviderConfig), `src/app/api/admin/providers/route.js` (stop accepting/reporting keys entirely), `tests/unit/api-admin-providers.test.mjs` (rewrite for new shape)
- Migration: part of `prisma/migrations/<ts>_drop_provider_apikey_add_reservation_expiry/` (combined with Task 9's column — author both in whichever of Tasks 7/9 runs first, the other task references it; single migration, two statements: `ALTER TABLE "ProviderConfig" DROP COLUMN "apiKey";` + `ALTER TABLE "CreditReservation" ADD COLUMN "expiresAt" TIMESTAMP(3);`)

**Interfaces:**
- Runtime provider keys come from env only (verified: `providers.js` reads `process.env.*_KEY`; `model-catalog.js`/`pricing-engine.js` read only `markup`/`isActive`/`name`). GET returns rows without any key-related fields (`hasApiKey`/`apiKeyLast4` dropped — no consumer exists, verified in Phase 1 Task 7). POST accepts `{ name, type, baseUrl, markup, isActive }` only and rejects a supplied `apiKey` with 400 `{ error: "Provider keys are configured via environment variables" }`.

- [ ] **Step 1: Failing tests** (rewrite the Phase 1 suite): GET rows have no apiKey/hasApiKey/apiKeyLast4 keys; POST with apiKey → 400; normal POST upserts allowlisted fields.
- [ ] **Step 2: Schema edit + migration SQL (offline) + route + prisma generate.** **Step 3: Gates + commit** — `feat: remove plaintext provider api-key column — env is the only key store`

---

### Task 8: Wallet + admin money-hardening (Phase 2 risk register)

**Files:**
- Modify: `src/lib/wallet.js`, `src/lib/director-executor.js`, `src/app/api/admin/users/route.js`
- Test: extend `tests/unit/wallet-core.test.mjs`, `tests/unit/director-credits.test.mjs`, `tests/unit/admin-users-credits.test.mjs`

**Interfaces / changes:**
1. `settleReservation`: clamp `const charge = Math.min(actualCredits, reservation.amount)` with a `console.warn` when clamped (invariant protection — a charge above the reservation would move `available` below the ledger's tracking).
2. `grantCredits`: validate `type` against `LEDGER_TYPES`, throw on unknown (same guard `addLedgerEntry` already has).
3. `settleReservation`/`releaseReservation`: the reservation status flip becomes conditional — `updateMany({ where: { id: reservation.id, status: "active" }, ... })`; count 0 → treat as already-settled (throw the existing "No active reservation" error) so two concurrent settles can't both proceed past the read.
4. `rerunShot` (director-executor.js): charge before regenerating — cost = `pipeline.costEstimate?.shotCosts?.[shot.index]?.costs?.[rerunType]` (for `"full"`, sum image+video+audio entries present), fallback `Math.ceil((pipeline.costEstimate?.totalCredits || 0) / max(1, totalShots))`; `debitWallet(userId, cost, \`Director shot rerun (${rerunType})\`, \`director:${pipelineId}:rerun\`)`; insufficient → the route's existing error path (verify `/api/director/rerun` returns the wallet error message safely — no leak concerns, it's our own message).
5. DELETE the dead `cancelPipeline` export (grep first: no route imports it — confirmed in the Phase 2 final review; if a route DOES import it now, STOP and report).
6. `admin/users` PATCH: catch the CAS error (`/Wallet changed concurrently/`) → 409 `{ error: "Balance changed concurrently — reload and retry" }`.

- [ ] **Step 1: Failing tests per change** (clamp warns and charges reservation.amount; unknown grant type throws; concurrent-settle second caller rejects [conditional updateMany count 0 path, unit-mocked]; rerunShot calls debitWallet with the shot cost; CAS miss → 409).
- [ ] **Step 2: Implement.** **Step 3: Gates (+ integration suite — wallet touched) + commit** — `fix: wallet hardening — settle clamp, type guard, conditional transitions, charged reruns`

---

### Task 9: Reservation expiry sweep

**Files:**
- Modify: `prisma/schema.prisma` (`CreditReservation.expiresAt DateTime?` — migration shared with Task 7), `src/lib/wallet.js` (`reserveCredits` writes `expiresAt: new Date(Date.now() + expiresInMinutes*60000)` — the parameter finally does something), `src/lib/automation.js` (sweep), `src/app/api/cron/automation/route.js` (no change if it calls `runAutomation`)
- Test: extend `tests/unit/wallet-core.test.mjs`, new `tests/integration/reservation-expiry.int.test.mjs`

**Interfaces:**
- `sweepExpiredReservations()` (export from `@/lib/wallet`): find `status: "active", expiresAt: { lt: now }` with their generation; for each — generation missing or `status ∈ [failed, cancelled]` → `releaseReservation`; `status === "completed"` → `settleReservation(userId, jobId, generation.creditsUsed)` (idempotent via Task 8's conditional transition); generation still `pending/processing` → skip (log count). Returns `{ released, settled, skipped }`. Called from `runAutomation`.

- [ ] **Step 1: Failing tests** — reserve writes expiresAt; sweep releases an expired reservation whose generation failed; skips a live one; integration: real DB end-to-end sweep restores `available`.
- [ ] **Step 2: Implement.** **Step 3: Gates + integration + commit** — `feat: reservations expire — automated sweep releases stuck holds`

---

### Task 10: Split webhook vs cron secrets

**Files:**
- Modify: `src/app/api/webhooks/generation-complete/route.js`, `src/app/api/webhooks/generation/route.js` (prefer `WEBHOOK_SECRET`; accept `CRON_SECRET` only with a deprecation `console.warn`), `src/app/api/cron/automation/route.js` + `src/app/api/cron/sync-kie/route.js` (CRON_SECRET only), `scripts/check-env.mjs` (add `WEBHOOK_SECRET` to REQUIRED), `.env.example`
- Test: `tests/unit/webhook-auth.test.mjs`

- [ ] **Step 1: Failing tests** — webhook accepts WEBHOOK_SECRET bearer; accepts CRON_SECRET with warn; rejects wrong/missing; cron route rejects WEBHOOK_SECRET. **Step 2: Implement** (read the cron routes' current auth first and preserve their check structure). **Step 3: Gates + commit** — `fix: webhook and cron secrets are distinct credentials`
- Deploy note for the PR: set `WEBHOOK_SECRET` on the server before deploying (check-env will fail the build env otherwise — confirm `.env` on the server already has it; if only CRON_SECRET exists, the deprecation path keeps callbacks working).

---

### Task 11: Threat model + security docs

**Files:**
- Create: `docs/security/threat-model.md` — contract §9.1's actor list (anonymous attacker, malicious user, abusive free user, compromised user, malicious admin, leaked API key, forged webhook, provider compromise, malicious upload, SSRF, IDOR, race/double-spend, prompt injection, cross-tenant leak, supply chain, wallet-drain DoS) — for each: current controls (name the file/mechanism), residual risk, phase where the residual closes. Honest, specific, no filler.
- Modify: `SECURITY.md` (link the threat model), `security/route-manifest.json` notes where relevant.

- [ ] **Step 1: Write it from the repo, not from memory** — every "current control" claim must name a real file. **Step 2: Gates (docs don't break them) + commit** — `docs: threat model mapped to implemented controls`

---

### Task 12: Phase gate — suites, CI, PR

- [ ] Full local gates + integration; landing diff vs main empty; push; PR "Phase 3: security hardening — authz, manifest, rate limits, upload sniffing, wallet hardening" with: deploy runbook (migrate deploy applies the two-statement migration; set WEBHOOK_SECRET; no seed steps), risk register update (ZAP authenticated scan + admin re-auth UI + CSP nonce migration deliberately deferred — ZAP needs a staging environment [Phase 7 release gates], admin re-auth needs UX design [Phase 5], CSP nonce requires layout.js inline-script refactor [Phase 5]); CI green = exit.

---

## Self-Review (done at authoring time)

1. **Coverage vs contract §3/§9 + P2 risk register:** central helpers → T1; route manifest → T2; CSRF/origin → T3; rate limiting (atomic, cross-instance, trusted-hop, privacy-hashed) → T4; upload content validation → T5 (SVG already excluded by the existing MIME allowlist — verified); mass assignment → T6; secret store → T7 (env-only, dead column dropped); negative/authz tests → T1/T2/T3 test suites (full per-resource ownership matrix already exists piecemeal from Phase 1–2 suites; manifest test closes the coverage gate); reruns/cancelPipeline/settle-clamp/type-guard/conditional-transitions/409 → T8; reservation expiry → T9; webhook/cron split → T10; threat model → T11. Explicitly deferred with reasons: ZAP scan, admin re-auth UI, CSP nonce (T12 risk register); external pen test (contract: "when revenue permits").
2. **Placeholder scan:** T6's Template allowlist is derive-and-record with reviewer re-derivation (schema is the source of truth; listing a possibly-stale copy here would be worse). T2's manifest is enumerate-the-tree by design. No TBDs.
3. **Type consistency:** `AuthzError(status, publicMessage)` used in T1/T3; `checkAnonLimit(ip, endpoint, {windowMs,max})` + `clientIp(req)` in T4 only; `sniffMatchesMime(buffer, mime)` T5; `sweepExpiredReservations()` T9; migration shared T7/T9 explicitly cross-referenced.
