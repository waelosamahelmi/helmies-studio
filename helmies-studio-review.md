# Helmies Studio — Full Codebase Review & Recommendations

This is a complete review of the Helmies Studio codebase, produced by reading the blueprint, the Prisma schema, every `src/lib` module, a representative full sweep of the API routes (all `/api/generate/*`, all `/api/admin/*`, agent, workflows, stripe, credits, estimate, upload, memory, user/keys), and the core frontend (studio shell, admin panel, orchestrator chat, workflow builder, project memory, landing page, login, gallery, models, settings, design system). Several of the findings below were **reproduced**, not just inferred from reading (e.g. the Prisma CLI failure, the missing `signIn()` calls, the dead-code greps) — those are called out explicitly.

No code changes were made as part of this review except a no-op edit attempt on `.env.example` that failed harmlessly (see Security note at the bottom) — this document is suggestions only, per your request.

---

## 1. The Vision, As I Understand It

From [helmies-studio-blueprint.md](helmies-studio-blueprint.md), Helmies Studio is not meant to be "another AI image generator wrapper." It's meant to be an **AI Operating System for creators**:

- A single **Orchestrator Agent** that takes a plain-English request, breaks it into steps, estimates the credit cost, asks for confirmation, routes each step to a specialist agent (image/video/audio/website/marketing/coding), retries failures with fallback models, and assembles the final output package.
- **Workflows** as a first-class citizen — reusable, saveable, multi-step pipelines where any single step can be regenerated without re-running the whole thing.
- A **swappable provider layer** — MuAPI today, but Atlas Cloud / Alibaba (Qwen) / WaveSpeed / OpenRouter should be interchangeable per-model without touching business logic.
- A **credit economy**, not raw pricing — dynamic, provider-cost-aware, admin-configurable, always estimated *before* the user commits.
- A **self-driving Admin Panel** — users, credits, pricing, providers, models, analytics, refunds, profit, feature flags, API keys — with automation doing the babysitting (auto-disable failing models, auto-suspend abusers) rather than a human watching dashboards all day.
- **Security as infrastructure**: rate limiting, RBAC, audit trails, abuse detection — not bolted on later.
- **Project Memory**: characters, styles, assets, brand, and history that persist across sessions so the tool feels like it "knows" the creator's world.
- A **premium, mobile-first, animation-rich UI** that never falls back to generic gradient-SaaS aesthetics.

This is an ambitious, coherent vision, and I want to be upfront: **a genuinely large fraction of it is actually built.** The schema, the agent/orchestrator system, the studio UI, and the admin panel all exist and are reasonably faithful to the blueprint. The issues below are mostly about **wiring** — pieces that were clearly designed to connect to each other but don't yet, plus a handful of correctness bugs — rather than missing ambition.

---

## 2. What's Already Working Well

Worth calling out explicitly, since the rest of this document is mostly problems:

