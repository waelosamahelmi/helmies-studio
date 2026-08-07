# HELMIES STUDIO — OPENART PARITY AND BEYOND
## MASTER EXECUTION CONTRACT (LIVE EXECUTION LEDGER)

**Status:** ACTIVE IMPLEMENTATION CONTRACT — this file is the authoritative work ledger.
**Created:** 2026-08-07 after a full repository audit (see AUDIT BASELINE).
**Rule:** A checkbox is flipped to `[x]` only after implementation AND its verification pass. Zero unchecked technically-implementable items at completion.

---

## AUDIT BASELINE (verified 2026-08-07, commit a80148e)

Verified green before any change: `npm run lint` PASS · `npm run typecheck` PASS · `npm test` 1651/1651 PASS (119 files).

Audited reality (code is source of truth; old docs were NOT trusted):

- **Durable queue exists and is excellent**: `src/lib/job-queue.js` (SKIP LOCKED claim, leases, backoff, idempotency keys) + `src/lib/job-runner.js` (provider-resume via `providerRequestId`, CAS money gate, settle-only-after-ingest) + `scripts/worker.mjs` (PM2 `helmies-worker`).
- **Template runs are durable** (`src/lib/template-runner.js`: one reservation per run, sequential step enqueue, idempotent advance) — this is the proven pattern to generalize.
- **Agent runs are NOT durable**: `executeAgentRunBackground` (src/lib/agents.js) is a detached promise in the web process; PM2 restart loses remaining steps AND the unused-budget refund. Money is `debitWallet` full-estimate up front (not a reservation).
- **Director is NOT durable**: `executeProductionPipeline` (src/lib/director-executor.js) is awaited inside the HTTP request; full estimate debited up front; no reservation rows; process death strands money (GAP-1/2/3/4/5/6); failed shots still charged (GAP-12); plan editable mid-run because lock checks nonexistent `"executing"` status (GAP-9); rerun races active runs (GAP-10); generated audio never mixed into assembly (GAP-8); timeline edits unpersisted (GAP-7); no rate limits on LLM-spending routes (GAP-11); no indexes on DirectorShot.pipelineId / DirectorPipeline.userId (GAP-13); UI poll never times out (GAP-14); non-transactional multi-writes (GAP-13b).
- **Characters are prose/JSON `ProjectMemory` rows** (`type:"character"`); server prompt hook exists (`applyMemoryToPrompt`, characterId/styleId) but **no UI anywhere passes them**; no entity pickers; no product/environment entities; `AssetRelation` and `Asset.analysis` are write-never; `Project` table is 100% dead; async-path generations never become Asset rows (sync handler is the only writer).
- **Model catalog is real SSOT for pricing/runnable checks** (`ModelPricing` + `model-catalog-core.mjs` + `model-catalog.js`), but stale model IDs persist at runtime: `director-constants.js` presets (`flux-dev`, `wan-2.6`, `suno-v4`, `kling-v2.1-i2v`, `seedance-2.0`), `director-executor.js` fallbacks, `director-planner.js` LLM example, `agents.js` LAST_RESORT_FALLBACKS (`wan2.6-t2v` resolves only to a retired adapter row), admin models grid keyed off legacy `models.js` static arrays (shadow-row hazard), `prompt-expansion.js` stale family keys.
- **Billing trust gaps**: `/api/estimate/batch` echoes client `credits`; `/api/generate/cinema` + `/influencer` bill client-sent `model` while executing hardcoded `nano-banana-pro(-edit)`; marketing endpoint picks provider endpoint from client `resolution`.
- **Security gaps**: no `verifyOrigin` on sync `/api/generate/*` (via generation-handler) / estimate routes; no rate limits on `/api/director/*`, `/api/assemble`, estimate routes; webhook secret compare is `===` (not timing-safe).
- **Workflows execute in-request** (not durable), positional `$STEP_N`, regen leaves no run record, pro-rata failure charge approximate, `makeTemplate` orphaned.
- **Templates**: 16 live executable seeds (`template-seeds.js`); `template-seed.js` is DEAD code; TemplateVersions only creatable via seed script; usage decremented at apply-time with `generationId:null`; no user templates/duplicate.
- **Dead/decorative**: `public/site.webmanifest` (unreferenced duplicate), `SHOT_PRESETS` export (unused), `useCreditCost.topUpPacks` (no consumer), waveform/transport components copy-pasted into 4 studios, `AGENT_NAMES` triple-duplicated (StepProgress copy stale), AudioStudio `MODES.voice` unreachable, `autoAssemble` param dead end-to-end, `STUDIO_FUNCTIONALITY.md` is a stale July snapshot, AGENTS.md references MasonryGrid which no longer exists.
- **Strengths to preserve**: wallet/ledger invariants + sweep, prompt engine, plan approval + re-quote UI, storyboard-first planning, session persistence, kit (Sheet/Modal/Confirm + focus traps), a11y patterns (roving grids, roles, live regions), responsive CSS architecture (one tree, 900/1024/640px), template graph validation, Stripe webhook idempotency (StripeEvent unique claim), upload sniffing, storage drivers + ingest, SSRF allowlist.

### Environment reality
KIE_KEY, OPENROUTER_KEY, Stripe keys, DATABASE_URL, GOOGLE OAuth: SET. WEBHOOK_SECRET unset (falls back to CRON_SECRET — accepted, deprecated). VISION_MODEL/LLM_MODEL unset (code defaults). No provider training/LoRA API key or 3D provider in env/catalog (Phases AM/AN evaluate with proof).

---

# PHASE 0 — SHARED FOUNDATIONS

Current problem: every later phase needs the migration, a worker-safe model-resolution module, and shared UI constants. Target: one additive migration; zero `@/`-alias imports in worker-reachable code.

- [ ] 0.1 Create migration `20260807000000_durable_runs_entities_projects` (additive, expand-only):
  - [x] 0.1.1 `AgentRunStep` table: `id` cuid pk, `runId` (idx), `stepIndex` Int, `stepId` String, `agent` String, `task` Text, `params` Json, `dependsOn` Json (string[]), `kind` String (`media`|`internal`), `status` String default `pending` (pending|queued|running|succeeded|failed|skipped), `attempts` Int default 0, `generationId` String?, `output` Json?, `outputUrl` Text?, `creditsQuoted` Int default 0, `creditsActual` Int?, `modelPlanned` String?, `modelUsed` String?, `substitution` String?, `error` Text?, `startedAt`/`completedAt`/`createdAt`/`updatedAt`; `@@unique([runId, stepId])`, `@@index([runId, status])`.
  - [x] 0.1.2 `AgentRun` add columns: `cancelRequested` Boolean default false, `maxCredits` Int?, `tier` String?, `qcMode` String default `off`, `engine` String default `durable`.
  - [x] 0.1.3 `StudioEntity` table: `id` cuid pk, `userId` (idx), `kind` String (character|product|environment), `name` String, `description` Text?, `attributes` Json default {}, `references` Json default [] (`[{id,url,kind,label,locked,createdAt}]`), `voiceId` String?, `voiceName` String?, `status` String default `draft` (draft|ready|locked), `fingerprint` Text?, timestamps; `@@index([userId, kind])`.
  - [x] 0.1.4 Backfill: copy `ProjectMemory type='character'` rows into `StudioEntity` (kind=character; `data` object→attributes, string→description; name preserved; id `cuid()` generated in SQL via `gen_random_uuid()`-safe expression). ORIGINAL ProjectMemory rows preserved (no deletes).
  - [x] 0.1.5 `Project` add columns: `brief` Text?, `status` String default `active`. Nullable `projectId` FK columns + indexes on: `Asset`, `DirectorPipeline`, `AgentSession`, `Workflow`.
  - [x] 0.1.6 Indexes: `DirectorShot.pipelineId`, `DirectorPipeline.userId`, `ProjectMemory(userId,type)`, `Generation(userId,status)`, `Generation(userId,tool,status)`.
  - [x] 0.1.7 `DirectorPipeline` add columns: `cancelRequested` Boolean default false, `concurrency` Int default 3.
  - [x] 0.1.8 Verify migration applies cleanly on the live DB (`npx prisma migrate dev`), `prisma generate`, app boots.
- [x] 0.2 New worker-safe module `src/lib/runnable-models.js` (relative `.js` imports ONLY; no `@/` alias): re-export/implement `resolveRunnableModel`, `getRunnableModelsForType`, `defaultRunnableModelForKind(kind)`, `pickSubstituteModel`, `getFallbackCandidates`, `requiresMediaInput` — backed by `model-catalog-core.mjs` + `model-catalog.js` logic; `src/lib/model-catalog.js` keeps its API but delegates where duplication exists. Unit tests.
- [x] 0.3 Shared `src/lib/agent-names.js` single AGENT_NAMES map; delete the 3 divergent copies (OrchestratorStudio, PlanApproval, StepProgress).
- [x] 0.4 Shared waveform module `src/components/studio/kit/Waveform.js` + `useWaveform`/`useTransport` (`src/lib/use-waveform.js`); replace the 4 verbatim copies (AudioStudio, MusicStudio, LipSyncStudio, AvatarStudio). No visual change.

