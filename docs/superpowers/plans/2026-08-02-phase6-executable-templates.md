# Phase 6 — Executable Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn templates from static prompt cards into versioned, executable, quotable workflows that run on the Phase 4A job queue and cannot be published broken.

**Architecture:** A `TemplateVersion` row holds an immutable `graph` (ordered steps, each naming a model + input mapping). `runTemplate()` quotes every step server-side, reserves once, enqueues step 1, and chains subsequent steps as each completes. Publishing is gated by a validator that refuses any template whose models are unpriced/inactive or whose graph can't be quoted. The twelve contract templates ship as seeds.

**Tech Stack:** unchanged. No new dependencies.

## Global Constraints

- Branch `feat/phase6-templates` off `main`. **Do not touch** `src/components/admin/*`, `src/app/api/admin/*`, `src/lib/log*`, or `docs/runbook-ops.md` — Phase 7 owns those and runs concurrently.
- Landing page off-limits except attribute/contrast a11y fixes (standing rule).
- NEVER prisma migrate/db push against `.env` DATABASE_URL. Test DB only (`postgresql://postgres:test@localhost:55432/test`, container `helmies-test-pg`).
- Money invariants from Phases 2–4 are binding: one reserve per run, settle only on real completion, release/refund on failure, never both. `npm run reconcile` must stay clean in integration tests.
- Every credit amount is server-computed. A template must never let the client supply a price, model id, or endpoint.
- Gates each task: `npm run lint` (0 warnings), `npm run typecheck`, `npm test`, `npm run build`; `npm run test:integration` where DB is touched; `npm run test:e2e` after UI tasks.
- Commit convention + standard footers as prior phases.

---

### Task 1: Versioned template graphs

**Files:** `prisma/schema.prisma` + migration `20260802140000_template_versions`; `src/lib/template-graph.js`; tests `tests/unit/template-graph.test.mjs`

**Interfaces:**
```prisma
model TemplateVersion {
  id         String   @id @default(cuid())
  templateId String
  version    Int
  graph      Json     // { steps: [{ id, tool, modelId, inputs, dependsOn }] }
  status     String   @default("draft")   // draft|published|archived
  createdAt  DateTime @default(now())
  template   Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  @@unique([templateId, version])
  @@schema("public")
}
```
(Add the matching `versions TemplateVersion[]` back-relation on `Template`.)
- `validateGraph(graph)` from `@/lib/template-graph` → `{ valid, errors[] }`. Rejects: empty steps; a `dependsOn` naming an unknown step; a cycle; a step missing `modelId` or `tool`; an input referencing `$stepN.output` where N isn't an earlier step.
- `topoSort(graph)` → step ids in execution order, throws on cycle.

- [ ] **Step 1: Failing tests** — a valid 3-step chain sorts correctly; a cycle is rejected by both functions; a forward reference (`step1` depends on `step2`) is rejected; a step with no `modelId` is rejected.
- [ ] **Step 2: Run, fail. Step 3: Implement + author the migration offline; apply to the test DB only.**
- [ ] **Step 4: Gates + commit** — `feat: versioned template graphs with validation`

---

### Task 2: Server-authoritative quoting + publish gate

**Files:** `src/lib/template-quote.js`; `src/app/api/templates/[slug]/quote/route.js`; `src/app/api/templates/[slug]/publish/route.js`; `security/route-manifest.json`; tests `tests/unit/template-quote.test.mjs`

**Interfaces:**
- `quoteTemplate(graph, inputs)` → `{ valid, steps: [{ stepId, modelId, credits }], totalCredits, errors[] }`. Each step's credits come from `quoteCatalogModel(modelId, params)` / the `ModelPricing` row — **never from the graph or the request**. A step whose model has no active pricing row makes the whole quote invalid.
- `canPublish(templateId, version)` → `{ ok, reasons[] }`. Refuses when: `validateGraph` fails; any step's model is missing/inactive/deprecated; `quoteTemplate` with the version's declared sample inputs is invalid.
- `POST /api/templates/[slug]/quote` (auth: user, origin-checked) → the quote for the caller's supplied inputs. `POST /api/templates/[slug]/publish` (auth: admin, origin-checked) → publishes only when `canPublish` passes, else 422 with reasons.
- Register both in `security/route-manifest.json` (the CI invariant test enforces `originCheck` on user/admin state-changers).

- [ ] **Step 1: Failing tests** — quote sums per-step credits from pricing rows; a client-supplied `credits`/`price` field in the request body is ignored; an unpriced model makes it invalid; `canPublish` refuses each of its four reasons independently; publish returns 422 with reasons and does not flip `status`.
- [ ] **Step 2–3: Run, implement. Step 4: Gates + commit** — `feat: server-authoritative template quotes and a publish gate`

---

### Task 3: Template runs on the durable queue

**Files:** `prisma/schema.prisma` + migration `20260802150000_template_runs`; `src/lib/template-runner.js`; `src/app/api/templates/[slug]/run/route.js`; tests `tests/unit/template-runner.test.mjs`, `tests/integration/template-run.int.test.mjs`