- **Schema coverage** ([prisma/schema.prisma](prisma/schema.prisma)) maps cleanly onto almost every blueprint entity: `User`, `Subscription`, `Generation`, `CreditTransaction`, `AgentRun`, `Workflow`/`WorkflowRun`, `ProjectMemory`, `ProviderConfig`, `ModelPricing`, `FeatureFlag`, `ApiKey`, `AuditLog`, `RateLimit`, `Refund`. This is a genuinely complete data model for the product described.
- **Orchestrator chat** ([src/components/studio/OrchestratorChat.js](src/components/studio/OrchestratorChat.js)) implements the plan → cost preview → confirm → live-step-execution flow faithfully — this is the centerpiece of the vision and it's a real, working, well-animated implementation.
- **Rich idle screens** ([src/components/studio/RichIdle.js](src/components/studio/RichIdle.js)) rotate contextual tips per tool with tasteful motion — directly matches the "Rich idle screens" design principle instead of a generic spinner.
- **Studio information architecture** ([src/app/studio/page.js](src/app/studio/page.js)) — 13 tools grouped into AI Agents / Generate / Cinematic / Character with an icon-rail + hover-flyout sidebar — is a thoughtful way to scale to this many tools without overwhelming the user.
- **Design system** ([src/styles/globals.css](src/styles/globals.css)) is distinctive: OLED-void background, a single confident brand magenta, custom display/mono fonts, no generic purple-gradient SaaS look. This matches "No gradient-first design" / "Premium UI" directly.
- **`brandError()`** ([src/lib/providers.js](src/lib/providers.js)) cleanly maps raw provider failures (rate limits, auth, timeouts, content filters, server errors) to friendly branded copy — a clean implementation of "Provider errors become Helmies Studio branded messages," in the routes where it's actually used.
- **Admin API routes are consistently gated.** All 9 checked routes under `src/app/api/admin/**` call `requireAdmin()` before doing anything.
- **Refund-on-failure** is implemented consistently in every generate route (even the ones bypassing the shared helper, see below) — credits are always returned if a generation errors out.
- **Signup automation**: first user becomes admin, every new user gets a free `Subscription` row + 100-credit welcome bonus via a NextAuth `createUser` event ([src/lib/auth.js](src/lib/auth.js)) — a nice small piece of "zero manual admin work."

---

## 3. Critical Issues (product is not usable end-to-end today)

### 3.1 There is currently no way to actually log in

I grepped the entire codebase for `signIn(` — **zero matches, anywhere.**

- [src/app/login/page.js](src/app/login/page.js): the "Continue with Google" button has no `onClick` at all — it's a plain `<button>` with an icon and text.
- The email/password form's submit handler is a complete stub:
  ```js
  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1200);
  };
  ```
  It never calls `signIn("credentials", …)`, never hits an API route, and there is no `Credentials` provider registered in [src/lib/auth.js](src/lib/auth.js) anyway (only `Google`). `bcryptjs` is already a dependency but nothing in the codebase imports/uses it — presumably it was intended for password hashing and never finished.

**Impact:** nobody can currently create an account or sign in through the UI. Every other feature in this document — credits, generation, Stripe, admin, memory — is unreachable until this is fixed. This should be fix #1, before anything else.

