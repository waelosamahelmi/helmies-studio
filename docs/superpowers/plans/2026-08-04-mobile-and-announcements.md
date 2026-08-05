# E7 Mobile + E8 Announcements/Promotions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the studio genuinely usable on a phone (E7), and turn the half-built announcement/promo scaffolding into a working, database-driven system the owner controls entirely from the admin panel (E8).

**Architecture:** E7 is a touch/layout pass over shipped surfaces plus the first mobile viewport coverage in the test suite. E8 extends the existing `SiteAnnouncement` model into a real campaign object (placement, targeting, scheduling, dismissal, metrics), wires the dead `PromoCode` table to an actual redemption path, and repairs two silently-broken CMS bugs.

**Tech Stack:** unchanged. No new dependencies (native Pointer Events for touch; no dnd library).

## Global Constraints

- NEVER prisma migrate/db push or ANY write against `.env` DATABASE_URL (LIVE PRODUCTION, real paying users). Author migrations offline; apply to the TEST DB only (`postgresql://postgres:test@localhost:55432/test`, container `helmies-test-pg`, SHARED — never drop it). Never print `.env` values.
- Providers (KIE/Alibaba/DashScope/…) must NEVER appear in user-facing strings.
- Money: prices server-computed; a promo may never produce a negative charge or mint credits outside the ledger.
- New/changed routes registered in `security/route-manifest.json` (CI-enforced); state-changers get `verifyOrigin`.
- Landing page (`src/app/page.js`, `src/components/landing/*`) off-limits except attribute/contrast a11y fixes.
- **Shared-resource rule:** `playwright.config.mjs` hardcodes port 3399 with `reuseExistingServer: !CI`. Kill any listener before every Playwright run or you will test another worktree's build:
  `for pid in $(netstat -ano 2>/dev/null | grep ":3399" | awk '{print $5}' | sort -u | grep -v '^0$'); do taskkill //PID $pid //F >/dev/null 2>&1; done; sleep 4`
  Run Playwright synchronously, never backgrounded.