**Interfaces:**
```prisma
model TemplateRun {
  id         String   @id @default(cuid())
  userId     String
  templateId String
  versionId  String
  status     String   @default("running")  // running|completed|failed|cancelled
  stepState  Json     // { [stepId]: { status, generationId, outputUrl, error } }
  totalCredits Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([userId, status])
  @@schema("public")
}
```
- `startTemplateRun({ userId, slug, inputs })` → quotes, **reserves the full total once**, creates the run, enqueues the first step's generation via `enqueueJob` (Phase 4A). Returns `{ runId, totalCredits }`. Insufficient credits → throws the standard insufficient-credits error (the route maps it to 402, matching `generate/async`).
- `advanceTemplateRun(runId)` → called when a step's generation reaches a terminal state: on success, maps its output into the next step's inputs (`$stepN.output`) and enqueues it; when the last step completes, **settles the reservation at the quoted total** and marks the run `completed`. On any step failure: marks the run `failed` and **releases-or-refunds exactly once** (release first; on "No active reservation found" or a null return, refund) — mirror `src/lib/job-runner.js`'s `releaseOrRefund`, do not write a second implementation.
- Wire `advanceTemplateRun` into the existing job terminal path in `src/lib/job-runner.js` (a job carrying `payload.templateRunId` advances its run after its own terminal transition).

- [ ] **Step 1: Failing unit tests** — reserve happens once for the total, not per step; a mid-chain failure releases exactly once and marks the run failed; the final step's completion settles once; a run whose reservation was already settled refunds instead of releasing.
- [ ] **Step 2: Integration test (real DB, mocked provider via the existing E2E seam pattern or direct job-runner mocks)** — a 2-step template runs end to end: wallet drops by exactly the quoted total, `reconcileWallet(userId).ok === true`, run `completed`, both steps have outputs.
- [ ] **Step 3: Implement. Step 4: Gates + integration + commit** — `feat: template runs execute on the durable job queue`

---

### Task 4: The twelve contract templates as seeds

**Files:** `scripts/seed-templates.mjs` (rewrite), `src/lib/template-seeds.js`; tests `tests/integration/template-seeds.int.test.mjs`

**Interfaces:** `TEMPLATE_SEEDS` exports twelve entries keyed A–L per the contract §11: product-launch-campaign, restaurant-content-pack, ai-influencer-campaign, ugc-product-ad, ecommerce-photography-pack, local-business-ad-pack, music-visualizer-pack, podcast-clip-factory, brand-identity-starter, real-estate-listing-pack, app-launch-pack, one-brief-to-campaign. Each carries: slug, name, description, category, toolType, a `graph` whose `modelId`s reference models that exist in `ModelPricing`, declared sample inputs, and the safety notes the contract requires (e.g. restaurant: never invent allergens/prices/opening times; real estate: label virtual staging; influencer: no public-figure impersonation).

**Honest scope:** seeds define and validate the *workflow*; they do not assert output quality — that needs human judgement and real provider spend. Each template gets a **publish-gate test**, not a live generation.

- [ ] **Step 1: Failing integration test** — for every one of the twelve seeds: `validateGraph` passes, and `canPublish` returns `ok` against a seeded catalog. Any template referencing a model with no pricing row fails loudly, naming the template and model.
- [ ] **Step 2: Write the seeds; make the script idempotent (upsert by slug) and safe to run in production.** If a template needs a model the catalog lacks, either pick an existing model or record it in the report as blocked — do NOT invent a model id to make the test pass.
- [ ] **Step 3: Gates + integration + commit** — `feat: the twelve contract templates as validated seeds`

---

### Task 5: Library UX + gate + PR

**Files:** `src/app/templates/*` (existing), the template detail/use flow; `tests/e2e/templates.spec.mjs`

- [ ] **Step 1: E2E first** — the library lists published templates and filters by category; a detail page shows the quote (credits) before running; "Use template" starts a run and the run appears with per-step status; an unpublished template 404s for a normal user.
- [ ] **Step 2: Implement against the existing templates UI — reuse `src/components/studio/kit/` and `src/components/states/`; this is wiring, not a redesign.**
- [ ] **Step 3: Full gates + e2e; landing diff empty; push; CI green; PR** (Risk: High — money path), runbook: `node scripts/seed-templates.mjs` after deploy, migrations via `migrate deploy`, restart app + worker.

---

## Self-Review
1. **Coverage vs contract §11/§12:** versioned executable workflow → T1/T3; editable inputs + quote before run → T2/T5; publish gates (model unavailable, quote fails, invalid schema, unhandled step) → T2; the twelve templates → T4; library/filter/detail/use → T5. **Deferred, stated in the PR:** creator revenue sharing, template analytics, report-template, per-step retry UI, and output-quality acceptance (needs human review + real spend).
2. **Placeholders:** T4 Step 2 requires choosing real model ids from the live catalog — an unknowable-in-advance detail with an explicit "don't invent one" rule. No TBDs.
3. **Type consistency:** `validateGraph`/`topoSort`/`quoteTemplate`/`canPublish`/`startTemplateRun`/`advanceTemplateRun` used identically across tasks; `TemplateVersion.graph` shape fixed in T1 and consumed unchanged in T2–T4.