**Fix:** wire the Google button to `signIn("google")` from `next-auth/react` (needs a `SessionProvider` wrapper somewhere in the tree — I didn't find one in [src/app/layout.js](src/app/layout.js), so that likely needs adding too, or use the `/api/auth/signin/google` link form). Decide whether email/password is actually wanted:
- If yes: add a `Credentials` provider to `auth.js`, a signup API route that hashes passwords with `bcryptjs`, and wire the form to `signIn("credentials", { email, password })`.
- If no: delete the dead email/password UI so it doesn't look broken, and ship Google-only for now.

### 3.2 Stripe subscription upsert will throw on first real subscribe attempt

[src/app/api/stripe/checkout/route.js](src/app/api/stripe/checkout/route.js) does:
```js
await prisma.subscription.upsert({
  where: { userId: user.id },
  ...
});
```
But in [prisma/schema.prisma](prisma/schema.prisma), `Subscription.userId` has **no `@unique`** (it's a plain relation scalar; `User.subscriptions` is a one-to-many `Subscription[]`). Prisma's `upsert` requires the `where` clause to target a unique field or compound-unique index. As written, this call is invalid against the current schema and will throw at runtime the first time any user tries to buy a paid plan.

**Fix:** since every other piece of code (checkout, credits route, analytics) treats a user as having exactly one meaningful subscription, add a unique constraint to match that assumption:
```prisma
model Subscription {
  id     String @id @default(cuid())
  userId String @unique
  ...
}
```
...then run a migration. (Alternative if you ever want multiple historical subscription rows per user: keep the schema as-is and change the checkout code to `findFirst` + `create`/`update` instead of `upsert`.)

### 3.3 Prisma CLI cannot connect to the database at all (reproduced)

[prisma.config.ts](prisma.config.ts) does:
```ts
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL! },
});
```
There is no `import "dotenv/config"` at the top, and `dotenv` isn't in [package.json](package.json) at all. Per Prisma's own docs, **Prisma ORM v7 requires you to load `.env` explicitly in `prisma.config.ts`** — it is not done automatically like it was in older Prisma CLI versions.

I verified this is a real, live problem, not a theoretical one:
```
> npx prisma validate
The schema at prisma\schema.prisma is valid 🚀       ← doesn't need a DB connection, so it "passes"

> npx prisma migrate status
Error: The datasource.url property is required in your Prisma config file when using prisma migrate status.
```
`migrate status`, `migrate dev`, `migrate deploy`, `db push`, and `prisma studio` will all fail exactly like this right now. (The *running app* is fine — Next.js loads `.env` itself for `src/lib/prisma.js` — this only breaks the CLI tooling used to evolve the schema.)

**Fix:**
```bash
npm install dotenv
```
```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL! },
});
```

---

## 4. High-Priority Issues (security, money-integrity, or a named vision feature that's silently broken)

### 4.1 Credit debits have a race condition (TOCTOU)

Every credit-debiting path — [src/lib/session.js](src/lib/session.js)'s `debitCredits()`, the inline logic in [src/app/api/generate/image/route.js](src/app/api/generate/image/route.js) / `video` / `lipsync`, [src/lib/agents.js](src/lib/agents.js)'s `executeAgentRun`, and [src/lib/workflows.js](src/lib/workflows.js)'s `executeWorkflow` — follows the same shape:

```js
const user = await prisma.user.findUnique({ where: { id }, select: { credits: true } });
if (user.credits < amount) throw new Error("Insufficient credits");
await prisma.user.update({ where: { id }, data: { credits: { decrement: amount } } });
```

Read-then-write, not atomic. Two concurrent requests (double-click, two tabs, or a scripted burst against `/api/agent/run`) can both pass the check before either decrements, letting credits go negative or letting a user generate more than their balance allows.

**Fix:** make the check-and-decrement one atomic statement and verify it actually matched a row:
```js
const result = await prisma.user.updateMany({
  where: { id: userId, credits: { gte: amount } },
  data: { credits: { decrement: amount } },
});
if (result.count === 0) throw new Error("Insufficient credits");
```
This is worth extracting into a single shared helper and using it everywhere credits are debited, instead of the current four+ copies of similar logic.

### 4.2 Rate limiting is defined but almost never enforced

[src/lib/security.js](src/lib/security.js) defines explicit limits for `/api/generate/image`, `/api/generate/video`, `/api/generate/lipsync`, `/api/generate/audio`, `/api/agent`, `/api/workflow`, `/api/upload` — but I grepped every route file, and `checkRateLimit()` is only ever called from [src/app/api/agent/plan/route.js](src/app/api/agent/plan/route.js) and [src/app/api/agent/run/route.js](src/app/api/agent/run/route.js).

None of the 13 `/api/generate/*` routes, `/api/upload`, or `/api/workflows` call it. Since every one of those routes calls a paid third-party provider, this isn't just a UX nicety — it's an open cost-abuse surface (a compromised session or a fast script can hammer real-money endpoints with no throttle at all).

**Fix:** add `checkRateLimit(user.id, "<route>")` at the top of every route already listed in `RATE_LIMITS`, right after the auth check. Since this is the same 3 lines repeated everywhere, consider folding it into [src/lib/generation-handler.js](src/lib/generation-handler.js)'s `handleGeneration()` so it's automatic for any route that uses the shared helper (see 4.5).

### 4.3 Audit logging and abuse detection are dead code

`logAudit()` and `detectAbuse()` in [src/lib/security.js](src/lib/security.js) are never imported anywhere else in the codebase (confirmed by grep — only their own definitions match). The only thing that actually writes to `AuditLog` today is `logProviderError()`, which is narrowly scoped to provider failures. The blueprint explicitly lists "Audit logs" and "Abuse detection" as security pillars, but as shipped:
- Admin actions (pricing changes, provider key changes, user credit/role edits, refunds, feature flag toggles) leave no audit trail.
- `detectAbuse()` never actually gets called before/after anything, so it can't flag or block abusive usage.

**Fix:** call `logAudit(action, resource, resourceId, metadata)` from every admin mutation route ([src/app/api/admin/users/route.js](src/app/api/admin/users/route.js) `PATCH`, `pricing`, `providers`, `refunds`, `flags`) and from generation creation/failure. Call `detectAbuse(userId)` inline before executing costly actions (agent runs, workflow runs) or on a schedule (see 4.4) and act on `flagged: true`.

### 4.4 Automation module is never invoked

`runAutomation()` / `autoDisableFailingModels()` / `autoSuspendAbusiveUsers()` in [src/lib/automation.js](src/lib/automation.js) are fully implemented but there is no cron route, no scheduled task, nothing that calls them. "Everything possible should be automated" isn't realized here yet — this logic currently can't ever run.

**Fix:** add a `src/app/api/cron/automation/route.js` that calls `runAutomation()`, protect it with a shared secret header (e.g. compare against `process.env.CRON_SECRET`), and schedule it (Vercel Cron, or any external scheduler hitting that URL every N minutes).

### 4.5 Image, Video, and Lip Sync bypass the shared provider/pricing logic

[src/lib/generation-handler.js](src/lib/generation-handler.js)'s `handleGeneration()` is clearly meant to be the one shared code path for generation routes: it resolves the provider via `resolveProvider()`, checks for an admin-configured `ModelPricing` override, calls `brandError()` on failure, and handles the credit debit/refund. **10 of 13** `/api/generate/*` routes use it (audio, cinema, clipping, i2i, i2v, influencer, marketing, motion, recast, v2v).

But [src/app/api/generate/image/route.js](src/app/api/generate/image/route.js), [src/app/api/generate/video/route.js](src/app/api/generate/video/route.js), and [src/app/api/generate/lipsync/route.js](src/app/api/generate/lipsync/route.js) — arguably the three flagship tools — each hand-roll the same ~50 lines instead, calling [src/lib/muapi.js](src/lib/muapi.js) directly (which is hardcoded to MuAPI only and has no concept of `resolveProvider`). Concretely, for these 3 tools only:
- Admin-configured `ModelPricing.creditsCost` overrides are ignored (only the static table in [src/lib/credits.js](src/lib/credits.js) is read).
- The "swappable provider layer" doesn't apply — Atlas/Alibaba/WaveSpeed can never be used for Image, Video, or Lip Sync no matter what's configured in the Providers admin tab.
- On failure, the raw provider error message is returned to the client (`{ error: genError.message }`) instead of being passed through `brandError()` — so the "branded error" promise from the blueprint is silently broken specifically for these 3 tools.

**Fix:** refactor these 3 routes to call `handleGeneration(req, "<tool>", cost, apiFn)` like the other 10 do. This is a net deletion of code, not an addition — it removes duplication while fixing three separate blueprint promises (dynamic pricing, swappable providers, branded errors) in one move.

### 4.6 Orchestrator/workflow credit estimates are silently wrong

[src/lib/pricing-engine.js](src/lib/pricing-engine.js)'s `estimateAgentTask(steps)` reads `step.tool` and `step.model`:
```js
const cost = await estimateCredits(step.tool, step.model, step.params || {});
```
But [src/lib/agents.js](src/lib/agents.js)'s `planTask()` produces steps shaped as `{ agent, task, params: { model, ... } }` — there is no top-level `tool` or `model` field, only `agent` and `params.model`. So `step.tool` and `step.model` are always `undefined`, and every step's estimate silently falls through to `getFallbackCost(undefined, undefined, params)` → a flat base cost of 2, regardless of whether the step is a $0.02 image or a $2 video. This directly undermines the headline "orchestrator estimates credits before execution" feature — the number shown is close to meaningless once a plan has more than one kind of step.

**Fix:** in `estimateAgentTask`, read `step.agent` as the tool and `step.params?.model` as the model:
```js
const cost = await estimateCredits(step.agent, step.params?.model, step.params || {});
```

### 4.7 Regenerating a single workflow step breaks any step that depends on a prior step's output

[src/lib/workflows.js](src/lib/workflows.js)'s `regenerateStep()` calls:
```js
const output = await executeStep(step, []);
```
passing an **empty** array for prior outputs. `executeStep`'s placeholder resolution only replaces `$STEP_N_OUTPUT` if `previousOutputs[stepNum]` exists — with an empty array, it never does, so the literal string `"$STEP_1_OUTPUT"` gets sent to the provider as e.g. an `image_url`. The built-in "Image → Video Pipeline" template ([src/components/studio/WorkflowBuilder.js](src/components/studio/WorkflowBuilder.js)) is exactly this shape, so regenerating its video step alone will fail. This directly breaks the blueprint's "regenerate individual steps" promise for any multi-step workflow with dependencies.

**Fix:** `regenerateStep` needs to fetch the most recent completed `WorkflowRun` for that workflow, pull its `outputs`, and pass that array into `executeStep(step, priorOutputs)` instead of `[]`.
(Smaller, separate note: the frontend doesn't currently expose a "regenerate this step" button anywhere either — [src/app/api/workflows/[id]/regen/route.js](<src/app/api/workflows/[id]/regen/route.js>) exists and works from the API side, it's just not surfaced in the UI yet.)

### 4.8 The Gallery page is 100% hardcoded mock data

[src/app/gallery/page.js](src/app/gallery/page.js) filters and renders a local `MOCK_CREATIONS` array — there is no `fetch()` call anywhere in the file. Meanwhile [src/lib/memory.js](src/lib/memory.js) already has a ready-made `getGenerationHistory(userId, limit, offset)` that queries the real `Generation` table — it's just never called from anywhere (confirmed by grep), and no API route exposes it.

**Fix:** add e.g. `GET /api/generations` wrapping `getGenerationHistory()` (with pagination/status-filter query params matching what the Gallery UI already expects), and swap `MOCK_CREATIONS` for a real fetch in `gallery/page.js`.

### 4.9 The public Models page doesn't match the real model catalog

[src/app/models/page.js](src/app/models/page.js) hardcodes its own `MODELS` array, separate from the real catalog in [src/lib/models.js](src/lib/models.js). They've drifted apart:
- IDs/names differ for models that do exist (e.g. page shows `"gpt-4o-image"` / "GPT-4o Image"; the real catalog's id is `gpt4o-text-to-image`).
- The page lists models that **don't exist anywhere** in `models.js` at all: "Recraft v3", "Luma Dream Machine", "Imagen 3" (real catalog only has Imagen 4 / Imagen 4 Ultra), "MiniMax Video-01".
- Marketing copy repeats specific counts — "55+" image models, "40+" video models, "9" lip-sync, "20+" audio — on the landing page and studio sidebar badges. Actual catalog sizes in `models.js`: 21 text-to-image + 11 image-edit ≈ 32 image-related; ~10 text-to-video + 7 image-to-video ≈ 17 video-related; 8 lip-sync; 7 audio. All four advertised counts currently overstate what's actually selectable.

**Fix:** generate the `/models` page directly from `src/lib/models.js` so there's one source of truth (no more drift), and either grow the catalogs to match the advertised counts or adjust the marketing copy to reality — false/inflated counts are a trust risk once a user actually opens the Studio and counts for themselves.

### 4.10 Admin analytics "profit" mixes units

[src/app/api/admin/analytics/route.js](src/app/api/admin/analytics/route.js):
```js
const revenue = totalRevenue._sum.amount || 0;       // sum of CreditTransaction.amount where type="subscription" → this is CREDITS
const providerCost = totalProviderCost._sum.providerCost || 0;  // sum of Generation.providerCost → this is EUR
const profit = revenue - (providerCost * 0.01);
```
`revenue` is a count of **credits** granted by subscriptions, not currency. `providerCost` is already in EUR (it's fed straight into `calculateCredits()` in [src/lib/pricing-engine.js](src/lib/pricing-engine.js), which treats it as a raw EUR cost). The `* 0.01` looks like a misapplied `CREDIT_TO_EUR` conversion — it's scaling the wrong side of the subtraction. As written, "profit" subtracts euros from a credit count, which isn't a meaningful number in either currency.

**Fix:** convert consistently before subtracting, e.g.
```js
import { CREDIT_TO_EUR } from "@/lib/pricing-engine";
const revenueEur = revenue * CREDIT_TO_EUR;
const profit = revenueEur - providerCost;
```
(and double check whether "revenue" should also include one-off credit purchases if/when those exist, not just `type: "subscription"`).

---

## 5. Medium-Priority Issues

### 5.1 `/admin` has no page-level guard
[src/app/admin/page.js](src/app/admin/page.js) renders `<AdminPanel />` unconditionally for anyone who navigates there. Every individual `/api/admin/*` call is correctly protected by `requireAdmin()`, so no *data* leaks — but a logged-out or regular user still gets the entire dashboard shell (tab names, form fields, empty states) rendered before every fetch fails with 401/403. This is also a defense-in-depth gap: a future new admin route that forgets to call `requireAdmin()` would have zero secondary protection.

**Fix:** add a `middleware.js` at the project root with a matcher for `/admin/:path*` (and ideally `/studio/:path*`, `/settings/:path*`) that checks the session server-side and redirects non-admins/unauthenticated users before the page ever renders.

### 5.2 API keys can be created but never authenticated against
[src/app/api/user/keys/route.js](src/app/api/user/keys/route.js) lets a user generate an API key (hashed correctly with SHA-256, raw value shown once — good practice), and the Pro plan's marketing copy on the landing page lists "API access" as a feature. But nothing in the codebase reads an incoming `Authorization`/`x-api-key` header and looks it up via `keyHash` to authorize a request — I grepped for it and found only the creation/listing code. As it stands, the feature can't actually be used for anything.

**Fix:** either implement a real bearer-token auth path for `/api/generate/*` (look up `ApiKey.keyHash`, attach the owning user, update `lastUsedAt`), or remove/relabel "API access" from the pricing page until it's built, so you're not advertising something that doesn't work yet.

### 5.3 Admin user editing has no validation or audit trail
[src/app/api/admin/users/route.js](src/app/api/admin/users/route.js) `PATCH` writes `credits` and `role` straight from the request body with no bounds/enum checking (any string becomes the new `role`, any number becomes `credits`, including negative), and — tying back to 4.3 — no `logAudit()` call for what is one of the most sensitive admin actions in the whole system.

**Fix:** validate `role` against `["user", "admin"]` and `credits` as a non-negative integer, and log every admin-initiated credit/role change.

### 5.4 Stripe client has no pinned API version
[src/app/api/stripe/checkout/route.js](src/app/api/stripe/checkout/route.js) and [src/app/api/stripe/webhook/route.js](src/app/api/stripe/webhook/route.js) both do `new Stripe(process.env.STRIPE_SECRET_KEY)` with no explicit `apiVersion`. The `invoice.paid` handler also reads `subscription.current_period_end` off the top-level Subscription object, which has become version-sensitive in recent Stripe API releases (billing-cycle fields moved to the subscription-item level in some versions).

**Fix:** pin `apiVersion` explicitly (`new Stripe(key, { apiVersion: "…" })`) and verify `current_period_end` access against whichever version you pin, per [Stripe's API changelog](https://stripe.com/docs/upgrades).

### 5.5 Whole-page text selection is disabled, plus a custom cursor
[src/styles/globals.css](src/styles/globals.css) sets `user-select: none` and a custom SVG cursor on `<body>` globally. This blocks users from copying prompts, error messages, API keys (shown once on Settings!), and prices — a real usability regression, not just a stylistic choice.

**Fix:** scope `user-select: none` to specific decorative/drag-only elements, and explicitly re-enable selection (`user-select: text`) on prompt inputs/outputs, error text, and the Settings API-key display.

---

## 6. Low-Priority / Polish

| # | Item | Note |
|---|------|------|
| 6.1 | Live Stripe keys (`sk_live_…` / `pk_live_…`) configured directly in local `.env` | Not a leak — `.env` is correctly gitignored and was never committed, and `.env.example` already only contains placeholders. Still, recommend Stripe **test** keys for local dev, live keys only in the deployed environment's secret manager. |
| 6.2 | [src/app/api/estimate/route.js](src/app/api/estimate/route.js) uses `await import("@/lib/prisma")` instead of a top-level import | Inconsistent with the rest of the codebase; adds pointless overhead. |
| 6.3 | `DIRECT_URL` in `.env`/`.env.example` is unused | Prisma ORM v7 removed `datasource.directUrl` in favor of a single `url` — this variable is a harmless leftover from an older Prisma setup guide. Safe to delete, or keep only if something else (a script, Supabase dashboard instructions) still relies on it. |
| 6.4 | `checkRateLimit()` has a small race window on a window's very first request | Two simultaneous "first" requests can both reset the counter to 1. Low impact on its own, but worth revisiting once 4.2 is fixed and rate limiting actually matters everywhere. |
| 6.5 | No `lint`/`typecheck`/`test` script in [package.json](package.json) | Only `dev`/`build`/`start` exist. `typescript` + `@types/*` are installed only for `prisma.config.ts`'s benefit (no `.ts`/`.tsx` files exist under `src/`, and `jsconfig.json` is used rather than `tsconfig.json`) — that's a reasonable intentional choice for a JS project, just worth knowing. A basic `next lint` script would still be cheap to add. |

---

## 7. Suggested Fix Order

Roughly in the order I'd tackle them — each phase unblocks the next:

1. **Make the product enterable at all**: wire real `signIn()` calls (3.1), add `dotenv` loading to `prisma.config.ts` (3.3).
2. **Make money flow correctly**: add `@unique` to `Subscription.userId` (3.2), fix the credit-debit race condition (4.1).
3. **Close the cost-abuse surface**: enforce `checkRateLimit()` on every `/api/generate/*` + upload + workflow route (4.2).
4. **Collapse duplication / restore blueprint promises**: move `image`/`video`/`lipsync` onto `handleGeneration()` (4.5), fix the orchestrator's cost-estimate field mismatch (4.6), fix workflow step regeneration (4.7).
5. **Make the "self-driving" parts actually drive**: wire `logAudit`/`detectAbuse` into admin + generation flows (4.3), add the automation cron route (4.4).
6. **Make read-only surfaces honest**: real Gallery data (4.8), reconcile `/models` with `src/lib/models.js` and correct marketing counts (4.9), fix the profit math (4.10).
7. **Harden the edges**: admin page guard (5.1), decide the fate of API keys (5.2) and the password-login UI (3.1's second half), validate admin user edits (5.3), pin Stripe API version (5.4), scope `user-select` (5.5).
8. Everything in section 6, opportunistically.

---

## 8. A Note on the `.env` / `.env.example` Check

While reviewing environment configuration I initially suspected `.env.example` had been committed with real production secrets (it briefly looked that way due to my own read of the wrong file). I re-verified directly against git history: `.env` (the file with real secrets) has **never** been committed and is correctly listed in [.gitignore](.gitignore); `.env.example` has only ever contained placeholder values. There is no secret leak in git history. The one real recommendation here is 6.1 above (use Stripe test keys locally).

---

*This document reflects the state of the code as read; happy to implement any subset of the above on request.*