# A. DURABLE AGENT ORCHESTRATION

Problem (verified): `executeAgentRunBackground` = detached promise in web process; restart loses steps + refund; money = up-front `debitWallet`, not reservation. Target: agent production runs on the proven GenerationJob queue, TemplateRun-style, with a real `AgentRunStep` table; one reservation per run; idempotent advance; worker-driven; cancellation; watchdog.

Files: NEW `src/lib/agent-runner.js`; EDIT `src/lib/agents.js`, `src/lib/job-runner.js`, `src/lib/wallet.js`, `src/app/api/agent/run/route.js`, `src/app/api/agent/step/route.js`, `src/app/api/agent/run/[id]/route.js`, `scripts/worker.mjs`, OrchestratorStudio.js.

- [ ] A1.1 `src/lib/agent-runner.js` exports `startAgentRun({ userId, plan, sessionId, task, mode, tier, maxCredits, boundOutputs })`:
  - [ ] A1.1.1 Validate plan: non-empty steps, `normalizeAgentKey` known, unique stepIds (`step-<n>` assigned when absent), DAG-ify: `dependsOn` derived by scanning params for `$STEP_N_OUTPUT` / `${storyboard}` tokens (N→step index); cycle detection (DFS) → `invalid_plan` on cycle.
  - [ ] A1.1.2 Server re-quote via `estimateAgentTask`; if client `approvedTotal` present and server total > approvedTotal → `quote_changed` (nothing reserved/created).
  - [ ] A1.1.3 `reserveCredits(userId, total, runId, TTL=max(60, steps*40))` BEFORE first enqueue; any setup failure after reserve → `releaseOrRefund` + run failed.
  - [ ] A1.1.4 Create `AgentRun` (status `executing`, `steps` Json kept for back-compat polling shape, `result.boundOutputs`, `maxCredits`, `tier`) + all `AgentRunStep` rows (status pending, `creditsQuoted` from breakdown) in ONE transaction.
  - [ ] A1.1.5 `enqueueReadySteps(runId)`: ready = pending steps whose dependsOn ⊆ succeeded; per-step: resolve planned model via `resolveRunnableModel`, media-required guard (text-only step + media-required model → substitute), substitution = cheapest runnable ≤ quoted ceiling (`creditsQuoted`); create `Generation` (status processing, creditsUsed 0) + `enqueueJob` idempotencyKey `agent-run-<runId>-<stepId>`, payload `{...params, model: providerModelId, endpoint, callBackUrl, agentRunId, stepId}` for media, `{agentRunId, stepId, internal:true, internalKind}` for internal (storyboard|assembly|export|llm); step status→queued. In-flight media cap = 3 per run (ready steps beyond cap stay pending until advance).
  - [ ] A1.1.6 Kick: if NO step got enqueued (all-ready set is internal-only), worker tick picks it up (A3.2) — also call `advanceAgentRun` once in-process for immediate start when called from the worker.
- [ ] A1.2 `advanceAgentRun(runId)` — idempotent, safe to call any number of times:
  - [ ] A1.2.1 Reload run + steps; not `executing` → no-op. `cancelRequested` → mark pending steps `skipped`, `releaseOrRefund`, status `cancelled`, session message.
  - [ ] A1.2.2 Sync step outcomes from their Generation rows (completed→succeeded + output/outputUrl + creditsActual=quoted; failed→failed + error).
  - [ ] A1.2.3 Budget gate: `actualSoFar = Σ creditsActual`; before enqueueing each ready step, `actualSoFar + remainingQuoted ≤ run.maxCredits ?? quotedTotal` else step skipped with `budget_exceeded` (never silently overspend).
  - [ ] A1.2.4 Enqueue newly-ready steps (A1.1.5 rules, concurrency cap).
  - [ ] A1.2.5 All terminal: any failed → status `failed`, `releaseOrRefund(userId, runId)` once; all succeeded/skipped-with-optional → status `completed`, `settleReservation(userId, runId, actualTotal)` (actual ≤ reserved, clamp rule reuses wallet logic), assemble `result.outputs`/`result.assembled` (deliverable-first shape preserved), persist AgentMessage `run` + `outputs` (same kinds as today), `User.credits` mirror sync via existing wallet behavior.
  - [ ] A1.2.6 Progress persistence: after every transition write `result.stepResults` (n, agent, task, status, error, output) so `GET /api/agent/run/[id]` shape is unchanged for the client.
- [ ] A1.3 `executeInternalStep(step, run, priorOutputs)` in agent-runner: storyboard (approved-draft pass-through free, else LLM strict-JSON — reuse existing `executeStoryboardStep` logic), assembly (`assembleVideos` on succeeded video outputs + transitions; audio bed from run params), export manifest, website/coding/persona/marketing-text (llmComplete). $STEP_N_OUTPUT/${storyboard} resolution identical to current `executeStep`.
- [ ] A1.4 `src/lib/job-runner.js`: payload branches —
  - [ ] A1.4.1 `payload.internal === true` → dispatch `executeInternalStep` (no provider submit); success/failure mapped to Generation + step; retryable LLM failures use existing failJob backoff.
  - [ ] A1.4.2 `payload.agentRunId` → bypass per-generation money (run-level reservation owns it); on terminal, `safeAdvanceAgentRun` (never throws; circular-import-safe lazy dynamic import like template-runner).
  - [ ] A1.4.3 Media steps inside agent runs DO get Asset rows + lineage on success (close the async-asset gap for this path) via shared `recordGenerationAsset` (Q1.1).
- [ ] A1.5 `src/lib/wallet.js` `sweepExpiredReservations`: add AgentRun branch BEFORE Generation branch — key matches AgentRun: status executing→skip regardless of TTL; completed→settle `creditsUsed`; failed/cancelled→release. Unit tests for each transition.
- [ ] A1.6 Routes —
  - [ ] A1.6.1 `POST /api/agent/run`: `background:true` AND default both → `startAgentRun` (durable), return `{queued:true, runId}`. `stream:true` → start durable run, then emit SSE frames by polling run state (≤2s tick) until terminal (frames `step_start`/`step_complete`/`run_complete` preserved for the client); HTTP connection no longer load-bearing.
  - [ ] A1.6.2 `POST /api/agent/step`: build a 1-step plan (params + paramOverrides merged), `boundOutputs = previousOutputs`, start durable single-step run; return `{queued:true, runId, stepId}`. Regenerate = same with `regenerate:true`. (Replaces in-request execution + up-front debitWallet.)
  - [ ] A1.6.3 `GET /api/agent/run/[id]` — unchanged contract; now reads AgentRunStep-backed `result.stepResults`; add `cancelRequested` field.
  - [ ] A1.6.4 `POST /api/agent/run/[id]/cancel` (NEW): owner-only, sets `cancelRequested`, returns state; running provider jobs finish but no new steps enqueue; reservation released for unexecuted remainder.
- [ ] A1.7 `agents.js` cleanup: `executeAgentRunBackground`/`executePlannedRun` up-front `debitWallet` path removed from the route flow (kept only as thin delegators to agent-runner or deleted if unreferenced; no behavioral dead code left behind). `executeAgentStep` re-quotes and delegates to the single-step durable run. PRESERVE: planTask/planTaskStream/extractPlanJson/resolveApprovedPlan/storyboard prompt contracts.
- [ ] A1.8 `scripts/worker.mjs`: add periodic `sweepStaleAgentRuns()` (executing runs with zero active jobs and no step change > 10 min → fail + release) alongside existing reaper; graceful shutdown unchanged.
- [ ] A1.9 Client (OrchestratorStudio): review-mode Accept/Regenerate consume `{queued, runId}` + poll (reuse existing 3s poll) instead of the 600s in-request body; "Don't ask again" unchanged (already background). No visual regression.
- [ ] A1.10 Tests —
  - [ ] A1.10.1 Unit: DAG derive (dependsOn from tokens), cycle rejection, budget gate, advanceAgentRun idempotency (call twice → one settle), cancel path.
  - [ ] A1.10.2 Integration: full durable agent run (mock provider submit/poll), PM2-kill simulation (complete job via webhook after "restart" → run still completes, exactly one settle), failed step → release remainder, sweep branch transitions.
  - [ ] A1.10.3 Money: no double charge on duplicate advance; no settle on failed run; reservation TTL sweep skips executing run.

# B. DAG EXECUTION + PARALLELISM

