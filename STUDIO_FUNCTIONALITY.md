# Helmies Studio — Current-State Functionality Reference

**Status:** Current-state reference. Describes the codebase as it actually exists and behaves today.
**Companion document:** `HELMIES_STUDIO_MASTER_UPGRADE.md` (target-state contract). Where the two disagree, the master document states the target and this document states the fact.
**Verified against:** working tree on 2026-07-28 (`package.json`, `prisma/schema.prisma`, `src/`, `scripts/`, `.env.example`).
**Production URL:** https://studio.helmies.fi

Conventions: **Auth** column values: `public` (no session), `user` (valid session or API key), `admin` (`User.role === "admin"`), `cron` (shared-secret bearer). File paths are relative to the repo root.

---

# 1. Stack and Runtime

| Area | Fact |
|---|---|
| Framework | Next.js `^16.2.3` (App Router), React `^19.0.0` |
| Language | JavaScript (JSX); `typescript` present as devDependency but the app is `.js` |
| Auth | NextAuth `^5.0.0-beta.31` + `@auth/prisma-adapter`, JWT session strategy |
| Database | PostgreSQL via Prisma `^7.0.0` / `@prisma/client ^7.8.0` + `@prisma/adapter-pg` + `pg`; `.env.example` indicates Supabase hosting; schemas `public` + `auth` |
| Payments | `stripe ^17.7.0` |
| AI providers | WaveSpeed (primary), KIE (jobs + OpenAI-compatible LLM/vision endpoint); env keys exist for Atlas and Alibaba |
| Canvas | `fabric ^7.4.0` |
| UI | Tailwind CSS `^4.0.0`, `framer-motion`, `lenis`, `react-hot-toast`, `react-icons` |
| Scripts | `dev` (port 3003), `build`, `start`, `lint`. **No test script, no tests, no CI workflows** |
| Rendering | `/studio` and `/studio/[tool]` are `force-dynamic` (commit history: prevents stale static prerender of studio pages) |
| Repo hygiene | No `prisma/migrations/` (schema applied via `db push`); no Dockerfile/docker-compose; `ssh.md` (plaintext server credentials) is tracked in git |

# 2. Authentication and Authorization

## 2.1 Providers and session model

`src/lib/auth.js` configures NextAuth v5 with:

1. **Google OAuth** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) via `PrismaAdapter` (Account/Session/User tables).
2. **Credentials (email + password)** — recently added. `User.passwordHash` (bcrypt, cost 10) verified in the `authorize` callback. Users without a `passwordHash` (OAuth-only accounts) cannot use credentials login.

Session strategy is **JWT** (required by the Credentials provider; the Prisma adapter remains for Google account linking). The `jwt` callback embeds `id`, `role`, `credits` and refreshes `role`/`credits` from the DB on every request; the `session` callback exposes them on `session.user`.

## 2.2 Sign-up paths and first-user-admin

