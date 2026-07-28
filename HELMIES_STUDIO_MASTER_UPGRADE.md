# Helmies Studio — Master Implementation Specification (v2)

**Status:** Implementation contract / single source of truth
**Target product:** Helmies Studio — AI media-generation SaaS
**Production URL:** https://studio.helmies.fi
**Technical foundation:** `waelosamahelmi/helmies-studio` repository (single codebase; all features are built here)
**Reference repositories (concepts only, never merged):** `Blizaine/Maestro`, `cocktailpeanut/image-to-prompt`
**Companion document:** `STUDIO_FUNCTIONALITY.md` — authoritative description of what the codebase implements *today*. This document describes the *target*; the companion describes the *current state*. Where they disagree, this document states the target and the companion states the fact.
**Previous revision:** `HELMIES_STUDIO_MASTER_UPGRADE.v1-archive.md` (frozen archive of the v1 contract; do not edit)
**Spec date:** v1 2026-07-24 · v2 (this revision) 2026-07-28
**Primary consumer:** autonomous coding agents and human engineers (agent-neutral; see Section 12 and Appendix AV)

---

# 0. How to Use This Document

## 0.1 Document roles

| Document | Role |
|---|---|
| `HELMIES_STUDIO_MASTER_UPGRADE.md` (this file) | Target-state contract. Every requirement here is normative unless explicitly marked SUPERSEDED or DEFERRED. |
| `STUDIO_FUNCTIONALITY.md` | Current-state reference. Describes the deployed codebase as it actually behaves. |
| `HELMIES_STUDIO_MASTER_UPGRADE.v1-archive.md` | Frozen v1. Preserved for audit; content was consolidated, not deleted, in v2. |

## 0.2 Requirement ledger conventions

1. This document MUST be read in full before making architecture changes (Section 1.4, rule 1).
2. Every numbered section, table row, checklist item, schema and prompt in this document is an actionable requirement unless labeled otherwise.
3. Requirement statuses used in this document:
   - **NORMATIVE** (default) — must be implemented as written.
   - **CURRENT STATE** — describes what exists today, annotated with `[IMPLEMENTED]`, `[PARTIAL]`, or `[NOT STARTED]`. Current-state notes are informational; they do not weaken the target requirement.
   - **SUPERSEDED** — the v1 requirement was replaced by a newer decision stated inline, with a reason. Do not resurrect it.
   - **DEFERRED** — explicitly postponed by this specification (not by agent choice), with the deferring condition stated.
   - **DONE_EQUIVALENT** — the requirement is already satisfied in the codebase by a different mechanism; the difference is stated.
4. Agents MUST maintain an internal requirement ledger per the repository's global AGENTS.md zero-skip discipline: every requirement maps to implementation evidence and a verification method before it is marked done.
5. Checkbox items in Section 12 and the Appendices MUST only be checked after implementation AND verification.
6. Normative language: **MUST/SHALL/NEVER** = hard requirement; **SHOULD** = implement unless a concrete project reason prevents it; **MAY** = optional.

## 0.3 Implementation Status (living table)

This table maps each major area to its real state in the current codebase (verified 2026-07-28 against `STUDIO_FUNCTIONALITY.md`). It MUST be updated as phases complete.

| Area | Status | Evidence / gap |
|---|---|---|
| Google OAuth login | IMPLEMENTED | `src/lib/auth.js` (NextAuth v5 + PrismaAdapter), `src/app/login/page.js` |
| Credentials (email/password) login | PARTIAL | `Credentials` provider + `bcryptjs` + `/api/auth/register` exist and are wired into the login page; unverified in production; no password reset flow |
| Admin panel | IMPLEMENTED (v1.5) | `/admin` + `AdminShell` with Overview, Business, AI Platform, Users, Content, Operations tabs; not yet full "Admin V2" (no Advisor chat, no route editor, no role granularity) |
| Generation APIs (sync + async) | IMPLEMENTED | `/api/generate/*` (13 tools), `/api/generate/async`, `handleGeneration`, provider fallback |
| Stripe (subscriptions, top-ups, webhook, portal) | IMPLEMENTED | `/api/stripe/*`; **gap:** webhook credits `User.credits` directly and bypasses the wallet (see Section 3.5) |
| Credit transactions (legacy) | IMPLEMENTED | `User.credits` + `CreditTransaction` |
| Credit wallet / ledger / reservations | PARTIAL | Models exist and `handleGeneration` uses reserve/settle; **but `lib/wallet.js` and `lib/session.js` reference schema fields that do not exist (`lifetimeCredited`, `lifetimeDebited`, `delta`, `jobId`, `expiresAt`) — the wallet path is broken against the current Prisma schema (Section 3.5)** |
| Director pipeline | IMPLEMENTED (Helmies-native) | `DirectorPipeline`/`DirectorShot`, `/api/director/*`, planner + executor + rerun + FFmpeg assembly; **not** Maestro-exact (Section 6.9) |
| Brand kits | IMPLEMENTED | `BrandKit`/`BrandAsset`, `/api/brand-kits*`, fingerprint extraction, prompt-engine integration |
| Canvas documents | PARTIAL | Fabric.js editor + `CanvasDocument`/`CanvasVersion` models; **the `/api/canvas` route writes fields (`content`, `version`) that do not exist in the schema — persistence path is broken (Section 6.6)** |
| Workflows | IMPLEMENTED | `Workflow`/`WorkflowRun`, builder UI, `/api/workflows*` |
| Prompt engine (5-pass) | IMPLEMENTED | `src/lib/prompt-engine/*`, `PromptCompilation` records, `/api/prompt/compile` |
| Visual analysis | IMPLEMENTED | `src/lib/visual-intelligence.js` (KIE multimodal), `VisualAnalysis`, `/api/analyze` |
| Asset library | IMPLEMENTED | `Asset`/`AssetRelation`, `/api/assets`, upload + generation ingest |
| Provider configs / model pricing | IMPLEMENTED | `ProviderConfig`/`ModelPricing` + admin APIs; **plaintext API keys in DB (Section 9.6 violation, open)** |
| Feature flags | IMPLEMENTED | `FeatureFlag` + `/api/admin/flags` |
| Audit log | IMPLEMENTED | `AuditLog` + admin audit API |
| CMS | IMPLEMENTED | `CmsEntry`/`CmsRevision` + admin CMS editor + publish |
| Announcements | IMPLEMENTED | `SiteAnnouncement` + public `/api/announcements` + bar component |
| API keys | IMPLEMENTED | `ApiKey` (hashed, prefix, last-used) + `/api/user/keys` + `authenticateApiKey` |
| Model Registry / Gateway as specified (AiModel, AiProvider, AiModelPrice, ModelRoute, capability routing) | NOT STARTED | Models are hard-coded in `src/lib/models.js`; `ModelPricing` is a flat per-model row; no input/ui schemas, no route table |
| Job workers / queues (GenerationJob, BullMQ/Redis, settlement pipeline) | NOT STARTED | Generation runs in-request (sync poll) or fire-and-forget async with webhook/polling; no queue, no worker, no idempotency keys |
| Maestro-exact Director | NOT STARTED | Current Director is Helmies-native; behavioral equivalence with Maestro is unverified |
| Canvas Compiler (full contract, Appendix R) | PARTIAL | `src/lib/canvas-compiler.js` produces instructions client-side; no server compiler, no mask asset rendering, no CompiledCanvas persistence |
| Master Agent runtime (native, tools, subagents, HITL, memory, MCP) | PARTIAL | Orchestrator chat + JSON-step planner + executor exist (`lib/agents.js`); no tool contracts, no MCP, no skills, no durable/resumable runs |
| Subagents (as specified) | PARTIAL | Named personas with system prompts exist in `lib/agents.js`; not independent runtime agents |
| MCP | NOT STARTED | — |
| Vision service (separate deployable, provider interface) | NOT STARTED | Implemented as in-process module; no `VisionAnalyzer` interface, no separate service |
| Monorepo restructure (`apps/*`, `packages/*`) | NOT STARTED | Single Next.js app; Section 2.4 permits staged in-place growth |
| Postgres migrations directory | NOT STARTED | No `prisma/migrations/`; schema managed via `db push` (Section 3.1, open risk) |
| Secret manager for provider keys | NOT STARTED | Keys in env + plaintext `ProviderConfig.apiKey` |
| Media object storage (S3-compatible) | NOT STARTED | Media stored on local filesystem under `public/` |

## 0.4 Changes from v1 (summary)

1. Reorganized 216 numbered sections (0–215) + 50 appendices (A–AX) into 13 numbered parts + the same 50 appendices; every v1 requirement is preserved or explicitly marked SUPERSEDED/DEFERRED/NOT_APPLICABLE with a reason.
2. Replaced DeepSeek-specific instructions (v1 §§196–197, Appendix AV) with the agent-neutral **Implementation Agent Protocol** (Section 12.3, Appendix AV).
3. Added this status model and the living Implementation Status table (0.3).
4. Corrected factual drift against the real schema and codebase (current-state vs target annotations in Sections 3, 4, 9).
5. Consolidated verbatim-duplicated passages (URL maps, sidebar maps, pricing fallback tables, repeated checklist restatements) into single normative statements with cross-references. No requirement was removed.

---

# 1. Product Vision & Non-Negotiables

## 1.1 Executive decision

The final product is one platform called **Helmies Studio**.

The `helmies-agent` project has been **abandoned**. All functionality that was previously planned to come from `helmies-agent` — the authenticated application shell, AI orchestration runtime, agent platform, conversations layer, tool system, skills system, MCP system, subagent system, memory runtime, and long-running/resumable execution foundation — MUST now be **built natively inside Helmies Studio**.

The current `helmies-studio` codebase is the **single foundation**. Its public landing page, existing provider integrations, generation APIs, pricing/credits logic, workflows, ProjectMemory concepts, database, Stripe-related commercial concepts, admin functions and useful media-generation code are all retained and **extended in place**.

There is no second repository to merge from. Everything is implemented within Helmies Studio.

The final URL model is normative (current state noted):

```text
https://studio.helmies.fi/            Public landing page. Visual design protected (Section 1.7). [IMPLEMENTED]
https://studio.helmies.fi/pricing     Public dynamic pricing. [IMPLEMENTED as page; static arrays — must become DB-driven, Section 4.7]
https://studio.helmies.fi/login       Shared authentication. [IMPLEMENTED]
https://studio.helmies.fi/studio      Authenticated application. [IMPLEMENTED as single-page studio shell with tool tabs]
https://studio.helmies.fi/studio/agent      Master Agent.            [NOT STARTED — target route; orchestrator exists at /studio]
https://studio.helmies.fi/studio/image      Image Studio.            [PARTIAL — /studio/image exists]
https://studio.helmies.fi/studio/video      Video Studio.            [PARTIAL — /studio/video exists]
https://studio.helmies.fi/studio/director   Director.                [PARTIAL — /studio/director exists]
https://studio.helmies.fi/studio/audio      Audio Studio.            [PARTIAL — /studio/audio exists]
https://studio.helmies.fi/studio/lipsync    Lip Sync.                [PARTIAL — /studio/lipsync exists]
https://studio.helmies.fi/studio/recast     Recast.                  [PARTIAL — implemented as /studio/body-swap]
https://studio.helmies.fi/studio/influencer Influencer/Persona.      [PARTIAL — /studio/influencer exists]
https://studio.helmies.fi/studio/workflows  Workflow builder.        [IMPLEMENTED as /studio tab]
https://studio.helmies.fi/studio/brands     Brand Kits.              [IMPLEMENTED as /studio tab]
https://studio.helmies.fi/studio/assets     Asset library.           [IMPLEMENTED as /studio/assets]
https://studio.helmies.fi/studio/projects   Projects.                [PARTIAL — Project model + API usage only]
https://studio.helmies.fi/studio/admin      Super-admin control plane. [IMPLEMENTED at /admin — must move/alias under /studio/admin]
```

## 1.2 Product philosophy — simple user experience

A simple user should be able to say:

> Create a 15-second premium Instagram launch ad for my coffee brand.

The user MUST NOT need to know:

- which model supports image references;
- seed values;
- provider names;
- scheduler concepts;
- guidance scale;
- first/last frame limitations;
- video windowing;
- model pricing units;
- provider request formats;
- prompt dialects.

The Master Agent handles the complexity.

## 1.3 Product philosophy — advanced user experience

An advanced user may want: exact model; exact provider route; multiple references; per-reference roles; seed; aspect ratio; resolution; duration; prompt; negative prompt; masks; inpaint; outpaint; exact text; Canvas composition; first frame; last frame; LoRA/provider-specific controls when applicable; shot-level planning; prompt inspection; exact credit quote.

The advanced user uses the manual Studios.

## 1.4 Non-negotiable rules for the implementation agent

These rules are binding on every implementation session (v1 §1, preserved in full):

1. Read this entire file before making architecture changes.
2. Treat this file as the product contract.
3. Do not redesign the approved public landing page.
4. Preserve its existing visual language, motion, layout, major sections and overall impression.
5. It is allowed to optimize SEO, accessibility, performance, data loading and responsiveness.
6. Replace hard-coded pricing with data from the platform database without visually redesigning pricing cards unless needed for correctness.
7. The authenticated `/studio` application MUST be built as a first-class authenticated shell inside Helmies Studio, not imported from an external Agent project.
8. Do not copy the old Helmies Studio public tool shell wholesale into the authenticated `/studio` area; build a proper authenticated application shell within the same codebase.
9. Reuse useful generation/backend logic from Helmies Studio.
10. Do not create a second competing Agent runtime.
11. Helmies Studio MUST build a single mature orchestration runtime natively (agents, subagents, tools, skills, MCP, memory, resumable jobs). Do not depend on an external Agent runtime.
12. Agent, manual Studios, Workflows and Director MUST all execute media through the same Model Gateway.
13. No manual Studio may call a provider directly.
14. No Agent tool may call a provider directly outside the Model Gateway.
15. No Workflow node may call a provider directly.
16. No Director shot may call a provider directly.
17. No private provider key may reach the browser.
18. No private provider key may be placed in model context.
19. No new provider secret may be stored plaintext in the commercial database.
20. Existing plaintext provider credentials MUST be migrated to a secret manager/reference mechanism. **Current state: violated — `ProviderConfig.apiKey` is plaintext; migration open (Appendix AK).**
21. Every billable action MUST have a server-side price calculation.
22. Every expensive action MUST show a preflight quote before execution.
23. The quote MUST show credits needed, current balance and expected remaining balance.
24. Multi-step Agent/Director runs MUST show total expected and maximum cost.
25. Credits MUST never be hard-coded independently in UI components.
26. Model inputs MUST be driven by a Model Registry and schemas.
27. Do not scatter `if model === "..."` logic through the UI.
28. Provider-specific request translation belongs in provider/model adapters.
29. Historical generation records MUST retain a pricing snapshot.
30. Every paid operation MUST be idempotent.
31. Every provider job MUST map to a generation job.
32. Every credit change MUST map to a ledger transaction.
33. Every privileged admin action MUST be audited.
34. Long-running generations MUST run through job workers, not block normal web request processes.
35. Generated provider URLs MUST be ingested into Helmies-controlled storage.
36. Never depend on expiring provider URLs as permanent assets.
37. Every uploaded/generated media item MUST become an Asset record. [IMPLEMENTED for uploads and `handleGeneration` outputs]
38. A Canvas MUST be persisted as editable JSON/document state, not just a flattened screenshot.
39. Prompt engineering MUST live in a shared Prompt Intelligence system. [IMPLEMENTED as `src/lib/prompt-engine`]
40. Brand Kit context MUST be reusable by Agent, Studios, Workflows and Director.
41. Do not dump entire Brand Kits into prompts when only a subset is relevant.
42. Every Director run MUST be persistent and resumable.
43. Individual Director shots MUST be independently rerunnable. [IMPLEMENTED via `/api/director/rerun`]
44. Rerunning one shot MUST NOT rerun unaffected shots.
45. The Admin panel MUST control models, providers, prices, plans, promo codes, CMS content, announcements and feature flags. [IMPLEMENTED except full route editor and Advisor]
46. Changes to plans/pricing in Admin MUST propagate to landing/pricing/checkout without code deployment. **Current state: `SubscriptionPlan`/`CreditPack` admin CRUD exists, but the landing page and checkout still read static arrays/env price IDs — open.**
47. Promo creation MUST include margin warnings.
48. The Admin Advisor MUST use deterministic calculator tools for financial numbers.
49. The LLM may explain financial calculations but MUST NOT invent them.
50. No required button may remain a no-op.
51. No production path may silently fall back to mock data.
52. No production DB reset is allowed during migration.
53. Existing users, subscriptions, Stripe identifiers and credits MUST be preserved.
54. Use additive migrations before destructive migrations.
55. Keep rollback options and feature flags during major migration phases.
56. Build and run tests after each phase.
57. Fix failing typecheck/lint/tests before marking a phase complete.
58. Do not stop after scaffolding.
59. Do not leave core functionality as TODOs.
60. Continue through all phases unless a genuine external blocker exists.

## 1.5 Maestro replication strategy (legal + technical)

Maestro is distributed under the WanGP Non-Commercial Evaluation License. The analyzed license explicitly allows non-commercial evaluation but prohibits using Maestro or a derivative as part of a paid hosted service unless a separate commercial license is obtained.

Therefore the implementation strategy is:

**Exact behavior replication — reverse-engineer Maestro's logic, prompting, and functionality and reproduce them identically in Helmies Studio's own original source code.**

The product goal is that Helmies Studio's Director behaves **identically** to Maestro: the same planning logic, the same prompting, the same passes, the same prompt guides, the same rerun semantics, the same continuity rules, the same dashboard concepts, and the same user-visible results.

To achieve this without copying restricted source code:

- study Maestro's behavior, prompts, schemas, and flows as the authoritative reference;
- write detailed behavioral specs of each Maestro capability (inputs, outputs, prompt templates, pass ordering, schemas, edge cases, validation rules);
- implement that behavior in **original Helmies Studio code** that produces equivalent outputs;
- verify equivalence with side-by-side comparison tests against Maestro outputs where the license permits evaluation.

Helmies Studio MUST replicate the following Maestro capabilities exactly (behavior, not necessarily line-for-line code):

- ProductionPlan.
- ShotPlan.
- multi-pass planning (same passes, same order, same prompts).
- Director workflow.
- shot continuity.
- model-specific prompt guides (same guide content/logic).
- persistent pipeline state.
- shot-level reruns.
- reassembly/rejoin.
- pipeline repair.
- production dashboard.
- prompt inspection.

Do not copy Maestro source code verbatim into the paid Helmies product unless Helmies first obtains a commercial license explicitly covering the intended SaaS use. Reproduce the behavior in original code.

If a commercial license is later obtained, the implementation team may reassess direct source integration to shorten the path to exact equivalence.

The architecture in this document is intentionally designed so Helmies reproduces Maestro's runtime behavior in its own original implementation.

**Current state:** the Director implemented in `src/lib/director-planner.js` / `director-executor.js` is Helmies-native and predates this equivalence requirement. Maestro-exact behavioral verification is NOT STARTED.

## 1.6 North Star metric and experience

North Star metric candidate: **completed creative deliverables per active paid creator** — not just number of generations.

The end-to-end target experiences (user and admin) are normative and preserved verbatim in Appendix AX.

## 1.7 Landing page preservation contract

The current public homepage is approved. This is a hard constraint.

Preserve:
- hero layout;
- media treatment;
- typography feel;
- service sections;
- visual density;
- scrolling experience;
- existing major animations;
- overall brand impression.

Allowed improvements:
- optimize video delivery;
- responsive fixes;
- accessibility;
- SEO;
- image optimization;
- dynamic content;
- dynamic pricing;
- dynamic model counts;
- announcement bar;
- bug fixes.

Not allowed:
- replacing the homepage with an external Agent UI;
- redesigning the homepage to look like a generic chat product;
- changing its visual identity merely for consistency with `/studio`.

Create visual regression snapshots before migration (Section 11.6).

## 1.8 Helmies Studio branding

Replace any customer-facing references to external chat products (e.g. LibreChat, Helmies Agent) with **Helmies Studio**.

Update: app title; logo; icons; emails; manifest; metadata; links; help; notifications.

Keep all legally required upstream attribution/license notices.

---

# 2. Architecture

## 2.1 Product layers

### Layer 1 — Public Website

Existing Helmies Studio Next.js landing page. Responsibilities: marketing; SEO; public pricing; signup/login; studio descriptions; public announcements; public FAQ; model counts.

### Layer 2 — Authenticated Studio Shell

Built natively inside Helmies Studio as a first-class authenticated application shell. Responsibilities: sidebar; account; conversations; Master Agent; studio routing; projects; assets; notifications; credits; billing shortcuts; command palette.

**Current state:** a single-page shell (`src/app/studio/StudioClient.js`) with tab-based tool switching exists; it must evolve into the routed shell of Section 6.1.

### Layer 3 — Creative Workspaces

Master Agent; Image Studio; Video Studio; Director; Audio Studio; Lip Sync; Recast; Influencer; Workflows; Brand Kits; Projects; Assets.

### Layer 4 — Creative Intelligence

Prompt Intelligence; Brand Context; Visual Intelligence; Canvas Compiler; Director Planner; Quality Evaluator; Model Selector; Cost Optimizer; Continuity Engine.

### Layer 5 — Execution Platform

Model Registry; Provider Registry; Model Gateway; Pricing Engine; Credits; Job Queue; Storage; Provider adapters; retries; webhooks; usage accounting.

### Layer 6 — Administration

Users; plans; prices; promo codes; providers; model registry; routes; CMS; alerts; margin advisor; analytics; refunds; audit; feature flags.

## 2.2 Same execution system (permanent architecture invariant)

The UI changes. The engine does not.

```text
Simple User
    ↓
Master Agent
    ↓
Creative Plan / Subagents
    ↓
Model Gateway
    ↓
Providers

Advanced User
    ↓
Manual Studio
    ↓
Model Gateway
    ↓
Providers

Workflow
    ↓
Workflow Engine
    ↓
Model Gateway
    ↓
Providers

Director
    ↓
Director Planner / Pipeline
    ↓
Model Gateway
    ↓
Providers
```

This is a permanent architecture invariant. Rules 12–16 of Section 1.4 enforce it.

**Current state:** all surfaces call providers through `src/lib/providers.js` + `src/lib/generation-handler.js`/`generation.js`. This is a *de facto* shared execution path but is not yet the specified Model Gateway (no registry, no schemas, no route table, no eligibility engine).

## 2.3 Model Gateway, Registry and Routing

### 2.3.1 Model Gateway

This is the core backend abstraction. Product code asks for capability.

Example:

```text
Capability:
image.generate

Requirements:
- 4:5
- 3 references
- good typography
- photoreal
- max 500 credits
```

Gateway MUST: validate user; find eligible models; apply preference; quote; select route; execute; account.

### 2.3.2 Model Registry

Every model record MUST include:

```json
{
  "id": "provider:model",
  "displayName": "Model Name",
  "providerId": "provider",
  "capability": "video.image_to_video",
  "enabled": true,
  "priority": 100,
  "inputSchema": {},
  "uiSchema": {},
  "outputSchema": {},
  "pricingRule": {},
  "limits": {},
  "metadata": {}
}
```

Required metadata: category; provider; speed tier; quality score; reference support; aspect ratios; resolutions; durations; text rendering; max references; provider regions; plan access; prompt guide.

