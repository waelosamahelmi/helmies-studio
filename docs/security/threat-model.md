# Threat Model

Phase 3 Task 11. Covers the actor/threat list from the security-hardening
contract (§9.1): anonymous attacker, authenticated malicious user, abusive
free user, compromised user, malicious admin, leaked API key, forged
webhook, provider compromise, stored malicious upload, SSRF, IDOR, race
condition/double-spend, prompt injection into agents, cross-tenant data
leakage, supply-chain compromise, denial of wallet/provider budget.

**Method:** every "current control" claim below names a real file, and was
verified by reading that file at commit time (not recalled from memory or
copied from an earlier plan doc). Where a plan document's phrasing turned
out to be stale against the actual code, this doc uses what the code does,
not what the plan said — e.g. `security/route-manifest.json` currently
enumerates **87** route files, not the 41 an earlier planning note cited
(41 was the count of *cookie-session state-changing* routes wired with
`verifyOrigin` in Task 3's final round, per `progress.md`; the manifest
itself covers every route in the app).

This is a living document. As later phases close a residual listed here,
update the "Phase" column/line for that item rather than deleting the
history — a threat model that silently drops closed items loses the trail
of what was actually decided and why.

---

## 1. Anonymous attacker

**Controls**
- `src/lib/authz.js` — `requireUser`/`requireAdminUser` throw
  `AuthzError(401, "Unauthorized")` for any protected route hit without a
  session; `authzResponse` converts that to the correct HTTP status and
  never leaks an internal error message for anything else (falls back to a
  generic 500).
- `security/route-manifest.json` enumerates all 87 `route.js` files with an
  `auth` classification (`public`/`user`/`admin`/`webhook`/`cron`/
  `mixed(user+apikey)`). `tests/unit/route-manifest.test.mjs` is a CI-enforced
  invariant: it fails if any route file on disk is missing from the
  manifest, if any manifest entry points at a file that no longer exists, if
  a `public`+`stateChanging` route lacks a non-empty `notes` justification,
  and it pins the *exact* set of public+state-changing routes to
  `auth/[...nextauth]`, `auth/register`, `contact`, `stripe/webhook` — a new
  one appearing changes the test, forcing a conscious review.
- `src/lib/rate-limit.js`'s `checkAnonLimit` — durable, hashed-IP
  (`sha256(salt + ip + ":" + endpoint)`, raw IPs never persisted), atomic
  single-statement `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`, used
  for anonymous callers via the `ip:`-prefixed path in
  `src/lib/security.js`'s `checkRateLimit` (e.g. `/api/contact`).
- `next.config.js`'s `headers()` sets `Content-Security-Policy`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`
  globally on every route.
- `src/lib/net-allowlist.js` guards the two surfaces an anonymous caller can
  reach with an attacker-supplied remote URL (`/api/media/proxy` and, via
  authenticated flows, `src/lib/video-assembly.js`) against SSRF (see §10).

**Residual risk**
- `/api/media/proxy` is `auth:"public"` with `rateLimit:"none"` (verified in
  `route-manifest.json`) — an unauthenticated caller can drive unlimited
  outbound fetches through the server. SSRF itself is blocked by
  `net-allowlist.js`, but this is still a bandwidth/amplification abuse
  vector; the manifest's own notes flag it as an anomaly, unfixed.
- CSP allows `script-src 'self' 'unsafe-inline'` in production (documented in
  `next.config.js`: `src/app/layout.js` ships inline `<script>` blocks and
  Next injects its own inline bootstrap; a nonce needs a `layout.js`
  refactor).