- [ ] B1.1 `src/lib/dag.js` (worker-safe): `buildDag(steps)` (ids, dependsOn), `validateDag` (unknown deps, cycles), `readyNodes(steps)`, `progressFor(steps)` (done/total), `topoLayers`. Unit tests incl. diamond deps + cycle.
- [ ] B1.2 Agent planner (`planTask` + `buildHeuristicPlan`) emits independent root steps without artificial ordering deps; storyboard dependents declare `${storyboard}`; scene stills depend only on storyboard; video clips depend on their still (continuity) — parallelism emerges from the DAG, not hardcoded sequence.
- [ ] B1.3 Template runner parallelism: `advanceTemplateRun` enqueues ALL ready steps (dependsOn from graph) up to cap 3 instead of strictly-one-running; `$stepN.output` resolution per completed dep only. Existing sequential templates keep working (chains are 1-wide DAGs). Integration test: 2 independent steps run concurrently (both jobs queued after run start).
- [ ] B1.4 Concurrency limits: `claimNextJob` SQL extended — per-user cap (`USER_JOB_CONCURRENCY`, default 4) and per-provider cap (`PROVIDER_JOB_CONCURRENCY`, default 8) via running-count subselects; env-tunable; unit/integration test with caps=1 proving serialization.
- [ ] B1.5 Cancellation propagation: run/pipeline cancel → queued jobs for that run marked dead (`dead`, lastError `cancelled`), running jobs allowed to finish but their advance no-ops (status already terminal).
- [ ] B1.6 Progress: `GET /api/agent/run/[id]` and template run poll expose `{done, total}` (computed from step states) without shape breakage.

# C. CHARACTER STUDIO (first-class Characters)

Problem: characters = prose JSON in ProjectMemory; zero UI passes `characterId`; no structured identity, references, voice, or consistency tooling. Target: polished Character Studio; `StudioEntity` (kind=character) is the entity; integrates everywhere via pickers + prompt/reference injection.

Files: NEW `src/lib/entities.js`, `src/app/api/entities/*`, `src/components/studio/CharacterStudio.js`; EDIT generate/async, generation-handler, agents.js (mentions), director-planner, StudioClient, tools.js.

- [ ] C1.1 `src/lib/entities.js` (web-side; worker-safe core `entity-prompt-core.mjs` for prompt/reference selection): CRUD (`listEntities(userId, kind)`, `createEntity`, `getOwnedEntity`, `updateEntity` — attributes immutable when `status='locked'`, `deleteEntity`), `validateEntityPayload(kind, body)` (name 1..80, description ≤2000, attributes object with per-kind allowed keys, references array of {url http(s)|/api/media, kind enum, label ≤80, locked bool}), `entityPromptBlock(entity)` (structured attribute text), `selectEntityReferences(entity, {purpose, max})` (locked/user refs first, then `sheet`/`full_body`/`face_front` by purpose; cap by model `maxImages`), `computeFingerprint(entity)` (LLM vision summary of references when available, else attribute digest), `mergeLegacyCharacter(memoryRow)` mapping for backfill reads.
- [ ] C1.2 `POST/GET /api/entities` (session, verifyOrigin on mutations, owner-scoped, kind filter, pagination limit 100), `GET/PATCH/DELETE /api/entities/[id]` (404 uniform on non-owner), `POST /api/entities/[id]/references` (add uploaded/generated ref; kind validated), `DELETE /api/entities/[id]/references/[refId]`.
- [ ] C1.3 Identity pack generation `POST /api/entities/[id]/generate-pack`: durable single jobs (normal `/api/generate/async`-style reserve→enqueue→settle per image, kind=internal tooling NOT used — these are real media generations) producing `sheet`, `full_body`, `face_front`, `face_side`, `face_34` images from description+existing refs; each result auto-appended to `references[]` (source labelled `generated`); per-image failure refunds (existing job money path); endpoint picks cheapest runnable `tti` model at quote time (never hardcoded ID).
- [ ] C1.4 Consistency test `POST /api/entities/[id]/test`: 3 probe prompts (portrait / full-body scene / different setting) generated with entity refs; results shown side-by-side; charged at normal quotes with explicit confirm; store last test run id in `attributes.consistencyTest`.
- [ ] C1.5 `POST /api/entities/[id]/fingerprint`: writes `fingerprint` (deterministic attribute digest + optional vision summary when VISION_MODEL configured; degrade gracefully).
- [ ] C1.6 Voice assignment: PATCH accepts `voiceId` from user's ready VoiceProfiles (validated ownership); surfaced in prompt block as speaking style/voice notes for voiceover steps.
- [ ] C1.7 CharacterStudio UI (new tool `characters`, registered in tools.js + StudioClient + shortcuts + palette; tabs: Characters / Products / Environments sharing one polished surface):
  - [ ] C1.7.1 Grid list with avatars (first reference thumb), status badges (Draft/Ready/Locked), search.
  - [ ] C1.7.2 Editor (kit Sheet/Modal patterns, full a11y): identity section (name, description, age appearance, gender presentation, face, skin, hair, eyes, build, height impression, distinctive features, wardrobe, accessories, makeup, default expressions, personality, speaking style, language), voice picker (from ready voice profiles), reference manager (upload via Dropzone, kind labels, lock/unlock, delete, set-as-primary), Generate identity pack, Regenerate single reference (re-run one kind), Lock identity (confirm dialog; unlock requires new confirm), Run consistency test.
  - [ ] C1.7.3 Product editor fields (name, description, materials, colors, dimensions notes, reference kinds front/side/back/closeup/logo/packaging), Environment editor fields (description, lighting notes, time-of-day variants, viewpoint refs) — same surface, kind-driven field sets.
  - [ ] C1.7.4 Mobile: one-tree responsive, 44px targets, sheet editor; keyboard: full tab order, Esc closes, focus restored.
- [ ] C1.8 Integration — generation surfaces:
  - [ ] C1.8.1 `/api/generate/async` + sync generation-handler accept `entityIds: []` (validated owner entities): prompt prefixed with `entityPromptBlock` for character/product/environment text; `images_list`/`image_url` filled from `selectEntityReferences` capped by target model `maxImages`; `Generation.params.entityIds` persisted for lineage.
  - [ ] C1.8.2 Image/Video/Marketing/Perform studios: entity picker (multi for characters+products, single for environment) beside the brief — chips with avatar; sends `entityIds`. No copy/paste of descriptions anywhere.
  - [ ] C1.8.3 Canvas: entity references importable as layers (uses existing reference-role layer flow).
- [ ] C1.9 Integration — Agent: `@Name` mention resolution extended to entities (resolveMentionRows scans entities too); plan steps touching a mentioned entity carry `params.entityIds`; planner prompt lists available entities (id, kind, name, one-line description) so the LLM can assign them; Agent chat system prompt includes project/entity context when session has projectId.
- [ ] C1.10 Integration — Director: brief `characters[]` accepts `{entityId}` (server hydrates name/description/referenceUrl from entity; rolling character refs keyed by entityId when present, else name slug as today); cast editor offers saved-entity picker alongside ad-hoc entries.
- [ ] C1.11 Legacy compat: `/api/memory?type=character` still returns pre-migration ProjectMemory rows (untouched); MemoryStudio "character" kind now deep-links to Character Studio ("Characters moved to a dedicated studio"); old `characterId` (ProjectMemory id) prompt hook keeps working.
- [ ] C1.12 Tests: unit (validateEntityPayload, selectEntityReferences ordering/caps, prompt block, immutability-when-locked), integration (CRUD ownership, generate-pack money path with mock provider, async route entityIds injection + params persisted), E2E (create→upload ref→generate pack→use in image studio→asset shows entity badge).

# D. CHARACTER CONSISTENCY ENGINE

- [ ] D1.1 Reference selection is angle/purpose-aware (C1.1 `selectEntityReferences`): dialogue/close-up→`face_front`/`face_34`; wide/action→`full_body`; wardrobe-critical→`outfit`; planner hint: shot camera framing chooses purpose.
- [ ] D1.2 Rolling references unified: director `stateMetadata.characterRefs` keyed by entityId-or-slug; first completed image containing the entity seeds it; `resolveCharacterReferences` order = uploaded refs → rolling ref → pending. Agent runs: same rolling-ref store on `AgentRun.result.characterRefs` for multi-scene runs.
- [ ] D1.3 Multi-reference models: when target model `maxImages > 1`, inject up to cap (entity refs + rolling + handoff); single-ref models get primary only; text-only fallback appends full attribute block (fallback strategy when reference support is weak).
- [ ] D1.4 First/last-frame continuity: existing `chainStepIfNeeded` (agents) + new director shot chaining (H1.4) consume last frames; continuityTracker.previousEndingFrame stays descriptive (documented).
- [ ] D1.5 Immutable attributes: `status='locked'` rejects attribute PATCH (409 `locked`); generation params snapshot the entity attribute digest (`params.entityDigest`) so later edits don't rewrite history.
- [ ] D1.6 Model-aware prompting: prompt block phrasing varies by model family (photoreal vs stylized vs multi-ref) via prompt-engine dialect hook (extend `prompt-engine/dialect-compiler.js` family map to current catalog families).
- [ ] D1.7 Lineage: `Asset.metadata.entityIds` + `Generation.params.entityIds` written on every entity-using generation (all paths incl. async/webhook); Asset detail shows linked entities; entity detail shows "Used in N assets" gallery.
- [ ] D1.8 Tests: unit (purpose selection, caps, rolling-ref precedence, digest snapshot), integration (two-shot run reuses rolling ref; asset entityIds persisted via webhook path).

# E. PRODUCT CONSISTENCY