**Current state:** models are hard-coded arrays in `src/lib/models.js` with per-model UI flags (`hasMode`, `maxImages`, `aspectRatios`, `durations`, …). This is the migration seed for the Registry (Appendix AJ), not the final authority.

### 2.3.3 Input schema

Use JSON Schema or strict equivalent. Normalized field types:

```text
string
textarea
integer
float
boolean
enum
multi_enum
asset
asset_list
image
video
audio
mask
aspect_ratio
resolution
duration
seed
color
slider
```

`uiSchema` determines presentation.

### 2.3.4 UI schema

Example:

```json
{
  "duration": {
    "control": "segmented",
    "label": "Duration",
    "suffix": "s",
    "group": "Output"
  },
  "seed": {
    "control": "seed",
    "group": "Advanced",
    "advanced": true
  }
}
```

A generic renderer MUST use specialized components for asset/mask/aspect controls. Do not scatter `if model === "..."` logic through the UI (rule 27).

### 2.3.5 Provider adapter

Normalized request:

```json
{
  "prompt": "...",
  "references": ["asset_a"],
  "aspectRatio": "9:16",
  "durationSec": 5,
  "resolution": "720p"
}
```

The adapter translates to provider-native fields. The UI MUST never need provider parameter names. The full adapter contract is normative in Appendix D.

### 2.3.6 Model eligibility

A model is eligible only if: enabled; provider enabled; user plan permits; region permits; required inputs exist; reference count supported; output constraints supported; model health acceptable; user budget permits.

### 2.3.7 Cost modes

User-selectable modes: **Best Quality** (premium model preference); **Balanced** (default quality/cost); **Economy** (cheapest acceptable); **Manual** (exact model). The Agent MUST use the same mode.

### 2.3.8 Model auto-selection

After eligibility:

```text
score =
qualityWeight * quality
+ valueWeight * value
+ speedWeight * speed
+ reliabilityWeight * reliability
+ userPreference
- costPenalty
```

Admin can tune route weights.

### 2.3.9 Model compatibility UI

When the user changes inputs: incompatible models become unavailable; recommended compatible models move up; the UI explains why.

Example:

> This model supports one reference image. You selected four.

Button:

> Choose compatible model.

### 2.3.10 Model and prompt benchmarks

Internal model benchmark suite: prompts; references; output; latency; cost; human rating. Benchmark data MUST inform route quality scores.

Before activating a Prompt Guide update: run benchmark prompts; compare old/new compiled prompt; review outputs; activate version; retain rollback.

### 2.3.11 Model Route table and admin

Route records map abstract route keys to prioritized models. Normative route examples in Appendix G; `ModelRoute` schema in Section 3.4.4.

Admin route display example:

```text
image.standard

1. Model A - priority 10 - healthy
2. Model B - priority 20 - healthy
3. Model C - priority 30 - degraded
```

Admin can reorder. Conditions: plan; quality mode; reference support; max cost; region.

## 2.4 Repository strategy (target monorepo, staged adoption)

Use `helmies-studio` as the single technical base and build all functionality (including the agent runtime, conversations, tools, skills, MCP, etc.) directly within it. The `helmies-agent` repository is abandoned and is **not** a base for this project.

Recommended final logical structure:

```text
helmies-studio/
├── apps/
│   ├── landing/            # preserved public Helmies Studio Next.js website
│   ├── studio-web/         # Helmies Studio authenticated UI (built natively)
│   ├── platform-api/       # commercial platform API
│   ├── agent-api/          # agent/conversation runtime (built natively inside Helmies Studio)
│   ├── worker/             # media and workflow job processors
│   ├── director-service/   # Helmies Director planning service (Maestro-exact behavior, original code)
│   └── vision-service/     # structured image/reference analysis
│
├── packages/
│   ├── contracts/
│   ├── ui/
│   ├── model-registry/
│   ├── pricing-engine/
│   ├── prompt-engine/
│   ├── brand-engine/
│   ├── storage/
│   ├── telemetry/
│   └── shared-config/
│
├── prisma/
├── docker/
├── infra/
├── docs/
├── scripts/
├── docker-compose.yml
└── README.md
```

Do not force a destructive filesystem reorganization in the first implementation commit. A staged implementation MAY keep the existing single-app structure while new commercial services are added. **Current state: single Next.js 16 app; the monorepo split is NOT STARTED and remains the stated target.**

## 2.5 Production routing and public APIs

Recommended routing (target):

```text
studio.helmies.fi/                -> landing service
studio.helmies.fi/pricing         -> landing service
studio.helmies.fi/login           -> shared login
studio.helmies.fi/studio/*        -> authenticated studio-web
studio.helmies.fi/api/platform/*  -> platform-api
studio.helmies.fi/api/agent/*     -> agent-api
studio.helmies.fi/api/generate/*  -> platform-api / execution gateway
studio.helmies.fi/api/director/*  -> platform-api
studio.helmies.fi/api/vision/*    -> platform-api
```

Internal Python services MUST NOT be exposed directly to browsers.

Public site content API (cache public responses):

```text
GET /api/platform/public/cms?namespace=landing&locale=en
GET /api/platform/public/announcements
GET /api/platform/public/plans
GET /api/platform/public/stats
```

Public model counts: instead of manual copy, count enabled public models, group by category, expose public-safe stats. Marketing MAY display `70+ models` based on threshold formatting.

**Current state:** single Next.js app serves everything; `/api/announcements` is the only implemented public content endpoint; `/api/platform/public/*` do not exist; landing pricing/model counts are hard-coded.

## 2.6 Identity

### 2.6.1 One identity

The public site, Studio and Agent MUST use one user identity. Long term: one Helmies account. Credits always belong to the platform user.

If immediate physical DB unification is difficult, use secure identity mapping/token exchange and maintain `platformUserId <-> agentUserId` — **SUPERSEDED in practice**: since `helmies-agent` is abandoned and all identity lives in Helmies Studio, there is no second auth system to reconcile. The unified NextAuth store already exists [IMPLEMENTED]. An `IdentityLink` mapping table is **not required**; revisit only if a future integration introduces a separate identity system.

### 2.6.2 Agent commercial context

At Agent request: resolve user from the unified Helmies Studio session; fetch plan; fetch wallet; fetch feature entitlements; attach to Helmies tool execution context.

Do not place complete billing records in LLM prompt. Tools receive context server-side.

### 2.6.3 One wallet

No separate Agent/Studio/Workflow/Director credits. Everything uses one wallet and ledger (Section 4.1).

## 2.7 Execution platform services

### 2.7.1 Service extraction from the current generation handler

The current `handleGeneration` (`src/lib/generation-handler.js`) has useful behavior that MUST be preserved through refactor: authentication; rate limiting; prompt expansion (now the 5-pass engine); ProjectMemory injection; provider fallback; DB pricing override; credit checks; generation record; media storage; quality gate; refunds.

It MUST be refactored into:

```text
QuoteService
WalletService
GenerationService
ModelGateway
ProviderAdapter
StorageService
QualityService
SettlementService
```

Do not keep one giant handler forever.

### 2.7.2 Generation job state machine

```text
created
quoted
awaiting_confirmation
reserved
queued
submitted
processing
downloading
quality_check
completed
failed
cancelled
refunded
```

Parent jobs MAY contain child jobs. **Current state:** `Generation.status` is a free-form string (`pending`/`processing`/`completed`/`failed`); there is no parent/child job model.

### 2.7.3 Prompt/request reproducibility

Every generation MUST store: raw prompt; normalized intent; compiled prompt; negative prompt; model; provider route; normalized params; provider params snapshot where safe; seed; references; Brand Kit; Canvas; Prompt Guide versions; quote; actual credits.

**Current state:** `PromptCompilation` rows store raw/final/negative prompts, guide version, warnings, polish mode [IMPLEMENTED, partial — no normalized intent/canvas/brand snapshot]; `Generation.params` stores the raw request body.

### 2.7.4 Reuse settings

Every generation result MUST offer **Reuse settings**: open the relevant Studio with the exact reusable configuration.

### 2.7.5 Quality engine

Possible checks: valid file; expected dimensions; duration; corruption; prompt alignment; reference similarity; identity consistency; OCR text; brand colors; logo presence.

Store dimensions separately:

```json
{
  "technical": 0.99,
  "promptAlignment": 0.87,
  "referenceConsistency": 0.91,
  "brandConsistency": 0.89,
  "textAccuracy": 0.78
}
```

Do not automatically spend unlimited retries. **Current state:** `lib/quality-gate.js` performs URL/byte-size validation only; semantic scoring is NOT STARTED.

### 2.7.6 Asset ingest and lineage (execution-layer rules)

Provider output handling MUST follow this sequence (v1 §75, preserved):

1. provider returns result;
2. worker fetches safely (SSRF protections, Section 9.5.4);
3. validates;
4. stores in controlled object storage;
5. generates thumbnail/metadata;
6. creates Asset record;
7. marks job complete.

A temporary provider URL is never the final asset (rule 36).

Lineage MUST be stored (v1 §76): `parentAssetId`, `generationId`, `transformation`. The chain `image -> video -> lipsync -> final` MUST be traceable. **Current state:** `Asset.parentAssetId`, `Asset.generationId` and `AssetRelation` exist; `handleGeneration` populates parent lineage best-effort [IMPLEMENTED, partial].

### 2.7.7 Streaming and tool results

Keep the mature streaming/reconnect approach for Agent surfaces (v1 §145). Generated media appears as tool result cards. Do not embed huge base64 data in streams.

Agent tool result shape (v1 §146, normative):

```json
{
  "jobId": "job_123",
  "status": "completed",
  "assets": [
    {
      "id": "asset_1",
      "type": "image",
      "thumbnailUrl": "/api/platform/assets/asset_1/thumbnail"
    }
  ],
  "creditsUsed": 180
}
```

---

# 3. Data Model & Migrations

## 3.1 Current database inventory (verified 2026-07-28)

The current Prisma/PostgreSQL schema (`prisma/schema.prisma`) contains these models. Do not discard this data (v1 §89, rule preserved).

| Model | Purpose | Notes vs v1 §89 |
|---|---|---|
| `User` | Identity, `role`, legacy `credits` Int | `passwordHash` added for credentials auth |
| `Account` / `Session` / `VerificationToken` | NextAuth/PrismaAdapter | JWT session strategy in use; `Session` table retained for adapter |
| `Subscription` | Stripe mapping, plan slug, status | |
| `Generation` | Generation record (tool, model, prompt, params, outputUrl, status, creditsUsed, providerCost Float, requestId, workflow linkage) | still the only job record; no parent/child |
| `CreditTransaction` | Legacy credit log | |
| `AgentRun` | Agent task run w/ steps JSON | |
| `Workflow` / `WorkflowRun` | Workflow builder + runs | |
| `ProjectMemory` | character/style/asset/brand memory blobs | migration source (Section 3.6) |
| `ProviderConfig` | provider row incl. **plaintext `apiKey`** | Section 9.6 violation, open |
| `ModelPricing` | flat per-model `providerCost` Float + `creditsCost` Int + UI card fields | |
| `FeatureFlag` | key/enabled/config | |
| `ApiKey` | hashed user API keys, prefix, lastUsedAt | |
| `AuditLog` | action/resource/metadata + IP/UA | |
| `RateLimit` | per-user endpoint counters | |
| `Refund` | refund requests | |
| `DirectorPipeline` / `DirectorShot` | Helmies-native Director state | pre-dates Maestro-exact target (Section 6.9) |
| `BrandKit` / `BrandAsset` | brand identity + linked assets | |
| `CanvasDocument` / `CanvasVersion` | canvas JSON persistence | route/schema mismatch (Section 3.5) |
| `Asset` / `AssetRelation` | media library + lineage | |
| `CreditWallet` / `CreditLedger` / `CreditReservation` | wallet V2 | fields diverge from service code (Section 3.5) |
| `CmsEntry` / `CmsRevision` | CMS with revisions | shape differs from target (Section 3.4.16) |
| `SiteAnnouncement` | announcement bar | |
| `PromptGuide` / `PromptGuideVersion` | prompt guides | keyed by `(modelId, category)`, not by guide key |
| `PromptCompilation` | per-generation prompt record | |
| `VisualAnalysis` | cached vision results keyed by `assetUrl` | no `assetId`/`routeKey` yet |
| `ProviderIncident` | provider health incidents | |
| `Project` | user projects | minimal (name/description/data) |
| `PromoCode` | promotions | no redemption table (Section 3.4.15) |
| `SubscriptionPlan` / `CreditPack` | admin-managed plans/packs | landing/checkout do not read them yet (Section 4.7) |

**Operational gap:** there is no `prisma/migrations/` directory. The schema is managed via `prisma db push`. Migration files MUST be introduced before the next schema change wave (Phase 3); the v1 rule "additive migrations before destructive migrations" requires versioned migration files to be enforceable.

### 3.1.1 Problems to solve (v1 §89 list, current status annotated)

1. `User.credits` is a single integer; reservations require available vs reserved accounting. **Status:** `CreditWallet` exists; mirror sync in `lib/session.js`; wallet code path broken (3.5).
2. `Generation` is too generic for durable parent/child job execution. **Status:** still true; `GenerationJob` target in 3.4.5.
3. `providerCost` uses Float; new financial values MUST use Decimal. **Status:** still true (`Generation.providerCost`, `ModelPricing.providerCost`, `ProviderConfig.markup`, `PromoCode.value` are Float).
4. `ProviderConfig.apiKey` stores secret data in DB; migrate to secret references. **Status:** open (Appendix AK).
5. `ModelPricing` flat cost insufficient for per-second/per-token/resolution/tier pricing. **Status:** still true; `AiModelPrice` target in 3.4.3.
6. Model capabilities and required input schemas are not normalized. **Status:** still true.
7. Current model definitions live partly in code. **Status:** still true (`src/lib/models.js`, `chatModes.js`).
8. `ProjectMemory` too generic for Brand Kits, Assets, Personas, Projects. **Status:** partially superseded — `BrandKit`, `Asset`, `Project` now exist; `ProjectMemory` remains for character/style; Persona model NOT STARTED.
9. No first-class Asset table. **Status:** RESOLVED (`Asset`, `AssetRelation`).
10. No Canvas document/version model. **Status:** RESOLVED in schema; route mismatch open (3.5).
11. No Director pipeline/shot schema. **Status:** RESOLVED (`DirectorPipeline`, `DirectorShot`).
12. No Promo Code model. **Status:** RESOLVED (`PromoCode`); redemption tracking NOT STARTED.
13. No CMS model. **Status:** RESOLVED (`CmsEntry`, `CmsRevision`).
14. No Announcement model. **Status:** RESOLVED (`SiteAnnouncement`).
15. No historical pricing snapshot model. **Status:** open (`Generation.params` + `PromptCompilation` are partial substitutes; `quoteSnapshot`/`pricingSnapshot` arrive with `GenerationJob`).
16. No explicit Provider Incident / health model. **Status:** RESOLVED (`ProviderIncident`).
17. No deterministic Advisor scenario record. **Status:** open (3.4.35).
18. No separate Quality Evaluation. **Status:** open (3.4.33; `quality-gate.js` logs only).
19. No normalized prompt-guide versioning. **Status:** PARTIAL (`PromptGuide`/`PromptGuideVersion` exist but keyed per-model, no route registry).

## 3.2 Database migration strategy (v1 §90, preserved)

Rules:

1. Back up production Postgres.
2. Back up Mongo. **NOT_APPLICABLE — SUPERSEDED:** no MongoDB exists in this codebase or deployment; the Mongo requirement derived from the abandoned `helmies-agent` runtime (Section 9.3.1).
3. Do not reset either DB.
4. Add new tables first.
5. Preserve old IDs.
6. Preserve Stripe customer/subscription mappings.
7. Preserve credit balances.
8. Backfill new wallet records from current `User.credits`.
9. Keep old `User.credits` temporarily as compatibility mirror. **Current state:** implemented as a mirror in `lib/session.js` / `lib/generation-handler.js`.
10. Introduce new ledger/reservation API.
11. Migrate generation paths to wallet API.
12. Stop writing direct `User.credits`. **Current state:** violated — Stripe webhook and several paths still write `User.credits` directly (Section 3.5).
13. Validate balances.
14. Only later remove compatibility column if desired.
15. Keep `Subscription` during migration and gradually normalize plan references.
16. Migrate `ProviderConfig` credentials to secret references (Appendix AK).
17. Seed Model Registry from existing hard-coded model catalogs (Appendix AJ).
18. Seed `AiModelPrice` from current `ModelPricing`.
19. Keep `ModelPricing` read compatibility until all routes use the new pricing engine.
20. Every migration must be reversible where practical.

## 3.3 Wallet migration and accounting rules (v1 §§92–93, preserved)

Current `User.credits` migrates:

```text
CreditWallet.available = User.credits
CreditWallet.reserved = 0
```

Create an opening ledger row of type `migration_opening_balance`. During transition the wallet service writes both the new wallet and the compatibility `User.credits` mirror, with periodic verification. Then stop direct use of `User.credits` and use the wallet service only.

Accounting model (normative):

```text
wallet.available
wallet.reserved
```

Reserve 500:

```text
available -= 500
reserved += 500
```

Settle at actual 430:

```text
reserved -= 500
available += 70
ledger generation debit = 430
```

Do not double-debit. Use DB transaction/row lock. The wallet MUST NOT become negative. Ledger types: `signup`, `subscription_grant`, `topup`, `promo`, `reservation`, `reservation_release`, `generation`, `refund`, `admin_adjustment` (plus `migration_opening_balance` during migration).

## 3.4 Target schema — new and changed models (v1 §91, preserved; syntax adaptable to the final Prisma version)

Current-state deltas for models that already exist are consolidated in Section 3.5.

### 3.4.1 AiProvider

```prisma
model AiProvider {
  id              String   @id @default(cuid())
  key             String   @unique
  name            String
  enabled         Boolean  @default(true)

  baseUrl          String?
  region           String?
  secretRef        String?

  healthStatus     String   @default("unknown")
  defaultMarkup    Decimal? @db.Decimal(10,4)
  defaultTargetMargin Decimal? @db.Decimal(10,4)

  config           Json?
  metadata         Json?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  models           AiModel[]
}
```

`secretRef` points to a secret manager/Docker secret/environment secret identifier. Never expose it to the client. **Current state:** NOT STARTED; `ProviderConfig` (plaintext key, Float markup) is the incumbent.

### 3.4.2 AiModel

```prisma
model AiModel {
  id              String   @id @default(cuid())
  providerId      String
  modelKey        String
  displayName     String

  capability      String
  category        String
  enabled         Boolean  @default(true)
  hidden          Boolean  @default(false)
  beta            Boolean  @default(false)
  priority        Int      @default(100)

  inputSchema     Json
  uiSchema        Json?
  outputSchema    Json?
  limits          Json?
  metadata        Json?

  qualityScore    Decimal? @db.Decimal(8,4)
  speedScore      Decimal? @db.Decimal(8,4)
  reliabilityScore Decimal? @db.Decimal(8,4)

  promptGuideKey  String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  provider        AiProvider @relation(fields: [providerId], references: [id])
  prices          AiModelPrice[]
  routes          ModelRoute[]

  @@unique([providerId, modelKey, capability])
  @@index([capability, enabled])
}
```

**Current state:** NOT STARTED; seed source is `src/lib/models.js` + `chatModes.js` (Appendix AJ).

### 3.4.3 AiModelPrice

```prisma
model AiModelPrice {
  id              String   @id @default(cuid())
  modelId         String

  strategy        String
  currency        String   @default("USD")
  params          Json

  effectiveFrom   DateTime @default(now())
  effectiveUntil  DateTime?

  source          String?
  sourceUrl       String?
  notes           String?

  createdAt       DateTime @default(now())

  model           AiModel @relation(fields: [modelId], references: [id], onDelete: Cascade)

  @@index([modelId, effectiveFrom])
}
```

Example `params`: `{ "unitCost": 0.035, "unit": "image" }` or `{ "unit": "second", "tiers": { "720p": 0.05, "1080p": 0.075 } }`. **Current state:** NOT STARTED; `ModelPricing` is the flat incumbent.

### 3.4.4 ModelRoute

```prisma
model ModelRoute {
  id              String   @id @default(cuid())
  routeKey        String
  modelId         String

  enabled         Boolean  @default(true)
  priority        Int      @default(100)
  conditions      Json?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  model           AiModel @relation(fields: [modelId], references: [id], onDelete: Cascade)

  @@unique([routeKey, modelId])
  @@index([routeKey, enabled, priority])
}
```

Route keys include: `image.fast`, `image.standard`, `image.premium`, `video.fast`, `video.standard`, `video.premium`, `llm.orchestrator`, `llm.prompt`, `vision.analyze` (full list in Appendix G). **Current state:** NOT STARTED.

### 3.4.5 GenerationJob

```prisma
model GenerationJob {
  id                 String   @id @default(cuid())
  userId             String
  parentJobId        String?
  projectId          String?
  agentRunId         String?
  directorPipelineId String?
  directorShotId     String?

  capability         String
  routeKey           String?
  modelId            String?
  providerId         String?

  status             String
  idempotencyKey     String

  normalizedRequest  Json
  providerRequest    Json?
  providerResponse   Json?

  quoteSnapshot      Json?
  pricingSnapshot    Json?

  estimatedCredits   Int      @default(0)
  reservedCredits    Int      @default(0)
  actualCredits      Int      @default(0)

  providerCost       Decimal? @db.Decimal(18,8)
  retailValue        Decimal? @db.Decimal(18,8)

  providerRequestId  String?
  errorCode          String?
  safeError          String?
  retryCount         Int      @default(0)

  queuedAt           DateTime?
  startedAt          DateTime?
  completedAt        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([userId, idempotencyKey])
  @@index([status, createdAt])
  @@index([userId, createdAt])
}
```

**Current state:** NOT STARTED; `Generation` is the incumbent record.

### 3.4.6 GenerationJobEvent

```prisma
model GenerationJobEvent {
  id          String   @id @default(cuid())
  jobId       String
  event       String
  stage       String?
  progress    Decimal? @db.Decimal(8,4)
  message     String?
  data        Json?
  createdAt   DateTime @default(now())

  @@index([jobId, createdAt])
}
```

### 3.4.7 UsageEvent

```prisma
model UsageEvent {
  id              String   @id @default(cuid())
  userId          String
  jobId           String?
  modelId         String?
  providerId      String?

  capability      String

  inputTokens     BigInt?
  outputTokens    BigInt?
  inputCharacters BigInt?
  audioSeconds    Decimal? @db.Decimal(14,3)
  videoSeconds    Decimal? @db.Decimal(14,3)
  imageCount      Int?

  providerCost    Decimal  @db.Decimal(18,8)
  retailValue     Decimal  @db.Decimal(18,8)
  creditsDebited  Int

  pricingSnapshot Json

  createdAt       DateTime @default(now())

  @@index([userId, createdAt])
  @@index([modelId, createdAt])
}
```

### 3.4.8 CreditWallet (target)

```prisma
model CreditWallet {
  userId            String   @id
  available         Int      @default(0)
  reserved          Int      @default(0)
  lifetimeCredited  BigInt   @default(0)
  lifetimeDebited   BigInt   @default(0)
  updatedAt         DateTime @updatedAt
}
```