- `events.createUser` (OAuth sign-up): first user in the DB becomes `role = "admin"`, all others `"user"`. Creates a free `Subscription`, a `CreditWallet` (`available: 100, lifetime: 100`) and a `CreditTransaction` (`signup_bonus`, +100).
- `POST /api/auth/register` (credentials sign-up, public): validates email format and password ≥ 8 chars, checks duplicates (409), bcrypt-hashes, applies the same first-user-admin rule (count === 0 before create), and creates user + free subscription + wallet (100) + signup transaction atomically. Has an in-memory per-IP rate limit (10 attempts / 10 min / instance).
- `scripts/seed-admin.mjs`: idempotent admin seeder. Reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` from env; creates or updates the user (refreshes `passwordHash`, ensures `role = "admin"`, never demotes), ensures free `Subscription` and `CreditWallet` rows. Run with `node scripts/seed-admin.mjs`.

## 2.3 Route protection

`middleware.js` guards `/admin/*`, `/studio/*`, `/settings/*` by fetching `/api/auth/session` internally and redirecting to `/login`; `/admin/*` additionally requires `session.user.role === "admin"` (else redirect to `/studio`). It sets `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` on protected responses only.

Server-side helpers (`src/lib/session.js`, `src/lib/security.js`): `getCurrentUser`, `getCurrentUserWithCredits`, `requireAdmin` (both variants check `role === "admin"`), `isAdmin`. There is exactly one role dimension (`user` | `admin`); no granular admin roles.

## 2.4 API keys

`/api/user/keys` (GET/POST/DELETE, user) manages user API keys. Keys are stored as SHA-256 hashes (`ApiKey.keyHash`) with a display prefix (`keyPrefix`) and `lastUsedAt`. `authenticateApiKey` (`src/lib/api-key-auth.js`) accepts `Authorization: Bearer` or `x-api-key` headers and is honored by the sync generation handler. No scopes.

# 3. Data Model (Prisma)

41 models in `prisma/schema.prisma`. Summary:

| Group | Models | Notes |
|---|---|---|
| Identity | `User` (email, passwordHash, role, credits Int default 100), `Account`, `Session`, `VerificationToken` | `User.credits` is the legacy balance column, mirrored from the wallet |
| Billing | `Subscription` (stripeCustomerId, stripeSubscriptionId, stripePriceId, plan, status), `CreditTransaction` (amount, type, description) | |
| Credits V2 | `CreditWallet` (available, reserved, lifetime), `CreditLedger` (walletId, amount, type, balanceAfter), `CreditReservation` (walletId, amount, generationId, status) | Field set diverges from `lib/wallet.js` code — see §17.1 |
| Generation | `Generation` (tool, model, prompt, params Json, outputUrl, status, creditsUsed, providerCost Float, requestId, workflowId/workflowStepId), `AgentRun` | |
| Workflows | `Workflow` (steps Json, isTemplate, isPublic), `WorkflowRun` | |
| Memory | `ProjectMemory` (type: character/style/asset/brand) | |
| Director | `DirectorPipeline` (plan/brief/costEstimate/validationResults/stateMetadata/assembledUrl/assemblyMetadata/rerunHistory Json), `DirectorShot` (plan/imageResult/videoResult/audioResult Json) | |
| Brand | `BrandKit` (colors, fonts, slogans, photographyStyle, toneOfVoice, avoid, visualReferences, fingerprint, enforcement, website), `BrandAsset` | |
| Canvas | `CanvasDocument` (data Json, width, height), `CanvasVersion` (data Json, snapshot) | |
| Assets | `Asset` (type, source, url, storageKey, thumbnailUrl, model, generationId, parentAssetId, metadata, analysis, isFavorite, isDeleted), `AssetRelation` | |
| Admin/commercial | `ProviderConfig` (plaintext apiKey, markup Float default 2.5), `ModelPricing` (providerCost Float, creditsCost Int, UI card fields), `FeatureFlag`, `ApiKey`, `AuditLog`, `RateLimit`, `Refund`, `PromoCode`, `SubscriptionPlan`, `CreditPack`, `CmsEntry`, `CmsRevision`, `SiteAnnouncement`, `ProviderIncident` | |
| Intelligence | `PromptGuide` (modelId+category unique), `PromptGuideVersion`, `PromptCompilation` (per-pass prompts, guideVersion, warnings, polishMode), `VisualAnalysis` (assetUrl key, caption/palette/regions/textRegions/lighting/style) | |
| Projects | `Project` (name, description, data) | |

# 4. Credits, Wallet and Pricing (as implemented)

## 4.1 Balances

Three representations coexist:

1. `User.credits` (legacy Int) — displayed widely; kept as a **mirror** of the wallet by `getCurrentUserWithCredits` / `syncLegacyCredits`.
2. `CreditWallet.available` / `.reserved` — intended source of truth (`lib/wallet.js`, `lib/session.js`).
3. `CreditTransaction` — legacy append-only log (signup_bonus, topup, subscription, subscription_renewal, generation, refund, webhook_refund, admin types).

New users receive **100 hard-coded signup credits** (`lib/auth.js`, `api/auth/register`).

## 4.2 Cost resolution order for a generation

1. `ModelPricing.creditsCost` for the model (DB override), else
2. static fallback per tool (`src/lib/credits.js` `CREDIT_COSTS`: image 2, i2i 3, video 10, i2v 12, v2v 8, lipsync 8, audio 5, recast 12, cinema 4, motion 8, clipping 6, marketing 15, influencer 3), with `pricing-engine.js` adding param-based surcharges for estimates (duration > 10s, 2K/4K resolution, extra images).

`pricing-engine.js`: `credits = ceil(providerCost × markup / 0.01)`, markup default **2.5** (per-provider override via `ProviderConfig.markup`), i.e. **1 credit = €0.01 retail**. `syncPricingFromWaveSpeed` upserts `ModelPricing` from the WaveSpeed v3 models + pricing APIs; `kie-sync.js` does the same for KIE models scraped from KIE's sitemap with 2.5× markup (triggered by `POST /api/admin/sync/kie` or daily cron `/api/cron/sync-kie`).

## 4.3 Wallet service (intended design)

`lib/wallet.js`: `reserveCredits` (available→reserved + reservation + ledger), `settleReservation` (charge actual, release remainder), `releaseReservation` (full release), `grantCredits`/`refundCredits`, `preflightQuote` (estimated/maximum/balance-after calculations). **This module references schema fields that do not exist** — see §17.1.

## 4.4 Subscription credit grants

`SUBSCRIPTION_CREDITS` in `lib/credits.js`: free 100, starter 1000, studio 3000, pro 10000. Plan resolution from Stripe price IDs via env vars (`STRIPE_PRICE_STARTER/STUDIO/PRO`, monthly only in `PLAN_IDS`).

# 5. Stripe Integration

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/stripe/checkout` | user | Creates a subscription Checkout Session. Plan → price ID resolved from env (`STRIPE_PRICE_{PLAN}` / `..._YEARLY`). Upserts `Subscription` (status pending) with `stripeCustomerId`. |
| `GET/POST /api/stripe/topup` | user | `GET` lists static `CREDIT_PACKS` (500/€9, 1000/€16, 2500/€35, 5000/€60); `POST` creates a one-time Checkout Session for a pack using `NEXT_PUBLIC_STRIPE_PRICE_CREDITS_*` env price IDs, metadata `type: "credit_topup"`. |
| `POST /api/stripe/portal` | user | Creates a Stripe Billing Portal session. |
| `POST /api/stripe/webhook` | public (signature-verified) | Handles `checkout.session.completed` (top-up → increment `User.credits`; subscription → grant `SUBSCRIPTION_CREDITS[plan]`), `invoice.paid` (renewal grant on `subscription_cycle`, sync Subscription row), `customer.subscription.deleted` (plan → free, status cancelled). |

**Gaps:** the webhook credits `User.credits` directly and never touches `CreditWallet`/ledger — granted credits can be overwritten by the wallet mirror (§17.2). No Stripe event-ID idempotency/dedup. Price IDs and pack definitions are env/static, not DB-driven. API version pinned `2024-12-18.acacia`.

# 6. Pages

| Route | Auth | What it is |
|---|---|---|
| `/` | public | Landing page (visually protected per the master spec). Static plan arrays and model counts. |
| `/pricing` | public | Pricing page (static arrays; plan CTAs → checkout). |
| `/models` | public | Public model showcase. |
| `/gallery` | user | "Generations" library (also linked from the studio LIBRARY group). |
| `/login` | public | Shared login: Google button + email/password form + registration (via `AuthModal`, recently wired to `/api/auth/register`). |
| `/settings` | user | Account, credits display, API keys. |
| `/studio` | user | Authenticated studio shell (`StudioClient`), tab-based tool switcher, defaults to the Agent (orchestrator) tab. |
| `/studio/[tool]` | user | Same shell pre-selected to a tool; SEO metadata for 14 tools (image, video, audio, cinema, vibe-motion, clipping, marketing, lipsync, body-swap, influencer, canvas, director, assets + fallback). `force-dynamic`. |
| `/admin` | admin | `AdminShell` control plane (§15). |
| `/error`, `/loading`, `/not-found` | — | App Router conventions. |

# 7. API Reference

All routes live under `src/app/api`. "Credits" = whether the route charges/quotes credits.

## 7.1 Generation

| Route | Auth | Behavior | Credits |
|---|---|---|---|
| `POST /api/generate/image` | user/API key | Sync T2I via `handleGeneration` (§9). | reserve/settle cost |
| `POST /api/generate/i2i` | user/API key | Sync image-to-image/edit. | reserve/settle |
| `POST /api/generate/video` | user/API key | Sync T2V. | reserve/settle |
| `POST /api/generate/i2v` | user/API key | Sync image-to-video. | reserve/settle |
| `POST /api/generate/v2v` | user/API key | Sync video-to-video/edit. | reserve/settle |
| `POST /api/generate/lipsync` | user/API key | Sync lip sync. | reserve/settle |
| `POST /api/generate/audio` | user/API key | Sync music/TTS/SFX. | reserve/settle |
| `POST /api/generate/recast` | user/API key | Sync recast/body-swap. | reserve/settle |
| `POST /api/generate/cinema` | user/API key | Cinematic video with camera controls. | reserve/settle |
| `POST /api/generate/motion` | user/API key | Motion graphics. | reserve/settle |
| `POST /api/generate/clipping` | user/API key | Highlight extraction. | reserve/settle |
| `POST /api/generate/marketing` | user/API key | UGC ads / marketing creatives. | reserve/settle |
| `POST /api/generate/influencer` | user/API key | Persona/avatar content. | reserve/settle |
| `POST /api/generate/async` | user | Fire-and-forget submit: creates `Generation` (pending), **debits immediately** (`debitCredits`), submits via `submitOnly` with `callBackUrl`, returns `generationId` + `pollUrl`. Writes a non-existent `Generation.providerName` field (§17.1). | debit up-front |
| `GET /api/generations` | user | List the caller's generations. | — |
| `GET /api/generations/status?id=` | user | Poll one generation's status/output. | — |
| `POST /api/webhooks/generation-complete` | cron-ish | Provider callback (KIE + WaveSpeed formats). Bearer check only if `WEBHOOK_SECRET`/`CRON_SECRET` set. On success: downloads media locally, marks completed. On failure: marks failed, refunds via `creditUser` (§17.1). No event dedup. | refund on fail |
| `POST /api/webhooks/generation` | cron-ish | Secondary/legacy generation webhook. | — |
| `POST /api/estimate` | user | Single quote: credits, affordability, remaining, shortfall, suggested top-up packs. | quote only |
| `POST /api/estimate/batch` | user | Multi-step quotes (used by agent/workflow planners). | quote only |
| `POST /api/assemble` | user | FFmpeg video assembly (`lib/video-assembly.js`) for Director/manual use. | — |

## 7.2 Agent

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/agent/chat` | user | Streaming orchestrator chat (SSE). Uses orchestrator system prompt; KIE OpenAI-compatible chat completions; streams tokens; graceful "No LLM configured" message when `KIE_KEY` missing. Rate-limited. |
| `POST /api/agent/plan` | user | JSON-step plan generation (`planTask` in `lib/agents.js`): LLM returns `{steps[], summary, totalCredits, maxCredits}`; server re-estimates each step via `estimateAgentTask`. |
| `POST /api/agent/run` | user | Executes a plan (SSE streaming by default): `executeAgentRunStream`/`executeAgentRun` run steps sequentially, substituting `$STEP_N_OUTPUT`, calling `lib/generation.js` functions; persists `AgentRun` (steps, result, creditsEstimated/creditsUsed). |

## 7.3 Director

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/director/plan` | user | `createProductionPlan(brief, userId)`: builds plan JSON, validates shots, estimates cost (`estimateDirectorCost`), persists `DirectorPipeline` + `DirectorShot` rows. |
| `POST /api/director/execute` | user | `executeProductionPipeline`: runs the shot state machine (image → video → optional audio → quality → assembly), updates per-shot results and pipeline state. |
| `POST /api/director/rerun` | user | `rerunShot(pipelineId, userId, shotId, rerunType)`: rerun image/video/audio/full for one shot without touching others; records `rerunHistory`. |
| `GET/POST /api/director/status` | user | `getPipelineStatus` / list pipelines; cancel supported in the executor (`cancelPipeline`). |

## 7.4 Intelligence and media

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/prompt/compile` | user | Runs the 5-pass prompt engine (`lib/prompt-engine/*`), returns compiled prompt/negative/warnings/guide version. Rate-limited. |
| `POST /api/prompt/optimize` | user | Legacy single-pass `expandPrompt`. Rate-limited. |
| `POST /api/analyze`, `GET /api/analyze` | user | Visual analysis via `lib/visual-intelligence.js` (KIE multimodal, `VISION_MODEL` default `google/gemini-2.5-flash-openai`), cached in `VisualAnalysis` by URL. |
| `POST /api/upload` | user | Multipart upload → `public/uploads/<uuid><ext>` → `/api/media/local/<name>`; creates an `Asset` (source upload). **No size/MIME/content validation.** Rate-limited. |
| `GET /api/media/local/[name]` | public | Serves a file from `public/uploads`. |
| `GET /api/media/proxy?url=` | **public** | Fetches any http(s) URL and streams it with `Access-Control-Allow-Origin: *`, Range support, immutable caching. The declared `PROVIDER_DOMAINS` allowlist is **not enforced** (§17.4). |
| `GET /api/assets` | user | List caller's assets (library). |
| `GET /api/openrouter/models` | public | Lists LLM models for the chat UI. |
| `GET /api/provider/models` | public | Live WaveSpeed model catalog (`fetchWaveSpeedModels`). |
| `POST /api/provider/pricing` | public | Live WaveSpeed price quote for a model + inputs → credits via `calculateCredits`. |

## 7.5 Account, billing, content

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/credits` | user | Balance (wallet-synced), active subscription, last 20 `CreditTransaction` rows. |
| `GET/POST/DELETE /api/user/keys` | user | API key management (§2.4). |
| `GET/POST /api/workflows` | user | Workflow CRUD (steps JSON). |
| `POST /api/workflows/[id]/run` | user | Executes a workflow run (`WorkflowRun`). |
| `POST /api/workflows/[id]/regen` | user | Re-runs/regenerates from a previous run. |
| `GET/POST/PATCH/DELETE /api/brand-kits` | user | Brand kit CRUD (ownership-scoped). |
| `POST /api/brand-kits/fingerprint` | user | Derives palette/typography/style fingerprint from kit references (`lib/brand-engine.js`). |
| `GET/POST/PATCH/DELETE /api/canvas` | user | Canvas document CRUD + version rows. **Writes non-existent `content`/`version` fields (§17.1).** |
| `GET/POST /api/canvas/versions` | user | Canvas version listing/creation. |
| `GET/POST/DELETE /api/memory` | user | `ProjectMemory` CRUD (character/style/asset/brand). |
| `GET /api/announcements` | public | Active site announcements for the announcement bar. |
| `GET /api/cron/automation` | cron | `runAutomation`: auto-disables models with ≥5 failures/30 min, flags abusive users (>100 gens/hour), maintenance tasks. |
| `POST /api/cron/sync-kie` | cron | Daily KIE model/pricing sync (§4.2). |

## 7.6 Admin (all `requireAdmin`; write actions audit-logged)

| Route | Behavior |
|---|---|
| `GET /api/admin/analytics` | Overview metrics (users, revenue, generations, costs). |
| `GET/PATCH /api/admin/users` | User list/search; credit adjustment and role changes with audit. |
| `GET/POST/PATCH /api/admin/plans` | `SubscriptionPlan` CRUD. |
| `GET/POST/PATCH /api/admin/credit-packs` | `CreditPack` CRUD. |
| `GET/POST/PATCH /api/admin/promos` | `PromoCode` CRUD. |
| `GET/POST/PATCH /api/admin/pricing` | `ModelPricing` CRUD. |
| `POST /api/admin/pricing/sync` | WaveSpeed pricing sync (manual). |
| `POST /api/admin/sync/kie` | KIE pricing sync (manual). |
| `GET/POST/PATCH /api/admin/models` | Model (pricing) management + smoke-test action used by `ModelManager`. |
| `GET/POST/PATCH /api/admin/providers` | `ProviderConfig` CRUD (plaintext keys). |
| `GET /api/admin/provider-health` | Provider health/incident view (`ProviderIncident`, failure stats). |
| `GET/POST/PATCH /api/admin/prompt-guides` | `PromptGuide` + versions CRUD. |
| `GET/POST /api/admin/cms-content`, `POST /api/admin/cms-content/publish` | CMS entry CRUD, draft→publish with `CmsRevision`. |
| `GET/POST/PATCH /api/admin/announcements` | `SiteAnnouncement` CRUD. |
| `GET/POST /api/admin/flags` | `FeatureFlag` CRUD. |
| `GET /api/admin/jobs` | Generation/job inspection. |
| `GET/POST /api/admin/refunds` | Refund queue. |
| `GET /api/admin/keys` | API key oversight. |
| `GET /api/admin/audit` | Audit log viewer. |

# 8. Studio Tools and Modes

`StudioClient.js` tool registry (CREATE group unless noted; badge = model count shown in UI):

| Tool | Route | Models | What it does |
|---|---|---|---|
| Agent (orchestrator) | `/studio` | — | Chat → Generate Plan → execute steps; `OrchestratorChat`/`OrchestratorMode`; badge "New". |
| Image | `/studio/image` | 32 | T2I/I2I; aspect, resolution, dimensions, variations, seed; single + multi (≤10) reference uploads. |
| Video | `/studio/video` | 17 | T2V/I2V; first/last frame, reference images/videos; duration, aspect, resolution, standard/pro mode; auto-switches to I2V when a first frame is set. |
| Director | `/studio/director` | — | Multi-shot production workspace (`DirectorWorkspace`, §12). |
| Audio | `/studio/audio` | 7 | Music/voice/SFX (Suno, ElevenLabs). |
| Music | (tab) | — | Suno music + ElevenLabs TTS variant. |
| Lip Sync | `/studio/lipsync` | 9 | Image/video + audio → talking video. |
| Recast | `/studio/body-swap` | — | Face/identity replacement into scenes. |
| Influencer | `/studio/influencer` | — | Persona content builder (`INFLUENCER_TABS`). |
| AI Avatar | (tab) | — | Kling AI avatar animation. |
| Canvas | `/studio/canvas` | — | Fabric.js visual instruction editor + compile → generate (§14.3). |
| Cinema | `/studio/cinema` | — | Camera-control-driven video (cameras/lens/focal/aperture catalogs). |
| Motion | `/studio/vibe-motion` | — | Motion graphics/remix. |
| Video Edit | (tab) | — | Runway Aleph, Veo extend, Wan V2V, upscale. |
| Clipping | `/studio/clipping` | — | Highlight extraction. |
| Marketing | `/studio/marketing` | — | UGC ads, product shots, avatar presenters (`MARKETING_AVATARS`). |
| Workflows (BUILD) | (tab) | — | Node-based builder + runs. |
| Brand Kits (BUILD) | (tab) | — | Kit CRUD + fingerprint. |
| Projects (BUILD) | (tab) | — | Currently surfaces `ProjectMemory` (characters/styles), not `Project` entities. |
| Assets (BUILD) | `/studio/assets` | — | Media library (`AssetLibrary`). |

Two implementation generations coexist: `ChatStudio` + `SimpleMode` (driven by `chatModes.js` declarative mode definitions: settings pills/selects, uploads, model lists from `lib/models.js`) and newer per-tool `*V2` components (ImageStudioV2, VideoStudioV2, AudioStudioV2, etc.). `useAsyncGeneration` drives the async submit→poll flow; `useCreditCost`/`useAllCreditCosts` + `/api/estimate` drive cost display; `StagedProgress` renders staged progress labels; `CreditTickDown` animates balance changes; `CommandPalette` provides Ctrl/Cmd+K.

# 9. Generation Lifecycle

## 9.1 Sync path (`handleGeneration`, used by the 13 `/api/generate/<tool>` routes)

1. Authenticate via API key or session; 401 otherwise.
2. Per-user rate limit (`RateLimit` table; e.g. image 20/min, video 5/min).
3. Parse body; model = `body.model || body.endpoint || tool`.
4. Optional `ProjectMemory` injection (characterId/styleId).
5. 5-pass prompt engine (`lib/prompt-engine`): normalize → enrich (brand kit constraints from `brandKitId` + compliance warnings) → expand → dialect → validate → optional polish (`body.polish`). Falls back to legacy `expandPrompt` on engine failure.
6. Resolve provider (`ModelPricing.providerName` → WaveSpeed/KIE; default WaveSpeed) and DB price override.
7. Balance check against `CreditWallet.available`; 402 if insufficient.
8. Create `Generation` (pending, creditsUsed = cost).
9. **Reserve credits** (`reserveCredits`) — currently throws on schema mismatch (§17.1), which fails the generation with 402.
10. Submit with provider fallback chain `[primary, wavespeed, kie]`; provider errors logged to console + `AuditLog`.
11. On result: download media into `public/media` (`storeMedia`, strips JPEG EXIF/PNG metadata); fallback to proxy URL on failure.
12. Quality gate (`lib/quality-gate.js`: URL/byte-size validation); on failure mark failed and release reservation.
13. Mark completed with local URL + `requestId`; create `Asset` (with best-effort parent lineage); write `PromptCompilation`; **settle reservation** at quoted cost; mirror `User.credits`; audit-log; return `{url, requestId, creditsUsed, remainingCredits, provider, expanded}`.
14. On exception: mark failed, release reservation, add a `CreditTransaction` refund row, return branded safe error.

## 9.2 Async path (`/api/generate/async` + webhook)

1. Auth, price via DB override or `estimateCredits`, balance check against mirrored `user.credits`.
2. Legacy prompt expansion (no 5-pass engine), `ProjectMemory` injection.
3. Create `Generation` (pending) — **currently writes non-existent `providerName` (§17.1)**.
4. `debitCredits` immediately (non-refundable path; also hits §17.1 field mismatch).
5. `submitOnly` with `callBackUrl = /api/webhooks/generation-complete`; store `requestId`; return poll URL.
6. Provider calls the webhook → media downloaded to `public/media`, Generation completed; on failure → `creditUser` refund.

## 9.3 Media ingest and assets

Provider URLs are treated as temporary: `storeMedia`/`downloadAllMedia` fetch and persist bytes under `public/media` (content-hash + uuid filename). Every successful generation and every upload creates an `Asset` (type image/video/audio, source generation/upload, model, generationId, optional parentAssetId).

# 10. Agent Platform (as implemented)

`src/lib/agents.js` defines ~16 agent personas (orchestrator + creative_director, image_director, video_director, brand_guardian, prompt_engineer, storyboard, audio_agent, vision_analyst, quality_control, cost_optimizer, assembly + tool agents image/video/audio/etc.) as **system-prompt presets**, not independent runtimes. The orchestrator prompt instructs the LLM to emit a JSON plan (`steps[]` with agent/task/params/estimatedCredits, `$STEP_N_OUTPUT` references, `totalCredits`/`maxCredits`). The planner (`planTask`) parses this JSON and re-estimates costs server-side; the executor runs steps sequentially through `lib/generation.js` functions and persists an `AgentRun`.

LLM access: KIE's OpenAI-compatible `/chat/completions` (primary; `KIE_KEY`, model default `google/gemini-2.5-flash-openai` / `LLM_MODEL` env). `lib/providers.js` additionally contains an `LLM_PROVIDER` defaulting to **localhost Ollama (`http://localhost:11434`, `llama3.2:3b`)** used by `llmComplete`/`llmStream` — agent/plan paths that route through these will fail in production unless Ollama is reachable. There are no tool contracts, no MCP, no skills system, no durable/resumable runs, no HITL approval step beyond the plan→run click flow.

# 11. Director (as implemented)

Helmies-native (predates the Maestro-exact requirement):

- `lib/director-planner.js`: `PRODUCTION_TYPE_PRESETS`, `SECTION_VISUAL_STRATEGY`, prompt policies (`getPromptPolicies`, `validatePrompt`), `validateShotPlan`, `estimateDirectorCost`, `createProductionPlan`, `getProductionPlan`, `updateProductionPlan`.
- `lib/director-executor.js`: explicit state machine (`PIPELINE_STATES`, `SHOT_STATES`, `VALID_TRANSITIONS`, `canTransition`, `transitionPipeline`), `executeProductionPipeline`, `rerunShot` (image/video/audio/full), `getPipelineStatus`, `cancelPipeline`, `listPipelines`.
- `lib/video-assembly.js`: FFmpeg-based clip assembly (`assembleVideos`, also exposed via `/api/assemble`).
- UI: `DirectorWorkspace.js` (brief → plan → execute → shot cards → rerun → assembled output).
- Persistence: `DirectorPipeline` (plan/brief/costEstimate/validationResults/stateMetadata/assembledUrl/rerunHistory JSON), `DirectorShot` (plan/imageResult/videoResult/audioResult JSON).

# 12. Prompt, Brand, Canvas, Vision (as implemented)

## 12.1 Prompt engine

`src/lib/prompt-engine/`: `normalizer` (intent extraction), `enricher` (ProjectMemory/character/brand context), `expander`, `dialect-compiler` (per-model guides from `PromptGuide`/`PromptGuideVersion`), `validator`, `polish` (off/fast/balanced/premium). Invoked by `handleGeneration` and `/api/prompt/compile`; every invocation writes a `PromptCompilation` row. `lib/prompt-expansion.js` (legacy single-pass) remains as fallback and is still used by the async path.

## 12.2 Brand kits

`lib/brand-engine.js`: `buildBrandPromptContext` (palette/typography/style/tone/avoid/slogans injected into enrichment), `checkBrandCompliance` (adds warnings for avoided terms), fingerprint derivation (`/api/brand-kits/fingerprint`). Enforcement modes stored on `BrandKit.enforcement` (default `off`).

## 12.3 Canvas

`CanvasEditor.js` (Fabric.js editing), `CanvasWorkspace.js` (orchestration), `lib/canvas-compiler.js` (pure module: converts the document into model-ready instructions — composition guide, masks, reference roles, region instructions, text requirements, compiled prompt, warnings; does not call providers; result submitted through `useAsyncGeneration`). Persistence via `/api/canvas` is currently broken against the schema (§17.1).

## 12.4 Visual intelligence

`lib/visual-intelligence.js`: KIE multimodal analysis returning caption/background/palette/regions/textRegions/lighting/style JSON; cached in `VisualAnalysis` by asset URL; exposed via `/api/analyze`. Used by brand fingerprinting and available to studio surfaces.

# 13. Admin Panel (as implemented)

`/admin` → `AdminShell.js` tabs (sub-tabs in parentheses):

| Tab | Sub-tabs | Backing |
|---|---|---|
| Overview | — | `OverviewDashboard` + `/api/admin/analytics` |
| Business | Revenue, Plans, Credit Packs, Promo Codes, Pricing, Margin Advisor | `PlanEditor`, `PromoManager`, pricing/plans/packs/promos APIs. Margin Advisor is a placeholder (no Advisor backend). |
| AI Platform | Models, Routes, Providers, Prompt Guides, Quality, Generations, Director | `ModelManager` + models/providers/prompt-guides/jobs APIs. Routes has no backend (`ModelRoute` does not exist). |
| Users | — | `/api/admin/users` (search, credit grant/remove, role, audit). |
| Content | Website Content, Announcements | `CmsEditor` + cms-content/publish + announcements APIs. |
| Operations | Jobs, Provider Health, Feature Flags, Audit Logs | jobs, provider-health, flags, audit APIs. |

The legacy `AdminPanel.js` also remains in the codebase.

# 14. Providers and Model Catalog

## 14.1 Provider layer (`src/lib/providers.js`)

- **WaveSpeed** (`api.wavespeed.ai`, v3): primary. Submit + poll (`/predictions/{id}/result`, 2s → 10s backoff, up to ~30 min). Key: `WAVESPEED_KEY`.
- **KIE** (`api.kie.ai`, v1 jobs): task creation with `callBackUrl`; also used for LLM chat completions and vision. Key: `KIE_KEY`.
- Fallback chain: static `["wavespeed", "kie"]` — no eligibility/capability checks.
- `MODEL_ENDPOINT_MAP`: ~155 model keys → provider endpoint paths (image T2I/edit, T2V, I2V, V2V, lipsync, ElevenLabs audio, extend, avatar, upscale, background removal).
- Env keys `ATLAS_KEY`, `ALIBABA_KEY`, `ALIBABA_WORKSPACE_ID` exist, and `lib/alibaba.js` implements a direct Alibaba MaaS video call — **but `getProvider("alibaba")` silently falls back to the WaveSpeed provider entry** (no `alibaba` key in `PROVIDERS`), so `alibaba.js` currently resolves the wrong provider config (§17.5).
- LLM: KIE chat completions for agent/vision; separate `LLM_PROVIDER` (Ollama localhost) for `llmComplete`/`llmStream` (§10).
- `OPENROUTER_KEY` env exists for `/api/openrouter/models` listing.

## 14.2 Model catalogs

`src/lib/models.js` exports static arrays (`IMAGE_MODELS`, `I2I_MODELS`, `VIDEO_MODELS`, `I2V_MODELS`, `V2V_MODELS`, `LIPSYNC_MODELS`, `AUDIO_MODELS`, `LLM_MODELS`, `RECAST_MODELS`, cinema/marketing/influencer catalogs) with per-model UI flags (aspectRatios, durations, resolutions, maxImages, hasMode, inputs…). `chatModes.js` turns these into declarative studio mode definitions. `ModelPricing` rows (synced from WaveSpeed/KIE) override credit costs and provider routing at runtime.

# 15. Security Posture

Implemented: middleware auth/role gates; `requireAdmin` on all admin APIs; per-user DB rate limits + per-IP registration limit; bcrypt password hashing; hashed API keys; Stripe webhook signature verification; audit logging of admin mutations and provider errors; branded (non-leaking) provider error messages; EXIF/PNG metadata stripping on media ingest; abuse heuristics (`detectAbuse`, automation cron).

# 16. Environment Variables (current)

From `.env.example` plus vars referenced in code:

| Var | Use |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Postgres (Supabase); used by Prisma and `seed-admin.mjs` |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth; base URL also used for webhook callbacks and middleware session fetch |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | `scripts/seed-admin.mjs` only |
| `WAVESPEED_KEY` | WaveSpeed provider |
| `KIE_KEY` | KIE jobs + LLM + vision |
| `ATLAS_KEY`, `ALIBABA_KEY`, `ALIBABA_WORKSPACE_ID` | Declared; Atlas unused in code, Alibaba mis-wired (§14.1) |
| `OPENROUTER_KEY` | Model listing route |
| `LLM_MODEL`, `VISION_MODEL` | Agent/vision model overrides |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| `STRIPE_PRICE_{STARTER,STUDIO,PRO}[_YEARLY]` | Subscription price IDs |
| `STRIPE_PRICE_CREDITS_{500,1000,2500,5000}` + `NEXT_PUBLIC_` variants | Credit pack price IDs |
| `CRON_SECRET`, `WEBHOOK_SECRET` | Cron routes; optional provider-webhook bearer |

# 17. Known Gaps, Bugs and TODOs

## 17.1 Code ↔ schema mismatches (break declared-schema writes)

1. `lib/wallet.js` and `lib/session.js` write `CreditWallet.lifetimeCredited/lifetimeDebited`, `CreditLedger.userId/delta/reservedAfter/referenceType/metadata`, `CreditReservation.jobId/expiresAt/settledAt` — none exist in `prisma/schema.prisma` (which has `lifetime`, `walletId`/`amount`, `generationId`/`releasedAt`). Every wallet reserve/settle/release and `debitCredits`/`creditUser` call fails against the declared schema. (Verify against the live DB — it may have drifted columns from earlier `db push` states — then reconcile code or schema, one way.)
2. `/api/canvas` writes `CanvasDocument.content` and `CanvasVersion.content`/`version`; schema fields are `data` (no `version` on `CanvasVersion`). Canvas persistence is broken.
3. `/api/generate/async` writes `Generation.providerName`; the column does not exist.

## 17.2 Money-flow gaps

4. Stripe webhook grants credits to `User.credits` only; the wallet mirror (`getCurrentUserWithCredits`) can subsequently overwrite the balance from the wallet, losing granted credits. No ledger entries for purchases.
5. No Stripe event idempotency; duplicate webhook deliveries re-grant credits.
6. Pricing authority is split: static landing arrays, `CREDIT_COSTS`, `SUBSCRIPTION_CREDITS`, `lib/credit-packs.js`, env price IDs, `SubscriptionPlan`/`CreditPack`/`ModelPricing` DB rows. Admin edits to plans/packs do not reach landing/checkout.
7. `providerCost`/markup/promo values are `Float`, not Decimal.

## 17.3 Security gaps

8. `ProviderConfig.apiKey` stored plaintext in Postgres and readable via admin API.
9. `ssh.md` contains plaintext server credentials and is tracked in git — remove from tracking and rotate.
10. `/api/media/proxy` is an unauthenticated open fetch proxy: declared `PROVIDER_DOMAINS` allowlist never enforced, `Access-Control-Allow-Origin: *` (SSRF).
11. `/api/upload` has no size, MIME, or content validation.
12. `/api/webhooks/generation-complete` is unauthenticated when `WEBHOOK_SECRET`/`CRON_SECRET` are unset; no replay protection.
13. Security headers only on middleware-protected paths; no CSP/HSTS anywhere.

## 17.4 Functional gaps vs the master spec

14. No `prisma/migrations/` directory — schema drift is untracked; no reversible migrations.
15. No job queue/workers: sync generations block the request for up to ~30 minutes of polling; async path is fire-and-forget without idempotency keys or durable state.
16. `lib/alibaba.js` resolves the wrong provider config (§14.1); Atlas key unused.
17. Agent LLM fallback points at localhost Ollama (`llmComplete`/`llmStream`) — broken in production for paths using it.
18. Register/auth first-user-admin logic depends on a global user count — a race or a wiped DB silently promotes the next registrant to admin.
19. Wallet-first-balance check in `handleGeneration` (step 9) currently converts **all** sync generations into 402 failures against the declared schema (see 17.1.1) — highest-priority fix.
20. No tests, no CI, no lint-staged; only `npm run lint`.
21. `CreditPack`/`SubscriptionPlan` DB tables duplicate (and diverge from) static packs/plan constants.
22. Two generations of studio UI (`ChatStudio`/`SimpleMode` vs `*V2` components) coexist; several legacy components (`AdminPanel.js`, non-V2 studios) remain.

# 18. Quick File Map

| Area | Files |
|---|---|
| Auth | `src/lib/auth.js`, `src/lib/session.js`, `src/app/api/auth/[...nextauth]/route.js`, `src/app/api/auth/register/route.js`, `middleware.js`, `scripts/seed-admin.mjs` |
| Generation core | `src/lib/generation-handler.js`, `src/lib/generation.js`, `src/lib/providers.js`, `src/lib/pricing-engine.js`, `src/lib/credits.js` |
| Wallet | `src/lib/wallet.js` |
| Agent | `src/lib/agents.js`, `src/app/api/agent/*` |
| Director | `src/lib/director-planner.js`, `src/lib/director-executor.js`, `src/lib/director-constants.js`, `src/lib/video-assembly.js`, `src/app/api/director/*` |
| Intelligence | `src/lib/prompt-engine/*`, `src/lib/prompt-expansion.js`, `src/lib/brand-engine.js`, `src/lib/visual-intelligence.js`, `src/lib/canvas-compiler.js` |
| Media | `src/lib/media-storage.js`, `src/lib/media-download.js`, `src/app/api/media/*`, `src/app/api/upload/route.js` |
| Admin | `src/components/admin/*`, `src/app/api/admin/*` |
| Studio UI | `src/app/studio/*`, `src/components/studio/*` |
| Data | `prisma/schema.prisma`, `src/lib/prisma.js` |