- [ ] E1.1 Products are `StudioEntity kind='product'` (schema from 0.1.3; C1.7.3 editor). Reference kinds: front/side/back/closeup/logo/packaging.
- [ ] E1.2 Prompt block + reference selection for products (`entityPromptBlock` product variant; `selectEntityReferences` purpose `product_hero`→front/closeup).
- [ ] E1.3 Marketing/UGC flows: MarketingStudio product uploads can be saved as a Product entity in-place ("Save as product" after upload); saved products selectable thereafter (picker); Agent/Director maintain product across stills/ads/clips via entityIds (shares D engine).
- [ ] E1.4 Tests: unit (product prompt block), integration (marketing generation with product entity → params.entityIds + images_list injected).

# F. ENVIRONMENT / LOCATION CONSISTENCY

- [ ] F1.1 Environments are `StudioEntity kind='environment'`; reference kinds: wide/detail/texture; attributes: description, lighting, time-of-day variants, viewpoint notes.
- [ ] F1.2 Agent/Director maintain environments between shots when requested: planner accepts `environmentId` (brief + storyboard scene `location` can reference entity by name); image steps inject environment refs/attributes; storyboard scenes display linked environment chip (UI).
- [ ] F1.3 Tests: unit (environment prompt block), integration (two scenes same environment → both generations carried entityIds).

# G. UNIFY AGENT + DIRECTOR MODEL RESOLUTION

Problem: director presets/executor/planner carry stale hardcoded IDs (`flux-dev`, `wan-2.6`, `suno-v4`, `kling-v2.1-i2v`, `seedance-2.0`); admin grid keyed by legacy static arrays; agents LAST_RESORT includes dead `wan2.6-t2v`. Target: one catalog-driven resolution path (0.2) used by Agent, Director, Workflows, Templates.

- [ ] G1.1 `director-constants.js` presets: replace `defaultModelImage/Video/Audio` stale IDs with capability descriptors (`{image:"tti.default", video:"i2v.default", audio:"music.default"}`); resolved at plan/execution time via runnable-models (cheapest-runnable default; quality tier aware H2.4).
- [ ] G1.2 `director-planner.js` LLM example `modelRoute: "wan-2.6"` → `"i2v.default"` token; normalization maps tokens→live models; heuristic builder same.
- [ ] G1.3 `director-executor.js` (and its H-successor) resolve every model via `resolveRunnableModel`; planned model unrunnable → substitute cheapest runnable ≤ shot budget; user-selected shot model honored when runnable; server re-quote on any substitution (never exceeds pipeline estimate ceiling).
- [x] G1.4 `agents.js` LAST_RESORT_FALLBACKS: drop `wan2.6-t2v` (dead); fallbacks verified against live catalog at boot-free call time (already `resolveRunnableModel`-gated — keep, add unit test asserting each listed ID resolves or is skipped).
- [ ] G1.5 Admin models grid (`/api/admin/models` + ModelManager.js): list from `getCatalogModels({isAdmin:true, includeInactive:true, includeCosts:true})` (DB SSOT), not legacy static arrays; legacy-ID rows marked `uncategorized/legacy` for cleanup; pricing edits continue through margin-floor guards.
- [ ] G1.6 `prompt-expansion.js`: family keys updated to current catalog families (substring matching on current IDs: `flux-2`, `nano-banana-2`, `kling-3`, `wan/2-7`, `seedance-2`, `veo3`, `sora-2`, `suno-v5`); stale keys removed; generic template remains fallback. Unit test: each key matches ≥1 active catalog id.
- [ ] G1.7 `canvas-compiler.js` accepts the live catalog model record (CanvasStudio already re-derives); static-list import removed; "Unknown model" warning eliminated for catalog models.
- [ ] G1.8 Deduplicate flat fallback pricing: `plan-constants.js CREDIT_COSTS` vs `pricing-engine.js getFallbackCost` → single map in pricing-engine, plan-constants re-exports (no behavior change; one source).
- [ ] G1.9 Tests: unit (preset tokens resolve to runnable models against seeded catalog; substitution ceilings; prompt-expansion key freshness), integration (director quote uses live pricing; unrunnable planned model substituted within ceiling).

# H. DIRECTOR DURABILITY

Problem: see AUDIT GAP-1..14. Target: director production runs on GenerationJob queue like template runs; one reservation per pipeline; per-shot staged jobs (image→video→audio); idempotent advance; watchdog; pause/resume/cancel; plan lock fixed; money exact.

Files: NEW `src/lib/director-runner.js`; EDIT `director-executor.js` (slim delegator), `job-runner.js`, `wallet.js`, `/api/director/*`, `video-assembly.js`, DirectorStudio.js, Timeline.js, `worker.mjs`.

- [ ] H1.1 `startDirectorRun(pipelineId, userId)`: state guard (planning|failed|cancelled|completed→re-run allowed via edges added to VALID_TRANSITIONS: `failed→queued`, `cancelled→queued`, `planning→queued`; stuck `queued/generating_*` re-entry allowed idempotently); balance check vs `costEstimate.totalCredits`; `reserveCredits(userId, total, "director:<id>", TTL=max(60, shots*3*40))`; upsert DirectorShot rows (pending); transition `queued`; enqueue first wave of shot IMAGE jobs (cap = pipeline.concurrency, default 3): payload `{directorPipelineId, shotId, stage:"image", model, endpoint, prompt, images_list?...}`; transition `generating_images`.
- [ ] H1.2 `advanceDirectorPipeline(pipelineId)` (idempotent; called from job terminal hooks + worker tick):
  - [ ] H1.2.1 Shot stage machine: image succeeded → persist `imageResult` + seed rolling entity refs → enqueue VIDEO job (i2v from shot image; refs via resolveCharacterReferences); video succeeded → `videoResult` → preset.requireAudio/type music_video → enqueue AUDIO job else shot completed; audio → `audioResult` → shot completed. Failed stage → shot failed (error persisted), no re-enqueue of that stage (manual rerun path exists), pipeline continues.
  - [ ] H1.2.2 Concurrency: count in-flight (queued+running) jobs for pipeline < concurrency → enqueue next pending shot images.
  - [ ] H1.2.3 All shots terminal → enqueue internal ASSEMBLY job (`assembleVideos` with per-boundary transitions from plan; music bed = brief musicUrl or first shot audioResult; `-shortest` mux — fixes GAP-8) → success: `assembledUrl` + `assemblyMetadata`; settle.
  - [ ] H1.2.4 Money at completion: `actual = Σ shotCosts[shot].costs[stage] for succeeded stages + assemblyCost(when >1 clip)`; `settleReservation(userId, "director:<id>", actual)` — failed shots/stages NEVER charged (fixes GAP-12); status `completed` (≥1 shot ok) else `failed` + release remainder; `stateMetadata.creditsUsed=actual`; return shape keeps `creditsUsed` accurate (not "full estimate").
  - [ ] H1.2.5 `cancelRequested` → stop enqueueing, skip pending shots, running jobs finish (advance no-ops), release remainder, status `cancelled`.
- [ ] H1.3 Job-runner/webhook: `payload.directorPipelineId` → bypass per-gen money; on terminal call `safeAdvanceDirectorPipeline` (lazy import); internal assembly jobs dispatched like A1.4.1.
- [ ] H1.4 Continuity chaining: shots whose plan `continuity` includes `follows:<shotId>` get I2V `last_frame_url` from the referenced shot's extracted last frame (`video-chain.js extractLastFrame` — promote usage into director); dependency expressed as job ordering (chained shot video job enqueued only after source shot video succeeded).
- [ ] H1.5 Watchdog (`worker.mjs` periodic `sweepStaleDirectorRuns()`): pipelines in `queued/generating_*/assembling` with zero active jobs and no shot update > 10 min → `failed` + `releaseOrRefund` (fixes GAP-2/3); `wallet.sweepExpiredReservations` gains Director branch (key `director:<id>`: executing states→skip; completed→settle stateMetadata.creditsUsed; failed/cancelled→release).
- [ ] H1.6 Plan lock fixed: `updateProductionPlan` refuses when status ∈ {queued, generating_images, generating_video, generating_audio, quality_check, assembling} (409 `plan_locked`); unit test (fixes GAP-9).
- [ ] H1.7 `generateShotAsset` + `rerunShot` durable-ized: reserve per-op keyed by the new Generation id; enqueue single job with `payload.directorShotHook={pipelineId, shotId, kind, op}`; normal per-generation settle/release on terminal; hook updates DirectorShot (+ rolling refs) after settle; BOTH guarded against pipeline executing states (409) (fixes GAP-10 + restart-money-loss); rerunType validation kept.
- [ ] H1.8 Pause/resume: `POST /api/director/pause` (owner) sets `stateMetadata.paused=true` (advance skips enqueueing new work; running jobs finish); `POST /api/director/resume` clears and kicks advance; cancel via `POST /api/director/cancel` (sets cancelRequested). Status enum additions are strings only — no migration needed beyond 0.1.7 columns.
- [ ] H1.9 `/api/director/assemble` (NEW owner route): body `{pipelineId, clips[{url,inSec,outSec,volume?,muted?}], transitions, audioUrl?, audioVolume?, fadeIn?, fadeOut?, format?}` → assembleVideos (K1.x) → persists `assembledUrl` + `assemblyMetadata.timeline` (fixes GAP-7) → optional `tool:"director"` Generation row for history. `/api/assemble` remains the generic free local-ffmpeg tool but gains rate limit.
- [ ] H1.10 Rate limits (fixes GAP-11): `/api/director/plan`, `/execute`, `/rerun`, `/generate-shot`, `/timeline-chat`, `/api/assemble` added to security.js RATE_LIMITS + `checkRateLimit` calls (plan 5/min, execute 5/min, others 10–20/min).
- [ ] H1.11 Transactional integrity: shot upsert + Generation create + job enqueue wrapped per-shot in `$transaction` where ordering matters; pipeline transitions merge stateMetadata atomically (fixes GAP-13b).
- [ ] H1.12 UI: DirectorStudio poll gains 30-min cap with clear stuck-state message + "Check status" recovery (fixes GAP-14); pause/resume/cancel controls while running; failed-shot cost honesty in UI ("not charged"); Timeline.js hydrates from `assemblyMetadata.timeline` on load (persisted edits survive reload) and saves via H1.9.
- [ ] H1.13 `director-executor.js` becomes a thin module re-exporting planner/executor helpers actually used elsewhere (resolveCharacterReferences, characterSlug, seedRollingCharacterRefs, transitionPipeline, getPipelineStatus); `executeProductionPipeline` deleted; `autoAssemble` dead param removed from route + UI (dead-code AE item).
- [ ] H1.14 Tests —
  - [ ] H1.14.1 Unit: stage machine transitions, settle-actual math (failed shot excluded), plan-lock statuses, cancel path, watchdog predicate.
  - [ ] H1.14.2 Integration: full durable pipeline (mock provider) image→video→audio→assembly→settle exact amount; kill-resume mid-pipeline (webhook completes job after "restart"); rerun-shot durable path; double-execute idempotency (second POST returns existing run, no double reserve).
  - [ ] H1.14.3 E2E: director journey (plan→edit shot→execute→leave→reopen→progress→regenerate one shot→reassemble→export).

