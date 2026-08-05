# EDITSv1 Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every requirement in `EDITSv1.md` — interactive agent experience with sessions, honored plan approval, Director shot/timeline editors, a visual workflow editor, honest video/audio/music categorization, and a uniform error standard — verified by automated and manual QA.

**Architecture:** Six phases (E1–E6). E1+E2 run in parallel (disjoint files), then E3 (agent, biggest), then E4+E5 in parallel (director vs workflow), then E6 (QA). Every phase: implementer subagents in worktrees, independent review, gates (`npm run lint && npm run typecheck && npm test && npm run build`, plus `test:integration`/`test:e2e` where touched), PR, merge, deploy via the plink runbook.

**Tech Stack:** unchanged, plus `react-markdown` + `remark-gfm` (E3 only — safe markdown, no dangerouslySetInnerHTML). Drag & drop uses native HTML5 DnD (precedent: `CanvasStudio.js:1508`), no new dep.

## Global Constraints

- NEVER prisma migrate/db push against `.env` DATABASE_URL (LIVE PRODUCTION). Test DB only: `postgresql://postgres:test@localhost:55432/test` (container `helmies-test-pg`, shared).
- Landing page off-limits (attribute/contrast a11y fixes only).
- Money invariants binding: server-computed prices only; reserve→settle-or-release exactly once; debits never exceed the user-approved total; `npm run reconcile` clean in integration tests.
- Providers (KIE/Alibaba/DashScope/etc.) must NEVER appear in any user-facing string, id, name, or description.
- Worker-imported modules: relative `.js` imports only (plain-node constraint).
- New/changed routes registered in `security/route-manifest.json` (CI-enforced); state-changers get `verifyOrigin`.
- Migrations: author offline, apply to test DB only; production applies via `migrate deploy` in the deploy runbook (build BEFORE migrate).
- Commit footers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_011b4sNmey45tunVt3b9HZhr`.

---

# Phase E1 — Catalog truth & mode separation (EDITSv1 §7, §8)

### Task E1.1: Capability groups tell the truth

**Files:** Modify `src/lib/capability-groups.js`; `src/lib/model-catalog-core.mjs` (audio subcategory inference); test `tests/unit/capability-groups.test.mjs`, extend `tests/unit/model-catalog-core.test.mjs`

**Interfaces:**
- `CAPABILITY_GROUPS.ttv` gains coarse `"video"`; new group `r2v: ["reference-to-video"]`; `v2v` gains `"video-upscale"` — every active capability value maps into ≥1 group (mirror how `tti` already includes coarse `"image"`).
- New export `audioKind(model)` in `model-catalog-core.mjs` → one of `"tts" | "dialogue" | "voice-clone" | "music" | "sfx" | "enhancement" | "conversion" | "utility"`, inferred from `capability` + `modelId`/`endpoint` tokens. Exact token rules: `text-to-dialogue|dialogue` → dialogue; `text-to-speech|tts` → tts; `voice-generate|voice-clone|persona` → voice-clone; `generate-sounds|sound-effect|sfx` → sfx; `audio-isolation|boost-music|separate-vocals|enhance` → enhancement; `convert-to-wav|to-wav|convert|generate-midi` → conversion; `generate-music|extend-music|add-instrumental|add-vocals|cover|mashup|replace-section|suno` → music; anything else with capability audio → utility. Order matters — test each precedence.
- **Bug fix:** `AudioStudio.js:339` reads `m.provider` which the public catalog never emits — the Suno exclusion is dead code. Remove it; `audioKind` replaces it.

- [ ] Steps: failing tests for every mapping + precedence → implement → gates → commit `fix: capability groups cover every capability; audio subcategorization`

### Task E1.2: Honest per-model schemas for audio/music/video

**Files:** Modify `src/lib/kie-sync.js` (curated schema map), `src/lib/model-catalog-core.mjs` (`defaultSchemaForCapability`); backfill extension in `scripts/fix-model-categories.mjs`; tests extend `tests/unit/kie-sync.test.mjs`

**Interfaces:**
- New `CURATED_SCHEMAS` map in `kie-sync.js` keyed by modelId for known families, spread over the generic default: Suno music models (`generate-music`, `extend-music`, …) get `{ style: {type:"string"}, title: {type:"string"}, instrumental: {type:"boolean"}, vocal_gender: {type:"string", enum:["m","f"]}, negative_tags: {type:"string"}, duration: {type:"number", enum:[30,60,120,180,240]} }`; ElevenLabs TTS gets `{ voice: {type:"string"}, stability: {type:"number",min:0,max:1}, similarity_boost: {...}, speed: {...} }`; the flags already exist in `src/lib/models.js:188-205` — port them, do not invent parameters KIE doesn't accept.
- Video schema honesty: KIE's generic `defaultSchemaForCapability` video enums stay (they're the provider's documented common set), but models with a curated entry override. No fictional per-model claims added.
- Persistent backfill re-writes stored schemas for curated ids (idempotent, dry-run default).

- [ ] Steps: failing tests (curated model exposes its real fields; non-curated unchanged; backfill idempotent) → implement → gates → commit `feat: honest per-model parameter schemas for audio and music`

### Task E1.3: Video studio — separate T2V and I2V tools

**Files:** Modify `src/components/studio/kit/tools.js`, `src/app/studio/[tool]/page.js`, `src/app/studio/StudioClient.js`, `src/components/studio/VideoStudio.js`; e2e `tests/e2e/video-modes.spec.mjs`

**Interfaces:**
- Two registry entries: `video` (label "Text to Video", group make) and `i2v` (label "Image to Video", group make, dock: false) both mounting `VideoStudio` with a new `fixedMode` prop (`"ttv"` / `"i2v"`); the in-component `Segmented` disappears when `fixedMode` is set; `v2v` stays inside Video Edit. Old `/studio/video` URLs keep working (ttv default).
- `ModelPicker` rows already show credits + specs; verify i2v lists now include every `image-to-video` model (23) and ttv lists include coarse-`video` models (58 total video-type after E1.1).
- Each model row shows duration/resolution/ratio specs from its (now honest) schema; the SpendMeter quote stays the live price authority.

- [ ] Steps: e2e first (both tools listed in rail; i2v page requires an image; ttv page doesn't; model counts > 0; no provider names) → implement → gates → commit `feat: separate text-to-video and image-to-video studios`

### Task E1.4: Audio studio 7-way + Music controls + Tools section

**Files:** Modify `src/components/studio/AudioStudio.js`, `src/components/studio/MusicStudio.js`, `src/components/studio/kit/tools.js` (+ `[tool]/page.js`, `StudioClient.js`); new `src/components/studio/AudioToolsStudio.js`; e2e `tests/e2e/audio-modes.spec.mjs`

**Interfaces:**
- `AudioStudio` Segmented becomes: Speech (tts) / Dialogue / Voice cloning (voice-clone) / Sound effects (sfx) — pools via `audioKind`.
- `MusicStudio` pool = `audioKind === "music"` only. Controls (rendered from the model's now-curated schema via the existing `offers()` gate, which now finds the fields): Genre (`style` chips — rename label to "Genre", keep 14 options), Mood (free-text appended to style string), Duration (schema enum), Instrumental/Vocals toggle + vocal register, Tempo (free-text appended: "at N BPM" — Suno takes prompt text, not a tempo param; label the control honestly as a prompt hint).
- New tool `audio-tools` ("Audio Tools", group edit): lists `enhancement` + `conversion` + `utility` kinds with a simple pick-model → upload/prompt → run surface reusing `Workspace` + `Brief` + `Stage` (mirror `VideoEditStudio.js`'s structure).
- All three registered in tools.js + [tool]/page.js metadata + StudioClient map.

- [ ] Steps: e2e first (each segment lists only its kind; music page shows genre/duration/instrumental controls for a Suno model; utilities appear in Audio Tools not in Music) → implement → gates → commit `feat: audio split into speech, dialogue, cloning, sfx; music controls; audio tools section`

---

# Phase E2 — Error handling standard (EDITSv1 §10)

### Task E2.1: Server error envelope

**Files:** Create `src/lib/api-error.js`; modify `src/app/api/generate/async/route.js`, `src/app/api/generations/status/route.js`, `src/app/api/upload/route.js`, `src/app/api/estimate/route.js`, `src/app/api/agent/{chat,plan,run}/route.js`, `src/app/api/director/{plan,execute,rerun,status}/route.js`, `src/app/api/workflows/**`; test `tests/unit/api-error.test.mjs`

**Interfaces:**
- `apiError({ status, code, title, message, retryable = false, details = null, cause = null })` → `NextResponse.json({ error: message, code, title, errorId, retryable, details }, { status })`. `errorId` = `randomUUID().slice(0,8)`; the full `cause` is logged server-side via `log.error(code, { errorId, err })` — never sent to the client. **`error` stays a string** (backward compatible with `apiFetch`).
- Canonical codes (exported `ERROR_CODES`): `bad_request, unauthorized, forbidden, not_found, rate_limited, invalid_model, model_not_priced, invalid_params, missing_provider_key, insufficient_credits, unsupported_setting, content_policy, provider_timeout, internal`. Each has a default title+message pair in one table (e.g. `insufficient_credits` → title "Not enough credits", message "This generation needs {cost} credits but you have {credits}.").
- `DirectorPlanError` migrates onto this (keeps its 422 + errorId behavior).
- The catch-all 500 in `generate/async/route.js:287` stops leaking `e.message` — it becomes `apiError({ status: 500, code: "internal", cause: e })`.
- 429s include `retryAfter`; 422 keeps `details` array.

- [ ] Steps: failing tests (envelope shape; errorId uniqueness; cause never in body; each converted route returns the envelope; 402 keeps credits/cost fields) → implement route-by-route → gates + integration → commit `feat: uniform api error envelope with error ids`

### Task E2.2: Provider branding + retry visibility fixes

**Files:** Modify `src/lib/providers.js` (`brandError`), `src/lib/job-runner.js` (re-brand on failure write), `src/components/studio/useAsyncGeneration.js` (surface `jobStatus`/`attempts`); tests extend `tests/unit/providers.test.mjs`, `tests/unit/job-runner.test.mjs`

**Interfaces:**
- `brandError("invalid_api_key")` bug: the matcher checks `"api key"` but callers pass `"invalid_api_key"` — match on `api_key|api key|apikey|unauthorized key`. A missing provider key must brand as the configured-key message, not "unexpected error".
- `job-runner.js` `handleFailure` writes `brandError(err.message)` (branded, provider-name-free) into `Generation.error` instead of the raw message; timeout sweep message unchanged.
- `useAsyncGeneration` returns `{ attempts, jobStatus }` in its state so studios can show "Retrying (attempt 2 of 3)…" — `Stage.Rendering` gains an optional `note` prop rendered under the phase strip.

- [ ] Steps: failing tests → implement → gates → commit `fix: provider error branding and visible retry state`

### Task E2.3: ErrorPanel — friendly errors everywhere

**Files:** Create `src/components/studio/kit/ErrorPanel.js` (export via `kit/index.js`); modify `src/components/studio/kit/Stage.js` (`Fault` delegates to ErrorPanel), `src/lib/client-fetch.js` (preserve envelope fields on `ApiError`), `AudioStudio.js` + `MusicStudio.js` (replace raw banners); e2e `tests/e2e/error-states.spec.mjs`

**Interfaces:**
- `ApiError` gains `.code, .title, .errorId, .retryable, .details` lifted from the envelope (`client-fetch.js:46-49`).
- `<ErrorPanel error onRetry onEditSettings />`: renders `error.title` (fallback "Something went wrong"), the message, `details[]` as field bullets when present, a Retry button (when `onRetry`), an "Edit settings" button (when `onEditSettings` — scrolls/focuses the controls pane), and a muted `Error ID: {errorId}` line when present. No raw strings, no provider names.
- Every studio using `Stage` passes `onEditSettings`; Audio/Music get Retry for the first time.

- [ ] Steps: e2e first (a forced 422 shows title+field detail+error id; retry re-submits; edit-settings focuses controls) → implement → gates → commit `feat: friendly error panel with retry, edit settings and error ids`

---

# Phase E3 — Agent experience, planning flow, sessions (EDITSv1 §1, §2)

### Task E3.1: Sessions — schema + API

**Files:** Modify `prisma/schema.prisma` (+ migration `20260803_agent_sessions`); create `src/lib/agent-sessions.js`, `src/app/api/agent/sessions/route.js` (GET list, POST create), `src/app/api/agent/sessions/[id]/route.js` (GET messages, PATCH title/settings, DELETE); register in `security/route-manifest.json`; tests `tests/unit/agent-sessions.test.mjs`, `tests/integration/agent-sessions.int.test.mjs`

**Interfaces:**
```prisma
model AgentSession {
  id        String   @id @default(cuid())
  userId    String
  title     String   @default("New session")
  status    String   @default("active")   // active|archived
  settings  Json?                          // { imageModel, videoModel, audioModel, quality, aspect, autoComplete }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  AgentMessage[]
  @@index([userId, updatedAt])
  @@schema("public")
}
model AgentMessage {
  id        String   @id @default(cuid())
  sessionId String
  role      String                          // user|assistant|system
  kind      String   @default("text")       // text|question|plan|run|outputs
  content   String   @db.Text               // markdown for text; JSON string for structured kinds
  createdAt DateTime @default(now())
  session   AgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@index([sessionId, createdAt])
  @@schema("public")
}
```
- `src/lib/agent-sessions.js`: `createSession(userId, title?)`, `listSessions(userId)` (newest 50), `getSession(userId, id)` (404-throws on other users'), `appendMessage(sessionId, {role, kind, content})`, `renameSession`, `archiveSession`. `AgentRun` gains `sessionId String?` column in the same migration.
- Routes are thin wrappers; GET list → `{ sessions: [{id,title,updatedAt,status}] }`; GET one → `{ session, messages }`.

- [ ] Steps: failing unit+integration tests (isolation between users; append preserves order; archive hides from list) → migration on test DB → implement → gates → commit `feat: persistent agent sessions`

### Task E3.2: Structured chat — one question at a time, markdown, honored approvals (backend)

**Files:** Modify `src/lib/agents.js`, `src/app/api/agent/chat/route.js`, `src/app/api/agent/run/route.js`; create `src/app/api/agent/step/route.js`; tests `tests/unit/agent-chat-contract.test.mjs`, `tests/unit/agent-run-approved.test.mjs`

**Interfaces:**
- **Chat contract:** system prompt rewritten to: ask AT MOST ONE clarifying question per turn; when asking, end the reply with a fenced block ```question\n{"question":"…","options":["…","…"],"allowCustom":true}\n``` — the UI parses the LAST such block; prose remains markdown. When enough is known, say so and tell the user to review the plan. Chat persists both sides via `appendMessage` when `sessionId` present (accepted in body).
- **Honored approval:** `POST /api/agent/run` — when `body.plan` is present it IS the executed plan: `executeAgentRunStream` gains a `precomputedPlan` parameter and skips `planTask` entirely; the debit ceiling is `plan.estimate.total` as approved. A fallback model swap re-quotes the step; if the re-quote would push the running total above the approved total, the step fails instead of overspending. Total debits ≤ approved total — enforced with a test.
- **Per-step execution:** `POST /api/agent/step` (auth, origin-checked, registered): body `{ sessionId, plan, stepIndex, regenerate?: bool, paramOverrides?: {model?, prompt?} }` → executes exactly ONE plan step via `executeStepWithRetry`, debits exactly that step's quoted credits (re-quoted server-side when overridden), writes the Generation row for media steps, returns `{ output, creditsUsed, assembled }`. This is what powers per-asset Accept/Regenerate/Edit; `run` remains for the auto-complete ("don't ask again") path.

- [ ] Steps: failing tests (question block parsed/absent correctly; approved plan executed verbatim — planner NOT called; debit ceiling enforced; step route debits exactly one step; regenerate with model override re-quotes) → implement → gates + integration → commit `feat: structured agent chat and honored plan approvals`

### Task E3.3: Agent UI — input, markdown, thinking, question cards

**Files:** Modify `src/components/studio/kit/Brief.js`, `src/components/studio/OrchestratorStudio.js`; add deps `react-markdown remark-gfm`; create `src/components/studio/agent/{Markdown.js,QuestionCard.js,ThinkingCard.js}`; CSS in `src/styles/studio.css`; e2e `tests/e2e/agent-chat.spec.mjs`

**Interfaces:**
- `Brief.js` keydown: plain `Enter` (no shift/ctrl/meta) → `preventDefault` + `submit()`; `Shift+Enter` → default newline; Ctrl/Cmd+Enter kept. New optional prop `enterSends={true}` — agent surface sets it; generation studios keep current behavior unless set.
- `Markdown.js`: react-markdown + remark-gfm, `components` map styled with existing `.st-msg` typography, links `target="_blank" rel="noopener"`, no raw HTML (`skipHtml`). Used for all assistant text.
- `QuestionCard.js`: renders parsed question block — option buttons + "Your choice" free-text row; selecting sends the answer as the next user message. Disabled after answered (shows chosen answer).
- `ThinkingCard.js`: replaces the bare "Thinking…" — animated pink-glow border (reuse `--filament` tokens; add `.hs-glow` keyframes to studio.css using `--filament-a24/a40` box-shadows), elapsed clock (reuse `useElapsed` pattern from `Stage.js:39`), stage label ("Thinking" / "Planning" / "Working out costs"), and an expandable `<details>` "What the agent is considering" fed by a one-line status summary per phase (NOT chain-of-thought — the stage words + step names only).
- Input dock gains the same glow while `busy` (class toggle).
- Feed renders by `kind`: text→Markdown, question→QuestionCard, plan→PlanCard, run→RunCard, outputs→AssetCards (E3.5).

- [ ] Steps: e2e first (Enter sends; Shift+Enter newlines; `**bold**` renders as `<strong>`; question options render and answer; glow class present while busy) → implement → gates → commit `feat: agent chat input, markdown, thinking state and question cards`

### Task E3.4: Plan approval UI — models, quality, budget, execution

**Files:** Modify `src/components/studio/OrchestratorStudio.js` (PlanCard → PlanApproval); create `src/components/studio/agent/PlanApproval.js`; e2e extends `tests/e2e/agent-chat.spec.mjs`

**Interfaces:**
- `PlanApproval` shows: the step list (editable per media step: `ModelPicker` filtered to that step's type via `useModelCatalog`, quality `Segmented` (720p/1080p/4K → resolution param where the model's schema offers it), `RatioPicker` from the model's aspect list), per-step credits (live re-quote via `POST /api/estimate` on every change, debounced 400ms — pattern from `WorkflowStudio.js:202`), total, `SpendMeter` vs balance, an execution mode toggle: "Review each asset" (default) vs "Auto-complete" (= don't ask again, persisted to session settings), and Adjust (free-text revision request → planner) / Approve buttons.
- Approve sends the EXACT displayed plan (with edited models/params and its re-quoted estimate) to run/step APIs. What you approved is what runs and what you pay — already enforced server-side by E3.2.

- [ ] Steps: e2e first (changing a step's model re-quotes; approve starts execution with the chosen model — assert the run's Generation row uses it; auto-complete toggle persists) → implement → gates → commit `feat: plan approval with model, quality and budget selection`

### Task E3.5: Per-asset review cards + processing cards

**Files:** Create `src/components/studio/agent/AssetCard.js`, `src/components/studio/agent/StepProgress.js`; modify `src/components/studio/OrchestratorStudio.js` (step-wise orchestration loop); e2e extends `tests/e2e/agent-chat.spec.mjs`

**Interfaces:**
- Review-mode execution: the client walks the approved plan calling `/api/agent/step` per step. While a step runs: `StepProgress` card (animated, shows agent name, task, elapsed, per-step credits; states waiting/running/done/failed with existing `.is-*` classes). On media output: `AssetCard` with inline preview (img/video/audio element), buttons Accept (advance), Regenerate (same step, `regenerate:true`), Edit (opens a small prompt/model override sheet → regenerate with overrides), and "Don't ask again" (flips session to auto-complete: remaining steps run via `/api/agent/run` with the remaining sub-plan).
- Auto-complete mode: single `/api/agent/run` stream, StepProgress cards driven by `step_start`/`step_complete` events, final `Outputs` grid with the same AssetCards (minus gating).
- Session persistence: every emitted card appends an `AgentMessage` (kind run/outputs) so resume re-renders the full history.

- [ ] Steps: e2e first (step runs → asset card appears → Regenerate produces a new Generation row and charges once more → Accept advances → don't-ask-again completes the rest without prompts) → implement → gates + full e2e → commit `feat: per-asset review with regenerate, edit and auto-complete`

### Task E3.6: Session UI — new / history / resume

**Files:** Modify `src/components/studio/OrchestratorStudio.js` (side panel gains Sessions group); create `src/components/studio/agent/SessionList.js`; e2e `tests/e2e/agent-sessions.spec.mjs`

**Interfaces:**
- Side panel: "New session" button (creates + switches), session list (title + relative time, newest 5 + "Show all" sheet), current session auto-titled from the first user message (first 60 chars, PATCH once). Selecting a session loads `GET /api/agent/sessions/[id]` and re-renders the full feed from stored messages; in-flight work blocks switching (confirm dialog).
- On first message with no session: one is created implicitly.

- [ ] Steps: e2e first (send → reload page → session listed → resume shows history; new session empties the feed; another user's session 404s) → implement → gates → commit `feat: agent session history and resume`

---

# Phase E4 — Director Mode (EDITSv1 §4)

### Task E4.1: Fix status/list route + wire the sketch and plan-edit endpoints

**Files:** Modify `src/app/api/director/status/route.js` (query `directorPipeline`, not `project`), `src/lib/director-planner.js` (`buildUserPrompt` reads `brief.shots`, `brief.characters`), `src/app/api/director/plan/route.js` (pass characters/aspectRatio); create `src/app/api/director/plan/[id]/route.js` (GET plan, PATCH via existing `updateProductionPlan`); manifest; tests `tests/unit/api-director-status.test.mjs`, extend `tests/unit/director-planner.test.mjs`

**Interfaces:**
- Status GET returns `{ pipeline: { id, status, plan, shots: [...DirectorShot], costEstimate } }` from the real tables; list returns the user's last 20 pipelines. `DirectorStudio.refresh()/loadRecent()/load()` work unchanged (they already call these URLs).
- PATCH body `{ plan }` → `updateProductionPlan` (already recomputes cost, blocks executing/completed) → returns `{ plan, costEstimate, validation }`.
- Planner user-prompt includes the user's sketched shot outline and named characters verbatim as constraints.

- [ ] Steps: failing tests (status reads directorPipeline; sketch shots appear in the LLM user prompt; PATCH recomputes cost and rejects during execution) → implement → gates → commit `fix: director status reads the right table; sketches and edits reach the planner`

### Task E4.2: Shot editor

**Files:** Create `src/components/studio/director/ShotEditor.js`; modify `src/components/studio/DirectorStudio.js`; shot shape gains `transition` + `dialogue` + `audioCues` (modify `src/lib/director-planner.js` normalizer/prompt/heuristic + `src/lib/director-executor.js:254` reads `shot.dialogue`); e2e `tests/e2e/director-editor.spec.mjs`

**Interfaces:**
- Planned shots become editable cards: Edit opens `ShotEditor` sheet with every field — title, section, duration, sceneGoal, environment (location), lighting, mood, camera {framing, angle, lens, movement}, transition (cut/fade/dissolve per shot — consumed by E4.4 assembly), dialogue (text → TTS audio cue), audioCues (free text), imageStrategy.prompt, videoStrategy.prompt. Toolbar per card: Duplicate (deep-copy, new id, insert after), Delete, ↑/↓ Reorder (re-indexes). Add Shot appends a template shot. Every mutation → PATCH `/api/director/plan/[id]` → cost re-renders from the response.
- Per-shot generate BEFORE full execution: "Generate image" / "Generate video" buttons on an un-executed planned shot call a new `POST /api/director/generate-shot` `{ planId, shotId, kind }` → creates the DirectorShot row if missing, debits that shot's quoted cost, runs `executeShotImage`/`executeShotVideo`, returns the output. (Rerun keeps working for executed shots.)

- [ ] Steps: e2e first (edit persists after reload; duplicate/reorder/delete recompute cost; per-shot generate yields an image without full execution) → implement → gates + integration → commit `feat: director shot editor with per-shot generation`

### Task E4.3: Character consistency

**Files:** Modify `src/lib/director-executor.js` (`executeShotImage`), `src/lib/director-planner.js` (prompt: emit real references), `src/components/studio/DirectorStudio.js` (character/reference upload in settings Sheet); tests extend `tests/unit/api-director-execute.test.mjs`

**Interfaces:**
- Brief gains `characters: [{name, description, referenceUrl?}]` (settings sheet: name+description rows + optional Dropzone upload). Planner injects them; LLM contract changes from `"references": []` to: reference a character's image by `$CHARACTER_<name>` when one exists.
- Executor resolves `$CHARACTER_*` tokens to uploaded reference URLs → `generateI2I` path (already exists at `director-executor.js:126-131`). When a character has no upload, the FIRST completed shot image containing that character becomes its rolling reference (stored on the pipeline row) — subsequent shots use it. This is real image-anchored consistency, not just prompt text.

- [ ] Steps: failing tests (token resolution; rolling reference set once and reused; no-character brief unchanged) → implement → gates → commit `feat: character reference threading across shots`

### Task E4.4: Timeline editor + chat edits

**Files:** Create `src/components/studio/director/Timeline.js`; modify `src/lib/video-assembly.js` (honor per-clip trim + transitions), `src/app/api/assemble/route.js` (accept `{clips:[{url, inSec?, outSec?}], transitions:[...]}`), `src/lib/director-executor.js` (assembly uses shot `transition`s); create `src/app/api/director/timeline-chat/route.js`; e2e `tests/e2e/director-timeline.spec.mjs`

**Interfaces:**
- After a run completes, `Timeline` lists completed shot clips in order: drag to rearrange (HTML5 DnD, `ClippingStudio` range-edge pattern for trim handles), per-clip trim in/out (numeric + drag), Split (one clip → two entries with adjoining in/out), Replace (upload or pick another generation), Regenerate (existing rerun), Remove. "Re-assemble" posts the clip list → new assembled URL (each assembly a fresh output; originals untouched).
- `assembleVideos` upgrade: per-clip `-ss/-to` trim via re-encode segments, then concat; transition `fade` implemented via `xfade` between segments when specified (hard cut default). The old `(urls, options)` signature keeps working.
- Chat edits: a small input under the timeline posts `{ pipelineId, instruction }` to `timeline-chat` → LLM (existing `llmComplete`) with the clip list + a constrained JSON tool contract `{ ops: [{op: "trim"|"reorder"|"remove"|"split", ...}] }` → validated ops applied to the client timeline (never auto-assembles; user still clicks Re-assemble). Invalid ops → 422 envelope.

- [ ] Steps: e2e first (rearrange + trim + re-assemble produce a new URL; chat "remove the last clip" removes it) → unit tests for the ffmpeg arg builder (no shell injection, trim math) → implement → gates → commit `feat: director timeline with trim, transitions and chat edits`

---

# Phase E5 — Workflow Mode (EDITSv1 §5)

### Task E5.1: New step kinds executable end-to-end

**Files:** Modify `src/lib/agents.js` (`executeStep` cases), `src/components/studio/WorkflowStudio.js` (`STEP_KINDS`); tests extend `tests/unit/agent-registry.test.mjs`, `tests/unit/api-workflows-run.test.mjs`

**Interfaces:**
- `STEP_KINDS` becomes: `image` (T2I), `i2v` (Image→Video — passes `$STEP_N_OUTPUT` as `image_url`), `upscale` (i2i `image-upscale` models), `audio`, `music` (audio models with `audioKind === "music"`), `voiceover` (TTS models; text from prompt), `assembly` (collects all prior video outputs → `assembleVideos`), `export` (final step: names the deliverable, returns the assembled/last URL + a manifest of all outputs). Each maps to an `executeStep` case; `assembly`/`export` are server-side non-provider steps with 0-credit quotes (assembly flat 5 credits, matching director).
- `executeWorkflow` switches to `executeStepWithRetry` (fallbacks finally apply to workflows) and records per-step status into `WorkflowRun.outputs` incrementally.

- [ ] Steps: failing tests per kind (i2v receives the prior image url; assembly concatenates; export returns manifest; retry path taken on failure) → implement → gates + integration → commit `feat: workflow steps for i2v, upscale, music, voiceover, assembly and export`

### Task E5.2: Visual editor — drag & drop pipeline

**Files:** Rework `src/components/studio/WorkflowStudio.js` (keep save/estimate/regen plumbing); create `src/components/studio/workflow/{StepNode.js,StepPalette.js}`; CSS in `studio.css`; e2e `tests/e2e/workflow-editor.spec.mjs`

**Interfaces:**
- Left palette of step kinds (icon + label, `draggable`); center canvas = vertical pipeline of `StepNode` cards connected by drawn connectors (CSS pseudo-elements); drop from palette inserts at the hovered gap; drag a node to reorder (native DnD, keyboard fallback: the existing Earlier/Later buttons stay). Each `StepNode` shows: kind icon, name (editable inline), model (ModelPicker sheet), one-line prompt preview, per-step credits, status chip after a run, and buttons Run-this-step (regen) / Duplicate / Delete.
- Per-step preview: after a run, the node shows its output thumbnail inline (img/video/audio) — data already in `WorkflowRun.outputs` per E5.1.
- Templates rail and Save/Publish/Run stay as-is (they already work). Cost bar (total + SpendMeter) pinned above the run button.

- [ ] Steps: e2e first (drag image→i2v→assembly from palette; reorder by drag; per-step cost visible; save→run→per-step thumbnails render; retry failed step) → implement → gates + full e2e → commit `feat: visual drag-and-drop workflow editor`

---

# Phase E6 — QA & release (EDITSv1 §11, §12)

### Task E6.1: Automated sweep
- [ ] Full suites green locally AND in CI: unit (~750+), integration, e2e (3 browsers). Registry/mapping/pricing/credits/workflow/director/sessions all covered by the phase tests above — verify each EDITSv1 §11 bullet maps to a named test file; add any missing.

### Task E6.2: Manual QA against production (post-deploy)
- [ ] Using claude-in-chrome against studio.helmies.fi with a QA account: run the five EDITSv1 scenarios — AI Music Video (agent), Director Mode (plan→edit→execute→timeline), Workflow Mode (build→run→retry), Image Generation, Audio Generation. Record every defect found; fix criticals before sign-off; console must be free of critical errors.

### Task E6.3: Final QA report
- [ ] `docs/qa/EDITSv1-QA-REPORT.md`: per Definition-of-Done item — evidence (test name/command/screenshot), fixed-issues list with PR links, remaining known issues with severity. Honest BLOCKED for anything unverifiable.

---

## Self-Review
1. **Spec coverage:** §1 → E3.3/3.4/3.5/3.6 (+E3.1/3.2 backend); §2 → E3.4 + E6.2 e2e scenario; §3 → shipped (PR #15) + registry tests exist; §4 fix → shipped (PR #15), enhancements → E4.2–E4.4, retry → E2.2/E4.1; §5 → E5.1/E5.2; §6 → shipped (PRs #16–18) + retries/fallbacks → E2.2/E5.1; §7 → E1.1/E1.3; §8 → E1.1/E1.2/E1.4; §9 → E2.3 + E3.3 (markdown, branding) + per-phase e2e; §10 → E2.1–E2.3; §11 → E6.1/E6.2; §12/§13 → phase ordering mirrors the priority list; Definition of Done → E6.3 report.
2. **Placeholders:** none — every task names files, shapes, and test assertions. Curated schemas port real flags from `models.js:188-205`, not invented params.
3. **Type consistency:** `audioKind` (E1.1) consumed by E1.4 and E5.1; error envelope (E2.1) consumed by E2.3 clients; `AgentSession/AgentMessage` (E3.1) consumed by E3.2/3.3/3.6; `/api/agent/step` (E3.2) consumed by E3.5; `updateProductionPlan` PATCH (E4.1) consumed by E4.2; `assembleVideos` clip-list form (E4.4) consumed by E5.1 assembly.