- React 19 streams the shell twice; `fill()`/`press()` can hit the doomed copy and silently no-op. Wait for the duplicate to collapse before interacting: `await expect.poll(() => page.locator(".st-app").count(), { timeout: 20000 }).toBe(1);`
- Gates per task: `npm run lint && npm run typecheck && npx vitest run && npm run build`; `TEST_DATABASE_URL=… npm run test:integration` where DB is touched; Playwright where UI changes.
- Commit footers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_011b4sNmey45tunVt3b9HZhr`.

---

# Phase E7 — Mobile

### Task E7.1: Mobile test coverage FIRST (so every later fix is proven)

**Files:** `playwright.config.mjs`; `tests/e2e/mobile.spec.mjs`

**Interfaces:** add a `mobile` Playwright project using `devices["Pixel 5"]` (393×851, `hasTouch: true`, `isMobile: true`), depending on `setup`, running only `tests/e2e/mobile.spec.mjs`. Keep the three desktop projects unchanged so nothing regresses.

- [ ] **Step 1: Write failing mobile specs.** For `/studio` (agent), `/studio/image`, `/studio/director`, `/studio/workflows`, `/gallery`, `/admin`:
  (a) **no horizontal page scroll** — assert `document.documentElement.scrollWidth <= innerWidth + 1`;
  (b) **every interactive control is ≥44×44 CSS px** — enumerate visible `button, a, input, select, [role=button], [role=switch]` and assert `getBoundingClientRect()`; report every offender by selector so the list is actionable;
  (c) the agent's balance, **Clear conversation**, latest-plan summary and produced-outputs are all reachable (they are hidden with no replacement today);
  (d) Director per-shot action buttons expose a visible or accessible name on touch (tooltips are hover-only).
- [ ] **Step 2: Run — they fail. Record the offender list in the commit message.** Do not fix yet.
- [ ] **Step 3: Commit** — `test: mobile viewport coverage for the studio surfaces`

### Task E7.2: Touch targets and the tooltip gap

**Files:** `src/styles/system.css`, `src/styles/pages.css`

**Interfaces:**
- **Specificity bug:** `system.css:411` `.hs-btn--icon.hs-btn--sm { width: 32px }` (0-2-0) out-specifies the `@media (pointer: coarse)` rule at `:430` (0-1-0), so small icon buttons stay 32px on touch. Fix by matching specificity inside the coarse block (`.hs-btn--icon.hs-btn--sm { width: var(--btn-h); }`), not with `!important`.
- Give `.hs-switch`, `.hs-thumb__x`, `.pg-tab`, `.st-canvas__tool`, `.hs-chip`, `.hs-segmented > button` a `pointer: coarse` minimum of 44px (grow the hit area; visual size may stay via padding/pseudo-element so the design isn't distorted).
- **Tooltips are hover-only** (`system.css:909`), so every `data-tip` icon-only button is unlabelled on touch. Either render `data-tip` text as a visible caption under coarse pointers, or ensure each such control has visible text. Director's three per-shot buttons are the worst case.

- [ ] Steps: fix → re-run E7.1's tap-target assertions until zero offenders → gates → commit `fix: touch target sizes and touch-visible labels`

### Task E7.3: Reachability — nothing hidden without a way back

**Files:** `src/styles/studio.css`; `src/components/studio/OrchestratorStudio.js`

**Interfaces:** every surface that hides a pane on small screens must offer a way to reopen it. Workspace tools, audio/music, canvas and workflows already do (`.st-panel-tabs` / a Sheet trigger). **The agent does not:** `.st-talk__side` is `display:none` at ≤1024 with no replacement, stranding the balance, Clear conversation, plan summary and produced-outputs list. Add the same affordance the other surfaces use (a `.st-panel-tabs`-style trigger opening the existing side content in a `Sheet`) — reuse, do not invent a new pattern.

- [ ] Steps: implement → E7.1's reachability assertions pass → gates → commit `fix: the agent side panel is reachable on phones and tablets`

### Task E7.4: Touch paths for drag-only interactions

**Files:** `src/components/studio/CanvasStudio.js` (layer reorder); `src/components/studio/workflow/*` + `WorkflowStudio.js` (E5 pipeline reorder); `src/components/studio/director/Timeline.js` (E4 clip reorder + trim)

**Interfaces:** all three use HTML5 drag-and-drop or fine-pointer drag, which **does not fire on touch**. Canvas layer reordering is currently impossible on a phone with no fallback at all. For each: keep the mouse drag, and add a touch-capable path — Pointer Events (the `ClippingStudio.js` grip pattern is the in-repo precedent, `setPointerCapture`) and/or explicit move-up/move-down buttons. Workflow already has Earlier/Later buttons — make sure they remain visible on mobile. Trim handles must be ≥44px of hit area on coarse pointers even if drawn thin (`.st-range__grip` is 7px today).

- [ ] Steps: e2e (mobile project) proving reorder works by touch on each surface → implement → gates → commit `feat: touch paths for layer, step and clip reordering`

### Task E7.5: Tables, admin navigation, and the unstyled-toast bug

**Files:** `src/styles/system.css`, `src/styles/pages.css`, `src/components/ToastProvider.js`

**Interfaces:**
- `.hs-table { min-width: 560px }` forces a nested horizontal scroller for every admin table at 390px. Give tables a card/stacked presentation under a phone breakpoint (label-value rows) rather than a sideways scroll, or at minimum a visible scroll affordance. Prefer stacking for the admin tables the owner actually uses.
- The admin section nav is a ~1,900px hidden-scrollbar strip of 15 links (`pages.css:656-666`); the settings tab strip has the same shape. Give them a visible affordance (edge fade / scroll buttons) or a select-style picker on phones.
- **`ToastProvider` renders `.toast-container`/`.toast` classes that exist only in `globals.css`, which loads on the landing page only** — so every generation-complete toast in the studio is unstyled, in normal document flow. Either move those styles into `system.css` (there is already a fully-styled, unused `.hs-toasts`/`.hs-toast` system there, including a mobile rule that lifts them above the dock) or switch the provider to those classes. Do not leave two toast systems.

- [ ] Steps: implement → mobile e2e green → gates → commit `fix: mobile tables, admin navigation, and studio toast styling`

---

# Phase E8 — Announcements, popups and promotions

### Task E8.1: Campaign schema

**Files:** `prisma/schema.prisma` + migration `20260804_announcement_campaigns`; `src/lib/announcements.js`; tests `tests/unit/announcements.test.mjs`, `tests/integration/announcements.int.test.mjs`

**Interfaces:** extend `SiteAnnouncement` (keep the existing rows valid — every new column nullable or defaulted):
```prisma
// added to SiteAnnouncement
placement   String   @default("banner")   // banner | modal | toast
title       String?
imageUrl    String?
ctaLabel    String?
ctaUrl      String?
dismissible Boolean  @default(true)
priority    Int      @default(0)
planTargets String[] @default([])          // empty = everyone; else plan slugs
audience    String   @default("all")       // all | anon | authed  (already exists — MAKE IT WORK)
impressions Int      @default(0)
clicks      Int      @default(0)
@@index([isActive, startDate, endDate])     // the exact predicates the public route filters on
```
```prisma
model AnnouncementDismissal {
  id             String   @id @default(cuid())
  announcementId String
  userId         String
  dismissedAt    DateTime @default(now())
  @@unique([announcementId, userId])
  @@index([userId])
  @@schema("public")
}
```
- `src/lib/announcements.js`: `listForViewer({ userId, planSlug, isAuthed })` → active, in-window, audience- and plan-matched, not-dismissed-by-this-user, ordered by `priority desc, createdAt desc`. `dismiss(announcementId, userId)` (idempotent upsert). `recordImpression(id)` / `recordClick(id)` (atomic `increment`).
- Dismissal stays in localStorage for anonymous viewers; **signed-in dismissals persist in the DB** so they don't reappear on another device.

- [ ] Steps: failing tests (audience filter actually applies; plan targeting; window; dismissed rows excluded; priority ordering; dismissal idempotent; counters atomic) → migration on the TEST DB only → implement → gates + integration → commit `feat: announcement campaign targeting, dismissal and metrics`

### Task E8.2: Public delivery — and make it visible where users actually are

**Files:** `src/app/api/announcements/route.js`; `src/app/api/announcements/[id]/dismiss/route.js`; `src/app/api/announcements/[id]/click/route.js`; `security/route-manifest.json`; `src/components/AnnouncementBar.js`; new `src/components/AnnouncementPopup.js`; `src/components/Providers.js`; `src/styles/system.css`

**Interfaces:**
- GET `/api/announcements` returns `listForViewer(...)` for the current session (anonymous allowed). **Stop leaking `e.message` to unauthenticated callers** — use the `apiError` envelope from `src/lib/api-error.js`. Add a short cache header; the query is per-viewer so keep it private/no-store if targeting is in play.
- POST `/api/announcements/[id]/dismiss` and `/click` (origin-checked; dismiss requires auth, click may be anonymous). **`params` must be awaited** — see `tests/unit/route-params-await.test.mjs`.
- **Bug to fix:** `.pg-announce` is statically positioned while `.st-app` is `position: fixed; inset: 0`, so **announcements are invisible inside `/studio`** — every announcement the owner has ever posted has been hidden from users in the app. Follow `OfflineBanner`'s proven pattern (mounted in `Providers.js`, `position: fixed`, high `z-index`, tokens from `system.css` so it does not depend on landing-only CSS). Keep it clear of the top bar and the mobile dock.
- `AnnouncementPopup` renders `placement: "modal"` campaigns using the existing `Modal` from `kit/Sheet.js` (which already becomes a bottom sheet ≤640px): title, optional image, body, CTA, dismiss. Record an impression on first display and a click on CTA activation. Never block a user who has dismissed it; respect `dismissible: false` only for genuinely blocking notices.
- Style variants must actually differ (`style: info|success|warning|critical` maps to real tokens — today every style renders identically).

- [ ] Steps: e2e first (a seeded banner shows **inside /studio**; a modal campaign opens once and stays dismissed after reload for a signed-in user; an anon-targeted campaign never shows to a signed-in user; clicking the CTA increments clicks) → implement → gates + e2e (desktop AND mobile projects) → commit `feat: announcement delivery, popups, and visibility inside the studio`

### Task E8.3: Admin control

**Files:** `src/app/api/admin/announcements/route.js` (add PUT, full field set); `src/components/admin/AnnouncementsPanel.js` (extract from `AdminPanel.js`); `src/components/admin/AdminShell.js`

**Interfaces:** full CRUD — create, **edit** (missing today: only create/toggle/delete exist), duplicate, schedule (start/end), choose placement, audience and plan targets, upload or link an image, set CTA, set priority, toggle live. Show per-campaign **impressions, clicks and dismissals** so the owner can tell whether a promotion worked. A live preview of how the campaign will render (banner vs modal) before saving. The PATCH route currently accepts a field set no caller sends — replace with an explicit, validated PUT.

- [ ] Steps: e2e (admin creates a campaign → it appears for a normal user → editing the copy changes what the user sees → toggling live hides it) → implement → gates → commit `feat: full announcement campaign management in the admin panel`

### Task E8.4: Make promo codes real

**Files:** `prisma/schema.prisma` + migration (`PromoRedemption`); `src/lib/promos.js`; `src/app/api/promos/redeem/route.js`; `src/app/api/stripe/checkout/route.js`; `src/app/api/stripe/topup/route.js`; pricing/billing UI; `security/route-manifest.json`; tests

**Interfaces:** `PromoCode` today is a full admin CRUD screen over a table **nothing reads** — no redemption endpoint, no input field, no Stripe wiring, and `currentUses` is never incremented. A customer given a code has nowhere to enter it.
```prisma
model PromoRedemption {
  id          String   @id @default(cuid())
  promoCodeId String
  userId      String
  redeemedAt  DateTime @default(now())
  @@unique([promoCodeId, userId])   // enforces maxUsesPerUser = 1 by construction
  @@index([userId])
  @@schema("public")
}
```
- `validatePromo(code, userId)` → `{ valid, reason?, promo }`: checks `isActive`, the `startsAt`/`expiresAt` window, `maxUses` vs `currentUses`, per-user redemptions, and `eligibility` (`all|new|existing` — decided by whether the user has any prior successful payment).
- `POST /api/promos/redeem` (auth, origin-checked, rate-limited): validates and returns the discount preview. Credit-grant style codes grant through the **existing wallet ledger** (`grantCredits`), never a direct balance write, and record a `PromoRedemption` in the same transaction as the `currentUses` increment so a double-submit cannot double-grant.
- Stripe: pass the discount properly (`discounts: [{ coupon }]` when a Stripe coupon is configured, or `allow_promotion_codes: true` to let Stripe own it) — decide one and document why. A percentage must never yield a charge below Stripe's minimum, and must never bypass the credit margin floor (`assertMarkupAboveFloor`).
- UI: a promo field on the pricing/checkout path showing the validated discount before payment, with a clear message for each rejection reason.

- [ ] Steps: failing tests (expired / exhausted / wrong-eligibility / already-redeemed each rejected with a distinct reason; a valid code redeems exactly once under concurrent double-submit; credits land in the ledger and `reconcileWallet` stays clean) → implement → gates + integration → commit `feat: promo code redemption wired to checkout and the credit ledger`

### Task E8.5: Repair the silently-broken CMS

**Files:** `src/app/api/admin/cms-content/publish/route.js`; `prisma/schema.prisma` (if a `status` on revisions is genuinely wanted); tests

**Interfaces:** two real bugs:
1. `cmsRevision.create` passes a `status` field that **does not exist on the model**, so every call throws — and the error is swallowed by `.catch(() => {})`. **No revision has ever been saved.** Fix the payload (or add the column deliberately) and stop swallowing the error; record `createdBy`.
2. `CmsEntry.key` is `@unique`, but the publish route's `updateMany({ where: { key, status: "published" } })` assumes a draft and a published row can coexist under one key — impossible under the current schema. Decide the model (single row with a status, or versioned rows keyed by `[key, version]`) and make code and schema agree.
Also: `CmsEntry` is written by the admin and **read by no page**. Either wire one real consumer (so the owner can edit copy without a deploy) or clearly mark the section as not yet connected — do not leave it silently useless.

- [ ] Steps: failing tests → implement → gates + integration → commit `fix: CMS revisions are actually written, and publish matches the schema`

---

## Self-Review
1. **Coverage:** mobile complexity → E7.1–E7.5 (measured, not asserted); popups/announcements/promotions, DB-driven and admin-controlled → E8.1–E8.4; the pre-existing breakage that would otherwise sabotage E8 → E8.2 (invisible in studio, audience ignored) and E8.5 (CMS).
2. **Placeholders:** none — every task names files, shapes and assertions. E7.1 deliberately records the real offender list before fixing, because that list cannot be known in advance.
3. **Type consistency:** `listForViewer`/`dismiss`/`recordImpression`/`recordClick` (E8.1) are consumed unchanged by E8.2; `validatePromo` (E8.4) is used by both the redeem route and checkout; the `mobile` Playwright project added in E7.1 is reused by E7.2–E7.5 and E8.2.