# I. DIRECTOR PERFORMANCE

- [ ] I1.1 Parallel shot execution delivered by H1.2.2 (cap = pipeline.concurrency; user-editable 1–5 in production settings sheet).
- [ ] I1.2 Entity pack/reference generations are root DAG nodes (parallel by construction, C1.3).
- [ ] I1.3 Provider/user/global concurrency honored via B1.4 claim caps.
- [ ] I1.4 Progress exposure: `/api/director/status` adds `{progress:{done,total,stage}}`; UI board shows per-stage counts + ETA-less honest progress (no fake percentages).
- [ ] I1.5 Tests: integration (3-cap respected: never >3 running jobs for a pipeline), unit (progress calc).

# J. STORYBOARD SYSTEM

Current: agent storyboard step (scenario/characters/scenes, editable pre-approval) + director storyboard cards (full shot ops). Target: scene ops + frame generation + propagation proof.

- [ ] J1.1 StoryboardCard scene ops: add scene, remove scene (min 1), duplicate, reorder (up/down + drag), per-scene field edit preserved; ops update step `params.storyboard` JSON (existing changeStep path); character assignment edit per scene (chip multi-select from storyboard characters + saved entities).
- [ ] J1.2 Frame generation: per-scene "Generate frame" (pre-approval, free of plan changes? NO — runs as a durable single-step image run via A1.6.2 with prompt from scene description + linked entity refs; result URL stored into `scenes[i].frameUrl`; regenerate replaces; lock/approve flags `scenes[i].frameLocked`); "Generate all frames" iterates unfilled scenes (each its own durable job, normal quotes, explicit confirm with total estimate).
- [ ] J1.3 Propagation: `${storyboard}` injection already embeds frames+scenes into downstream prompts; add explicit `frameUrl` usage: scene still steps prefer `i2i` from approved frame when present (referenceOnly output so it doesn't pollute deliverables).
- [ ] J1.4 Director storyboard parity: per-shot "generate still" pre-run already exists (generate-shot image) — verify durable per H1.7; storyboard frames from J1.2 importable into director shot imageStrategy.references.
- [ ] J1.5 Tests: unit (scene ops reducers, frame JSON round-trip), E2E slice (edit storyboard → generate frame → appears in card → referenced in run params).

# K. TIMELINE / FINAL EDITING

Current: reorder/trim/split/remove/replace/regenerate/transitions(cut|fade|dissolve)/NL-chat/re-assemble — all client-state only. Target: + audio, volumes, duplicate, fades, export options, persistence (H1.9/H1.12).

- [ ] K1.1 `video-assembly.js` extensions: per-clip `volume` (0–2) + `muted` (volume filter per trimmed segment); `audioUrl` music/voiceover bed (`amix=inputs=2:duration=first:dropout_transition=0`, bed `volume` param, `-shortest` guard for shorter bed: loop bed via `-stream_loop -1` when bed shorter than video); keep `-an` only when no audio anywhere (else map mixed audio); `fadeIn`/`fadeOut` (fade=t=in/out on first/last segment); `format` preset (`source` default | `720p` | `1080p` → scale+crf map). All numbers validated pre-ffmpeg; timeouts preserved.
- [ ] K1.2 `timeline-ops.js` + NL chat grammar: add `duplicate` (copy clip at index), `volume` (set per-clip), `mute`/`unmute`, `set_audio` (attach bed), ops validated against shifting indices like existing ops.
- [ ] K1.3 Timeline.js UI: audio bed lane (pick from completed audio generations or upload; volume slider; mute toggle), per-clip volume slider + mute, duplicate button, fades toggles (fade in/out), export preset picker (Source/720p/1080p), Re-assemble persists via H1.9; hydrates from persisted timeline (H1.12); all controls keyboard reachable with aria labels (existing slider pattern).
- [ ] K1.4 Replace-without-regenerate guarantee: any single clip replace/trim/reorder never triggers regeneration (pure ffmpeg on existing files) — already true; add E2E assertion.
- [ ] K1.5 Tests: unit (buildTrimArgs volume/mute filters, amix graph with bed, fade filters, format presets, ops validator new ops), integration (assemble with bed+volume produces file — ffmpeg present locally; skip-guarded when ffmpeg absent), E2E (trim+bed+export persists across reload).

# L. VFX STUDIO

Target: model-aware VFX surface driven strictly by catalog capability — no fake controls.

- [ ] L1.1 New tool `vfx` (VfxStudio.js) modes: `edit` (i2i incl. inpaint models — prompt + optional mask_url when model schema has mask field), `remove-bg` (capability `background-removal`/`remove-background` rows only), `upscale` (image-upscale + video-upscale groups), `restyle` (v2v group), `relight` (rendered ONLY if a catalog row with capability `relight*` exists — else mode hidden), `faceswap`/`recast` (recast group, links to existing VideoEdit recast if duplicate). Mode bar hides modes with empty pools.
- [ ] L1.2 Params strictly schema-driven (offers()/enums like AudioStudio pattern); hidden when unsupported (S-phase contract); submit via `useAsyncGeneration` (durable async route); cost via `useCreditCost`.
- [ ] L1.3 Registration: tools.js/StudioClient/[tool] metadata/shortcuts/palette/legacy redirects if needed; SendTo targets extended (image→"Remove background"/"Upscale", video→"Restyle"/"Upscale").
- [ ] L1.4 Tests: unit (mode-pool derivation from seeded catalog incl. empty-pool hiding), E2E (remove-bg happy path with e2e fixture model).

# M. MASKING / REGION EDITING

- [ ] M1.1 `MaskEditor` component (kit-grade): brush/eraser with size control, invert, clear, include/exclude mode (paint vs protect), region naming (text label per mask session), undo stack; exports PNG dataURL (white=edit, black=preserve); touch + pointer support; keyboard shortcuts documented in ShortcutHelp.
- [ ] M1.2 Wiring: VfxStudio `edit` mode + ImageStudio edit mode show MaskEditor when chosen model schema declares a mask field (`mask`/`mask_url`); mask uploaded via `/api/upload` → `mask_url` param; generation params retain mask_url (lineage); mask saved as Asset (source `mask`, parentAssetId = source image asset when known).
- [ ] M1.3 Canvas keeps its existing mask roles (include/exclude layers) — compiler already emits masks for mask-literate models; add warning UI parity with VFX when model is mask-illiterate (exists) — no duplicate mask systems (documented shared representation: PNG white-on-black).
- [ ] M1.4 Tests: unit (mask export pixel math — pure canvas-free core in `src/lib/mask-core.mjs`: invert/merge/export-array), E2E (paint mask → submit edit → params include mask_url).

# N. PRODUCTIZED ONE-CLICK CREATION MODES

- [ ] N1.1 Extend `PRODUCTION_TYPE_PRESETS` (director-constants): add `brand_film`, `launch_film`, `film_trailer`, `explainer`, `story_video`, `voiceover_video`, `fashion_film` with sectionStrategy/shotsPerSection/duration/aspect per type; existing 5 untouched.
- [ ] N1.2 New executable template seeds (template-seeds.js additions, toolType `director` where multi-shot, `workflows` where linear): Product Ad (exists), UGC Ad (exists), Social Ad (viral-hook exists), Brand Film, Launch Film, Short Film (exists as short-drama), Music Video (exists as music-visualizer), Film Trailer, Explainer, TikTok/Reel (pov-drama exists), YouTube Short (talking-avatar covers — add explicit short), YouTube Video (explainer-long), AI Influencer (exists), Product Photography (ecommerce exists), Fashion Shoot, Story Video, Micro Drama (exists), Podcast Clip (exists), Talking Avatar (exists), Voiceover Video. GAP seeds to add: Brand Film, Launch Film, Film Trailer, Explainer, YouTube Video, Fashion Shoot, Story Video, Voiceover Video (8 new, all graphs validated by template-graph + publishable via canPublish).
- [ ] N1.3 DirectorStudio consumes `templateConfig` (from `?template=` apply flow) to prefill brief (type/concept/duration/platform); template cards deep-link `/studio/director?template=<slug>`.
- [ ] N1.4 Templates landing grouping by goal (Market / Story / Social / Audio) using existing category field — no new silos.
- [ ] N1.5 Tests: seed validation unit test (every seed graph validates + models resolve against seeded catalog), integration (seed script idempotent upsert).

# O. TEMPLATE SYSTEM

- [ ] O1.1 User templates: `Template.userId` nullable (migration 0.1 or follow-up `template_user_templates`); `POST /api/templates/save` (owner) from a Workflow or an Agent plan → creates Template (isPublished=false, userId) + TemplateVersion v1 (graph built from steps via template-graph builder helper); `GET /api/templates?mine=1`.
- [ ] O1.2 Duplicate: `POST /api/templates/[slug]/duplicate` (owner-or-admin; copies latest version graph into new v1 draft).
- [ ] O1.3 Edit: owner PATCH creates NEW TemplateVersion (immutable published graphs preserved); publish for user templates = `isPublic` share toggle (listed under Community), admin `isPublished` = official (existing gate `canPublish`).
- [ ] O1.4 Workflow "Save as template" button (WorkflowStudio) wired to O1.1; `makeTemplate` orphaned lib function removed or wired (choose: wire to same route, delete orphan).
- [ ] O1.5 TemplateUsage: apply flow records `generationId` when the apply leads to a generation (best-effort backfill on async submit with template context); decrement remains at apply (documented semantics) — UI copy "use recorded when you start in the studio".
- [ ] O1.6 Tests: unit (graph builder from workflow steps), integration (save→duplicate→new-version edit→run), API ownership tests.

# P. PROJECTS

Problem: `Project` table dead; "Projects" nav label actually opens ProjectMemory. Target: real organizational object with explicit membership; agent project context.

- [ ] P1.1 API: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/[id]` (owner-scoped); body {name, description, brief, status}; PATCH allowlist.
- [ ] P1.2 Membership: `projectId` columns (0.1.5) settable via: Asset PATCH {projectId}, Director PATCH {projectId} (new route field), AgentSession PATCH {projectId} (extend sessions route), Workflow PATCH {projectId}; `GET /api/projects/[id]` returns `{project, assets, pipelines, sessions, workflows}` (counts + first-page items each).
- [ ] P1.3 ProjectsStudio UI (rename MemoryStudio surface honestly): new tool `projects` replacing the mislabeled `memory` entry (memory moves to `library` group as "Memory"); project list (create/rename/archive), project detail: brief editor, linked items sections with open-in-studio actions, "add current" affordances from studios (session/direction pickers), entity tabs (project characters/products/environments via `?projectId=` filter on /api/entities — StudioEntity.projectId nullable added in same migration).
- [ ] P1.4 Agent project context: session PATCH accepts projectId; agent chat/plan system prompt includes project brief + entity summaries when set; plan approval shows project chip.
- [ ] P1.5 Opening a project restores context: deep links carry `?project=` which studios honor (session create pre-binds; asset library filters).
- [ ] P1.6 Tests: integration (membership writes, ownership, project payload), E2E (create project → bind session → asset lands in project).

# Q. ASSET SYSTEM + LINEAGE

- [ ] Q1.1 `recordGenerationAsset(generation, {source})` shared writer (NEW in `src/lib/assets-core.js`, worker-safe): creates Asset on EVERY successful generation path (sync handler, job-runner, webhook) with `{type, source:"generation", url, storageKey(from ingest), model, generationId, parentAssetId (input-url→asset lookup as today), metadata:{tool, prompt, creditsUsed, entityIds: params.entityIds ?? []}, projectId: params.projectId}`; idempotent on generationId (unique guard via findFirst+create race tolerated with catch). AssetRelation rows written for parent/child (`derived`).
- [ ] Q1.2 GET /api/assets: server-side `search` (name ILIKE), `favorite=1`, `entityId`, `projectId` filters; stable merged cursor (generations merge retained for legacy rows missing Assets; new rows all have Assets); limit≤100.
- [ ] Q1.3 Asset mutations: PATCH {name?, isFavorite?, projectId?, tags? (metadata.tags string[] ≤20)}; DELETE soft (existing); `POST /api/assets/[id]/restore` clears isDeleted.
- [ ] Q1.4 Upload: extract width/height for png/jpg/webp/gif + duration n/a (dependency-free header sniffer in upload-sniff.js); response includes `assetId`.
- [ ] Q1.5 AssetLibraryStudio: server search box + favorites filter wired to API (not client-only), tags editor, rename inline, restore from "Trash" filter, entity badges, project filter chip, lineage view walks full parent chain (loop-safe) + children + entity links; "Use in" menu (Agent/Director/Canvas/Workflow reference injection via handoff/entity refs).
- [ ] Q1.6 Tests: unit (sniffer dimensions, cursor merge), integration (async generation → Asset row exists with lineage + entityIds; search/favorite filters; restore), E2E covered in C1.12/Q journeys.

# R. MODEL CATALOG AS SINGLE SOURCE OF TRUTH

- [ ] R1.1 Kill runtime dependence on `models.js` static arrays: `generation-handler.js`/`generate/async` MODEL_REGISTRY fallback → resolve endpoint/providerModelId from the ModelPricing row only; row missing endpoint AND providerModelId AND not in a small curated `ENDPOINT_FALLBACKS` map inside `model-catalog-core.mjs` (moved from models.js, marked deprecated-aware) → `model_not_priced` 422. models.js shrinks to: CINEMA_*/MARKETING_AVATARS/INFLUENCER_TABS constants (non-model knowledge) with a header noting model arrays are catalog-served.
- [ ] R1.2 Admin grid DB-only (G1.5) closes shadow-row hazard; `POST /api/admin/models` rejects ids that don't match an existing row unless `create:true` explicit (prevents typos creating orphans).
- [ ] R1.3 Capability/modelType/audioKind/subtype all catalog-derived everywhere (capability-groups.js stays UI-only vocabulary).
- [ ] R1.4 Availability/fallback suitability: `ModelPricing.constraints.verification` verdicts honored in runnable pools (already) + surfaced in admin grid column.
- [ ] R1.5 Tests: unit (registry fallback removal paths), integration (row without endpoint but with providerModelId works; row with neither → 422).

# S. MODEL-AWARE PARAMETER UI

- [ ] S1.1 Sweep all studios for controls not backed by model schema: VideoStudio `camera_motion` (MOVES) — gate behind schema field presence or move into prompt-compile only (choose prompt-compile; never send unsupported param); Marketing fallbacks durations/res shown only when model lacks values (current behavior) — keep; ClippingStudio ASPECTS hardcoded → intersect with model schema enum when present.
- [ ] S1.2 VFX studio fully schema-driven (L1.2).
- [ ] S1.3 Server-side validation parity: `validateModelInput(schema, params)` enforced on async route (drop/reject unsupported enum values → 422 with field errors) so no UI mistake becomes a provider 422/500; unit tests incl. case-insensitive enums.
- [ ] S1.4 First/last-frame controls shown only when schema declares them (already via offers() in VideoStudio — verify i2v models; add regression test).

# T. PROVIDER RESILIENCE

- [ ] T1.1 Circuit breaker: `ProviderIncident` auto-open after N=5 consecutive provider-level failures (job-runner failure path, per providerName) → `ops-flags` soft-disable consulted by `resolveProviderWithFallback`; auto-resolve on next success; admin sees incidents (provider-health route exists — wire counts).
- [ ] T1.2 Rate-limit awareness: branded `rate_limit` errors → failJob retry with min 60s backoff floor (extend backoff calc for this class).
- [ ] T1.3 Timeouts: verify submit 60s/poll 30s/heartbeat 60s/lease 5min coherent under concurrency caps (B1.4); document in runbook-jobs.
- [ ] T1.4 Stale recovery: existing reaper + new agent/director watchdogs (A1.8/H1.5) + reservation sweeps (A1.5/H1.5) — one integration test each.
- [ ] T1.5 User-facing errors: branded only (exists); operator diagnostics keep raw via logProviderError (exists) + surfaced in admin jobs view error column.
- [ ] T1.6 Provider name hiding: verify no client payload includes provider/providerName (serializeCatalogModel strips — add regression test on /api/models/catalog + /api/estimate responses).

# U. CREDIT / BILLING CORRECTNESS

- [ ] U1.1 Race-condition test pack (integration): double webhook delivery (same body twice → one settle), webhook vs job-runner race (both paths → one settle), concurrent reserve vs sweep, duplicate enqueue same idempotencyKey, settle-after-release guard ("No active reservation found" → refund path, never both).
- [ ] U1.2 Reconciliation: extend `scripts/reconcile-credits.mjs` to verify invariants (available == Σ non-generation ledger; reserved == Σ active reservations; User.credits mirror == available+0?) and report drift; add `GET /api/admin/reconciliation` read-only report (same math, admin UI panel).
- [ ] U1.3 Kill client-trusting price paths: `/api/estimate/batch` stops echoing client `credits` (recompute server-side; response marks `quoted:true`); cinema/influencer routes bill the EXECUTED model (nano-banana-pro(-edit)) — server re-quotes executed model, ignores client model for pricing (keeps client model only if it equals executed); marketing endpoint choice derived server-side from catalog constraints (resolution→endpoint map moved server-side into generation.js with catalog check).
- [ ] U1.4 Fallback ceilings: agent/director substitution ≤ quoted (A1.1.5/G1.3) — add unit tests asserting ceiling enforcement.
- [ ] U1.5 Actual-cost recording: agent run `creditsUsed` = settled actual; director `stateMetadata.creditsUsed` = settled actual; template run already; providerCost recorded on Generation (exists) + assembly/director rows (add providerCost:0 explicit).
- [ ] U1.6 Reservation TTL coherence: agent (steps*40m) / director (shots*3*40m) / template (exists) documented in one table in runbook-jobs.md.

# V. STRIPE / COMMERCIAL

- [ ] V1.1 `customer.subscription.updated` webhook handler: sync plan/status/currentPeriodEnd/cancel_at_period_end (upgrade/downgrade/scheduled-cancel reflected without waiting for invoice).
- [ ] V1.2 `invoice.payment_failed` handler: subscription → `past_due`, AuditLog entry, no credit revocation (grants are cycle-based; documented), user-facing banner source: `/api/billing/status` includes `pastDue` flag consumed by settings billing.
- [ ] V1.3 Storefront genuinely admin-driven: settings billing page + pricing section fetch `GET /api/billing/plans` (DB SubscriptionPlan active rows sorted by sortOrder) and `GET /api/stripe/topup` packs (exists) — replace any client hardcoded plan lists (verify `src/app/settings` + landing pricing component); placeholder price_ ids guard exists — keep.
- [ ] V1.4 Regression tests: subscription.updated plan change; payment_failed → past_due; promo single-use race (exists? verify + keep); template purchase idempotent verify (exists — keep).
- [ ] V1.5 Audit doc: `docs/runbook-billing.md` short page (renewal/cancel/refund flows + webhook map).

# W. ADMIN PANEL

- [ ] W1.1 Agent runs monitor: `GET /api/admin/agent-runs` (filters status/user/date, pagination) + AdminPanel tab (status badges, credits est vs used, error).
- [ ] W1.2 Director productions monitor: `GET /api/admin/director-runs` + tab (progress done/total, stuck highlight >10min).
- [ ] W1.3 Ledger browser: `GET /api/admin/ledger` (user filter, type filter, reference lookup) + tab.
- [ ] W1.4 Reconciliation panel (U1.2 data) with drift highlighting.
- [ ] W1.5 Jobs view: add `agentRunId`/`directorPipelineId`/`templateRunId` grouping column + stuck-job highlight (running past lease) (extends existing /api/admin/jobs).
- [ ] W1.6 Models grid SSOT (G1.5) + verification verdict column (R1.4) + "deprecated/replacement" badges.
- [ ] W1.7 Tests: route authz (non-admin 403), filters, reconciliation math.

# X. OBSERVABILITY

- [ ] X1.1 Runner logs carry `{jobId, generationId, agentRunId|templateRunId|directorPipelineId, provider, model, attempt, submitMs, pollMs}` structured fields (log.js).
- [ ] X1.2 `GET /api/admin/metrics` extended: queue depth by status, per-provider failure rate 1h/24h, agent/director run counts by status, average settle latency.
- [ ] X1.3 Answerability checklist encoded as admin "Explain" endpoint: `GET /api/admin/explain?generationId=` → {charged?, provider/model, attempts, retries, fallbackUsed, providerCost, credits, jobState, outputUrl} (composition of existing rows).
- [ ] X1.4 No secrets in logs: grep-audit `console.` in src/lib for key leakage + log.js redaction test (extend existing).
- [ ] X1.5 Tests: unit (explain composer, metrics aggregation), integration (structured fields present — capture logger).

# Y. SECURITY

- [ ] Y1.1 Timing-safe webhook secret compare (crypto.timingSafeEqual, length-guarded) in generation webhook + cron auth helper (shared `safeCompare` in security.js).
- [ ] Y1.2 `verifyOrigin` added to sync generation handler routes + estimate routes (generate/*, /api/estimate, /api/estimate/batch, /api/models/quote).
- [ ] Y1.3 Rate limits: director routes + assemble (H1.10), estimate (60/min), entities (30/min), projects (30/min).
- [ ] Y1.4 IDOR regression pack (integration): entities/projects/assets/agent runs/director pipelines/workflows/templates cross-user 404-or-403 matrix.
- [ ] Y1.5 Money races (U1.1 pack) + concurrent admin credit adjust vs reservation (adjustWalletTo CAS test).
- [ ] Y1.6 Provider endpoint injection: async route strips `callBackUrl/webhook_url/endpoint` from client params (endpoint strip exists; add callBackUrl/webhook_url strip + test).
- [ ] Y1.7 `/api/assets` POST: validate url host (same-origin /api/media or allowlisted https), type enum, bytes int ≥0; reject `gen-*` ids (exists).
- [ ] Y1.8 Media proxy SSRF: confirm net-allowlist enforced on /api/media/proxy (audit + test private-IP rejection).

# Z. ACCESSIBILITY

- [ ] Z1.1 New surfaces (Character Studio, Projects, VFX, Timeline additions) follow kit patterns: focus trap, Esc, restoration, labels, 44px targets, live regions for async progress.
- [ ] Z1.2 axe e2e passes on new/changed pages (extend existing axe spec list).
- [ ] Z1.3 Keyboard maps updated (ShortcutHelp: characters/projects/vfx tools + mask editor keys).
- [ ] Z1.4 Reduced-motion respected in new animations (MotionConfig inherited; verify).

# AA. MOBILE / PWA

- [ ] AA1.1 New surfaces one-tree responsive (900/1024/640 rules), sheet-based editors on phone, no horizontal overflow (Playwright mobile viewport assertions).
- [ ] AA1.2 PWA: remove stale `public/site.webmanifest` (AE); keep install-only (document: offline SW intentionally deferred — needs media caching strategy; recorded as deferred with reason).
- [ ] AA1.3 Mobile E2E sweep: agent plan approval, character editor, director board, timeline re-assemble — 390px viewport spec additions.

# AB. PERFORMANCE

- [ ] AB1.1 Indexes from 0.1.6 + verify slow queries (EXPLAIN on assets merged query, director status, admin jobs).
- [ ] AB1.2 Assets server-side search/pagination (Q1.2) removes client full-list filtering.
- [ ] AB1.3 Catalog fetch: module-level cache exists; add `Cache-Control: public, max-age=60` on /api/models/catalog (public, sanitized) + ETag optional.
- [ ] AB1.4 Poll audit: studio running-jobs 10s (ok), agent run 3s (pause when tab hidden — add visibility guard), director 3s (same guard + 30min cap H1.12).
- [ ] AB1.5 No N+1 in new endpoints (batch includes); entities list includes reference thumbs inline (no per-row fetch).

# AC. TEST COVERAGE

- [ ] AC1.1 All phase-listed unit/integration tests implemented alongside their phases (A1.10, B1.x, C1.12, D1.8, E1.4, F1.3, G1.9, H1.14, I1.5, J1.5, K1.5, L1.4, M1.4, N1.5, O1.6, P1.6, Q1.6, R1.5, S1.3, T1.4/1.6, U1.1, V1.4, W1.7, X1.5, Y1.4–1.8).
- [ ] AC1.2 New E2E specs (mocked-provider fixtures pattern already in tests/e2e/fixtures/seed.mjs): agent durable journey (approve→background→reload→resume→deliverable), character journey, director durable journey, timeline persistence, billing refund-on-failure visible in UI.
- [ ] AC1.3 Full suite green at end: lint, typecheck, unit, integration, build, e2e.

# AD. DOCUMENTATION HYGIENE

- [ ] AD1.1 `STUDIO_FUNCTIONALITY.md` → moved to `docs/archive/STUDIO_FUNCTIONALITY-2025-07.md` with header banner; replacement current-state doc `docs/CURRENT_STATE.md` generated from implementation (tools list, money flow, durability architecture).
- [ ] AD1.2 Archive other stale master plans/specs found in root/docs (banner + move to docs/archive/); keep reasoning, label HISTORICAL.
- [ ] AD1.3 AGENTS.md updated: remove MasonryGrid claim, add agent-runner/director-runner/entities/projects/vfx tool, worker sweep list, new test commands if any.
- [ ] AD1.4 runbook-jobs.md: agent/director durability + watchdogs + TTL table (U1.6) + concurrency env vars (B1.4).
- [ ] AD1.5 README: MCP server section (AL) + new tools list refresh.

# AE. CLEANUP / TECHNICAL DEBT

- [ ] AE1.1 Delete dead code: `src/lib/template-seed.js` (confirmed dead), `public/site.webmanifest`, `SHOT_PRESETS` export, AudioStudio `MODES.voice` unreachable block, `autoAssemble` param chain (route+UI+executor), `useCreditCost.topUpPacks` return field (+ API field kept but documented? — remove from hook only), `makeTemplate` orphan (O1.4), legacy `src/lib/alibaba.js` dead provider file (verify zero imports first).
- [ ] AE1.2 Deduplicate: AGENT_NAMES (0.3), waveform (0.4), fallback pricing map (G1.8).
- [ ] AE1.3 Swallowed exceptions audit in touched files (agents.js persistSessionMessage best-effort logs — verify warn-level logging present).
- [ ] AE1.4 TODO/FIXME sweep in src/ — resolve or convert to tracked MD items.
- [ ] AE1.5 `console.log` sweep in production paths (keep log.js structured only).

# AF. OPENART PARITY FEATURES

- [ ] AF1.1 Parity matrix appended here after C–O land: character builder (C), consistent product (E), VFX (L), background replacement (L remove-bg/replace via edit), inpainting (M+L), one-click story/video (N), image editing (exists+mask), canvas (exists), model browsing (/models exists), templates (O), workflows (exists), asset reuse (Q), creative agent (exists), director (H), voice/audio (exists), social/UGC templates (N). Any remaining MATERIAL gap → new checkbox here and implement.
- [ ] AF1.2 `/models` public catalog page: verify against SSOT (R) + add capability filter chips if absent.

# AG. AGENT AS CREATIVE PRODUCER

- [ ] AG1.1 Brief intake captures objective/platform/audience/brand/characters/products/style/duration/aspect/quality/budget/deliverables — planner system prompt extended (question system already asks follow-ups; add budget + deliverables prompts when missing).
- [ ] AG1.2 Plan output includes `deliverable` descriptor + `dependencies` (DAG) + entity assignments; PlanApproval shows deliverable summary.
- [ ] AG1.3 Agent never secretly spends: every spend inside approved plan + maxCredits ceiling enforced server-side (A1.2.3) — regression test.

# AH. SMART BUDGET OPTIMIZER

- [ ] AH1.1 `POST /api/agent/plan` accepts `tier: best|balanced|cheapest|custom` (default current behavior = balanced): model selection per media step re-solved server-side (cheapest runnable / quality-ranked best = highest providerCost runnable / balanced = mid); plan returns per-step model+credits+total+`balanceAfter`.
- [ ] AH1.2 PlanApproval tier Segmented + per-step diff display (model swap list before approval); re-quote on tier change (debounced); approve sends tier + plan (server revalidates, quote_changed guard).
- [ ] AH1.3 Tests: unit (tier solver picks expected models from seeded catalog), integration (tier re-plan changes total, never exceeds balance gate).

# AI. QUALITY CONTROL LOOP

- [ ] AI1.1 Technical QC in durable runners: after media job success, `validateGenerationOutput` (quality-gate.js) — failure → step retried once with alternative model (≤ quoted ceiling, counts against run budget) before marking failed; logged `qc_retry`.
- [ ] AI1.2 Vision QC (opt-in per run `qcMode:"smart"`): VISION_MODEL-configured LLM scores prompt adherence/identity/defects on image outputs; recommendation recorded on step (`output.qc = {verdict, reasons}`); auto-retry ONLY when retry budget exists inside maxCredits; otherwise surfaced as recommendation in review UI.
- [ ] AI1.3 Review UI shows QC verdict chip + "Retry with alternative" action (single-step durable rerun); auto mode never exceeds approved ceiling (A1.2.3 test covers).
- [ ] AI1.4 Tests: unit (QC verdict parsing, retry budget math), integration (quality-gate failure triggers alternative-model retry once).

# AJ. EXECUTION MODES

- [ ] AJ1.1 Modes finalized: review (per-step durable single runs), auto (full durable run), smart (auto + qcMode) — session settings persist `autoComplete` + `qcMode`.
- [ ] AJ1.2 Spending ceiling visible in plan card (maxCredits = estimate total; smart mode adds retry headroom shown explicitly).
- [ ] AJ1.3 Tests: integration (mode flags round-trip; smart mode retry accounting).

# AK. FINAL DELIVERABLE EXPERIENCE

- [ ] AK1.1 AssetGrid deliverable-first (exists) + supporting sections: storyboard card, references, voiceover/music players, per-shot list, credits used, download-all (zip via existing media? — implement sequential downloads list, no zip dependency), Edit timeline (handoff to director timeline when video deliverable), Regenerate weak shot (exists), Create variation (re-plan with `variationOf: runId` — planner instructed to vary style/composition, explicit new approval).
- [ ] AK1.2 Deliverable persisted: `AgentRun.result.deliverable` + linked from project detail when session bound.
- [ ] AK1.3 Tests: E2E (deliverable section renders; variation creates new plan).

# AL. MCP / EXTERNAL AGENT ACCESS

- [ ] AL1.1 `mcp/` package in-repo: `mcp/server.mjs` stdio MCP server (dep `@modelcontextprotocol/sdk`), config via env `HELMIES_BASE_URL` (default https://studio.helmies.fi) + `HELMIES_API_KEY` (user ApiKey, Bearer).
- [ ] AL1.2 Tools: `list_models`, `estimate_generation`, `generate_image`, `generate_video`, `generate_audio` (async submit + poll status), `create_agent_production`, `check_run`, `list_assets`, `list_templates`, `run_template`, `check_template_run`, `list_projects`. Each = thin REST call; errors surfaced as MCP error content; no provider secrets anywhere (server-side only).
- [ ] AL1.3 API-key scope check: verify `authenticateApiKey` accepted on the routes MCP calls (async route currently session-only → extend to accept API key like sync handler).
- [ ] AL1.4 npm script `"mcp": "node mcp/server.mjs"` + README section with Claude Desktop config example.
- [ ] AL1.5 Tests: unit (tool arg validation, response mapping with mocked fetch).

# AM. PERSONAL MODEL / TRAINING — EVALUATION

- [ ] AM1.1 Verify provider training capability with proof: query live ModelPricing catalog for capability/modelType LIKE %train%/%lora%/%fine%/%personal%; check KIE docs surface for training endpoints (document URLs checked). Voice cloning EXISTS (VoiceProfile/suno) — record as the one supported personal-model path.
- [ ] AM1.2 If unsupported (expected): record DEFERRED with exact evidence (catalog query result + doc URLs); NO fake UI shipped. If supported: implement minimal training architecture (this is the only acceptable flip).

# AN. 3D / WORLD — EVALUATION

- [ ] AN1.1 Verify with proof: catalog query for %3d%/%world%/%mesh%/%gaussian% capabilities; KIE/Alibaba docs check.
- [ ] AN1.2 If unavailable (expected): record DEFERRED with exact evidence; no checkbox-theater clone.

# FINAL CODE REVIEW (after all phases)

- [ ] FR1 Senior-review pass over full diff: state machines, money races, ownership, stale IDs, client pricing, disconnected UI, dead controls, mobile overflow, stale docs, missing migrations, restart behavior, Agent/Director agreement, resumability, partial outputs, asset lineage, a11y.
- [ ] FR2 Newly discovered issues appended as checkboxes and fixed.
- [ ] FR3 `git diff` inspection: no secrets, migrations committed, docs consistent.

# FINAL VERIFICATION (evidence appended at completion)

_To be filled with exact command outputs at the end: lint / typecheck / unit count / integration / e2e / build / migrations list / architecture summary / external blockers / deferrals._

---

## EXECUTION RULES (binding)

1. Checkbox flips ONLY after implementation + verification.
2. Money: reservation before work; settle actual on success; release/refund on failure; never both; never charge failed work; ceilings server-enforced.
3. No client-trusted pricing/endpoints/ownership. No provider names/keys to end users. No secrets in code/logs.
4. Proper Prisma migrations (expand/contract); preserve existing data; no `db push` as strategy.
5. Preserve: wallet/ledger, durable GenerationJobs, worker, catalog, server pricing, plan approval, per-step model selection + re-quote, storyboard-first, last-frame chaining, deliverable concept, sessions, assets, canvas, workflows, brand kits, prompt engine, a11y, PWA, tests, CI, security posture.
6. Design: existing Helmies kit + design language; creative studio feel; no admin-dashboard look; no decorative controls; one component tree per surface (CSS responsive).
7. Fix failures encountered, including pre-existing defects exposed by tests.
8. New UI copy: grounded, normal wording.
9. Commit migrations + milestones (user contract authorizes commits).
10. External blockers only: missing credential / unavailable third-party API — document exact proof, continue everything else.