- No `Strict-Transport-Security` header appears anywhere in this repository
  (`next.config.js`'s header list does not include it). If HSTS is set at a
  reverse-proxy layer on the deploy host, that's outside this codebase and
  not verifiable from here — stated as a gap, not assumed fixed elsewhere.

**Phase** — CSP nonce migration is deferred to **Phase 5** (needs the
`layout.js` inline-script refactor; recorded in Task 12's risk register).
The `/api/media/proxy` rate limit and the missing HSTS header have no phase
currently scheduled.

---

## 2. Authenticated malicious user

**Controls**
- `requireUser` (`src/lib/authz.js`) gates every `auth:"user"` route.
- `verifyOrigin` (`src/lib/origin-check.js`) is CSRF/cross-site
  defense-in-depth on cookie-session state-changing routes, and it's a
  CI-enforced invariant, not a convention: `route-manifest.test.mjs`'s
  "every auth:user/admin state-changing route has originCheck:true" test
  fails for any new mutating route that doesn't wire it, short of an
  explicit `ORIGIN-EXEMPT:`-prefixed note.
- Mass-assignment allowlists replace raw-body-to-Prisma passthrough on
  routes that previously did `data: body` directly: `src/app/api/templates/route.js`,
  `src/app/api/templates/[slug]/route.js`, `src/app/api/admin/plans/route.js`,
  `src/app/api/admin/credit-packs/route.js` (commit `6dac4ef`), and
  `src/app/api/brand-kits/route.js`'s own `UPDATABLE_FIELDS`/`pickUpdatable`
  (a caller cannot rewrite `userId` or `id` via a PATCH body).
- Business-logic input validation: `validatePrompt`/`validateImageUrl`
  (`src/lib/security.js`); `VALID_RERUN_TYPES` in
  `src/lib/director-executor.js` (this round's fix — a route can no longer
  pass an unrecognized `rerunType` through to a cost/execution mismatch).
- Per-user, per-endpoint rate limiting (`security.js`'s `RATE_LIMITS` map +
  `checkRateLimit`) on every generation tool.
- `detectAbuse` (`security.js`) + `autoSuspendAbusiveUsers`
  (`src/lib/automation.js`) — see §3.

**Residual risk**
- Several state-changing routes still carry `rateLimit:"none"` in the
  manifest: `/api/assemble`, `/api/brand-kits/fingerprint`,
  `/api/director/execute`, `/api/director/rerun` — flagged as anomalies in
  the manifest's own `notes` field, not yet fixed.
- No generic input-fuzzing/WAF layer; correctness relies on per-route
  validation, which is thorough where it exists but not centrally enforced.

**Phase** — not explicitly scheduled; the manifest's own anomaly notes are
currently the only tracking mechanism for the unfixed rate-limit gaps.

---

## 3. Abusive free user

**Controls**
- `detectAbuse` (`src/lib/security.js`) flags a user with >100 generations
  in the last hour, >50 failed generations in the last hour, or >20 refunds
  in the last hour.
- `autoSuspendAbusiveUsers` (`src/lib/automation.js`) independently
  `groupBy`s generations per user over a rolling 60-minute window
  (`ABUSE_THRESHOLD = 100`), skips admins, and — for anyone else over the
  threshold with a positive balance — clamps their wallet to `0` available
  via `adjustWalletTo` and writes an `AuditLog` row. Wired into
  `runAutomation`, reachable via `/api/cron/automation` (bearer
  `CRON_SECRET`, fails closed).
- `autoDisableFailingModels` (same file) disables a `ModelPricing` row once
  it crosses 5 failures in a 30-minute window — stops repeated abuse of a
  broken/expensive model.
- `executeAgentRun` (`src/lib/agents.js`) calls `detectAbuse` before
  starting a run and refuses immediately if flagged.

**Residual risk**
- Thresholds (100 generations/hr, 50 failures/hr) are static constants —
  not plan-tier-aware. A paying-but-abusive user is treated identically to
  a free one; there is no separate, more permissive ceiling for paid tiers.
- The sweep runs on a cron cadence (external dispatcher), not in real time —
  a burst of abuse within one window can complete before the next sweep
  catches it.

**Phase** — not scheduled.

---

## 4. Compromised user (stolen session / credentials)

**Controls**
- NextAuth JWT sessions (`src/lib/auth.js`, `session: { strategy: "jwt" }`)
  — the `jwt()` callback re-reads `role`/`credits` from the DB on every
  token refresh (`else if (token.id)` branch), not only at sign-in, so a
  role change or suspension propagates without waiting for the session to
  fully expire.
- Passwords are bcrypt-hashed (`Credentials.authorize` in `auth.js` calls
  `bcrypt.compare` against `user.passwordHash`) — never compared or stored
  in plaintext.
- API keys are a separate, independently revocable credential from the
  session (`src/lib/api-key-auth.js`; `DELETE /api/user/keys`) — a
  compromised session does not automatically compromise a user's API keys
  or vice versa.

**Residual risk**
- No per-session revocation registry: a stolen JWT stays valid until its
  own expiry. The only way to invalidate *every* outstanding session at
  once is rotating `NEXTAUTH_SECRET`, which logs out every user, not just
  the compromised one — there is no way to kill a single session.
- No re-authentication/step-up flow for sensitive in-session actions (mint
  an API key, large spend) — a hijacked session can do anything the real
  user could, in one request, with no extra friction.

**Phase** — admin re-authentication for dangerous ops is deferred to
**Phase 5** (needs UX design, per Task 12's risk register) — that covers
the admin side of this problem. A general user-facing step-up flow for
non-admin sensitive actions is not yet scoped anywhere.

---

## 5. Malicious admin

**Controls**
- `requireAdminUser` (`src/lib/authz.js`) re-reads the DB `role` column on
  every call (not just a long-lived token claim) and returns
  `403 "Forbidden"` — never the real role or any other detail — for an
  authenticated non-admin.
- `logAudit` (`src/lib/security.js`) writes an `AuditLog` row (action,
  resource, resourceId, metadata including `adminId`, acting user) from
  routes that call it — e.g. `admin/users` PATCH logs `admin_edit_user`
  with both the `credits`/`role` change and the admin's own id.
  `GET /api/admin/audit` (admin-only) exposes the last 200 entries.
- `verifyOrigin` applies to admin routes exactly like user routes — Task 3's
  fix round specifically called out `admin/refunds`, `admin/plans`,
  `admin/credit-packs`, `admin/promos` as money-impacting CSRF gaps that got
  closed (confirmed: every admin state-changing entry in
  `route-manifest.json` has `originCheck: true`).
- Field allowlists on admin CRUD (§2) constrain what an admin request body
  can actually write.
- `autoSuspendAbusiveUsers` explicitly skips `role === "admin"` users — an
  admin account can't be auto-suspended by the abuse sweep, which cuts both
  ways (also means a compromised/malicious admin isn't rate-limited by that
  particular control).

**Residual risk**
- `logAudit` is opt-in per route, not centrally enforced (it's not called
  from `authz.js` itself, or from every admin mutation route) — a malicious
  admin acting through a route that doesn't call it leaves no audit trail.
  Verified: e.g. `admin/users` PATCH calls it explicitly; there's no
  guarantee every other admin mutation route does the same.
- No step-up re-authentication before a dangerous admin action (grant
  credits, change a role, delete a template) — one valid admin session can
  do all of it in a single request with no extra proof of identity.
- No four-eyes/second-approver requirement on any admin action.

**Phase** — admin re-authentication for dangerous ops → **Phase 5** (needs
UX design, per Task 12's risk register). Universal audit-log coverage
across every admin mutation route is not yet scheduled.

---

## 6. Leaked API key

**Controls**
- Keys are never stored recoverably: `src/lib/api-key-auth.js` stores and
  looks up only `keyHash = sha256(token)`. The raw key is returned to the
  user exactly once, at creation (`POST /api/user/keys`); every subsequent
  `GET` returns only `keyPrefix` (first 14 chars + `...`), never the full
  key or the hash.
- Independently revocable: `DELETE /api/user/keys` does
  `deleteMany({ where: { id, userId } })` — scoped to the caller, and
  doesn't require killing the whole session to kill one key.
- `isActive` is checked on every lookup
  (`where: { keyHash, isActive: true }`) and `lastUsedAt` is updated on
  every successful auth — gives the key owner a way to notice unexpected
  use before formally revoking.
- Provider-side API keys (KIE/Alibaba/OpenRouter) are a separate concern
  from user API keys and were hardened independently — see §8.

**Residual risk**
- No key expiry — an API key is valid indefinitely until manually revoked.
- No scoping/permission tiers — a key grants the same access as the owning
  user's session on every `mixed(user+apikey)` generate route
  (`route-manifest.json`); there is no narrower per-key rate limit or
  capability set.
- `verifyOrigin` correctly does **not** apply to the API-key half of
  `mixed(user+apikey)` routes (documented per-route in
  `route-manifest.json` — a bearer credential is immune to CSRF by
  construction), but that also means a leaked key is usable from literally
  anywhere with zero additional friction, by design.

**Phase** — not scheduled; recommend key expiry/scoping as a follow-up.

---

## 7. Forged webhook

**Controls**
- **Stripe**: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
  (`src/app/api/stripe/webhook/route.js`) rejects an unsigned or
  wrongly-signed request with `400` before any DB write happens.
  Idempotent via a `@unique` constraint on `StripeEvent.stripeEventId`
  (`prisma/schema.prisma`), claimed as the *first* write inside the same
  transaction as every credit grant — a replay or a concurrent duplicate
  hits the unique constraint (`P2002`), is caught, and is acknowledged as a
  no-op rather than granting twice.
- **Generation-provider webhooks**: bearer `WEBHOOK_SECRET` (falling back
  to `CRON_SECRET` only when `WEBHOOK_SECRET` is unset) checked in
  `src/app/api/webhooks/generation-complete/route.js` — fails closed with
  `503` if neither secret is configured, `401` on mismatch. Commit `670583a`
  made `WEBHOOK_SECRET` and `CRON_SECRET` distinct credentials, closing an
  earlier gap where the two were interchangeable.

**Residual risk**
- `src/app/api/webhooks/generation/route.js` is a byte-for-byte duplicate
  of `generation-complete/route.js` (flagged in `route-manifest.json`'s
  notes as an anomaly) — two live URLs accept the same bearer secret. Not a
  vulnerability by itself, but unnecessary surface; the manifest recommends
  confirming which URL the real provider targets and removing the other.
- The bearer-secret comparison (`authHeader === "Bearer " + secret"`) is a
  plain `===`, not constant-time — a timing side-channel against the
  webhook secret is a low-severity theoretical residual.

**Phase** — not scheduled.

---

## 8. Provider compromise (KIE / Alibaba / OpenRouter account or infra compromised)

**Controls**
- Provider API keys live only in `process.env`
  (`src/lib/providers.js`: `getKey: () => process.env.KIE_KEY` /
  `ALIBABA_KEY` / `OPENROUTER_KEY`) — never persisted to the database.
  Commit `88d1fce` dropped the dead `ProviderConfig.apiKey` plaintext
  column entirely, so a database compromise cannot also leak these
  credentials.
- `brandError` (`src/lib/providers.js`) maps raw provider error text to one
  of a small set of generic, non-identifying branded messages
  (`BRANDED_ERRORS`) before it ever reaches a client response — a
  provider's raw error detail, which a compromised provider could shape,
  never round-trips to the caller.
- `logProviderError` writes provider failures to `AuditLog` server-side
  only (truncated to 500 chars), never returned in the HTTP response.
- `resolveProviderWithFallback` (`src/lib/providers.js`) exists for
  cross-provider fallback — limits single-provider blast radius for
  availability (verified: the function exists and is exported; not
  independently verified to cover every generation path in this task).
- Provider-returned result URLs still go through
  `src/lib/net-allowlist.js`'s known-provider-domain check or the
  public-IP-resolution fallback before this server fetches them — a
  compromised provider redirecting a result URL to an internal address is
  still blocked (§10).

**Residual risk**
- No automated key rotation — a compromised provider credential stays valid
  until a human rotates it in `.env` and redeploys.
- No per-provider spend cap or circuit breaker independent of
  `autoDisableFailingModels`, which reacts to *failure rate*, not cost or
  suspicious volume — a compromised-but-still-"succeeding" provider could
  still run up spend.
- Provider-returned media content itself is not scanned for anything beyond
  what the SSRF host-allowlist and (on re-upload) the upload magic-byte
  sniffer would catch — a compromised provider serving malicious payload
  bytes through an otherwise-valid, allowlisted URL is a residual with no
  dedicated content-safety control.

**Phase** — not scheduled.

---

## 9. Stored malicious upload

**Controls**
- Declared `Content-Type` is restricted to a fixed 10-entry allowlist
  (`ALLOWED_TYPES` in `src/app/api/upload/route.js`); the stored file
  extension is derived from the declared MIME type, never from the
  attacker-controlled filename.
- Byte-level magic-number verification —
  `sniffMatchesMime` (`src/lib/upload-sniff.js`) checks the actual buffer
  bytes against a signature table (JPEG/PNG/WebP/GIF/MP4/WebM/MP3/WAV)
  before the file is written to disk, closing "declare an allowed MIME but
  upload different bytes" (commit `afc0b43`).
- 100MB size cap enforced from both the declared `file.size` (before
  buffering) and the actual buffer length (after).
- Served back through `/api/media/local/[name]`
  (`route-manifest.json` note: path-basename-sanitized; `.svg` is
  deliberately excluded from the extension→MIME serving map specifically to
  prevent stored-XSS via `image/svg+xml`).
- Served under the global `X-Content-Type-Options: nosniff` and CSP
  (`default-src 'self'`, `object-src 'none'`) from `next.config.js` — even
  a file that slipped through has a narrower blast radius.

**Residual risk**
- No antivirus/malware scanning of upload content — checks validate
  *container format* (magic bytes), not payload safety *within* a valid
  container (e.g. crafted metadata/exploit payloads inside an otherwise
  well-formed JPEG or MP4).
- Uploads are stored on local disk (`public/uploads`), not an isolated
  object store with signed URLs — a durability/multi-instance concern
  first, but it does mean the trust boundary is "this server's local
  filesystem," not an externally isolated store.

**Phase** — object storage with signed reads is scoped into **Phase 4**
("S3-compatible object storage with signed reads, ingest-before-complete,
lifecycle rules," per the roadmap's Phase 4 description). Antivirus/malware
scanning of upload content is not scheduled in any phase.

---

## 10. SSRF

**Controls**
- `src/lib/net-allowlist.js` is the single source of truth for "which
  remote hosts may this server fetch from": known provider domains
  (`kie.ai`, `aiquickdraw.com`, `aliyuncs.com`, `alicdn.com`) pass
  immediately; any other host must be `http(s)` **and** resolve exclusively
  to public unicast addresses. Loopback, private (RFC1918), link-local
  (including the `169.254.169.254` cloud-metadata address), CGNAT,
  multicast, and reserved ranges are all refused — including literal-IP
  URLs (`ipv4IsPublic`/`ipv6IsPublic`/`hostResolvesPublic`).
- Used by `/api/media/proxy` (`validateOutboundUrl` on the initial URL) and
  re-validated on **every** redirect hop, up to 3, via
  `isAllowedHostAsync` — confirmed in `src/app/api/media/proxy/route.js`'s
  manual (`redirect: "manual"`) redirect loop, specifically so an
  initially-allowed host can't 302 to an internal address after the fact.
- Also imported and used by `src/lib/video-assembly.js` and
  `src/app/api/assemble/route.js` (confirmed by direct import).

**Residual risk**
- DNS-rebinding: `hostResolvesPublic` resolves and validates at check time;
  nothing pins the validated IP for the `fetch()` call that follows. A
  narrow TOCTOU window exists for a non-provider domain if an attacker
  controls its DNS and can rebind between validation and the actual
  request.
- `/api/media/proxy` is unauthenticated with no rate limit (§1/§2) — SSRF
  itself is blocked, but the endpoint remains an amplification/bandwidth
  vector against any allowlisted target.

**Phase** — not scheduled.

---

## 11. IDOR

**Controls**
- Ownership-scoped queries are the standing pattern for user-owned
  resources — `findFirst`/`findMany`/`updateMany`/`deleteMany` filtered by
  `{ id, userId }` (never a bare `findUnique({ where: { id } })` for a
  resource a non-owner could otherwise reach). Verified directly in:
  `src/lib/director-executor.js` (`executeProductionPipeline`, `rerunShot`,
  `getPipelineStatus`, `listPipelines` all filter by `userId`),
  `src/app/api/canvas/route.js` (`findFirst({ where: { id, userId } })` on
  both PATCH and DELETE), `src/app/api/brand-kits/route.js` (same pattern,
  plus `updateMany({ where: { id, userId } })` on DELETE, with an explicit
  comment: *"Scope by owner: updateMany silently no-ops on someone else's
  brand kit"*), and `src/app/api/user/keys/route.js`
  (`deleteMany({ where: { id, userId } })`).
- Non-owner access to an existing resource id returns `404`/an empty
  result, not `403` — avoids confirming a resource id exists to a caller
  who doesn't own it.

**Residual risk**
- Ownership scoping is a hand-written, per-route convention, not a shared
  enforced helper (no single `loadOwnedOrThrow(model, id, userId)`
  utility) — unlike the CSRF/origin-check invariant, nothing in CI would
  catch a new route that forgot the `userId` filter.
- No single centralized negative-ownership test sweep across every
  resource type — coverage is real (Phase 1–2 test suites plus this
  phase's additions) but scattered per-resource, not enumerated in one
  place.

**Phase** — not scheduled; recommend a shared ownership-loading helper
and/or a lint rule in a follow-up.

---

## 12. Race condition / double-spend

**Controls**
- `reserveCredits` (`src/lib/wallet.js`) is compare-and-set, not
  read-then-write: `updateMany({ where: { userId, available: { gte: amount } }, data: { available: { decrement: amount }, ... } })`
  — concurrent reservations can never jointly overdraw `available`, because
  Postgres evaluates the conditional `WHERE` atomically per row even
  without an app-level lock.
- `settleReservation`/`releaseReservation` use the identical
  conditional-transition pattern on `CreditReservation.status`
  (`updateMany({ where: { id, status: "active" }, data: { status: "settled"/"released" } })`)
  — only one of two racing callers on the same reservation can win the
  status flip; the loser gets `count: 0` and throws. This closed the
  specific race the Phase 3 review found: an unguarded settle/release race,
  empirically reproduced pre-fix as a `{50,40}` double-credit vs. the
  post-fix correct `{35,60}` (commit `90fd7eb`, per
  `.superpowers/sdd/2026-08-01-phase3-security-hardening/progress.md`).
- DB-level `CHECK` constraints as defense-in-depth behind the app-level CAS:
  `CreditWallet_available_nonnegative` and `CreditWallet_reserved_nonnegative`
  (`prisma/migrations/20260801120000_wallet_constraints_and_plan_yearly/migration.sql`)
  — even a logic bug cannot drive a balance negative at the database level.
- Stripe webhook idempotency (`StripeEvent.stripeEventId` unique
  constraint, claimed inside the grant transaction — §7) closes the
  double-grant-on-retry race.
- Anonymous rate limiting is one atomic
  `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` statement
  (`src/lib/rate-limit.js`), specifically because an earlier
  multi-statement version admitted 24–27 requests against a `max` of 5
  under concurrent load — regression-tested in
  `tests/integration/rate-limit.int.test.mjs`.
- This round's fix (commit `8994aba`) makes `sweepExpiredReservations`
  match legacy `NULL`-`expiresAt` rows too, alongside a backfill migration
  (`20260801150000_backfill_reservation_expiry`) — closes a case where a
  pre-existing stuck reservation could hold a wallet's `reserved` balance
  forever, invisible to the sweep's `lt: now` comparison (SQL `NULL`
  comparisons are `UNKNOWN`, never matched).

**Residual risk**
- `adjustWalletTo` (admin credit edits, auto-suspend) throws
  `"Wallet changed concurrently"` on a CAS miss rather than retrying — the
  caller (e.g. `admin/users` PATCH) surfaces a `409` to a human, correct
  for an admin action, but there is no automatic retry anywhere in this
  path.
- `runAutomation` runs its three legs (`autoDisableFailingModels`,
  `autoSuspendAbusiveUsers`, `sweepExpiredReservations`) via `Promise.all`
  with no isolation between them (noted in `progress.md`'s Task 9 entry) —
  not a correctness bug today since each leg is independently idempotent,
  but a future shared-state bug between them wouldn't be caught by this
  shape.

**Phase** — the two residuals above are minor and not scheduled; the
double-spend-class races this section otherwise describes are closed as of
this round.

---

## 13. Prompt injection into agents

**Controls**
- Agent system prompts are static, hardcoded strings (the `AGENTS` registry
  in `src/lib/agents.js`) — user input is only ever passed as a separate
  `{ role: "user", content: userMessage }` chat message, never concatenated
  into the system prompt string itself.
- `validatePrompt` (`src/lib/security.js`) bounds prompt length (max 10,000
  chars) and rejects empty input before it reaches any agent.
- `executeAgentRun` (`src/lib/agents.js`) debits the wallet for the whole
  plan's *estimated* cost upfront, before executing any step, and refunds
  the un-consumed remainder on partial failure — bounds the financial blast
  radius of a plan an injected prompt might try to manipulate (e.g. into an
  unexpectedly long step sequence) to what was quoted at plan time, not
  unlimited.
- `detectAbuse` gate at the start of `executeAgentRun` (§3).

**Residual risk**
- No prompt-injection-specific test suite exists. Nothing in `tests/`
  exercises "does adversarial text embedded in user input, or in an
  upstream tool/analysis result fed back into a later step, change the
  orchestrator's `plan.steps` in an unintended way." The orchestrator's
  `plan.steps` directly selects which downstream agent/tool executes
  (`step.agent`, `step.params`) — a successful injection could still cause
  unintended (though wallet-bounded) generation calls.
- No output-side filtering: an agent's generated content (e.g. the website
  or coding agent's output) is returned to the user as-is, with no scan for
  injected instructions that could resurface if that output is later fed
  back into another agent step.

**Phase** — prompt-injection test suite → **Phase 4** (agent work).

---

## 14. Cross-tenant data leakage

**Controls**
- The same ownership-scoping convention as §11 is what actually prevents
  cross-tenant reads — there is no separate mechanism. Verified across
  `director-executor.js`, `canvas/route.js`, `brand-kits/route.js`,
  `user/keys/route.js` (§11).
- `CreditWallet.userId` is `@unique` (`prisma/schema.prisma`) — exactly one
  wallet per user by database constraint, cannot be ambiguously shared.
- Admin listing routes (e.g. `GET /api/admin/users`, which returns every
  user's `credits`/`role`/wallet balance) intentionally cross tenant
  boundaries by design and are gated by `requireAdminUser` (§5) — the one
  place cross-tenant visibility is correct, not a leak.
- Rate-limit and anonymous-limit keys are salted hashes or FK-scoped rows,
  not raw shared identifiers (`rate-limit.js`'s `hashKey`).

**Residual risk**
- Same root cause as §11: no centralized enforcement, so a future route
  that reads by a bare `id` without a `userId` filter would leak
  cross-tenant data with nothing in CI to catch it.
- Webhook and cron code paths operate with elevated/no per-user session
  context by necessity (bearer-secret auth, §7) — their own internal logic
  is what keeps them from touching the wrong user's rows. Verified for the
  Stripe webhook (uses `metadata.userId` sourced from the Stripe
  object/session, not from any caller-supplied field on the HTTP request),
  but this is structurally a wider trust boundary than a normal
  user-scoped route.

**Phase** — not scheduled; same recommendation as §11.

---

## 15. Supply-chain compromise

**Controls**
- `package-lock.json` is committed; CI uses `npm ci` (reproducible,
  lockfile-exact installs), not `npm install`.
- Dependabot is configured (`.github/dependabot.yml`): weekly `npm`
  ecosystem update PRs, capped at 5 open PRs at a time.
- CI runs a dedicated `audit` job — `npm audit --omit=dev --audit-level=critical`
  (`.github/workflows/ci.yml`) — on every push/PR, failing the build on any
  new critical-severity finding.
- The remaining known findings are documented, not silently ignored: a CI
  comment (dated 2026-08-01) records that `npm audit fix` already cleared
  the critical (`@auth/core`) and moderate (`@hono/node-server`, `valibot`)
  findings via in-range bumps (next-auth, prisma, next), that 3 high-severity
  findings remain nested exclusively inside Next's own `node_modules`
  (`postcss`, `sharp`/libvips) with no upstream fix available on the Next
  16.x line at time of writing, and that the audit level was deliberately
  narrowed to `critical` until that changes — recorded in the Phase 1
  progress log, not just the CI comment.
- Provider/session secrets are env-only and `.env` is not git-tracked (per
  the production-excellence roadmap's verified-current-state note) — a
  compromised dependency reading the repo can't exfiltrate credentials from
  source control itself.

**Residual risk**
- `--audit-level=critical` (not `high`) means the 3 known high-severity
  findings — and any *new* high-severity finding — do not fail CI. A
  deliberate, documented tradeoff, but still an open gap at that severity
  tier.
- No SBOM generation, no dependency-provenance verification (e.g. `npm
  audit signatures`/Sigstore), no lockfile-diff review gate beyond
  Dependabot's own PR review.
- No runtime egress restriction on what a compromised dependency's code
  could reach from inside the Node process — `net-allowlist.js` governs
  this app's *own* outbound-fetch logic, not arbitrary code executing
  in-process.

**Phase** — not scheduled. Re-widening the audit level to `high` is called
out in the CI comment itself as the trigger condition ("Re-widen to `high`
at that point," once Next ships a release with the nested deps patched).

---

## 16. Denial of wallet/provider budget

**Controls**
- Per-user, per-endpoint rate limits on every credit-consuming generation
  tool (`security.js`'s `RATE_LIMITS`: 20/min image-class, 5/min
  video-class, 10/min audio, etc.).
- Durable anonymous rate limiting (§1) for pre-auth-reachable endpoints.
- Wallet CAS (`available: { gte: amount }`, §12) makes it structurally
  impossible to spend more than is available regardless of concurrency — a
  flood of concurrent requests can drain a wallet to exactly its balance,
  never below it, with the `CHECK` constraint as a second line of defense.
- `autoSuspendAbusiveUsers` (§3) clamps a heavy user's available balance to
  `0` once generation volume crosses the abuse threshold — stops an
  ongoing drain, not just future ones.
- `autoDisableFailingModels` (§3/§8) disables a model once it crosses a
  failure-rate threshold — protects provider budget from continuing to pay
  for/hammer a broken model.
- Reservation expiry + sweep (`e7cf86e`, and this round's `8994aba`) — a
  job that never completes releases its held credits back automatically
  instead of leaving them reserved-but-unusable indefinitely, which is
  itself a mild wallet-availability DoS if it accumulates unswept.

**Residual risk**
- Several credit-consuming, state-changing routes explicitly have
  `rateLimit: "none"` in `route-manifest.json`: `/api/assemble` (CPU/IO-
  expensive transcode), `/api/director/execute`, `/api/director/rerun`,
  `/api/brand-kits/fingerprint` — all flagged as anomalies in the
  manifest's own notes, unfixed. A single user (or a leaked session/API
  key) can call these in an unbounded loop today.
- No per-provider *aggregate* spend cap independent of per-user limits — a
  large number of distinct, individually-low-volume users could
  collectively exhaust provider budget without any single user crossing an
  abuse threshold.
- No circuit breaker tied to provider cost or latency, only to failure rate
  — `autoDisableFailingModels` reacts to errors, not to a model that keeps
  "succeeding" while being unexpectedly expensive or slow.
- `AnonRateLimit` rows have no TTL/cleanup job — the table grows
  unboundedly over time (recorded as a deferred item in Task 4's progress
  note); this is a storage-growth concern more than a budget-DoS one, but
  it's the same "denial of shared resource" family.

**Phase** — not scheduled. Recommended follow-ups: close the
manifest-flagged rate-limit gaps directly; scope per-provider spend caps
alongside **Phase 4**'s durable job queue (the natural place to add
backpressure); add periodic `AnonRateLimit` cleanup (e.g. folded into
`runAutomation`).

---

## Appendix: routes and manifest

`security/route-manifest.json` is the authoritative, CI-enforced inventory
this document leans on throughout — 87 route files, each classified by
`auth`, `originCheck`, `rateLimit`, and `stateChanging`, with a `notes`
field carrying the specific rationale or flagged anomaly for that route.
`tests/unit/route-manifest.test.mjs` keeps it from drifting out of sync
with `src/app/api/**/route.js` on disk and enforces the origin-check
invariant described in §2/§5. Rather than duplicate or restate individual
route notes here (the manifest already documents them, and the manifest's
schema has no room for a global/meta note without breaking that CI check),
every threat section above cites the manifest and its notes directly where
relevant — treat `route-manifest.json` as this document's live companion,
not a separate concern.

## Known deferrals not tied to a specific actor above

- **ZAP authenticated scan** — needs a staging environment; deferred to
  **Phase 7** (release gates), per Task 12's risk register.
- **External penetration test** — contract defers this to "when revenue
  permits"; not phase-scheduled.