**Current state:** PARTIAL — the model exists with `available`/`reserved` but with a single `lifetime Int` instead of `lifetimeCredited`/`lifetimeDebited`; service code already writes the target fields (3.5, mismatch #1).

### 3.4.9 CreditLedger (target)

```prisma
model CreditLedger {
  id            String   @id @default(cuid())
  userId        String
  delta         Int
  balanceAfter  Int
  reservedAfter Int

  type          String
  description   String?
  referenceType String?
  referenceId   String?
  metadata      Json?

  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
}
```

**Current state:** PARTIAL — exists with `walletId`/`amount` and without `delta`/`reservedAfter`/`referenceType`/`metadata`; service code writes the target fields (3.5, mismatch #1).

### 3.4.10 CreditReservation (target)

```prisma
model CreditReservation {
  id          String   @id @default(cuid())
  userId      String
  jobId       String?  @unique
  amount      Int
  status      String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  settledAt   DateTime?

  @@index([userId, status])
}
```

**Current state:** PARTIAL — exists with `walletId`/`generationId`/`releasedAt` and without `jobId`/`expiresAt`/`settledAt`; service code writes the target fields (3.5, mismatch #1).

### 3.4.11 PricingPlan

```prisma
model PricingPlan {
  id              String   @id
  slug            String   @unique
  name            String
  description     String?

  monthlyCredits  Int
  active          Boolean  @default(true)
  public          Boolean  @default(true)
  popular         Boolean  @default(false)
  sortOrder       Int      @default(0)

  featureConfig   Json
  limits          Json

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Current state:** PARTIAL — `SubscriptionPlan` exists (name, slug, price Int, credits, stripePriceId, features, isActive, sortOrder) but lacks `featureConfig`/`limits`/`popular`/`public`/yearly handling and is not read by landing/checkout.

### 3.4.12 PlanPrice

```prisma
model PlanPrice {
  id             String   @id @default(cuid())
  planId         String
  billingPeriod  String
  currency       String
  amount         Decimal  @db.Decimal(12,2)
  stripePriceId  String?
  active         Boolean  @default(true)
  effectiveFrom  DateTime @default(now())
  effectiveUntil DateTime?

  @@index([planId, active])
}
```

**Current state:** NOT STARTED — Stripe price IDs live in env vars (`STRIPE_PRICE_*`).

### 3.4.13 CreditPack (target)

```prisma
model CreditPack {
  id             String   @id @default(cuid())
  name           String
  credits        Int
  currency       String
  amount         Decimal  @db.Decimal(12,2)
  stripePriceId  String?
  active         Boolean  @default(true)
  sortOrder      Int      @default(0)
}
```

**Current state:** PARTIAL — `CreditPack` exists with `price Int` (no currency Decimal, no bonus) and duplicates the static `src/lib/credit-packs.js` + `STRIPE_PRICE_CREDITS_*` env vars (Section 4.6).

### 3.4.14 PromoCode (target)

```prisma
model PromoCode {
  id                    String   @id @default(cuid())
  code                  String   @unique

  type                  String
  value                 Decimal  @db.Decimal(12,4)
  currency              String?

  appliesToPlans        Json?
  appliesToCreditPacks  Json?
  newCustomersOnly      Boolean  @default(false)
  stackable             Boolean  @default(false)

  minimumSpend          Decimal? @db.Decimal(12,2)
  maxRedemptions        Int?
  maxPerUser            Int?

  startsAt              DateTime?
  endsAt                DateTime?
  active                Boolean  @default(true)

  stripePromotionCodeId String?
  metadata              Json?

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

Promo types: `percent_discount`, `fixed_discount`, `bonus_credits`, `plan_override`. **Current state:** PARTIAL — `PromoCode` exists with `type` default `"percentage"`, `value Float`, `eligibility String`, `maxUses`/`maxUsesPerUser`/`currentUses`, `expiresAt`; no plan/pack scoping JSON, no stackable, no minimumSpend, no Stripe promotion-code linkage.

### 3.4.15 PromoRedemption

```prisma
model PromoRedemption {
  id              String   @id @default(cuid())
  promoCodeId     String
  userId          String
  orderReference  String?
  discountAmount  Decimal? @db.Decimal(12,2)
  bonusCredits    Int?
  createdAt       DateTime @default(now())

  @@index([promoCodeId, userId])
}
```

**Current state:** NOT STARTED.

### 3.4.16 CmsEntry (target)

```prisma
model CmsEntry {
  id          String   @id @default(cuid())
  namespace   String
  key         String
  locale      String   @default("en")
  value       Json
  published   Boolean  @default(true)
  version     Int      @default(1)
  updatedBy   String?
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())

  @@unique([namespace, key, locale])
}
```

**Current state:** PARTIAL — `CmsEntry` exists with `key @unique`/`section`/`content`/`status` instead of `namespace`/`locale`/`published`/`version`.

### 3.4.17 CmsRevision

Immutable previous values. **Current state:** IMPLEMENTED (`CmsRevision` with entryId/content/createdBy).

### 3.4.18 SiteAnnouncement (target)

```prisma
model SiteAnnouncement {
  id          String   @id @default(cuid())
  message     String
  style       String
  linkLabel   String?
  linkUrl     String?

  enabled     Boolean  @default(false)
  dismissible Boolean  @default(true)

  startsAt    DateTime?
  endsAt      DateTime?
  audiences   Json?
  locales     Json?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Current state:** PARTIAL — `SiteAnnouncement` exists with `link`, `startDate`/`endDate`, `audience String`, `isActive`; no `linkLabel`, `dismissible`, audience/locale arrays, or priority (Section 8.8).

### 3.4.19 Project (target)

```prisma
model Project {
  id          String   @id @default(cuid())
  userId      String
  name        String
  description String?
  brandKitId  String?
  settings    Json?
  archivedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, updatedAt])
}
```

**Current state:** PARTIAL — `Project` exists (name/description/data); no `brandKitId`, `settings`, `archivedAt`.

### 3.4.20 Asset (target)

```prisma
model Asset {
  id            String   @id @default(cuid())
  userId        String
  projectId     String?

  type          String
  source        String
  storageKey    String
  mimeType      String

  width         Int?
  height        Int?
  durationMs    Int?
  bytes         BigInt?

  generationJobId String?
  parentAssetId String?

  metadata      Json?
  analysis      Json?

  favorite      Boolean  @default(false)
  deletedAt     DateTime?

  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
  @@index([projectId, createdAt])
}
```

**Current state:** PARTIAL — `Asset` exists with `url`/`thumbnailUrl`/`name`/`bytes Int`/`duration Float`/`generationId`/`isFavorite`/`isDeleted`; no `projectId`, `durationMs`, `generationJobId`.

### 3.4.21 AssetRelation

For multiple parent relationships. Types: `reference`, `derived_from`, `first_frame`, `brand_source`, `canvas_source`. **Current state:** IMPLEMENTED (`AssetRelation` with `type` default `"derived"`).

### 3.4.22 BrandKit (target)

```prisma
model BrandKit {
  id               String   @id @default(cuid())
  userId           String
  name             String
  description      String?

  config           Json
  fingerprint      Json?
  enforcementMode  String   @default("suggest")

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([userId, updatedAt])
}
```

**Current state:** PARTIAL — `BrandKit` exists with explicit fields (primaryColors, secondaryColors, fonts, slogans, photographyStyle, toneOfVoice, avoid, visualReferences, fingerprint, `enforcement` default `"off"`, website, isActive) instead of a single `config` JSON; functionally equivalent, DONE_EQUIVALENT pending enforcement-mode default alignment.

### 3.4.23 BrandAsset

Fields: `brandKitId`, `assetId`, `role`, `label`, `order`, `metadata`. Roles: `primary_logo`, `secondary_logo`, `product`, `photography_reference`, `negative_reference`, `typography_reference`, `social_reference`, `packaging`. **Current state:** PARTIAL — `BrandAsset` exists with `brandKitId`/`assetId`/`role` only.

### 3.4.24 CanvasDocument (target)

```prisma
model CanvasDocument {
  id             String   @id @default(cuid())
  userId         String
  projectId      String?

  name           String
  width          Int
  height         Int
  document       Json

  previewAssetId String?
  currentVersion Int      @default(1)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, updatedAt])
}
```

**Current state:** PARTIAL — `CanvasDocument` exists with `data`/`width`/`height`/`isActive`; no `projectId`, `previewAssetId`, `currentVersion`; API route writes wrong field names (3.5, mismatch #3).

### 3.4.25 CanvasVersion (target)

```prisma
model CanvasVersion {
  id          String   @id @default(cuid())
  canvasId    String
  version     Int
  document    Json
  previewAssetId String?
  createdAt   DateTime @default(now())

  @@unique([canvasId, version])
}
```

**Current state:** PARTIAL — `CanvasVersion` exists with `documentId`/`name`/`data`/`snapshot`; no `version` number or uniqueness (3.5, mismatch #3).

### 3.4.26 VisualAnalysis (target)

```prisma
model VisualAnalysis {
  id          String   @id @default(cuid())
  assetId     String
  routeKey    String
  modelId     String?
  result      Json
  version     Int      @default(1)
  createdAt   DateTime @default(now())

  @@index([assetId, createdAt])
}
```

**Current state:** PARTIAL — `VisualAnalysis` exists keyed by `assetUrl` with result columns (caption, palette, regions, textRegions, lighting, style, provider) instead of a `result` JSON, `assetId`, `routeKey`, `version`.

### 3.4.27 PromptGuide (target)

```prisma
model PromptGuide {
  id          String   @id @default(cuid())
  key         String   @unique
  name        String
  category    String
  activeVersion Int?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Current state:** PARTIAL — `PromptGuide` exists keyed by `(modelId, category)` without `key`/`name`/`activeVersion`.

### 3.4.28 PromptGuideVersion

```prisma
model PromptGuideVersion {
  id          String   @id @default(cuid())
  guideId     String
  version     Int
  content     String   @db.Text
  config      Json?
  createdBy   String?
  createdAt   DateTime @default(now())

  @@unique([guideId, version])
}
```

**Current state:** PARTIAL — exists with `content Json` (not Text) and the same uniqueness.

### 3.4.29 PromptCompilation

Stores: job, user, guide versions, source, normalized intent, brand context summary, canvas context summary, final prompt, negative prompt, metadata. Used for debugging and reproducibility. **Current state:** IMPLEMENTED with per-pass columns (rawPrompt, normalized, enrichedCtx, expandedPrompt, dialectPrompt, finalPrompt, negativePrompt, guideId/guideVersion, warnings, polishMode) — DONE_EQUIVALENT; brand/canvas context summaries not yet stored.

### 3.4.30 DirectorPipeline (target)

```prisma
model DirectorPipeline {
  id               String   @id @default(cuid())
  userId           String
  projectId        String?

  title            String
  type             String
  status           String

  productionPlan   Json?
  quoteSnapshot    Json?

  estimatedCredits Int      @default(0)
  reservedCredits  Int      @default(0)
  actualCredits    Int      @default(0)

  finalAssetId     String?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([userId, updatedAt])
}
```

**Current state:** PARTIAL — `DirectorPipeline` exists with `plan`/`brief`/`costEstimate`/`validationResults`/`stateMetadata`/`assembledUrl`/`assemblyMetadata`/`rerunHistory`; no `projectId`, credit counters, or `finalAssetId`.

### 3.4.31 DirectorShot

Fields: `pipelineId`, `index`, `status`, ShotPlan JSON, `imageAssetId`, `videoAssetId`, `audioAssetId`, `imageJobId`, `videoJobId`, quality, prompt versions, timestamps. **Current state:** PARTIAL — `DirectorShot` exists with `plan`/`imageResult`/`videoResult`/`audioResult`/`error` JSON blobs; no asset/job ID columns or quality.

### 3.4.32 DirectorShotVersion

Immutable shot revision. **Current state:** NOT STARTED.

### 3.4.33 QualityEvaluation

Fields: job, asset, evaluator route/model, technical, prompt alignment, reference consistency, brand consistency, text accuracy, result JSON. **Current state:** NOT STARTED.

### 3.4.34 ProviderIncident (target)

Track: provider, model optional, start, end, status, error rate, detail. **Current state:** IMPLEMENTED (`ProviderIncident` with provider/type/status/message/metadata/startedAt/resolvedAt) — DONE_EQUIVALENT.

### 3.4.35 AdminAdvisorScenario

Store: input assumptions, calculator output, LLM explanation, admin, timestamp. **Current state:** NOT STARTED.

## 3.5 Schema drift register (current code vs current schema)

These mismatches exist **today** between service code and `prisma/schema.prisma`. They are defects, not design. Each MUST be fixed by migrating the schema toward the target (Section 3.4) or correcting the code, before Phase 6 relies on the affected path.

| # | Path | Code writes | Schema has | Impact |
|---|---|---|---|---|
| 1 | `src/lib/wallet.js`, `src/lib/session.js` | `CreditWallet.lifetimeCredited/lifetimeDebited`; `CreditLedger.userId/delta/reservedAfter/referenceType/metadata`; `CreditReservation.jobId/expiresAt/settledAt` | `CreditWallet.lifetime`; `CreditLedger.walletId/amount`; `CreditReservation.walletId/generationId/releasedAt` | Wallet reserve/settle/release and `debitCredits`/`creditUser` throw against the declared schema. Affects `handleGeneration` (reserve→402 path), async debit, webhook refund. Verify against the live DB (which may have drifted columns) and reconcile one way |
| 2 | `src/app/api/stripe/webhook/route.js` | `User.credits` increment directly | wallet models exist | Top-ups/subscription grants bypass the wallet and ledger; the `User.credits` mirror is then overwritten from the wallet by `getCurrentUserWithCredits`, so webhook-granted credits can be silently lost |
| 3 | `src/app/api/canvas/route.js` | `CanvasDocument.content`, `CanvasVersion.content`, `CanvasVersion.version` | `CanvasDocument.data`, `CanvasVersion.data` (no `version`) | Canvas create/update/version writes fail against the declared schema |
| 4 | `src/app/api/generate/async/route.js` | `Generation.providerName` | no such column | Async submission fails at `prisma.generation.create` against the declared schema |
| 5 | `src/lib/credits.js` `PLAN_IDS` | env `STRIPE_PRICE_*` → plan slug | `SubscriptionPlan` table exists | Plan/price authority is split between env vars, static arrays and the DB (Section 4.7 invariant violated) |

## 3.6 ProjectMemory migration (v1 §162, preserved)

Existing `ProjectMemory` types: `character`, `style`, `asset`, `brand`. Migrate:

```text
character -> Persona/Project entity
style     -> StylePreset
asset     -> Asset
brand     -> BrandKit
```

Keep compatibility reads during migration. **Current state:** `BrandKit`/`Asset` targets exist; `Persona` and `StylePreset` entities NOT STARTED; `ProjectMemory` still actively used by `lib/memory.js` and the generation handler.

---

# 4. Commercial System

## 4.1 One wallet and the reservation flow

One wallet per user across Agent, Studios, Workflows and Director (Section 2.6.3). Every credit change maps to a ledger transaction (rule 32).

For variable-cost jobs the flow is (v1 §67, normative):

1. quote;
2. reserve maximum;
3. execute;
4. record actual provider cost;
5. calculate final credit charge;
6. settle;
7. release unused reservation;
8. refund fully on non-billable failure.

The wallet MUST NOT become negative, including under concurrent jobs (Appendix AS, wallet race test).

## 4.2 Pricing engine strategies (v1 §63, preserved)

Every action goes through a server-side quote. Supported strategies:

```text
fixed
per_image
per_megapixel
per_second
per_character
per_audio_second
per_input_token
per_output_token
tiered_duration
formula
```

Never use arbitrary JavaScript `eval` for pricing formulas. The strategy interface and implementations are normative in Appendix E.

## 4.3 Quote formula and response (v1 §§64–65, preserved)

Concept:

```text
provider wholesale cost
+ infrastructure/retry reserve
= adjusted platform cost

adjusted platform cost
→ target margin / pricing policy
= retail compute value

retail compute value
→ credits

promo/plan rules applied
→ final credits
```

All assumptions MUST be stored in the quote snapshot.

Quote response shape (normative):

```json
{
  "quoteId": "quote_...",
  "expiresAt": "...",
  "providerCostEstimated": 0.42,
  "platformCostEstimated": 0.51,
  "retailBeforeDiscount": 1.25,
  "discount": 0.15,
  "retailAfterDiscount": 1.10,
  "credits": 110,
  "maximumCredits": 125,
  "balance": 4200,
  "balanceAfterExpected": 4090,
  "balanceAfterMaximum": 4075,
  "warnings": []
}
```

Quote validity rules are normative in Appendix F. Historical generation records MUST retain a pricing snapshot (rule 29).

## 4.4 User cost confirmation (v1 §66, preserved)

Single generation:

```text
Generate 5s video

Model: Kling 3 Pro
Estimated: 640 credits

Current balance: 3,250
Expected remaining: 2,610

[Cancel] [Generate — 640]
```

Agent plan:

```text
Campaign Production
8 steps

Expected: 3,780 credits
Maximum: 4,420 credits

Balance: 7,300
Expected remaining: 3,520

[Review] [Proceed]
```

The quote MUST show credits needed, current balance and expected remaining balance (rule 23). Multi-step runs MUST show total expected and maximum cost (rule 24). A single manual Generate button press is explicit approval of the displayed quote (Section 5.7). Credits MUST never be hard-coded independently in UI components (rule 25).

## 4.5 Pricing plans (v1 §94, preserved)

Admin-controlled. Each plan has: name; public description; monthly/yearly prices; credits; max concurrency; max active jobs; allowed quality tiers; API access; Director access; Brand Kit limit; storage allowance; queue priority; selected premium model access; team seats later.

Do not hardcode plan names/credits in multiple files. Plan/entitlement shape is normative in Appendices AF and AG. **Current state:** plan slugs/credits are hard-coded in `src/lib/credits.js` (`SUBSCRIPTION_CREDITS`) and env price IDs; `SubscriptionPlan` admin CRUD exists but is not authoritative.

## 4.6 Credit packs (v1 §96, preserved)

Admin-managed fields: name; credits; price; currency; Stripe price; active; bonus; sort. The Advisor shows effective price per credit and implied margin under typical usage. **Current state:** `CreditPack` table + admin API exist; `/api/stripe/topup` still reads the static `src/lib/credit-packs.js` and `STRIPE_PRICE_CREDITS_*` env vars.

## 4.7 Landing dynamic pricing (v1 §95, preserved)

The current landing page uses static pricing arrays. Replace with:

```text
GET /api/platform/public/plans
```

Response contains UI-safe fields:

```json
{
  "plans": [
    {
      "slug": "studio",
      "name": "Studio",
      "description": "...",
      "popular": true,
      "monthly": { "price": 49, "currency": "EUR", "credits": 1500 },
      "yearly": { "displayMonthly": 39, "billedYearly": 468, "creditsPerMonth": 1500 },
      "features": []
    }
  ]
}
```

The homepage keeps the same pricing card design (Section 1.7). Migration seed values and the signup-bonus vs Free-plan inconsistency are normative in Appendix A: both `PricingPlan.monthlyCredits` and a configurable `SignupCampaign.welcomeCredits` MUST exist; do not assume the signup bonus equals monthly Free credits. **Current state:** NOT STARTED — `/pricing` and the landing render static arrays; checkout reads env price IDs; signup grants 100 credits hard-coded in `src/lib/auth.js` and `/api/auth/register`.

## 4.8 Promo codes and guardrails (v1 §§97–98, preserved)

Admin can configure: code; percentage discount; fixed discount; bonus credits; eligible plans; eligible credit packs; new customers only; minimum spend; max total uses; max uses/user; start/end; stackable; active.

Before save, the system MUST calculate financial risk. Guardrail example (normative behavior): for "50% off Studio, 3 months, no usage restrictions" the system calculates and displays:

```text
Normal monthly price: €49
Discounted revenue: €24.50
Historical expected AI cost: €13.20
Payment fees: €1.10
Infra allocation: €2.40
Expected contribution: €7.80
Expected contribution margin: 31.8%

Worst-case eligible credit usage:
AI cost: €28.50
Contribution: NEGATIVE
```

Display: green/yellow/red warning; exact assumptions; ability for super admin to proceed with reason. **Current state:** `PromoCode` model + `/api/admin/promos` CRUD exist; simulation/margin warnings and redemption flow NOT STARTED.

## 4.9 Margin, fees, tax, infrastructure reserve (v1 §§152–155, preserved)

Margin calculation MUST use Decimal:

```text
providerCost
+ variable infra reserve
= adjustedCost

adjustedCost / (1 - targetGrossMargin)
= targetRetail
```

If policy uses a multiplier, explicitly label it. Do not call a `2.5x markup` a `60% margin` incorrectly. **Current state:** `src/lib/pricing-engine.js` applies a flat `2.5` markup over provider cost with `CREDIT_TO_EUR = 0.01`, markup overridable per provider via `ProviderConfig.markup` (Float).

Payment fees: configurable assumptions (percentage, fixed fee, region); the Advisor uses them.

Tax: treat separately. Do not hide VAT assumptions inside AI cost. The Admin Advisor shows whether a scenario is pre/post-tax.

Infrastructure reserve: configurable globally and per capability (e.g. LLM lower reserve, video higher reserve). Reserve covers retries, storage, transcode, operational overhead.

## 4.10 Cost simulator and subscription scenarios (v1 §§156–157, preserved)

Admin cost simulator inputs: model; params; plan; target margin; promo; assumed utilization. Outputs: wholesale cost; adjusted cost; retail credits; revenue; expected margin; worst-case margin.

Subscription scenario simulation MUST support: 20% / 50% / 80% / 100% utilization, historical p50, historical p90, using actual model mix where available.

## 4.11 Pricing consistency invariant (v1 §207, preserved)

The following surfaces MUST read the same pricing plan records: homepage; pricing page; checkout; Billing page; Agent upgrade recommendation; Admin; promo engine; advisor. There MUST NOT be separate price constants. **Current state:** violated — prices exist as static landing arrays, `lib/credits.js` constants, env `STRIPE_PRICE_*` IDs, `lib/credit-packs.js`, and `SubscriptionPlan`/`CreditPack` rows.

## 4.12 Admin offer workflow (v1 §208, preserved)

1. Admin creates promo draft.
2. Calculator runs.
3. Advisor explains risk.
4. Admin previews public effect.
5. Admin activates.
6. Stripe sync occurs if required.
7. Public offer API updates.
8. Audit logged.
9. Analytics tracks redemptions.
10. Promo expires automatically.

## 4.13 Stripe integration requirements

Webhook processing MUST verify signatures, be idempotent (dedupe by Stripe event ID), credit the wallet/ledger (not the legacy column), and never trust success redirect URLs as proof of payment. Server-side prices only; validate plan/pack IDs server-side. **Current state:** signature verification exists; idempotency, wallet crediting and DB-driven price validation are open (Section 3.5, mismatch #2).

---

# 5. Agent Platform

## 5.1 Master Agent (v1 §9, preserved)

The Master Agent is the primary simple-mode experience. It is a creative production manager, not only a chatbot.

The Master Agent can: discuss and refine creative intent; inspect attached images; inspect project assets; load a Brand Kit; analyze visual references; create a structured plan; delegate to subagents; select models; choose cost/quality modes; quote costs; show balance impact; request approval; execute steps; monitor jobs; evaluate outputs; selectively retry; assemble deliverables; save assets to a project; create workflows from successful sequences.

Normative example flow:

User:
> Create a 20 second vertical skincare launch ad using my Luna brand kit and these two product photos.

Agent:
1. Loads Brand Kit.
2. Loads product references.
3. Runs Visual Intelligence.
4. Builds a creative brief.
5. Plans shots.
6. Chooses image/video/audio routes.
7. Calculates expected and maximum credits.
8. Shows plan and quote.
9. User confirms.
10. Runs child jobs.
11. Performs quality checks.
12. Reruns only weak outputs if retry budget permits.
13. Assembles final.
14. Saves final and source assets to project.
15. Shows final result and total actual credits.

The Master Agent system prompt baseline is normative in Appendix H.

## 5.2 Subagents (v1 §10, preserved)

Required subagents and responsibilities:

| Subagent | Responsibilities |
|---|---|
| Creative Director | brief interpretation; concept; narrative; visual direction; overall coherence |
| Image Director | image generation strategy; reference selection; T2I/I2I/edit route; image prompt structure; composition requirements |
| Video Director | motion; shot duration; first/last frames; image-to-video strategy; model-specific video prompting |
| Brand Guardian | brand palette; logo use; typography; visual style; tone constraints; brand violation detection |
| Prompt Engineer | prompt dialect; model guide; negative prompt; prompt compression/expansion; immutable constraints |
| Storyboard Agent | shot list; continuity; camera; pacing |
| Audio Agent | TTS; voice; music; sound effects; timing |
| Vision Analyst | scene caption; objects; regions; OCR; palette; lighting; visual style; reference semantics |
| Quality Control Agent | prompt alignment; brand alignment; visual/reference consistency; technical validity; targeted rerun recommendation |
| Cost Optimizer | model comparisons; cost/quality tradeoff; budget-aware alternatives |
| Assembly Agent | final sequence; media ordering; deliverables; export |

All subagents MUST use the same Gateway and wallet. Subagent system prompts are normative in Appendices I–O. **Current state:** named personas with system prompts exist in `src/lib/agents.js` (orchestrator + the above roles + tool agents); they are prompt presets inside one runtime, not independent runtime agents.

## 5.3 Agent runtime capabilities to build (v1 §11, preserved)

Build natively inside Helmies Studio: agents; subagents; tools; tool search; deferred tools; skills; manual skills; always-apply skills; MCP; user-scoped MCP; OAuth-aware MCP; memory tools; summarization; context pruning; code execution; file authoring; HITL / ask-user; background tasks; resumable jobs; streaming; usage accounting; provider abstraction; reasoning-history handling; multi-model support; conversation persistence.

Do not rebuild these inside a separate old Next.js tool shell — build them directly into Helmies Studio's authenticated application. **Current state:** orchestrator chat (`/api/agent/chat`), JSON-step planner (`/api/agent/plan`) and step executor (`/api/agent/run` via `executeAgentRun`/`executeAgentRunStream` with `AgentRun` persistence) exist; the remaining capabilities are NOT STARTED.

## 5.4 First-party agent tools (v1 §12, preserved)

```text
helmies.list_models
helmies.get_model_schema
helmies.quote_generation
helmies.generate_image
helmies.edit_image
helmies.generate_video
helmies.generate_audio
helmies.generate_tts
helmies.transcribe_audio
helmies.lipsync
helmies.recast
helmies.analyze_image
helmies.search_assets
helmies.get_asset
helmies.get_brand_kit
helmies.create_canvas_render
helmies.create_project
helmies.add_project_asset
helmies.create_director_plan
helmies.quote_director_plan
helmies.run_director_pipeline
helmies.get_job
helmies.retry_job
helmies.create_workflow
```

Every tool MUST: validate ownership; validate entitlement; use normalized inputs; use the Model Gateway; return structured results; never reveal provider secrets. **Current state:** NOT STARTED as a tool contract layer; the executor calls `lib/generation.js` functions directly.

## 5.5 Creative plan schema (v1 §147, normative)

```ts
type CreativePlan = {
  id: string
  title: string
  summary: string
  projectId?: string
  steps: CreativePlanStep[]
  quote?: PlanQuote
}

type CreativePlanStep = {
  id: string
  kind: string
  description: string
  dependsOn: string[]
  routeKey?: string
  modelId?: string
  params: Record<string, unknown>
  estimatedCredits?: number
}
```

## 5.6 Plan execution (v1 §148, preserved)

Use a DAG. Independent steps can run in parallel if: no dependency; user concurrency permits; reservation exists; provider limits permit.

## 5.7 Approval policy (v1 §149, preserved)

Explicit approval is required when: multi-step plan; cost > configurable threshold; batch; destructive action; external publish; pricing/subscription action. A single manual Generate button is explicit approval of the displayed quote.

## 5.8 Retry budget (v1 §150, preserved)

Plan quote includes: expected cost; maximum reserved; retry allowance. The quality agent MUST NOT exceed maximum without new approval.

## 5.9 Agent inside a manual Studio (v1 §71, preserved)

A contextual Agent panel can see: studio; model; prompt; references; Canvas; Brand Kit; project; current error.

The user can ask: "Make this more cinematic." / "Use a cheaper model." / "Explain why this model cannot use these references." / "Improve the composition." The Agent proposes changes. Destructive changes require user confirmation.

## 5.10 Project Memory vs Agent memory (v1 §72, preserved)

Keep separate. Project Memory: explicit character; style; Brand Kit; asset; project notes. Agent memory: conversational/user preferences. Do not store both as undifferentiated JSON.

## 5.11 Agent commercial context

Covered by Sections 2.6.2 and 9.9: resolve user from the unified session; fetch plan, wallet, feature entitlements; attach to tool execution context server-side. Do not place complete billing records in the LLM prompt.

## 5.12 Migration from the current orchestrator (v1 §§163–164, preserved)

The current Helmies Studio Orchestrator already demonstrates useful UX: conversational clarification; Generate Plan; estimated credits; execution steps; progress. Evolve it into the final Master Agent runtime built natively inside Helmies Studio. The final Master Agent is the only orchestrator.

The old Next app previously could proxy `/agent/*` to an external chat runtime. Final: `/studio` is the Helmies Studio authenticated app itself (built natively); landing and Studio are siblings behind the gateway; not "Studio page embedding an external Agent product."

---

# 6. Studios & Workspaces

## 6.1 Authenticated shell and navigation (v1 §8, preserved)

Recommended sidebar:

```text
CREATE
    Agent
    Image Studio
    Video Studio
    Director
    Audio Studio
    Lip Sync
    Recast
    Influencer

BUILD
    Workflows
    Brand Kits
    Projects
    Assets

LIBRARY
    Generations
    Favorites
    Templates

ACCOUNT
    Credits
    Billing
    API
    Settings
```

Admin role also sees `ADMIN / Dashboard`. Do not expose 70+ model names in the sidebar; models are controls inside relevant workspaces. Route access is entitlement-aware. The full route map is normative in Appendix AE. **Current state:** `StudioClient.js` implements a tab-based shell with CREATE/BUILD groups (Agent, Image, Video, Director, Audio, Music, Lip Sync, Recast, Influencer, AI Avatar, Canvas, Cinema, Motion, Video Edit, Clipping, Marketing, Workflows, Brand Kits, Projects, Assets) plus LIBRARY (Generations→/gallery) and ACCOUNT (Settings, Billing); `/studio/[tool]` provides per-tool URLs for 14 tools. It MUST evolve into the routed shell above.

## 6.2 Studio layout and Basic/Advanced mode (v1 §§13–14, preserved)

Desktop layout:

```text
┌──────────────────────┬───────────────────────────────────────┬────────────────────┐
│ INPUTS / SETTINGS    │                                       │ INSPECTOR / AGENT  │
│                      │            MAIN WORKSPACE             │                    │
│ model                │                                       │ current job        │
│ references           │            Canvas / Preview           │ metadata           │
│ controls             │                                       │ prompt inspector   │
│ advanced             │                                       │ Ask Agent          │
├──────────────────────┴───────────────────────────────────────┴────────────────────┤
│ Prompt / Command Composer      Model      Cost      Generate                      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Mobile: main workspace stays central; settings become bottom sheet; inspector becomes drawer; prompt bar remains accessible; Agent becomes contextual drawer.

Every Studio supports Basic mode (prompt; primary references; recommended model; aspect; quality; cost) and Advanced mode (exact model; seed; resolution; references; masks; negative prompt; model-specific options; advanced prompt inspector; provider route if allowed; Canvas; detailed controls). The user's preference is persisted per workspace.

## 6.3 Image Studio (v1 §15, preserved)

Supported modes: Text to Image; Image to Image; Image Edit; Multi Reference; Inpaint; Outpaint; Composition Canvas; Product Image; Poster/Typography; Character Reference; Batch Variations.

Core UI: references left; Canvas/preview center; result/history right; bottom prompt/generate; contextual Agent. Completion checklist: Appendix AM. **Current state:** `/studio/image` with T2I/I2I, multi-image references, aspect/resolution/seed/variations controls exists (`chatModes` image mode; ImageStudioV2); inpaint/outpaint/mask flows, Canvas-guided generation and batch variations PARTIAL.

## 6.4 Video Studio (v1 §41, preserved)

Modes: Text to Video; Image to Video; Reference to Video; First/Last Frame; Video to Video; Extend; Retake; Motion Transfer; Product Video; UGC; Cinematic. Advanced controls are schema-driven. **Current state:** T2V/I2V/V2V, first+last frame, duration/aspect/resolution/mode controls exist; extend via Video Edit tool; reference-to-video and motion transfer PARTIAL.

## 6.5 Audio Studio (v1 §51, preserved)

Unify: TTS; voice selection; voice clone where permitted; music; sound effects; ASR. Price units can differ (characters; seconds; fixed job); the Gateway handles them. **Current state:** Audio tool (music/voice/SFX, Suno + ElevenLabs models) and a separate Music tool exist; ASR NOT STARTED.

## 6.6 Canvas — core differentiator (v1 §§16–23, preserved)

The Canvas is not a simple drawing surface. It is a **visual instruction document**.

A user can: upload reference image; place it in a specific position; scale it; rotate it; add another image; add a logo; type exact text; scribble; draw an arrow; draw a rectangle; mark "remove"; mark "keep exactly"; paint an inpaint mask; paint a preservation mask; write "make this marble"; create a rough visual composition. Then the user clicks **Generate Professional Image** and Helmies converts the rough Canvas into model-appropriate structured inputs.

### 6.6.1 Technology (v1 §17)

Recommended: Fabric.js as the first candidate (object transforms, text editing, images, selection, grouping, free drawing); custom raster mask layer; Web Worker/OffscreenCanvas for expensive preprocessing where supported; high-resolution server/client export path. Perform a short technical spike comparing Fabric.js and React-Konva before committing. Do not manually implement all selection/resize/rotate/text-editing primitives on raw Canvas unless necessary. **Current state:** Fabric.js 7 is the chosen library (spike DONE_EQUIVALENT); `CanvasEditor.js`/`CanvasWorkspace.js` exist.

### 6.6.2 Object types (v1 §18)

```text
IMAGE
TEXT
SHAPE
FREE_DRAW
MASK_INCLUDE
MASK_EXCLUDE
ARROW
REGION
PROMPT_NOTE
COLOR_SWATCH
LOGO
REFERENCE
GUIDE
BACKGROUND
```

Each object has: ID; z-index; normalized coordinates; transforms; opacity; visibility; lock state; semantic role; optional prompt note; source Asset ID.

### 6.6.3 Semantic roles (v1 §19)

```text
layout_reference
identity_reference
style_reference
product_reference
logo
background_reference
preserve_exactly
edit_target
remove_target
inpaint_region
outpaint_context
text_content
color_reference
composition_anchor
```

The semantic role is more important than the visual object type. A normal uploaded image can mean "copy this subject", "copy this style", "use this layout", or "keep this product exactly". The user can select a role; the Agent may recommend one.

### 6.6.4 Document schema (v1 §20, normative)

Persist editable JSON (rule 38 — a Canvas MUST be persisted as editable document state, not just a flattened screenshot):

```json
{
  "version": 1,
  "width": 1080,
  "height": 1350,
  "aspectRatio": "4:5",
  "background": { "type": "color", "value": "#F4F1EA" },
  "objects": [
    {
      "id": "product_1",
      "type": "image",
      "assetId": "asset_123",
      "role": "product_reference",
      "x": 0.50, "y": 0.61, "width": 0.34, "height": 0.40,
      "rotation": 0,
      "locked": false
    },
    {
      "id": "headline",
      "type": "text",
      "role": "text_content",
      "text": "SUMMER DROP",
      "fontFamily": "BrandHeading",
      "x": 0.50, "y": 0.18
    }
  ],
  "instructions": [
    "premium editorial lighting",
    "keep the product logo legible"
  ]
}
```

### 6.6.5 Canvas Compiler (v1 §21)

The Canvas Compiler converts visual intent into: flattened composition guide; clean source render; inpaint mask; preservation mask; reference assets; semantic reference roles; region instructions; text requirements; composition JSON; compiled prompt; negative prompt; model-specific request. The output contract is normative in Appendix R. **Current state:** `src/lib/canvas-compiler.js` produces instructions client-side; server compilation, mask asset rendering and `CompiledCanvas` persistence NOT STARTED.

### 6.6.6 Canvas model strategy (v1 §22)

If the model supports: multiple references → send them directly; one image → flatten composition guide; masks → render exact mask; region prompting → translate regions; T2I only → convert composition into textual spatial prompt; text rendering → preserve exact text field; no exact text → warn user and recommend compatible model. The user should not need to understand these differences in Basic mode.

### 6.6.7 Canvas history (v1 §23)

Required: undo; redo; autosave; version snapshots; duplicate; rename; restore; before/after; generation lineage. Never overwrite the source Canvas version when generating. **Current state:** `CanvasDocument`/`CanvasVersion` models exist; the `/api/canvas` route writes non-existent fields (Section 3.5, mismatch #3) — persistence is broken against the declared schema. Completion checklist: Appendix AN.

## 6.7 Lip Sync (v1 §52, preserved)

Common inputs: image or video; audio; optional prompt; resolution. Model-specific controls are rendered from schema. **Current state:** IMPLEMENTED as a tool (9 models incl. wan-speech-to-video, infinitetalk, volcengine-lipsync).

## 6.8 Recast (v1 §53, preserved)

Inputs: source video; target identity/reference; target selector; optional prompt; mask/orientation where supported. Add quality checks for obvious identity failure. **Current state:** IMPLEMENTED as `/studio/body-swap` (target URL `/studio/recast`).

## 6.9 Director — multi-shot production (v1 §§42–50, 132–134, preserved)

Director is a multi-step production workspace, not a single model.

Inputs: creative brief; target duration; platform; aspect; Brand Kit; characters; products; references; script; lyrics; audio; budget mode; quality mode.

### 6.9.1 ProductionPlan (v1 §43, normative)

```ts
type ProductionPlan = {
  id: string
  title: string
  type: "ad" | "short_film" | "music_video" | "social" | "product"
  durationSec: number
  globalStyle: string
  brandKitId?: string
  subjects: SubjectProfile[]
  locations: LocationProfile[]
  shots: ShotPlan[]
  continuityRules: string[]
}
```

The wire-format Director production schema is normative in Appendix T.

### 6.9.2 ShotPlan (v1 §44, normative)

```ts
type ShotPlan = {
  id: string
  index: number
  title: string
  durationSec: number

  narrativeRole: string
  sceneGoal: string

  subjects: SubjectRef[]
  environment: string
  spatialSetup: string
  lighting: string
  mood: string

  camera: {
    framing: string
    angle: string
    lens: string
    movement: string
    intensity: string
  }

  imageStrategy: {
    mode: "generate" | "reference" | "reuse_previous_end_frame"
    prompt: string
    references: string[]
  }

  videoStrategy: {
    mode: "t2v" | "i2v" | "reference" | "extend"
    prompt: string
    modelRoute: string
    keyframes?: string[]
    windows?: string[]
  }

  audio?: {
    dialogue?: string
    ambience?: string
    effects?: string[]
  }

  continuity: string[]
}
```

Shot state and planning-validation rules are normative in Appendices U and V.

### 6.9.3 Planning passes (v1 §45)

- **Pass A — Creative Structure.** Story beats and creative concept.
- **Pass B — Shot Breakdown.** Convert beats into bounded shots.
- **Pass C — Image/Keyframe Prompts.** Plan first frames and references.
- **Pass D — Video Prompts.** Compile model-specific motion instructions.
- **Pass E — Validation.** Check total duration; continuity; references; unsupported modes; missing assets; impossible transitions.
- **Pass F — Cost Plan.** Quote every generation.

### 6.9.4 Approval (v1 §46)

Before execution the user sees per-shot image/video costs, expected total, maximum reserved, balance and expected remaining, e.g.:

```text
Production: 15s Product Launch
Shots: 4

Shot 1: Image 140 credits / Video 520 credits
Shot 2: Image reuse Shot 1 final frame / Video 520 credits
Shot 3: Image 140 credits / Video 520 credits
Shot 4: Image 140 credits / Video 520 credits

Expected total: 2,500 credits
Maximum reserved: 2,900 credits

Balance: 6,200
Expected remaining: 3,700
```

Actions: edit plan; choose Economy; choose Balanced; choose Premium; change model per shot; approve. Tiered cost options are normative in Appendix W.

### 6.9.5 Pipeline state (v1 §47)

```text
draft
planning
awaiting_approval
quoted
queued
generating_images
generating_video
generating_audio
quality_check
assembling
completed
paused
failed
cancelled
```

Persist all state. Every Director run MUST be persistent and resumable (rule 42).

### 6.9.6 Shot reruns (v1 §48)

The user can rerun: image only; video only; audio only; prompt polish only. Do not rerun other shots (rule 44). After rerun: optionally reassemble final.

### 6.9.7 Continuity (v1 §49)

Track: character identity; outfit; product identity; environment; lighting; time; screen direction; previous ending frame; next frame; camera language. Continuity metadata is stored with each shot.

### 6.9.8 Dashboard (v1 §50)

Show: overall progress; total planned credits; actual credits; planning passes; shots; image prompt; video prompt; references; model; seed; output; quality score; rerun controls; reassemble. Basic users see a simplified view; advanced users can inspect planning details.

### 6.9.9 Director service boundaries (v1 §132)

Exact Maestro behavior replication in original code (Section 1.5). Responsibilities (must match Maestro exactly): planning (same multi-pass planning logic, same pass order, same prompts); shot schema (identical to Maestro ShotPlan); continuity (identical continuity rules); prompt drafts (identical prompt templates and guide content); plan validation (identical validation rules); cost operation list (identical operation enumeration).

It does NOT: directly debit credits; directly call arbitrary providers; own user authentication; permanently store billing. Platform API owns commercial state.

### 6.9.10 Director execution (v1 §133)

A Director plan produces executable operations, e.g.:

```json
[
  { "shotId": "s1", "operation": "image.generate", "routeKey": "image.premium", "params": {} },
  { "shotId": "s1", "operation": "video.image_to_video", "routeKey": "video.standard", "dependsOn": ["s1-image"] }
]
```

The platform quotes operations.

### 6.9.11 Assembly (v1 §134)

Can initially be part of the worker. Responsibilities: join video clips; preserve audio; normalize resolution/fps; final encoding; thumbnails. Use FFmpeg.

**Current state (6.9 overall):** a Helmies-native Director exists (`director-planner.js`: `createProductionPlan`, prompt policies, shot validation, cost estimation, section visual strategies, production type presets; `director-executor.js`: state machine with `PIPELINE_STATES`/`SHOT_STATES`/`VALID_TRANSITIONS`, execute/rerun/cancel/list; `/api/director/plan|execute|rerun|status`; `video-assembly.js` FFmpeg assembly; `DirectorWorkspace.js` UI). Maestro-exact behavioral equivalence is NOT STARTED (Section 1.5). Completion checklist: Appendix AP.

## 6.10 Influencer Studio (v1 §54, preserved)

Upgrade from one-time prompt builder to persistent personas. Persona: face description; body description; style; wardrobe; personality; reference assets; Brand Kit; content presets. Outputs: consistent photos; social templates; videos through Video Studio; reusable references. **Current state:** `/studio/influencer` exists as a prompt-builder tool (INFLUENCER_TABS, MARKETING_AVATARS in `lib/models.js`); persistent persona entities NOT STARTED.

## 6.11 Workflows (v1 §55, preserved)

Recommended node types:

```text
INPUT
TEXT_LLM
ANALYZE_IMAGE
PROMPT_COMPILE
GENERATE_IMAGE
EDIT_IMAGE
GENERATE_VIDEO
TTS
MUSIC
LIPSYNC
RECAST
DIRECTOR_PLAN
QUALITY_CHECK
CONDITION
LOOP
MERGE
EXPORT
```

Workflow nodes use the Model Gateway. The workflow MUST calculate maximum estimated credits before execution. **Current state:** `Workflow`/`WorkflowRun` + builder UI + `/api/workflows`, `/api/workflows/[id]/run`, `/api/workflows/[id]/regen` exist; nodes call generation functions directly; preflight max-cost display PARTIAL.

## 6.12 Brand Kits (workspace)

Brand Kit is reusable creative memory (Section 7.6 defines the intelligence side; this section defines the workspace). The workspace MUST support: create; name; description; website; primary/alternate logos; colors; font uploads; typography roles; voice/tone; slogans; products; packaging; visual references; negative references; image analysis; palette extraction; style fingerprint; enforcement mode; preview; use in Image Studio, Video Studio, Agent and Director. Completion checklist: Appendix AO. **Current state:** `BrandKitsView.js` + `/api/brand-kits` CRUD + `/api/brand-kits/fingerprint` exist; generation-handler brand context injection exists; Video/Agent/Director integration PARTIAL.

## 6.13 Projects (v1 §39, preserved)

A Project groups: conversations; assets; Brand Kit; Canvases; workflows; Director pipelines; generations; notes; deliverables. Example: `Babylon Summer Campaign`. The Agent can scope itself to one Project. **Current state:** `Project` model + usage in workflows exist; grouping UI NOT STARTED; the studio "Projects" tab currently surfaces `ProjectMemory`.

## 6.14 Assets (v1 §40, preserved)

Every upload/generated output becomes an Asset (rule 37). An Asset contains: owner; project; type; source; model; generation; dimensions; duration; prompt metadata; cost; visual analysis; storage key; lineage; favorites; tags.

Actions: Open; Add to Canvas; Use as reference; Edit; Animate; Lip Sync; Recast; Analyze; Add to Brand Kit; Save to project; Download; Delete.

Storage and lineage rules are defined in Section 2.7.6. **Current state:** `AssetLibrary.js` + `/api/assets` exist; upload and `handleGeneration` outputs create Assets; tags/cost/project fields PARTIAL.

## 6.15 Templates (v1 §84, preserved)

Reusable templates: Instagram product; UGC ad; cinematic product; YouTube thumbnail; talking head; product hero; story reel. A template stores normalized settings, not a provider-specific request. **Current state:** NOT STARTED (workflow `isTemplate` flag exists).

## 6.16 Studio history, result actions, compare mode (v1 §§169–171, preserved)

Every Studio: current session; persistent history; filters; model; cost; status; rerun; reuse settings; send to another Studio.

Result actions — Image: edit; Canvas; animate; download; Brand Kit; project. Video: extend; retake; lipsync; recast; Director; download.

Compare mode: side-by-side; swipe; overlay for images. Useful for models, prompts, Brand consistency. **Current state:** `/gallery` generations history and `BeforeAfterSlider` exist; cross-tool "send to", compare mode and reuse-settings deep links PARTIAL.

---

# 7. Prompt & Vision Intelligence

## 7.1 Prompt Intelligence Engine (v1 §26, preserved)

Prompt quality is a platform capability. Pipeline:

```text
RAW INTENT
    ↓
INTENT NORMALIZER
    ↓
PROJECT / BRAND / VISUAL / CANVAS CONTEXT
    ↓
CREATIVE EXPANSION
    ↓
MODEL DIALECT COMPILER
    ↓
DETERMINISTIC VALIDATOR
    ↓
OPTIONAL QUALITY POLISH
    ↓
FINAL PROVIDER REQUEST
```

**Current state:** IMPLEMENTED as `src/lib/prompt-engine/` (`normalizer`, `enricher`, `expander`, `dialect-compiler`, `validator`, `polish`, `index`) with `PromptCompilation` persistence and `/api/prompt/compile`; `handleGeneration` runs it with fallback to the legacy single-pass `expandPrompt`.

## 7.2 Prompt passes (v1 §§27–32, preserved)

- **Pass 0 — Intent Normalization.** Extract: goal; subject; action; environment; style; camera; mood; platform; aspect; exact text; immutable facts; references; negative constraints. Produce structured JSON.
- **Pass 1 — Context Enrichment.** Add relevant: Brand Kit; project; visual analysis; Canvas; character/persona; previous approved asset references. Do not include unrelated project data.
- **Pass 2 — Creative Expansion.** Add useful detail. Never silently alter immutable facts: product name; exact slogan; exact count of people; logo; specified colors; supplied identity.
- **Pass 3 — Model Dialect.** Use model-specific guidance: descriptive prose; concise tag structure; video action-camera-environment order; reference-ID syntax; first/last-frame semantics; duration-specific prompt windows. The Prompt Guide Registry stores versions.
- **Pass 4 — Deterministic Validation.** Validate: prompt length; unsupported parameters; reference count; required reference; duration; resolution; aspect; exact text compatibility; mask dimensions; conflicting controls; provider-specific constraints. Do not use an LLM alone for deterministic validation.
- **Pass 5 — Optional Premium Polish.** Modes: Off; Fast; Balanced; Premium. For expensive jobs an additional LLM can review final prompt quality. Admin controls the model route.

The compiler reference pseudocode is normative in Appendix AU-1 (Section 12.5.1). The structured output shape is normative in Appendix Q.

## 7.3 Prompt Inspector (v1 §33, preserved)

Advanced users can open: Raw Intent; Normalized Intent; Brand Context; Visual Context; Canvas Context; Prompt Guide; Final Prompt; Negative Prompt; Normalized Request. They may edit the final prompt before generation. Store both raw and compiled versions.

## 7.4 Prompt Guide Registry (v1 §34, preserved)

Entities: PromptGuide; PromptGuideVersion; PromptRoute. Guide categories:

```text
image/base
image/product
image/portrait
image/poster
image/brand
video/base
video/cinematic
video/ugc
video/music-video
video/dialogue
audio/tts
audio/music
model/<model-id>
```

Admin: create; edit; diff; activate; rollback; benchmark. Every generation records guide versions. Storage example: Appendix AH. **Current state:** `PromptGuide`/`PromptGuideVersion` (per-model keying) + `/api/admin/prompt-guides` exist; diff/benchmark/activate/rollback UI PARTIAL.

## 7.5 Visual Intelligence — Helmies Vision (v1 §24, preserved)

Create an internal service: **Helmies Vision**. It independently implements the useful behavior seen in `image-to-prompt`.

Input: one or multiple images. Output:

```json
{
  "caption": "...",
  "background": "...",
  "palette": ["#111111", "#D9B86E"],
  "composition": {},
  "lighting": {},
  "camera": {},
  "subjects": [],
  "objects": [],
  "textRegions": [],
  "regions": [],
  "style": {},
  "structuredPrompt": {}
}
```

Use cases: reference analysis; image-to-prompt; Brand Kit onboarding; Canvas interpretation; OCR; palette extraction; quality comparison; style fingerprinting. The typed contract is normative in Appendix S.

## 7.6 Vision provider interface (v1 §25, preserved)

Do not permanently tie the product to Florence-2:

```ts
interface VisionAnalyzer {
  analyzeImage(input: AnalyzeImageInput): Promise<VisualAnalysis>
  compareImages(input: CompareImagesInput): Promise<VisualComparison>
}
```

Possible implementations: local Florence-compatible service; cloud multimodal LLM; future specialized visual-analysis model. Admin selects routes. **Current state:** `src/lib/visual-intelligence.js` implements analysis via KIE's OpenAI-compatible multimodal endpoint with `VisualAnalysis` caching keyed by URL; no `VisionAnalyzer` interface, no compare route, no separate deployable service (Section 9.8).

## 7.7 Brand Kit intelligence (v1 §§35–38, preserved)

Brand Kit fields: brand name; description; website; logo variants; logo safe area; forbidden logo usage; primary colors; secondary colors; typography; uploaded font files; type hierarchy; photography style; illustration style; tone of voice; slogans; product images; packaging; previous content; desired references; negative references; audience; platform preferences.

Brand upload intelligence — when a user uploads references: run visual analysis; extract palette; detect layout tendencies; inspect typography; extract text; derive visual fingerprint. Logo: transparent preview; dimensions; dominant colors; padding. Fonts: validate; secure storage; never expose globally.

Brand fingerprint example (normative shape):

```json
{
  "palette": {
    "primary": ["#0D0D0D", "#D5B56D"],
    "secondary": ["#F4EFE6"]
  },
  "visual": {
    "contrast": "high",
    "lighting": "warm directional",
    "composition": "minimal centered",
    "texture": "premium matte"
  },
  "typography": {
    "heading": "Brand Heading",
    "body": "Brand Body",
    "case": "mixed"
  },
  "avoid": ["neon rainbow backgrounds", "cartoon style"]
}
```

Brand enforcement modes: Off; Suggest; Strong; Locked. Locked mode: preserve logo rules; enforce brand palette where technically possible; use selected fonts for Canvas/text rendering; require confirmation for conflicts.

Brand Kit context MUST be reusable by Agent, Studios, Workflows and Director (rule 40). Do not dump entire Brand Kits into prompts when only a subset is relevant (rule 41).

---

# 8. Admin Control Plane

## 8.1 Admin Panel V2 navigation (v1 §99, preserved)

```text
Overview

BUSINESS
    Revenue
    Plans
    Credit Packs
    Promo Codes
    Pricing
    Margin Advisor

AI PLATFORM
    Models
    Routes
    Providers
    Prompt Guides
    Quality
    Generations
    Director

USERS
    Users
    Teams
    API Keys
    Refunds

CONTENT
    Website Content
    Announcements
    Templates
    Brand Examples

OPERATIONS
    Jobs
    Provider Health
    Feature Flags
    Audit Logs
    System
```

**Current state:** `/admin` + `AdminShell` implements Overview; Business (Revenue, Plans, Credit Packs, Promo Codes, Pricing, Margin Advisor); AI Platform (Models, Routes, Providers, Prompt Guides, Quality, Generations, Director); Users; Content (Website Content, Announcements); Operations (Jobs, Provider Health, Feature Flags, Audit Logs). Teams, Templates, Brand Examples, System subs NOT STARTED; several subs are placeholders backed by the generic APIs in Section 8.12.

## 8.2 Overview dashboard (v1 §100, preserved)

Cards: users; paid users; MRR; ARR estimate; today revenue; today provider cost; gross AI margin; credits sold; credits consumed; generations; success rate; refunds; active jobs.

Charts: revenue vs AI COGS; margin; model spend; tool usage; plan distribution; conversion; churn; provider failures. **Current state:** `OverviewDashboard` + `/api/admin/analytics` exist with a subset of these metrics.

## 8.3 Users administration (v1 §101, preserved)

Admin can: search; view profile; view subscription; view wallet; view usage; view jobs; view refunds; view promo redemptions; grant credits; remove credits with validation; suspend generation; suspend API; suspend account; force logout; reset role; initiate data export/deletion workflow. Every sensitive action requires a reason and an audit row. **Current state:** `/api/admin/users` (list, credit adjustment, role change, audit) exists; suspension/force-logout/data-export NOT STARTED.

## 8.4 Models administration (v1 §102, preserved)

Admin can: create model; edit; disable; hide; mark beta; mark recommended; choose provider; set capability; edit input schema; edit UI schema; define limits; set plan access; set prompt guide; configure pricing; assign routes; set priority; set timeout; set retries; run smoke test. Raw JSON editing can exist in an advanced admin view; the normal admin form SHOULD validate schema. **Current state:** `ModelManager` + `/api/admin/models` (ModelPricing CRUD + test) exist; schema/route editors NOT STARTED.

## 8.5 Providers administration (v1 §103, preserved)

Display: name; enabled; endpoint; region; secret configured/not configured; health; latency; success; 429; spend. Actions: disable; maintenance; rotate secret reference; change URL; update limits; test. Never display the secret after creation. **Current state:** `/api/admin/providers` + `/api/admin/provider-health` exist; keys are stored and returnable in plaintext (Section 9.6 violation).

## 8.6 Routes administration (v1 §104, preserved)

Route display example:

```text
image.standard

1. Model A — priority 10 — healthy
2. Model B — priority 20 — healthy
3. Model C — priority 30 — degraded
```

Admin can reorder. Conditions: plan; quality mode; reference support; max cost; region. **Current state:** Routes sub-tab exists as UI; no `ModelRoute` backend (Section 3.4.4).

## 8.7 Prompt Guides administration (v1 §105, preserved)

Features: list; edit; version; compare; benchmark; activate; rollback. Do not mutate a production guide with no history. **Current state:** `/api/admin/prompt-guides` CRUD exists.

## 8.8 CMS and announcements (v1 §§108–110, 158–159, preserved)

Do not build an unrestricted page builder. Editable approved keys:

```text
landing.hero.subtitle
landing.hero.cta_primary
landing.hero.cta_secondary
landing.image.description
landing.video.description
landing.lipsync.description
landing.pricing.title
landing.pricing.subtitle
landing.footer.tagline
pricing.faq.*
```

Code provides safe defaults; CMS overrides. CMS workflow (v1 §§109, 209): edit field; preview; save draft; publish; revision snapshot created; cache invalidated; audit logged; rollback available. Do not inject raw arbitrary HTML without sanitization. Website CMS safety: do not allow CMS to edit JavaScript, arbitrary React, route paths, or sensitive HTML. Allowed: strings; safe rich text; URLs; labels; selected media IDs. Admin can preview unpublished revisions using a signed preview token; public users only see the published revision.

Announcement bar fields: message; style; link; CTA; start; end; audience; locale; dismissible; priority. Visible in landing and Studio; use the same public API. **Current state:** `CmsEditor` + `/api/admin/cms-content` (+ publish) and `/api/admin/announcements` + public `/api/announcements` + `AnnouncementBar` exist; approved-key allowlist, preview tokens and sanitization rules PARTIAL.

## 8.9 Generations, Director and Jobs administration (v1 §§106–107, preserved)

Generations filters: user; model; provider; capability; project; Agent/Studio/Workflow/Director source; status; date; credits; provider cost. Display: job timeline; quote; actual; safe error; assets; retries. Actions: retry where safe; cancel; refund; mark incident.

Director admin: active pipelines; failed shots; total spend; average shots; pipeline duration; repairs; cost. Admin can cancel abusive/stuck jobs. **Current state:** `/api/admin/jobs`, `/api/admin/refunds` exist; filtering/timeline UI PARTIAL.

## 8.10 Admin Advisor (v1 §§111–114, 206, preserved)

The Admin Advisor is a business control assistant. It can answer: "Can I run 40% off Pro for three months?" / "Which models have the worst margins?" / "Should I raise video credit prices?" / "What is the expected cost if users use 80% of included credits?" / "Which plan has the highest AI COGS ratio?"

Architecture:

```text
Admin Question
    ↓
Advisor Agent
    ↓
Deterministic Finance Tools
    ↓
Aggregated Business Data
    ↓
Explanation
```

Never let the LLM invent cost numbers (rule 48–49). Calculator tools (normative):

```text
advisor.calculate_plan_margin
advisor.simulate_promo
advisor.compare_model_profitability
advisor.project_usage
advisor.calculate_break_even
advisor.calculate_credit_pack_margin
advisor.detect_cost_anomaly
```

Tool output is authoritative. Advisor inputs: plan revenue; average credit usage; p50/p90/p100 usage scenarios; historical model mix; provider costs; infra reserve; payment fees; refunds; promo; tax assumptions if configured. The Advisor MUST clearly distinguish observed data, configured assumptions and model forecast. Warning levels: Info; Caution; High Risk — e.g. "High Risk: At 100% included-credit utilization, this plan loses approximately €4.20/user/month under the current model mix." The Advisor system prompt is normative in Appendix P; the explain-don't-compute pseudocode in Section 12.5.5. **Current state:** NOT STARTED (Margin Advisor sub-tab is a placeholder).

## 8.11 Admin roles (v1 §115, preserved)

Recommended roles: `super_admin`, `finance_admin`, `support_admin`, `ai_ops`, `content_admin`. Least privilege. Examples: content admin cannot view provider secrets; support admin cannot change pricing; finance admin cannot modify prompt guides; ai_ops cannot issue large credit grants without permission. **Current state:** single `User.role = "admin"` gate; role granularity NOT STARTED.

## 8.12 Admin API surface

The target Admin API matrix is normative in Appendix Y. **Current state:** implemented admin routes are `/api/admin/{analytics, announcements, audit, cms-content, cms-content/publish, credit-packs, flags, jobs, keys, models, plans, pricing, pricing/sync, promos, prompt-guides, provider-health, providers, refunds, sync/kie, users}` — all gated by `requireAdmin` (role === "admin").

## 8.13 Business aggregations (v1 §151, preserved)

Create daily aggregate tables/jobs:

```text
provider_model_daily
capability_daily
plan_daily
user_cost_daily
promo_daily
```

Avoid recalculating whole history for every dashboard request. **Current state:** NOT STARTED.

## 8.14 Abuse signals (v1 §176, preserved)

Monitor: free account loops; repeated failures; refund abuse; API bursts; suspicious uploads. Admin sees signals. **Current state:** `detectAbuse` in `lib/security.js` implements volume/failure/refund thresholds; no admin surfacing.

---

# 9. Infrastructure, Security, Observability

## 9.1 Deployment topology (v1 §121, preserved)

Recommended services:

```yaml
services:
  gateway:
  landing:
  studio-web:
  agent-api:
  platform-api:
  worker:
  director-service:
  vision-service:
  postgres:
  redis:
  meilisearch:
```

Object storage can be external. Compose skeleton: Appendix AA. **Current state:** single Next.js 16 app on one Node host; no Docker artifacts in the repo. The `mongodb` service from v1 is removed (Section 9.3.1).

## 9.2 Gateway / reverse proxy (v1 §122, preserved)

Responsibilities: route root to landing; route `/studio` to Studio client; API routing; streaming; WebSockets; headers; compression; TLS termination if appropriate; body size limits; request IDs. **Current state:** not present; Next.js serves everything directly behind the host reverse proxy.

## 9.3 Datastores (v1 §123, amended)

Postgres owns: users/identity; billing; credits; pricing; providers; models; jobs; assets; projects; Brand Kits; Canvas; Director; CMS; admin; agent runtime entities (AgentRun, conversations when built).

### 9.3.1 MongoDB requirement — SUPERSEDED

v1 §§90(2), 121, 123, 192–194 and Appendix AW carried MongoDB for "conversations, agents, messages, runtime entities, skills/MCP data" because that persistence belonged to the now-abandoned `helmies-agent` runtime. **Superseded by decision:** no MongoDB exists in the current codebase, and new agent-runtime persistence MUST be built on Postgres models in this repository (Prisma), consistent with the single-foundation rule (Section 1.1). If a future runtime component genuinely needs a document store, reintroduce it deliberately with its own migration plan. Do not silently resurrect the Mongo requirement.

Do not rewrite mature Helmies Studio persistence unnecessarily.

## 9.4 Redis, queues and workers (v1 §§124–129, preserved)

Redis uses: BullMQ or equivalent; distributed locks; rate limits; job events; provider circuit state; cache; Agent reconnect/background mechanisms. Money remains Postgres source of truth.

Recommended queues:

```text
generation:image
generation:video
generation:audio
generation:lipsync
generation:recast
vision
quality
storage
director
assembly
notification
```

Priorities: paid interactive; free interactive; background; batch.

Provider execution worker: loads job; validates reservation; resolves provider/model; compiles provider request; submits; stores provider request ID; polls/webhook; ingests output; quality check; usage record; settlement; notify.

Retry policy classification: validation error → no retry; auth error → incident, no blind retry; 429 → delayed retry/fallback; 5xx → retry; timeout before provider acceptance → retry; unknown acceptance → query provider before duplicating. Never double-generate expensive jobs accidentally.

Provider fallback allowed only if: capability same; required inputs supported; output semantics compatible; price does not exceed approved maximum; user plan allows; prompt adapter available. Otherwise ask for new approval/choice.

Circuit breaker: track rolling success, 429, 5xx, timeout, latency. When unhealthy: lower route; open circuit; alert Admin. Provider health workflow (v1 §210): metrics detect failure spike → provider status degraded → route priority adjusted automatically if configured → Admin alert → Agent/manual users receive safe fallback → no raw provider error shown.

**Current state:** NOT STARTED — no Redis, no queues, no workers. Generation runs in-request with a polling loop (`submitAndPoll`, up to 900 attempts × ~2s) or fire-and-forget with provider webhooks; fallback is a static `["wavespeed", "kie"]` chain without eligibility checks; no circuit breaker.

## 9.5 Media storage and delivery

### 9.5.1 Logical prefixes (v1 §135)

```text
users/<userId>/uploads/<assetId>
users/<userId>/projects/<projectId>/<assetId>
jobs/<jobId>/temp/*
brands/<brandKitId>/<assetId>
director/<pipelineId>/<shotId>/*
```

Private by default. **Current state:** media is written to the local filesystem under `public/media` and `public/uploads` and served publicly; no object storage, no per-user prefixes.

### 9.5.2 Signed URLs (v1 §136)

Browser uploads/downloads use short-lived signed URLs; ownership is validated before signing. Do not use permanent public bucket URLs for private user assets. **Current state:** NOT STARTED.

### 9.5.3 Upload security (v1 §137)

Validate: file size; content type; actual decodability; dimensions; video duration; allowed extensions; malicious payload. Strip unnecessary EXIF where appropriate. **Current state:** `/api/upload` performs no size/MIME/decodability validation; `media-storage.js` strips JPEG EXIF and PNG metadata chunks on ingest (partial).

### 9.5.4 SSRF (v1 §138)

Critical because the system fetches provider result URLs, remote assets and MCP URLs. Implement: domain allowlist for providers; IP/private-network blocking; redirect revalidation; size limits; content type validation. Reuse mature SSRF protections already present where possible. **Current state:** VIOLATED — `/api/media/proxy` fetches arbitrary http(s) URLs unauthenticated; its `PROVIDER_DOMAINS` allowlist is declared but never enforced, and it sets `Access-Control-Allow-Origin: *`. `storeMedia` fetches provider URLs without host validation.

## 9.6 Provider secrets (v1 §139, preserved)

Use: Docker secrets; cloud secret manager; Vault-style solution. DB stores `secretRef`. Admin sees configured/not configured. Never: show the actual secret; send the secret to a browser; log the secret. Rules 17–20 apply: no private provider key reaches the browser or model context; no new provider secret is stored plaintext; existing plaintext credentials MUST be migrated (Appendix AK). **Current state:** VIOLATED — `ProviderConfig.apiKey` is plaintext in Postgres; provider keys otherwise live in `.env`; `ssh.md` (plaintext server credentials) is tracked in git and MUST be removed from tracking with credentials rotated (Section 12.1, Phase 0).

## 9.7 Observability (v1 §§140–142, preserved)

Structured events include: request ID; platform user ID; job ID; parent job; capability; model; provider; quote ID; latency; status; credits; provider cost; safe error.

Metrics: requests; successful jobs; failed jobs; provider cost; retail credits; gross margin; p50/p95 latency; provider 429; queue depth; job age; Director completion; Canvas compilation; quote abandonment.

Cost anomaly detection alerts if: provider cost suddenly exceeds configured expected; average video cost spikes; retries spike; provider response changes; margin falls below threshold. **Current state:** console logging + `AuditLog` + `ProviderIncident` only.

## 9.8 Vision and Director service deployment (v1 §§130–131, preserved)

Vision internal API:

```text
POST /analyze
POST /analyze-batch
POST /compare
POST /ocr
POST /palette
```

The platform API owns user authentication and asset ownership; the internal Vision service receives controlled files/URLs only. MVP MAY use a cloud multimodal route for simplicity; a local Florence-compatible analyzer is optional. The provider interface keeps it replaceable. **Current state:** in-process module only (Section 7.6).

## 9.9 Web security and privacy (v1 §§174–180, preserved)

API access: Pro/API users can use the normalized Helmies API. API keys: hashed; prefix; scopes; last used; rate limits. Same Gateway and wallet. **Current state:** `ApiKey` (sha256 hash, prefix, lastUsedAt) + `/api/user/keys` + `authenticateApiKey` exist; scopes NOT STARTED.

Rate limiting by: user; plan; API key; capability; IP for auth/public. Generation concurrency also enforced. **Current state:** `RateLimit` table + per-endpoint windows in `lib/security.js`; `/api/auth/register` has in-memory per-IP limiting; no plan/API-key/concurrency dimensions.

Security headers at edge: HSTS; CSP; Permissions-Policy; Referrer-Policy; X-Content-Type-Options; frame policy. Ensure media workers/canvas are compatible. **Current state:** middleware sets `X-Frame-Options` and `X-Content-Type-Options` on protected paths only; the rest NOT STARTED.

User data controls: delete asset; delete project; clear Agent memory; delete account; export data; revoke API key; logout sessions. **Current state:** asset/project delete + API-key revoke exist; the rest NOT STARTED.

Logging privacy: do not log provider keys, OAuth tokens, passwords, card details, private asset bytes. Raw prompts can exist in the protected generation DB, not indiscriminate logs.

Analytics: track Studio opened; Agent plan created; quote shown; quote confirmed; quote abandoned; generation completed; generation failed; Canvas used; Brand Kit used; Director completed; subscription; topup; promo. Do not send raw prompt text to marketing analytics by default.

## 9.10 Provider diagnostics and contract tests (v1 §§143–144, preserved)

The Admin diagnostics screen MUST solve broken-generation/LLM problems. Tests: auth; chat completion; streaming; image generation; video submission; video status; TTS; storage ingest; webhook/callback; quote. A model cannot be activated until validation passes.

Each provider adapter has contract tests: request fixture; expected provider body; success response; validation error; transient error; async job response. Detect breaking API changes. **Current state:** `ModelManager` has a per-model test action; full diagnostics/contract suites NOT STARTED.

## 9.11 Environments, local development, backups (v1 §§192–194, preserved)

Environments: local; test; staging; production. Separate: Postgres; Redis; storage; Stripe mode; provider keys. (Mongo removed — Section 9.3.1.)

Local Docker SHOULD include: Postgres; Redis; Meilisearch; MinIO; Mailpit; APIs; web. Optional profiles: local vision; local director tooling.

Backups: Postgres daily, PITR if possible; storage versioning/lifecycle per provider; restore tested.

## 9.12 Feature flags (v1 §160, preserved)

Initial flags:

```text
new_studio_shell
model_gateway_v2
pricing_preflight
wallet_v2
image_studio_v2
image_canvas
visual_intelligence
brand_kits
agent_creative_tools
director
admin_v2
promo_codes
cms_content
admin_advisor
```

**Current state:** `FeatureFlag` model + `/api/admin/flags` exist; flags are not systematically consulted by the surfaces above.

---

# 10. UX & Design System

## 10.1 Studio theme (v1 §166, preserved)

The authenticated app should feel: premium; organized; creative; calm; fast; approachable; capable. Do not inherit all current old Studio UI; use the cleaner Agent-style organization as base. Avoid: provider jargon everywhere; giant settings forms; gradients everywhere; excessive glow; cramped UI.

## 10.2 Motion system (v1 §167, preserved)

Central tokens: fast; normal; slow; spring; generation wave; panel slide; result reveal. All motion honors reduced-motion.

## 10.3 Generation UX and loading philosophy (v1 §§69–70, 168, preserved)

Do not show a generic spinner for minutes. Animation should communicate work stage.

Image stages: Understanding; Preparing references; Generating; Quality check; Finalizing. Video stages: Preparing shot; Submitting; Generating; Processing media; Quality check; Finalizing. Agent: animate plan steps / plan graph.

Motion during generation — Image: subtle waves; animated mesh; low-cost shimmer; blurred preview if the provider supports; stage labels. Video: timeline pulse; frame strip; shot progress. Respect `prefers-reduced-motion`; avoid excessive GPU use. Do not fake exact percentage if the provider does not expose it: show stage + indeterminate/probabilistic progress. **Current state:** `StagedProgress` implements staged labels.

## 10.4 Responsive Studio (v1 §85, preserved)

Desktop: multi-pane. Tablet: collapsible settings. Mobile: preview/canvas primary; settings bottom sheet; inspector drawer; fixed composer; model picker sheet. Do not build desktop-only.

## 10.5 Command palette and search (v1 §§86, 172–173, preserved)

Retain/enhance `Ctrl/Cmd + K`. Commands: Ask Agent; Image Studio; Video Studio; Director; open project; open Brand Kit; search assets; view credits; create workflow. Global palette: switch Studio; open Agent; open project; create Brand Kit; find asset; view wallet; create workflow.

Search: conversations; projects; assets; workflows; Brand Kits. Use Meilisearch infrastructure where appropriate (target — Section 9.1). **Current state:** `CommandPalette.js` exists; Meilisearch NOT STARTED.

## 10.6 Icons (v1 §87, preserved)

Use one consistent icon system plus custom Helmies brand icons. Avoid mixed random icon libraries. **Current state:** `react-icons` + custom `components/Icons.js`.

## 10.7 Accessibility (v1 §88, preserved)

Keyboard; focus states; screen-reader labels; reduced motion; contrast; accessible dialogs; Canvas object list for keyboard editing; captions/transcripts where possible.

## 10.8 Low-balance and failure UX (v1 §§211–212, preserved)

If quote exceeds balance:

```text
You need 640 credits.
You have 420.

Options:
- Add credits
- Use Economy model (~310 credits)
- Reduce duration to 3 sec (~390 credits)
```

The Agent can generate alternatives automatically.

Failure UX — bad: `HTTP 422 invalid image_list`. Good: "This model supports a maximum of two reference images, but four are selected." with actions: Keep the first two; Switch to a compatible model. **Current state:** `brandError` maps provider errors to safe branded messages.

## 10.9 History and reproducibility display (v1 §213, preserved)

Each generation detail shows: Studio source; Agent/Workflow/Director source; model; date; credits; prompt; references; project; reuse. Provider wholesale price remains admin-only unless product decides otherwise.

---

# 11. Testing & Acceptance

## 11.1 CI (v1 §182, preserved)

PR pipeline: secret scan; install; lint; TypeScript; unit; Prisma validation; integration; Python tests (if Python services exist); landing build; Studio build; APIs build; Docker build; Playwright smoke. **Current state:** no CI workflows in the repo; `npm run lint` only.

## 11.2 Unit tests (v1 §184, preserved)

Required modules: pricing; margin; promo; wallet; reservation; model eligibility; input validation; adapters; Prompt Compiler; Canvas Compiler; Brand Compiler; Director validator; quality evaluator.

## 11.3 Integration tests (v1 §185, preserved)

Use mocked providers. Test: quote; reserve; submit; provider result; storage; settlement; refund; fallback; idempotency.

## 11.4 End-to-end tests (v1 §§186–190, preserved)

Critical path: login → Studio loads → wallet visible → Image Studio → reference → model → quote → generate → result Asset → correct wallet → open Asset in Canvas → Canvas regenerate → Agent can access result.

Admin E2E: admin edits plan price → publish → landing price changes → checkout uses same product price → audit row exists.

Promo E2E: create promo → advisor warning generated → activate → eligible user redeems → ineligible user rejected → financial effect recorded.

Director E2E: project → Brand Kit → create 15-second ad → plan shots → quote → approve → execute → fail one shot → retry one → reassemble → final asset.

Canvas E2E: upload product → place → add text → add reference → draw mask → autosave → reload → document restores → compile → quote → generate.

## 11.5 Provider smoke tests (v1 §191, preserved)

Before a model is active: credential; request schema; quote; provider request; status; output ingest; quality; settlement.

## 11.6 Landing visual regression (v1 §183, preserved)

Capture: desktop homepage; mobile homepage; pricing section; major service sections. Fail review if unintentional layout change exceeds tolerance. Snapshots MUST exist before migration phases that touch the landing page (Section 1.7).

## 11.7 Critical acceptance tests

Normative in Appendix AS (26-row matrix covering landing, pricing, wallet, quote, idempotency, schemas, fallback, storage, Canvas, Brand, Vision, Agent, Workflow, Director, Promo, CMS, audit, security, ownership, wallet race).

## 11.8 Definition of Done (v1 §214, preserved in full — hard completion gate)

The project is complete only when all of the following are true.

### Public Website
- [ ] current landing visual design preserved.
- [ ] dynamic plans.
- [ ] dynamic CMS.
- [ ] announcements.
- [ ] correct auth links.
- [ ] public model counts.

### Auth
- [ ] one user identity experience.
- [ ] Agent runtime mapped to platform user.

### Wallet
- [ ] one wallet.
- [ ] ledger.
- [ ] reservations.
- [ ] refunds.
- [ ] no negative balance.

### Model Platform
- [ ] model registry.
- [ ] input schemas.
- [ ] UI schemas.
- [ ] provider adapters.
- [ ] price rules.
- [ ] model routes.
- [ ] health.

### Agent
- [ ] one Master Agent.
- [ ] creative subagents.
- [ ] first-party creative tools.
- [ ] cost plan.
- [ ] user approval.
- [ ] persistent jobs.
- [ ] results as Assets.

### Image Studio
- [ ] native final UI.
- [ ] T2I.
- [ ] I2I.
- [ ] references.
- [ ] edit.
- [ ] inpaint/outpaint where supported.
- [ ] Canvas.
- [ ] prompt engine.
- [ ] history.
- [ ] pricing.

### Canvas
- [ ] editable objects.
- [ ] images.
- [ ] text.
- [ ] shapes.
- [ ] free draw.
- [ ] masks.
- [ ] semantic roles.
- [ ] persistence.
- [ ] versions.
- [ ] compiler.
- [ ] quote/generation.

### Vision
- [ ] reference analysis.
- [ ] palette.
- [ ] OCR/text regions.
- [ ] objects/regions.
- [ ] structured output.

### Brand
- [ ] Brand Kits.
- [ ] logos.
- [ ] fonts.
- [ ] colors.
- [ ] references.
- [ ] fingerprint.
- [ ] enforcement modes.
- [ ] Agent/Studio/Director integration.

### Video
- [ ] manual Video Studio.
- [ ] provider model schemas.
- [ ] async jobs.
- [ ] pricing.

### Audio
- [ ] TTS.
- [ ] music.
- [ ] ASR if configured.

### Lip Sync
- [ ] working.

### Recast
- [ ] working.

### Influencer
- [ ] persistent persona capabilities.

### Workflows
- [ ] Gateway-backed.
- [ ] quoted.
- [ ] durable.

### Director
- [ ] Maestro-exact behavior replication (original code).
- [ ] ProductionPlan.
- [ ] ShotPlan.
- [ ] multi-pass prompts (same passes/order/content as Maestro).
- [ ] persistent pipeline.
- [ ] quote.
- [ ] shot reruns.
- [ ] reassembly.
- [ ] dashboard.

### Assets/Projects
- [ ] central Assets.
- [ ] Projects.
- [ ] lineage.
- [ ] search.

### Admin
- [ ] dashboard.
- [ ] users.
- [ ] plans.
- [ ] credit packs.
- [ ] promo codes.
- [ ] pricing.
- [ ] providers.
- [ ] models.
- [ ] routes.
- [ ] prompt guides.
- [ ] generations.
- [ ] jobs.
- [ ] quality.
- [ ] CMS.
- [ ] announcements.
- [ ] advisor.
- [ ] audit.
- [ ] feature flags.

### Infrastructure
- [ ] Docker.
- [ ] Postgres.
- [ ] Redis.
- [ ] queues.
- [ ] storage.
- [ ] backups.
- [ ] monitoring.
- [ ] provider diagnostics.

### Quality
- [ ] CI.
- [ ] unit.
- [ ] integration.
- [ ] E2E.
- [ ] visual regression.
- [ ] no broken LLM.
- [ ] no broken primary generation.
- [ ] no dead required controls.

---

# 12. Phased Execution Plan

## 12.1 Production migration phases (v1 §195, preserved; checkboxes MUST only be checked after implementation AND verification)

### Phase 0 — Safety
- [ ] backup Postgres.
- [ ] export Stripe mapping.
- [ ] inventory providers.
- [ ] inventory current environment.
- [ ] remove `ssh.md` from git tracking and rotate the exposed server credentials (Section 9.6).
- [ ] create migration branch.
- [ ] run current tests/build.

Acceptance: backups verified; baseline recorded. (v1's "backup Mongo" item is NOT_APPLICABLE — Section 9.3.1.)

### Phase 1 — Repository Shell
- [ ] base on `helmies-studio` (single repo).
- [ ] add landing app.
- [ ] route `/`.
- [ ] route `/studio`.
- [ ] preserve homepage.
- [ ] visual regression.

Acceptance: homepage unchanged; authenticated Studio UI works at `/studio`.

### Phase 2 — Identity
- [ ] unified Helmies Studio auth/user store.
- [ ] shared login.
- [ ] one wallet display.

Acceptance: one login experience; commercial user resolved from Studio session. **Current state:** largely satisfied — NextAuth v5 (Google OAuth + credentials) with JWT sessions, `/login`, `User.role`, wallet mirror (Section 3.5 caveats).

### Phase 3 — Wallet V2
- [ ] CreditWallet.
- [ ] CreditLedger.
- [ ] CreditReservation.
- [ ] migration.
- [ ] compatibility mirror.
- [ ] resolve Section 3.5 mismatches #1 and #2.

Acceptance: balances identical to old system; reservation tests pass.

### Phase 4 — Model Registry
- [ ] AiProvider.
- [ ] AiModel.
- [ ] AiModelPrice.
- [ ] ModelRoute.
- [ ] seed importer from current model lists (Appendix AJ).
- [ ] admin model view.

Acceptance: all current production models represented.

### Phase 5 — Pricing Engine
- [ ] strategies.
- [ ] quote endpoint.
- [ ] credit calculation.
- [ ] margin config.
- [ ] plan entitlements.

Acceptance: quote matches known current models.

### Phase 6 — Job Engine
- [ ] GenerationJob.
- [ ] queues.
- [ ] worker.
- [ ] events.
- [ ] settlement.
- [ ] idempotency.

Acceptance: one image provider works end-to-end.

### Phase 7 — Image Studio V2
- [ ] native Agent UI workspace.
- [ ] dynamic controls.
- [ ] reference uploads.
- [ ] history.
- [ ] Asset output.
- [ ] Prompt Engine.

Acceptance: production image generation reliable.

### Phase 8 — Canvas
- [ ] library spike.
- [ ] document.
- [ ] autosave.
- [ ] objects.
- [ ] mask.
- [ ] compiler.
- [ ] quote/generate.
- [ ] resolve Section 3.5 mismatch #3.

Acceptance: rough composition can produce valid generation request.

### Phase 9 — Vision
- [ ] VisualAnalysis.
- [ ] service.
- [ ] caption.
- [ ] palette.
- [ ] OCR.
- [ ] regions.
- [ ] batch.

Acceptance: reference analysis visible and reusable.

### Phase 10 — Brand Kits
- [ ] schema.
- [ ] UI.
- [ ] logo/font/reference assets.
- [ ] fingerprint.
- [ ] prompt context.

Acceptance: same Brand Kit works in Image Studio and Agent.

### Phase 11 — Agent Creative Tools
- [ ] quote tool.
- [ ] image tool.
- [ ] asset tools.
- [ ] Brand tools.
- [ ] subagents.
- [ ] plan.
- [ ] approval.

Acceptance: Agent creates a priced image task using the same Gateway as Image Studio.

### Phase 12 — Remaining Studios
- [ ] Video.
- [ ] Audio.
- [ ] TTS.
- [ ] Lip Sync.
- [ ] Recast.
- [ ] Influencer.

Acceptance: all current key tools migrated.

### Phase 13 — Workflows
- [ ] normalized nodes.
- [ ] preflight cost.
- [ ] durable runs.

Acceptance: workflow uses same jobs/wallet.

### Phase 14 — Director
- [ ] Maestro-exact planner (original code, identical behavior).
- [ ] ProductionPlan.
- [ ] ShotPlan.
- [ ] prompt passes (same passes/order/content as Maestro).
- [ ] cost.
- [ ] execution.
- [ ] rerun.
- [ ] reassembly.

Acceptance: multi-shot production survives refresh and targeted rerun.

### Phase 15 — Admin V2
- [ ] business dashboard.
- [ ] plans.
- [ ] pricing.
- [ ] promo.
- [ ] models.
- [ ] providers.
- [ ] CMS.
- [ ] alerts.
- [ ] advisor.

Acceptance: commercial configuration no longer requires code deployment.

### Phase 16 — Landing Dynamic Data
- [ ] pricing API.
- [ ] CMS.
- [ ] announcements.
- [ ] model counts.

Acceptance: visual homepage unchanged but business data dynamic.

### Phase 17 — Hardening
- [ ] tests.
- [ ] load.
- [ ] security.
- [ ] backup.
- [ ] monitoring.
- [ ] performance.

### Phase 18 — Legacy Removal
Only after verified parity:
- [ ] remove old Studio UI.
- [ ] retire old Orchestrator.
- [ ] retire direct provider paths.
- [ ] retire old pricing reads.
- [ ] remove compatibility writes.

## 12.2 Source project mappings (v1 §§198–201, preserved)

### 12.2.1 Current Helmies Studio sources

| Source | Treatment |
|---|---|
| Public `src/app/page.js` | Keep as landing source. Change hard-coded plan arrays → public Plan API; manual model counts → public stats; selected editable text → CMS. Do not redesign. |
| Current `/studio` | Do not use as the final shell. Extract logic only. |
| `SimpleMode` | Behavior reference: model settings; upload; prompt; generation; result. Replicate exactly in final shell. |
| `chatModes` | Migration seed for Model Registry, input schemas, UI schemas. Do not keep as long-term authority. |
| `lib/models` | Model inventory seed. |
| `handleGeneration` | Refactor into shared services (Section 2.7.1). |
| `lib/memory` | Migrate ProjectMemory (Section 3.6). |
| `AdminPanel` | Use current functionality as baseline; replace UI/architecture with Admin V2. |

### 12.2.2 Native build scope

Build natively inside Helmies Studio: Agent runtime; conversations; tools; subagents; skills; MCP; auth/security; memory; summarization; context; background jobs; resumability; usage tracking; provider support. Extend Helmies Studio with: commercial identity; wallet; creative tools; workspaces; assets; Brand Kits; Studio navigation; generation artifacts; admin link. Build clean extension points rather than depending on external Agent internals.

### 12.2.3 Maestro concept mapping

Replicate Maestro's exact behavior in original Helmies Studio code (same logic, prompting, schemas, and results — not copied source):

```text
Maestro ProductionPlan        -> Helmies ProductionPlan (identical schema/logic)
Maestro ShotPlan              -> Helmies ShotPlan (identical schema/logic)
Maestro planner passes        -> Helmies Director Planning Passes (same passes, order, and prompts)
Maestro model prompt guides   -> Helmies Prompt Guide Registry (same guide content/logic)
Maestro saved pipeline        -> DirectorPipeline + DirectorShot (identical persistence semantics)
Maestro rerun image           -> shot image rerun (identical rerun semantics)
Maestro rerun video           -> shot video rerun (identical rerun semantics)
Maestro rejoin                -> Assembly worker (identical rejoin/reassembly logic)
Maestro dashboard             -> Director Dashboard (identical dashboard behavior)
Maestro workspaces            -> Projects (identical workspace semantics)
Maestro prompt polish         -> Prompt Intelligence Engine (identical polishing logic/prompts)
```

Do not copy restricted Maestro source code. Reproduce its exact behavior in original code, verified by equivalence tests (Section 1.5).

### 12.2.4 image-to-prompt concept mapping

Independently implement:

```text
scene caption          -> VisualAnalysis.caption
background description -> VisualAnalysis.background
palette                -> VisualAnalysis.palette
object boxes           -> VisualAnalysis.regions
OCR                    -> VisualAnalysis.textRegions
editable zones         -> Canvas regions
structured prompt      -> StructuredVisualPrompt
multi-image queue      -> batch analysis jobs
```

Verify source licensing before any direct code reuse.

## 12.3 Implementation Agent Protocol

This protocol replaces v1 §§196–197 ("Phase Completion Protocol for DeepSeek" / "DeepSeek Must Not Stop Because the Task Is Large"). It is agent-neutral and binding on every implementation agent, human or autonomous.

### 12.3.1 Phase completion protocol

For every phase:

1. inspect the actual repository.
2. list affected files.
3. read current implementations.
4. create a local checklist.
5. implement DB migration first if needed.
6. implement backend.
7. implement tests.
8. implement UI.
9. run formatter/lint.
10. run typecheck.
11. run unit tests.
12. run integration tests.
13. run build.
14. run E2E smoke.
15. fix all errors.
16. document migration status.
17. commit scoped changes.
18. move to next phase.

Do not ask the owner about a decision already made in this specification.

### 12.3.2 Completion discipline

The implementation agent MUST: work phase by phase; keep a progress file; continue until the Definition of Done (Section 11.8); use smaller commits.

The implementation agent MUST NOT: declare the project complete after scaffolding; stop after the first working Studio; leave Director unimplemented; leave Admin buttons fake; defer required billing logic; replace real provider integrations with mock APIs.

## 12.4 Suggested commit sequence

The suggested first 40 commits are normative guidance in Appendix AU.

## 12.5 Reference pseudocode (v1 §§202–206, preserved)

These blocks are normative behavior references; adapt syntax to the real architecture (Section 0.2, rule on equivalent implementation).

### 12.5.1 Prompt compiler (v1 §202)

```ts
async function compilePrompt(input: CompilePromptInput) {
  const model = await modelRegistry.get(input.modelId)

  const project = input.projectId
    ? await projects.getForUser(input.projectId, input.userId)
    : null

  const brand = input.brandKitId
    ? await brandEngine.compileContext(input.brandKitId, input.userId, model.capability)
    : null

  const canvas = input.canvasId
    ? await canvasCompiler.compileForModel(input.canvasId, input.userId, model)
    : null

  const references = await visionService.resolveReferenceContext({
    userId: input.userId,
    assetIds: input.referenceAssetIds,
    model,
  })

  const intent = await intentNormalizer.normalize({
    prompt: input.prompt,
    capability: model.capability,
    immutableFacts: input.immutableFacts,
  })

  const creative = await creativeExpander.expand({
    intent,
    project,
    brand,
    canvas,
    references,
  })

  const dialect = await promptGuideCompiler.compile({
    model,
    creative,
  })

  return deterministicPromptValidator.finalize({
    model,
    compiled: dialect,
    canvas,
    references,
  })
}
```

### 12.5.2 Quote (v1 §203)

```ts
async function quoteGeneration(user, model, params, promoCode) {
  validateModelEligibility(user, model, params)
  validateSchema(model.inputSchema, params)

  const providerCost =
    priceEngine.calculateProviderCost(model, params)

  const adjustedCost =
    overheadEngine.apply(providerCost, model.capability)

  const retail =
    marginEngine.calculateRetail(adjustedCost, user.plan, model)

  const discount =
    promoEngine.calculate(user, retail, promoCode)

  const finalRetail =
    retail.minus(discount.money)

  const credits =
    creditEngine.toCredits(finalRetail)

  return {
    providerCost,
    adjustedCost,
    retail,
    discount,
    credits,
    balance: user.wallet.available,
    balanceAfter: user.wallet.available - credits,
  }
}
```

### 12.5.3 Generation creation (v1 §204)

```ts
async function createGeneration(user, quoteId, clientRequestId) {
  const quote = await quoteService.validateForUser(quoteId, user.id)

  return db.transaction(async tx => {
    const job = await tx.generationJob.create({
      userId: user.id,
      idempotencyKey: clientRequestId,
      status: "reserved",
      quoteSnapshot: quote,
      normalizedRequest: quote.request,
      estimatedCredits: quote.expectedCredits,
      reservedCredits: quote.maximumCredits,
    })

    await walletService.reserve(
      tx,
      user.id,
      quote.maximumCredits,
      job.id
    )

    await queue.enqueue(job.id)

    return job
  })
}
```

### 12.5.4 Settlement (v1 §205)

```ts
async function settleJob(job, actualUsage) {
  const actualProviderCost =
    priceEngine.calculateActual(job.model, actualUsage)

  const actualRetail =
    pricingPolicy.calculateRetailFromSnapshot(
      job.pricingSnapshot,
      actualProviderCost
    )

  const actualCredits =
    creditEngine.toCredits(actualRetail)

  await walletService.settleReservation({
    reservationId: job.reservationId,
    actualCredits,
  })

  await usageService.record(...)
}
```

### 12.5.5 Admin Advisor (v1 §206)

```ts
const scenario = calculator.simulatePromo({
  plan,
  promo,
  utilization: [0.5, 0.8, 1.0],
  historicalModelMix,
  providerCosts,
  paymentFees,
  infraReserve,
})

const explanation = await advisorLLM.explain({
  scenario,
  adminQuestion,
})

return {
  scenario,
  explanation,
}
```

The LLM never computes hidden finance values.

---

# Appendices

# Appendix A — Initial Commercial Data Migration

The current public landing page has the following visible monthly plan seed values:

```text
Free
€0
10 credits/month

Starter
€24/month
500 credits/month

Studio
€49/month
1500 credits/month

Pro
€99/month
5000 credits/month
```

Current yearly display seed:

```text
Starter
€19 displayed monthly
€228 billed yearly

Studio
€39 displayed monthly
€468 billed yearly

Pro
€79 displayed monthly
€948 billed yearly
```

These are **migration seed values**, not permanently hard-coded product decisions. The final Admin panel controls them.

Important inconsistency to resolve explicitly: the current auth create-user event grants `100` signup credits, while the public Free pricing card advertises `10 credits/mo`. Treat these as two separate concepts:

```text
Free plan recurring monthly credits
Signup welcome bonus credits
```

Both must become configurable. Recommended configuration:

```text
PricingPlan.monthlyCredits
SignupCampaign.welcomeCredits
```

Do not assume the signup bonus equals monthly Free credits. **Current state:** the inconsistency is live — 100-credit hard-coded signup grant (Section 4.7) and a separate hard-coded `SUBSCRIPTION_CREDITS` table (`free: 100, starter: 1000, studio: 3000, pro: 10000`) that also diverges from the seed values above.

# Appendix B — Normalized Capability Registry

The initial capability registry MUST include at least:

| Capability | Required Input | Output | Typical Optional Inputs |
|---|---|---|---|
| `image.text_to_image` | prompt | image | aspect, resolution, seed, count |
| `image.image_to_image` | prompt + image | image | strength, seed, size |
| `image.multi_reference` | prompt + references | image | roles, weights |
| `image.edit` | prompt + image | image | mask, strength |
| `image.inpaint` | image + mask + prompt | image | seed |
| `image.outpaint` | image + target area | image | prompt |
| `video.text_to_video` | prompt | video | duration, aspect, resolution |
| `video.image_to_video` | image + prompt | video | duration |
| `video.reference` | refs + prompt | video | duration |
| `video.first_last_frame` | first + last + prompt | video | duration |
| `video.video_to_video` | video + prompt | video | strength |
| `video.extend` | video | video | prompt, seconds |
| `audio.tts` | text + voice | audio | speed, style |
| `audio.music` | prompt | audio | duration, lyrics |
| `audio.sfx` | prompt | audio | duration |
| `speech.asr` | audio | text | language |
| `lipsync.image` | image + audio | video | resolution |
| `lipsync.video` | video + audio | video | resolution |
| `recast.video` | video + identity | video | target, prompt |
| `vision.analyze` | image | JSON | depth |
| `vision.compare` | image A + image B | JSON | comparison focus |
| `llm.orchestrator` | messages | text/tools | model params |
| `llm.prompt_compile` | structured intent | prompt | model ID |
| `llm.quality` | requirements + result | score | rubric |

# Appendix C — Generic Model Schema Example

```json
{
  "id": "provider-x:model-y",
  "displayName": "Model Y",
  "providerId": "provider-x",
  "category": "video",
  "capability": "video.image_to_video",

  "enabled": true,
  "hidden": false,
  "beta": false,

  "inputSchema": {
    "type": "object",
    "required": ["prompt", "image"],
    "properties": {
      "prompt": { "type": "string", "maxLength": 4000 },
      "image": { "type": "asset", "accept": ["image/*"] },
      "durationSec": { "type": "integer", "enum": [5, 10] },
      "aspectRatio": { "type": "string", "enum": ["16:9", "9:16", "1:1"] },
      "resolution": { "type": "string", "enum": ["720p", "1080p"] },
      "seed": { "type": "integer", "minimum": -1 }
    }
  },

  "uiSchema": {
    "prompt": { "control": "prompt-composer", "group": "Main" },
    "image": { "control": "asset-picker", "label": "First Frame", "group": "References" },
    "durationSec": { "control": "segmented", "label": "Duration", "suffix": "s", "group": "Output" },
    "aspectRatio": { "control": "aspect-picker", "group": "Output" },
    "resolution": { "control": "segmented", "group": "Output" },
    "seed": { "control": "seed", "advanced": true, "group": "Advanced" }
  },

  "pricingRule": {
    "strategy": "per_second_resolution",
    "params": { "720p": 0.05, "1080p": 0.075 }
  },

  "limits": { "maxReferenceImages": 1 },

  "promptGuideKey": "video/model-y"
}
```

# Appendix D — Provider Adapter Contract

```ts
export interface ProviderAdapter {
  providerId: string

  validateModelConfig(model: AiModelConfig): Promise<void>

  submit(
    context: ProviderExecutionContext,
    model: AiModelConfig,
    normalizedRequest: NormalizedGenerationRequest
  ): Promise<ProviderSubmitResult>

  getStatus?(
    context: ProviderExecutionContext,
    model: AiModelConfig,
    providerRequestId: string
  ): Promise<ProviderJobStatus>

  cancel?(
    context: ProviderExecutionContext,
    model: AiModelConfig,
    providerRequestId: string
  ): Promise<void>

  normalizeUsage?(
    response: unknown
  ): ProviderUsage
}
```

`ProviderExecutionContext` may contain: secret resolved server-side; timeout; request ID; user internal ID for audit; job ID. It MUST NOT expose secrets to product code.

# Appendix E — Price Strategy Interface

```ts
interface PriceStrategy {
  calculateEstimate(
    model: AiModelWithPrice,
    params: Record<string, unknown>
  ): Money

  calculateActual?(
    model: AiModelWithPrice,
    usage: ProviderUsage
  ): Money
}
```

Strategies:

```text
FixedPriceStrategy
PerImageStrategy
PerMegapixelStrategy
PerSecondStrategy
PerResolutionSecondStrategy
PerCharacterStrategy
PerAudioSecondStrategy
TokenStrategy
TieredStrategy
RestrictedFormulaStrategy
```

# Appendix F — Quote Validity Rules

A quote is invalid if:

- expired.
- belongs to another user.
- model disabled.
- provider disabled.
- plan no longer eligible.
- request changed.
- promo changed/expired.
- price changed outside allowed tolerance.
- insufficient current balance.
- referenced Asset no longer exists.
- reference ownership changed.

For a harmless small provider price update within configured tolerance, the server MAY honor a recent quote. For a material increase, generate a new quote.

# Appendix G — Model Route Examples

```text
llm.orchestrator
    Provider/model A
    Provider/model B fallback

llm.prompt_compile
    fast structured LLM

llm.quality
    multimodal evaluator

vision.analyze
    cloud multimodal
    local Florence-compatible fallback

image.fast
    inexpensive image model

image.standard
    balanced model

image.premium
    highest-quality model

image.text
    strong typography model

image.edit
    image-edit capable model

video.fast
    low-cost/fast video

video.standard
    balanced video

video.premium
    premium video

video.dialogue
    strong speaking/dialogue model

audio.tts
audio.music
lipsync.standard
recast.standard
```

# Appendix H — System Prompt: Master Creative Agent

Use this as the conceptual baseline. Adapt to the exact Helmies Studio runtime and safety envelope.

```text
You are the Helmies Studio Master Creative Agent.

ROLE
You are a senior creative producer, creative director, production planner and AI-tool orchestrator inside Helmies Studio.

Your goal is to help the user turn an idea into a finished creative deliverable while hiding unnecessary technical complexity.

You have access to specialized Helmies tools and subagents for:
- image generation and editing
- video generation
- audio and TTS
- lip sync
- recast
- visual analysis
- Brand Kits
- projects and assets
- Canvas documents
- Director productions
- workflows
- cost quotation

CORE BEHAVIOR
1. Understand the actual deliverable the user wants.
2. Use the current Project and Brand Kit when relevant.
3. Inspect references rather than guessing their contents.
4. Use specialized subagents when a task benefits from them.
5. Prefer the simplest viable production plan.
6. Do not expose provider complexity unless the user asks.
7. Never execute a billable multi-step plan before obtaining an approved quote.
8. Before a billable multi-step plan, show:
   - the planned steps
   - expected credits
   - maximum credits
   - current balance
   - expected remaining balance
9. For a single manual-like generation request made directly through chat, use the quote tool and show the cost before execution when the configured approval threshold requires it.
10. Respect the user's quality mode:
   - Economy
   - Balanced
   - Best Quality
   - Manual
11. When a requested model cannot support the inputs, explain the mismatch and offer a compatible alternative.
12. Never call providers directly. Always use Helmies tools.
13. Never expose provider credentials or internal secrets.
14. Save useful outputs as Assets.
15. When working in a Project, attach outputs to that Project.
16. When a Brand Kit is active, preserve its important constraints.
17. Do not invent exact brand facts that are not in the Brand Kit.
18. Do not claim generation succeeded until the job result confirms success.
19. If a long job is running, continue the conversation and track it through job tools.
20. When quality evaluation identifies a correctable problem, prefer a targeted retry rather than restarting the entire production.
21. Never exceed the approved maximum retry budget without asking the user again.
22. For Director productions, think in shots, dependencies, continuity and deliverables.
23. Keep ordinary-user explanations simple.
24. Give advanced technical detail when the user asks for it.

PLANNING
For tasks requiring multiple generated assets:
- create a structured plan;
- assign dependencies;
- determine which steps can run in parallel;
- obtain cost estimate;
- present a concise plan;
- obtain approval;
- execute.

MODEL SELECTION
Do not choose a model based on name recognition.
Choose based on:
- eligibility
- requested quality
- reference support
- output needs
- user budget
- provider health
- value
- model routing policy

BRAND
When a Brand Kit is active:
- ask the Brand Guardian subagent/tool for relevant constraints;
- preserve exact brand names and slogans;
- use logo assets rather than hallucinated logos;
- prefer actual uploaded fonts for final Canvas/text rendering when possible.

CANVAS
A Canvas is a visual instruction document.
If the user has a Canvas:
- use its semantic objects, masks, notes and references;
- do not treat a rough Canvas screenshot as the only source of truth.

FINAL DELIVERY
At the end of a production:
- clearly identify final deliverables;
- provide important source assets when useful;
- report actual credits used;
- offer relevant next action such as Edit in Canvas, Animate, Lip Sync or Create Variation.
```

# Appendix I — System Prompt: Creative Director Subagent

```text
You are the Helmies Creative Director.

Your role is to transform a user's brief into a coherent creative direction.

You do not directly execute provider calls.

You produce structured creative decisions for the Master Agent or Director pipeline.

Focus on:
- audience
- objective
- visual concept
- emotional tone
- narrative
- shot or image strategy
- composition
- lighting
- camera language
- brand alignment
- deliverable requirements

Rules:
- preserve exact user constraints;
- preserve exact brand facts;
- do not invent logos, slogans, products or people that were not requested;
- avoid unnecessary complexity;
- make a concept generatable by current tools;
- separate immutable constraints from creative suggestions;
- when multiple options exist, prefer one strong direction unless asked for alternatives.

Return structured output when a schema is provided.
```

# Appendix J — System Prompt: Image Director

```text
You are the Helmies Image Director.

You specialize in planning image generation and image editing.

Determine:
- whether the task is T2I, I2I, multi-reference, edit, inpaint, outpaint or Canvas-guided;
- the semantic role of each reference;
- composition;
- subject;
- environment;
- lighting;
- camera/lens feel;
- typography requirements;
- preservation constraints;
- negative constraints.

Never invent exact product or brand details.
Use actual reference assets when exact identity/product preservation matters.

Produce a structured image brief.
Do not directly call a provider.
```

# Appendix K — System Prompt: Video Director

```text
You are the Helmies Video Director.

You specialize in video-generation planning.

Determine:
- T2V vs I2V vs reference video vs first/last frame vs V2V vs extend;
- shot duration;
- subject action;
- environmental motion;
- camera movement;
- pacing;
- start/end continuity;
- reference strategy;
- dialogue/audio needs;
- model constraints.

Video prompts must describe observable motion.

Avoid non-visual abstract filler.

For long productions, break work into shots.

Do not directly call providers.
```

# Appendix L — System Prompt: Brand Guardian

```text
You are the Helmies Brand Guardian.

You receive:
- a user request
- relevant Brand Kit context
- possibly Canvas/reference analysis

Your job is to identify the brand constraints relevant to the requested deliverable.

Separate them into:
1. immutable
2. preferred
3. avoid

Immutable examples:
- exact logo asset
- exact product name
- exact slogan
- required palette
- legal copy

Preferred examples:
- photography style
- visual density
- tone
- typography hierarchy

Avoid examples:
- disallowed colors
- disallowed logo treatments
- negative-reference visual styles

Do not invent brand facts.
Return only context relevant to the current generation.
```

# Appendix M — System Prompt: Prompt Engineer

```text
You are the Helmies Prompt Engineer.

Your input is a structured creative brief, model information, Prompt Guide and model capabilities.

Your task is to produce the strongest model-specific prompt while preserving the source intent.

Rules:
- immutable facts must remain unchanged;
- use model-specific syntax/dialect from the supplied Prompt Guide;
- do not add unsupported controls into prompt prose if they have dedicated request parameters;
- use precise visual/mechanical language;
- remove redundant narrative filler;
- respect prompt length;
- return prompt and negative prompt separately when supported;
- do not alter exact text requirements;
- do not invent unprovided brand details.

When a JSON schema is supplied, return schema-valid output only.
```

# Appendix N — System Prompt: Quality Control Agent

```text
You are the Helmies Quality Control Agent.

Evaluate a generated result against:
- user request
- immutable constraints
- Brand Kit
- references
- Canvas
- technical requirements

Return separate scores:
- technical validity
- prompt alignment
- reference consistency
- brand consistency
- text accuracy where applicable

Also return:
- hard failure yes/no
- specific issues
- whether a targeted retry is justified
- suggested retry change

Do not recommend a retry merely because the output is not your personal aesthetic preference.

Prefer targeted correction.

Do not authorize spending beyond the supplied retry budget.
```

# Appendix O — System Prompt: Cost Optimizer

```text
You are the Helmies Cost Optimizer.

You receive only eligible models and deterministic quote data.

Never invent prices.

Choose or rank options using:
- requested quality mode
- model suitability
- quote
- reliability
- speed
- user budget

Return:
- recommended option
- cheaper option
- premium option when useful
- exact quote IDs supplied by tools

Do not perform provider-cost arithmetic yourself when calculator data is available.
```

# Appendix P — System Prompt: Admin Margin Advisor

```text
You are the Helmies Studio Admin Margin Advisor.

You help authorized administrators reason about pricing, plans, promotions and AI COGS.

RULES
1. Never invent financial numbers.
2. Use deterministic calculator/tool output for all arithmetic.
3. Clearly label observed data, configured assumptions and forecasts.
4. When a promotion can produce negative contribution in a reasonable scenario, say so clearly.
5. Explain both expected and worst-case scenarios.
6. Do not modify plans, promo codes or pricing unless the admin explicitly asks to apply a change.
7. If a change is requested, show the calculated impact before execution.
8. Respect role permissions.
9. Keep provider wholesale data inside admin context.
10. Do not expose secrets.

Useful questions:
- What happens if we discount Pro by 30%?
- Which model route has the weakest margin?
- How much could a 100%-utilization Studio user cost?
- What credit-pack price reaches our target margin?
```

# Appendix Q — Prompt Compilation Structured Output

```json
{
  "intent": {
    "deliverable": "instagram_product_post",
    "subject": "perfume bottle",
    "style": "luxury editorial",
    "aspectRatio": "4:5"
  },

  "immutableFacts": [
    { "type": "product_asset", "assetId": "asset_product" },
    { "type": "exact_text", "value": "SUMMER DROP" }
  ],

  "brandConstraints": {
    "palette": ["#0D0D0D", "#D5B56D"],
    "logoAssetId": "logo_main"
  },

  "composition": {
    "subjectPosition": "center-lower-third",
    "textPosition": "upper-third"
  },

  "prompt": "...",
  "negativePrompt": "...",

  "modelHints": {
    "referenceRoles": {
      "asset_product": "preserve_subject"
    }
  }
}
```

# Appendix R — Canvas Compilation Contract

```ts
type CompiledCanvas = {
  canvasId: string
  version: number

  flattenedGuideAssetId?: string
  sourceImageAssetId?: string

  inpaintMaskAssetId?: string
  preserveMaskAssetId?: string

  references: Array<{
    assetId: string
    role: string
    weight?: number
  }>

  regions: Array<{
    id: string
    bbox: [number, number, number, number]
    role: string
    instruction?: string
  }>

  exactText: Array<{
    value: string
    bbox?: [number, number, number, number]
    fontAssetId?: string
  }>

  compositionPrompt: string

  warnings: string[]
}
```

# Appendix S — Visual Analysis Contract

```ts
type VisualAnalysis = {
  image: {
    width: number
    height: number
  }

  caption: string
  background?: string

  palette: Array<{
    hex: string
    weight?: number
  }>

  subjects: Array<VisualSubject>
  objects: Array<VisualObject>

  textRegions: Array<{
    text: string
    bbox: NormalizedBBox
    confidence?: number
  }>

  regions: Array<{
    label: string
    description?: string
    bbox: NormalizedBBox
  }>

  lighting?: {
    direction?: string
    quality?: string
    contrast?: string
    temperature?: string
  }

  style?: Record<string, unknown>

  structuredPrompt?: Record<string, unknown>
}
```

# Appendix T — Director Production Schema

```ts
type DirectorProductionPlan = {
  version: 1
  id: string
  title: string

  type:
    | "advertisement"
    | "short_film"
    | "music_video"
    | "social_campaign"
    | "product_video"

  targetPlatform?: string
  aspectRatio: string
  durationSec: number

  globalStyle: string
  brandKitId?: string

  subjects: DirectorSubject[]
  locations: DirectorLocation[]

  continuityRules: string[]

  shots: DirectorShotPlan[]
}
```

# Appendix U — Director Shot State

```ts
type DirectorShotState = {
  shotId: string
  index: number

  state:
    | "planned"
    | "quoted"
    | "image_queued"
    | "image_ready"
    | "video_queued"
    | "video_ready"
    | "quality_failed"
    | "ready"
    | "failed"

  plan: DirectorShotPlan

  imageJobId?: string
  videoJobId?: string
  audioJobId?: string

  imageAssetId?: string
  videoAssetId?: string
  audioAssetId?: string

  quality?: QualityEvaluation

  version: number
}
```

# Appendix V — Director Planning Validation

A plan is rejected before quote if:

- shot duration <= 0.
- total duration exceeds allowed limit without segmentation.
- required character reference missing.
- a selected model cannot perform the requested strategy.
- a shot depends on an unavailable prior frame.
- aspect/resolution combination unsupported.
- Brand Kit immutable constraint is impossible without user confirmation.
- plan contains an execution cycle.
- exact text is assigned to a model known not to support it when a compatible route exists.

# Appendix W — Director Cost Options

Director should be able to produce:

```json
{
  "premium": {
    "expectedCredits": 4800,
    "maximumCredits": 5400,
    "description": "Premium video routes and premium reference frames."
  },
  "balanced": {
    "expectedCredits": 2900,
    "maximumCredits": 3400,
    "description": "Premium hero frames with balanced video routes."
  },
  "economy": {
    "expectedCredits": 1650,
    "maximumCredits": 1900,
    "description": "Fewer shots and economical 720p routes."
  }
}
```

The plan structure may adapt between modes.

# Appendix X — Public API Matrix (target)

## Public

```text
GET  /api/platform/public/plans
GET  /api/platform/public/cms
GET  /api/platform/public/announcements
GET  /api/platform/public/stats
```

## User

```text
GET  /api/platform/me
GET  /api/platform/wallet
GET  /api/platform/subscription

POST /api/platform/quote

POST /api/platform/generations
GET  /api/platform/generations
GET  /api/platform/generations/:id
POST /api/platform/generations/:id/cancel
POST /api/platform/generations/:id/retry

POST /api/platform/assets/upload-url
GET  /api/platform/assets
GET  /api/platform/assets/:id
DELETE /api/platform/assets/:id
POST /api/platform/assets/:id/analyze

GET  /api/platform/projects
POST /api/platform/projects
GET  /api/platform/projects/:id
PATCH /api/platform/projects/:id

GET  /api/platform/brand-kits
POST /api/platform/brand-kits
GET  /api/platform/brand-kits/:id
PATCH /api/platform/brand-kits/:id
POST /api/platform/brand-kits/:id/assets
POST /api/platform/brand-kits/:id/compile

POST /api/platform/canvases
GET  /api/platform/canvases/:id
PATCH /api/platform/canvases/:id
POST /api/platform/canvases/:id/version
POST /api/platform/canvases/:id/compile

POST /api/platform/director/plan
GET  /api/platform/director/:id
POST /api/platform/director/:id/quote
POST /api/platform/director/:id/execute
POST /api/platform/director/:id/pause
POST /api/platform/director/:id/resume
POST /api/platform/director/:id/shots/:shotId/rerun-image
POST /api/platform/director/:id/shots/:shotId/rerun-video
POST /api/platform/director/:id/reassemble

GET  /api/platform/workflows
POST /api/platform/workflows
POST /api/platform/workflows/:id/quote
POST /api/platform/workflows/:id/run
```

The currently implemented API surface is documented in `STUDIO_FUNCTIONALITY.md` (current-state reference).

# Appendix Y — Admin API Matrix (target)

```text
GET   /api/platform/admin/dashboard

GET   /api/platform/admin/users
GET   /api/platform/admin/users/:id
PATCH /api/platform/admin/users/:id
POST  /api/platform/admin/users/:id/credits
POST  /api/platform/admin/users/:id/suspend
POST  /api/platform/admin/users/:id/logout-all

GET   /api/platform/admin/models
POST  /api/platform/admin/models
GET   /api/platform/admin/models/:id
PATCH /api/platform/admin/models/:id
POST  /api/platform/admin/models/:id/test

GET   /api/platform/admin/providers
POST  /api/platform/admin/providers
PATCH /api/platform/admin/providers/:id
POST  /api/platform/admin/providers/:id/test

GET   /api/platform/admin/routes
POST  /api/platform/admin/routes
PATCH /api/platform/admin/routes/:id

GET   /api/platform/admin/plans
POST  /api/platform/admin/plans
PATCH /api/platform/admin/plans/:id

GET   /api/platform/admin/credit-packs
POST  /api/platform/admin/credit-packs
PATCH /api/platform/admin/credit-packs/:id

GET   /api/platform/admin/promos
POST  /api/platform/admin/promos
PATCH /api/platform/admin/promos/:id
POST  /api/platform/admin/promos/:id/simulate

GET   /api/platform/admin/pricing
POST  /api/platform/admin/pricing
PATCH /api/platform/admin/pricing/:id

GET   /api/platform/admin/prompt-guides
POST  /api/platform/admin/prompt-guides
POST  /api/platform/admin/prompt-guides/:id/version
POST  /api/platform/admin/prompt-guides/:id/activate
POST  /api/platform/admin/prompt-guides/:id/rollback

GET   /api/platform/admin/generations
GET   /api/platform/admin/generations/:id
POST  /api/platform/admin/generations/:id/refund

GET   /api/platform/admin/jobs
GET   /api/platform/admin/provider-health

GET   /api/platform/admin/cms
PUT   /api/platform/admin/cms/:namespace/:key
POST  /api/platform/admin/cms/:id/publish
POST  /api/platform/admin/cms/:id/rollback

GET   /api/platform/admin/announcements
POST  /api/platform/admin/announcements
PATCH /api/platform/admin/announcements/:id

POST  /api/platform/admin/advisor/scenario
POST  /api/platform/admin/advisor/chat

GET   /api/platform/admin/feature-flags
POST  /api/platform/admin/feature-flags

GET   /api/platform/admin/audit
```

# Appendix Z — Environment Variable Contract

Target variables by service. **Current state:** the deployed single-app variable set is documented in `STUDIO_FUNCTIONALITY.md` §16 and `.env.example`; the variables below apply to the target multi-service topology (Section 9.1).

## Public Landing

```text
NEXT_PUBLIC_PLATFORM_API_URL
NEXT_PUBLIC_STUDIO_URL
NEXT_PUBLIC_SENTRY_DSN
```

No secret.

## Studio Web

```text
VITE_PLATFORM_API_URL
VITE_AGENT_API_URL
VITE_SENTRY_DSN
```

No provider secret. (Applies only if `studio-web` becomes a Vite app; a Next.js `studio-web` uses `NEXT_PUBLIC_*` equivalents.)

## Platform API

```text
DATABASE_URL
REDIS_URL

AGENT_INTERNAL_URL
AGENT_SHARED_SECRET

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_REGION
OBJECT_STORAGE_ACCESS_KEY_ID
OBJECT_STORAGE_SECRET_ACCESS_KEY
OBJECT_STORAGE_PRIVATE_BUCKET
OBJECT_STORAGE_PUBLIC_BUCKET

SECRET_MANAGER_PROVIDER

SENTRY_DSN
OTEL_EXPORTER_OTLP_ENDPOINT
```

## Agent API

Keep existing required Helmies Studio variables plus:

```text
HELMIES_PLATFORM_API_URL
HELMIES_PLATFORM_INTERNAL_TOKEN
HELMIES_STUDIO_BASE_URL
```

## Director

```text
PLATFORM_INTERNAL_URL
PLATFORM_INTERNAL_TOKEN
DIRECTOR_LLM_ROUTE
FFMPEG_PATH
```

## Vision

```text
VISION_PROVIDER
VISION_MODEL
VISION_LOCAL_MODEL_PATH
PLATFORM_INTERNAL_TOKEN
```

Provider-specific credentials SHOULD be resolved by the Platform/Gateway secret layer rather than broadly copied into every service.

# Appendix AA — Docker Compose Skeleton

Illustrative only; adapt to the existing deployment. MongoDB from v1 removed (Section 9.3.1).

```yaml
services:
  gateway:
    image: traefik:v3
    restart: unless-stopped
    depends_on:
      - landing
      - studio-web
      - agent-api
      - platform-api

  landing:
    build:
      context: .
      dockerfile: apps/landing/Dockerfile
    restart: unless-stopped

  studio-web:
    build:
      context: .
      dockerfile: apps/studio-web/Dockerfile
    restart: unless-stopped

  agent-api:
    build:
      context: .
      dockerfile: docker/agent-api.Dockerfile
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
      - meilisearch

  platform-api:
    build:
      context: .
      dockerfile: apps/platform-api/Dockerfile
    restart: unless-stopped
    depends_on:
      - postgres
      - redis

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    restart: unless-stopped
    depends_on:
      - postgres
      - redis

  director-service:
    build:
      context: .
      dockerfile: apps/director-service/Dockerfile
    restart: unless-stopped

  vision-service:
    build:
      context: .
      dockerfile: apps/vision-service/Dockerfile
    restart: unless-stopped

  postgres:
    image: postgres:17
    restart: unless-stopped

  redis:
    image: redis:7
    restart: unless-stopped

  meilisearch:
    image: getmeili/meilisearch
    restart: unless-stopped
```

Do not blindly replace currently working pinned DB versions without migration testing. Use versions compatible with current production data.

# Appendix AB — Queue Payload

```ts
type GenerationQueuePayload = {
  jobId: string
  userId: string
  capability: string
  modelId: string
  routeKey?: string
  normalizedRequest: Record<string, unknown>
  pricingSnapshot: Record<string, unknown>
  reservationId: string
}
```

The queue payload MUST NOT contain provider secrets.

# Appendix AC — Job Event Contract

```ts
type JobEvent = {
  jobId: string
  parentJobId?: string
  timestamp: string

  event:
    | "queued"
    | "stage"
    | "progress"
    | "asset"
    | "warning"
    | "completed"
    | "failed"

  stage?: string
  progress?: number
  message?: string

  asset?: {
    id: string
    type: string
    thumbnailUrl?: string
  }
}
```

# Appendix AD — UI Components to Build

## Shared

```text
StudioShell
StudioSidebar
StudioTopbar
CreditBalance
CostQuote
GenerateButton
ModelSelector
ModelCard
ModelCompatibilityReason
BasicAdvancedToggle
AssetPicker
MultiAssetPicker
AspectRatioPicker
ResolutionPicker
DurationPicker
SeedControl
SettingsGroup
PromptComposer
PromptInspector
JobProgress
GenerationResultCard
GenerationHistory
AssetCard
ProjectSelector
BrandKitSelector
AgentDrawer
ErrorRecoveryCard
```

## Canvas

```text
CanvasWorkspace
CanvasToolbar
CanvasObjectLayer
CanvasLayerPanel
CanvasMaskLayer
CanvasTextEditor
CanvasAssetObject
CanvasShapeObject
CanvasPromptNote
CanvasSemanticRoleMenu
CanvasVersionHistory
CanvasCompilePreview
```

## Director

```text
DirectorBrief
DirectorPlanView
DirectorCostOptions
DirectorTimeline
DirectorShotCard
DirectorShotEditor
DirectorPromptInspector
DirectorJobStatus
DirectorQualityBadge
DirectorRerunMenu
DirectorAssemblyPanel
```

## Admin

```text
AdminShell
BusinessDashboard
RevenueChart
MarginChart
PlanEditor
CreditPackEditor
PromoEditor
PromoRiskPanel
ModelRegistryTable
ModelEditor
InputSchemaEditor
UISchemaEditor
PriceRuleEditor
ProviderTable
ProviderHealth
RouteEditor
PromptGuideEditor
PromptGuideDiff
GenerationInspector
UserInspector
CmsEditor
AnnouncementEditor
AdvisorChat
AdvisorScenario
AuditTable
```

# Appendix AE — Sidebar Route Map

```text
/studio
    redirects to /studio/agent

/studio/agent
/studio/image
/studio/video
/studio/director
/studio/audio
/studio/lipsync
/studio/recast
/studio/influencer
/studio/workflows
/studio/brands
/studio/projects
/studio/assets
/studio/generations
/studio/templates
/studio/credits
/studio/billing
/studio/api
/studio/settings
/studio/admin
```

Route access is entitlement-aware.

# Appendix AF — Feature Entitlement Contract

```ts
type Entitlements = {
  plan: string

  maxConcurrentJobs: number
  maxProjects: number | null
  maxBrandKits: number | null
  maxStorageBytes: number | null

  director: boolean
  apiAccess: boolean
  premiumModels: boolean

  modelAllowlist?: string[]
  modelDenylist?: string[]

  queuePriority: number
}
```

The browser MAY use it for UI. The server remains the authority.

# Appendix AG — Admin Plan Example

```json
{
  "id": "studio",
  "name": "Studio",
  "monthlyCredits": 1500,
  "limits": {
    "maxConcurrentJobs": 4,
    "maxBrandKits": 10,
    "maxProjects": 100
  },
  "features": {
    "director": true,
    "apiAccess": false,
    "premiumModels": true,
    "priorityQueue": true
  }
}
```

This is illustrative and can be changed in Admin.

# Appendix AH — Prompt Guide Storage Example

```json
{
  "key": "video/cinematic/base",
  "version": 4,
  "content": "Model-facing guide...",
  "config": {
    "maxPromptChars": 4000,
    "supportsNegativePrompt": true,
    "order": ["subject", "action", "environment", "camera", "lighting", "style"]
  }
}
```

# Appendix AI — Model Price Examples

Examples only; actual provider pricing is admin-managed and effective-dated.

```json
{ "strategy": "per_image", "params": { "unitCost": 0.035 } }
```

```json
{ "strategy": "per_second_resolution", "params": { "rates": { "720p": 0.05, "1080p": 0.075 } } }
```

```json
{ "strategy": "token", "params": { "inputPerMillion": 0.10, "outputPerMillion": 0.40 } }
```

# Appendix AJ — Model Importer

Write a one-time/importable script:

```text
scripts/import-current-model-registry.ts
```

Sources: current `src/lib/models`; current `chatModes`; current `ModelPricing`; current provider config. Output: AiProvider; AiModel; AiModelPrice; ModelRoute seeds. The script MUST be idempotent.

# Appendix AK — Provider Secret Migration

Current `ProviderConfig` has `apiKey`. Migration:

1. read provider rows in a secure migration environment.
2. create secret in secret manager.
3. store secret reference.
4. test provider.
5. null/remove plaintext key after verified migration.
6. audit.
7. ensure backups containing plaintext are protected under retention policy.

Never print keys to migration logs.

# Appendix AL — Existing Model/Tool Migration Checklist

For every model currently exposed in Helmies Studio:

- [ ] identify provider.
- [ ] identify exact model key.
- [ ] identify capability.
- [ ] identify required inputs.
- [ ] identify optional inputs.
- [ ] identify max reference count.
- [ ] identify durations.
- [ ] identify aspect ratios.
- [ ] identify resolutions.
- [ ] identify async vs sync.
- [ ] identify provider pricing.
- [ ] identify current credits.
- [ ] create AiModel record.
- [ ] create price record.
- [ ] create adapter mapping.
- [ ] assign route.
- [ ] assign Prompt Guide.
- [ ] create provider smoke test.
- [ ] verify result storage.
- [ ] enable only after test.

# Appendix AM — Image Studio Completion Checklist

- [ ] T2I.
- [ ] I2I.
- [ ] multi-reference.
- [ ] edit.
- [ ] inpaint where model supports.
- [ ] outpaint where model supports.
- [ ] exact model selector.
- [ ] auto model recommendation.
- [ ] Basic mode.
- [ ] Advanced mode.
- [ ] Prompt Composer.
- [ ] Prompt Inspector.
- [ ] references.
- [ ] semantic reference roles.
- [ ] Canvas.
- [ ] Brand Kit.
- [ ] quote.
- [ ] balance.
- [ ] Generate.
- [ ] job progress.
- [ ] results.
- [ ] Assets.
- [ ] reuse settings.
- [ ] history.
- [ ] send to Video.
- [ ] Ask Agent.

# Appendix AN — Canvas Completion Checklist

- [ ] create document.
- [ ] resize canvas.
- [ ] aspect presets.
- [ ] upload image.
- [ ] add existing Asset.
- [ ] move.
- [ ] resize.
- [ ] rotate.
- [ ] crop.
- [ ] text.
- [ ] font.
- [ ] brand font.
- [ ] shapes.
- [ ] arrows.
- [ ] free draw.
- [ ] prompt notes.
- [ ] include mask.
- [ ] exclude/preserve mask.
- [ ] semantic role.
- [ ] layer panel.
- [ ] visibility.
- [ ] lock.
- [ ] grouping.
- [ ] undo.
- [ ] redo.
- [ ] autosave.
- [ ] version.
- [ ] restore.
- [ ] flatten.
- [ ] high-res render.
- [ ] compile.
- [ ] warnings.
- [ ] quote.
- [ ] generate.
- [ ] result lineage.

# Appendix AO — Brand Kit Completion Checklist

- [ ] create.
- [ ] name.
- [ ] description.
- [ ] website.
- [ ] primary logo.
- [ ] alternate logos.
- [ ] colors.
- [ ] font uploads.
- [ ] typography roles.
- [ ] voice/tone.
- [ ] slogans.
- [ ] products.
- [ ] packaging.
- [ ] visual references.
- [ ] negative references.
- [ ] image analysis.
- [ ] palette extraction.
- [ ] style fingerprint.
- [ ] enforcement mode.
- [ ] preview.
- [ ] use in Image Studio.
- [ ] use in Video Studio.
- [ ] use in Agent.
- [ ] use in Director.

# Appendix AP — Director Completion Checklist

- [ ] brief.
- [ ] project.
- [ ] Brand Kit.
- [ ] references.
- [ ] duration.
- [ ] platform.
- [ ] aspect.
- [ ] quality mode.
- [ ] Pass A.
- [ ] Pass B.
- [ ] Pass C.
- [ ] Pass D.
- [ ] validation.
- [ ] cost options.
- [ ] approval.
- [ ] persistent pipeline.
- [ ] persistent shots.
- [ ] child jobs.
- [ ] image generation.
- [ ] video generation.
- [ ] optional audio.
- [ ] quality.
- [ ] shot image rerun.
- [ ] shot video rerun.
- [ ] shot prompt edit.
- [ ] reassembly.
- [ ] final Asset.
- [ ] actual cost.
- [ ] resume after refresh.
- [ ] pause.
- [ ] cancel.

# Appendix AQ — Master Agent Completion Checklist

- [ ] creative system prompt.
- [ ] platform user context.
- [ ] project context.
- [ ] Brand Kit tool.
- [ ] asset search tool.
- [ ] vision tool.
- [ ] quote tool.
- [ ] image tool.
- [ ] video tool.
- [ ] TTS tool.
- [ ] lipsync tool.
- [ ] recast tool.
- [ ] Director tool.
- [ ] job status tool.
- [ ] subagents.
- [ ] plan schema.
- [ ] cost approval.
- [ ] retry budget.
- [ ] background job handling.
- [ ] media result cards.
- [ ] project saving.
- [ ] Agent -> Studio handoff.
- [ ] Studio -> Agent context handoff.

# Appendix AR — Admin Completion Checklist

## Business

- [ ] MRR.
- [ ] revenue.
- [ ] AI COGS.
- [ ] margin.
- [ ] plan editor.
- [ ] credit packs.
- [ ] promo codes.
- [ ] promo simulation.
- [ ] Advisor.
- [ ] refund management.

## AI Ops

- [ ] models.
- [ ] providers.
- [ ] routes.
- [ ] pricing rules.
- [ ] Prompt Guides.
- [ ] generation inspector.
- [ ] provider health.
- [ ] smoke tests.
- [ ] quality metrics.

## Content

- [ ] CMS.
- [ ] revisions.
- [ ] preview.
- [ ] announcements.
- [ ] public plan preview.

## Users

- [ ] search.
- [ ] plan.
- [ ] wallet.
- [ ] usage.
- [ ] credit adjustment.
- [ ] suspension.
- [ ] logout.
- [ ] audit.

## Operations

- [ ] job queue.
- [ ] incidents.
- [ ] feature flags.
- [ ] audit.
- [ ] system health.

# Appendix AS — Critical Acceptance Tests

| Feature | Test | Expected |
|---|---|---|
| Landing | screenshot before/after | approved design preserved |
| Plan price | Admin changes price | landing updates without deployment |
| Signup bonus | Admin changes welcome credits | new signup follows config |
| Wallet | Agent then Image Studio generation | same wallet debited |
| Quote | duration changes | quote recalculates |
| Idempotency | double click Generate | one job and charge |
| Model schema | missing required reference | client and server reject |
| Compatibility | too many refs | clear incompatibility |
| Provider fallback | primary 5xx | compatible fallback within approved max |
| Provider validation | permanent 422 | no blind fallback |
| Storage | provider URL expires | Helmies Asset still available |
| Canvas | refresh | editable state restored |
| Canvas mask | compile | mask asset valid |
| Brand | locked kit | immutable constraints present |
| Vision | analyze poster | OCR/palette/regions returned |
| Agent | campaign request | plan + quote before execution |
| Agent refresh | long job | state resumes |
| Workflow | multi-step | maximum cost shown first |
| Director | rerun shot | unaffected shots unchanged |
| Director | reassemble | new final output |
| Promo | loss-making promo | red advisor warning |
| CMS | edit hero text | preview/publish works |
| Audit | admin changes model price | before/after audit |
| Security | browser network | no provider secrets |
| Asset ownership | user requests another user's asset | denied |
| Wallet race | concurrent jobs | balance never negative |

# Appendix AT — File/Module Target Map

| Target | Responsibility |
|---|---|
| `apps/landing` | preserved public Next.js site |
| `apps/studio-web` | final authenticated UI |
| `apps/platform-api` | commercial API |
| `apps/worker` | async jobs |
| `apps/director-service` | Maestro-exact production planning (original code) |
| `apps/vision-service` | image analysis |
| `packages/model-registry` | models/capabilities/schemas |
| `packages/pricing-engine` | quote/margin/prices |
| `packages/prompt-engine` | prompt compilation |
| `packages/brand-engine` | Brand Kit context |
| `packages/contracts` | shared types |
| `packages/storage` | assets/object storage |
| `prisma` | commercial DB |
| current Helmies Studio `src/lib/models` | migration seed only |
| current Helmies Studio `chatModes` | migration seed only |
| current generation handler | service extraction source |
| current AdminPanel | baseline requirements, not final UI |

(v1 rows referencing "existing Agent runtime / MCP / skills modules" from the abandoned `helmies-agent` project are SUPERSEDED — there is no external runtime to reference; Section 9.3.1.)

# Appendix AU — Suggested First 40 Commits

1. `chore: snapshot migration baseline`
2. `feat: add public landing app to final repo`
3. `feat: route authenticated studio under /studio`
4. `test: add landing visual regression`
5. `feat: add platform identity mapping`
6. `feat: introduce credit wallet and ledger`
7. `feat: add credit reservation service`
8. `feat: add provider and model registry schema`
9. `feat: import existing model catalog`
10. `feat: add model input validation`
11. `feat: add generic studio input renderer`
12. `feat: add pricing strategy engine`
13. `feat: add quote API`
14. `feat: add generation job state machine`
15. `feat: add generation queue worker`
16. `feat: migrate first image provider`
17. `feat: add asset storage and library`
18. `feat: build Image Studio shell`
19. `feat: add prompt compiler`
20. `feat: add prompt inspector`
21. `feat: persist Canvas documents`
22. `feat: build Canvas editor`
23. `feat: add Canvas masks and semantic roles`
24. `feat: add Canvas compiler`
25. `feat: add visual analysis service`
26. `feat: build Brand Kits`
27. `feat: compile Brand context`
28. `feat: add Helmies creative agent tools`
29. `feat: add creative subagents`
30. `refactor: retire old Studio orchestrator`
31. `feat: migrate Video Studio`
32. `feat: migrate Audio and TTS`
33. `feat: migrate Lip Sync and Recast`
34. `feat: migrate Influencer`
35. `feat: migrate Workflows to gateway`
36. `feat: add Director planning`
37. `feat: add Director execution and reruns`
38. `feat: build Admin V2`
39. `feat: add dynamic landing pricing cms and alerts`
40. `chore: remove verified legacy paths`

# Appendix AV — Implementation Agent Instruction Block

Copy this intent into the coding-agent context when implementation starts. This block replaces the v1 "Final DeepSeek Instruction Block" and is agent-neutral.

```text
You are implementing the final Helmies Studio according to
HELMIES_STUDIO_MASTER_UPGRADE.md.

Read the entire file before making changes.

Do not ask product questions already answered in the specification.

Work sequentially through the migration phases (Section 12.1).

The current public landing page is visually protected.
Do not redesign it.

The `helmies-agent` project is abandoned and is NOT used.
The `helmies-studio` codebase is the single foundation and is built out
natively into the final authenticated application and Agent-runtime
foundation.

The old helmies-studio public tool shell is a source of commercial
database data, generation providers, pricing, workflows and useful
backend logic that must be evolved in place rather than blindly
rewritten.

Do not maintain or import a second Agent runtime.
Helmies Studio builds its own Master Agent runtime natively.

Agent, manual Studios, Workflows and Director must all use the same
Model Gateway, Pricing Engine, wallet and job system.

Replicate Maestro's exact Director behavior (logic, prompting, schemas,
results) in original Helmies Studio code. Do not copy Maestro source
code verbatim unless a valid commercial license has been obtained.
Equivalence must be verified by side-by-side comparison tests.

Do not expose provider secrets.

Do not hardcode models or prices in random UI components.

Do not reset production databases.

Do not stop at scaffolding.

For each phase (Section 12.3):
- inspect
- migrate
- implement
- test
- build
- fix
- document
- continue

The project is not complete until the Definition of Done (Section 11.8)
is satisfied.
```

# Appendix AW — Architecture Diagram (target)

```text
                         ┌────────────────────────────┐
                         │ studio.helmies.fi         │
                         └──────────────┬─────────────┘
                                        │
                               ┌────────▼────────┐
                               │ Gateway / Edge │
                               └──────┬─────┬────┘
                                      │     │
                          /            │     │ /studio
                     ┌────────────────┘     └─────────────────┐
                     │                                        │
           ┌─────────▼────────┐                    ┌──────────▼─────────┐
           │ Landing Next.js  │                    │ Helmies Studio UI  │
           │ Existing design  │                    │ native built UI    │
           └─────────┬────────┘                    └───────┬────────────┘
                     │                                     │
                     │ Public API                          │
                     └───────────────┐          ┌──────────┘
                                     │          │
                              ┌──────▼──────────▼─────┐
                              │    Platform API       │
                              │ commercial control    │
                              └────┬────┬────┬───────┘
                                   │    │    │
                  ┌────────────────┘    │    └────────────────┐
                  │                     │                     │
          ┌───────▼───────┐     ┌──────▼──────┐      ┌──────▼────────┐
          │ Agent API     │     │ Model       │      │ Projects /    │
          │ (native)      │     │ Gateway     │      │ Assets/Brand  │
          └───────┬───────┘     └──────┬──────┘      └───────────────┘
                  │                    │
          ┌───────▼───────┐     ┌──────▼──────────────┐
          │ Master Agent  │     │ Generation Workers  │
          │ + Subagents   │     └──────┬──────────────┘
          └───────────────┘            │
                                       │
                 ┌─────────────────────┼────────────────────┐
                 │                     │                    │
          ┌──────▼──────┐      ┌──────▼───────┐    ┌──────▼───────┐
          │ Providers   │      │ Vision       │    │ Director     │
          │ AI APIs     │      │ Service      │    │ Service      │
          └─────────────┘      └──────────────┘    └──────────────┘

Persistent data:

PostgreSQL
    users/identity
    wallet/billing
    models/pricing
    jobs/assets/projects
    Brand Kits/Canvas
    Director/Admin/CMS
    agent runtime entities

Redis
    queues/cache/locks/realtime

Object Storage
    all user/generated media
```

(MongoDB removed from the target — Section 9.3.1.)

# Appendix AX — Product North Star Experience

A new user should be able to:

1. Visit the existing beautiful Helmies Studio landing page.
2. Understand the product and current pricing.
3. Sign up.
4. Enter `/studio`.
5. See a clean Agent-centered creative environment.
6. Tell the Agent what they want.
7. Upload references.
8. Create or select a Brand Kit.
9. Receive a clear production plan.
10. See cost before spending.
11. Approve.
12. Watch dynamic production progress.
13. Receive polished media Assets.
14. Open an image in Image Studio.
15. Switch to Advanced mode.
16. Put references on a Canvas.
17. Draw and type rough instructions.
18. Let Helmies transform the rough Canvas into a professional generation.
19. Animate the result in Video Studio.
20. Create a full multi-shot production in Director.
21. Rerun one weak shot without losing the rest.
22. Reassemble.
23. Save everything inside a Project.
24. Reuse the Brand Kit next week.
25. See the exact credits spent.

At the same time, the owner/admin should be able to:

1. add a model.
2. change a model price.
3. change a plan price.
4. run a promotion.
5. receive a margin warning.
6. edit approved landing text.
7. publish an alert.
8. disable a broken provider.
9. inspect failures.
10. see real AI COGS and margin.

That is the final Helmies Studio.

---

# Final Mental Model (v1 §215, preserved)

Helmies Studio is not a collection of API forms. It is a creative operating system.

The **Master Agent** is the natural-language controller.
The **Manual Studios** are precision instruments.
The **Model Gateway** is the execution kernel.
The **Prompt Intelligence Engine** translates creative intent into model language.
The **Canvas** translates rough visual thought into structured generation instructions.
The **Visual Intelligence service** understands references.
The **Brand Kit** is persistent brand memory.
The **Director** turns ideas into multi-shot productions.
The **Asset/Project system** gives the work continuity.
The **Admin panel** is the business and AI control plane.
The existing **landing page** remains the storefront.

All of these are one product: **Helmies Studio**.
