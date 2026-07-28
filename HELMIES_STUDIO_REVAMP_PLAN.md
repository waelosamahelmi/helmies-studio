# Helmies Studio — Full Codebase Revamp Plan

**Status:** Living audit + execution prompt
**Date:** 2026-07-28
**Scope:** Every Studio page, component, lib, API route, prompt, and UX flow
**Constraint:** Helmies Agent merge is **abandoned**. Build everything inside the existing `helmies-studio` repo. Keep the approved landing page. Do NOT reset the DB. Do NOT break existing generation. Follow `AGENTS.md` and `HELMIES_STUDIO_MASTER_MERGE_IMPLEMENTATION_SPEC.md` (all sections except the LibreChat/Helmies Agent merge).

---

## 0. How to read this file

This file has two parts:
1. **Audit** — concrete problems found in the current code (with file + line references). These are the things to fix.
2. **Execution Prompt** — the canonical task description to give the coding agent (me) before each phase of work. It encodes the design system, quality bar, and the order of work.

Every edit must be made with the edit tools (`replace_string_in_file` / `insert_edit_into_file`), never by printing code blocks. Never stop at scaffolding. No dead buttons. No mock data in production paths. No hardcoded pricing.

---

## 1. Audit — What's Broken or Sub-Par

### 1.1 Critical bugs (fix first)

| # | File | Issue | Severity |
|---|------|-------|----------|
| B1 | `src/app/api/agent/chat/route.js:40` | `PROVIDERS.wavespeed` is referenced but `PROVIDERS` is never imported. The variable `provider` is then unused. This throws `ReferenceError` at runtime when KIE_KEY is set. | 🔴 |
| B2 | `src/app/api/agent/chat/route.js` | Non-streaming fallback path uses `llmComplete` (imported) but the streaming success path ignores the imported `getProvider`/`brandError` helpers and hand-rolls the KIE fetch. Inconsistent with `lib/providers.js` abstraction. | 🔴 |
| B3 | `src/components/studio/page.js` studio shell | `pendingCount` polls `/api/generations/status` every 10s forever; no cleanup on tab blur, no exponential backoff, no vis ref counting. Light but wasteful. | 🟡 |
| B4 | `ImageStudioV2.js` / `VideoStudioV2.js` | `resolution` default is `"1080p"` but model registry uses `"1k"/"2k"/"4k"` tiers — mismatched state sent to backend. | 🟡 |
| B5 | `CanvasWorkspace.js` | `CANVAS_MODELS` is a hand-sliced `IMAGE_MODELS.slice(0,8)` — arbitrary, ignores capability filtering. Mask/multi-ref models may be missing. | 🟡 |
| B6 | `chatModes.js` | `MARKETING_AVATARS`, `INFLUENCER_TABS` imported but several tool modes (`marketing`, `influencer`, `clipping`, `vibe-motion`) have `models: null` and `defaultModel: null` — the SimpleMode then has no model selector and silently builds params with no endpoint. Verify each still routes to a real provider endpoint. | 🟡 |
| B7 | `lib/agents.js` | `planTaskStream` references `estimateAgentTask` and `buildHeuristicPlan` — confirm both exist; the heuristic fallback must produce a valid plan when `KIE_KEY` is absent (no mock). | 🟡 |
| B8 | `agent/chat` vs `agent/plan` vs `agent/run` | Three separate endpoints, no shared session/conversation persistence in the DB. Orchestrator chat is stateless per request. AGENTS.md §9.1 requires conversation + plan + execute to be one coherent flow with persistence. | 🟡 |
| B9 | `generation-handler.js` | `debitCredits` happens **before** generation succeeds; on failure it does a manual `credits: { increment: cost }` refund instead of using `CreditLedger`/`CreditReservation` (which already exist in the schema). Wallet/ledger is bypassed. | 🟡 |
| B10 | Multiple `.bak` files | `AvatarStudio.js.bak`, `VideoEditStudio.js.bak`, `SimpleMode.js.bak` left in `src/components/studio/`. Dead code, confuses tooling. | 🟢 |

### 1.2 Architecture gaps vs spec

| # | Spec section | Gap |
|---|--------------|-----|
| A1 | §5 Three-pane layout | Only `ImageStudioV2`/`VideoStudioV2` implement it. `SimpleMode` (used by 8+ tools: cinema, motion, clipping, marketing, lipsync, recast, influencer, audio) is still single-column chat. Each of those tools deserves a real workspace. |
| A2 | §6 Canvas | `CanvasEditor.js` exists but `CanvasWorkspace` doesn't wire the Canvas Compiler (spec §6.4) — no flattened guide render, no mask render, no semantic-role → model request translation. Generation from Canvas sends raw params. |
| A3 | §7 Director | `director-planner.js` + `director-executor.js` exist but the planner does NOT do the single-LLM-call Maestro methodology (one massive system prompt → JSON shot array). It also lacks continuity tracking as explicit per-shot data (spec §7.7). Shot reruns exist in API (`director/rerun`) but UI repair flow is thin. |
| A4 | §8 Brand Kits | `BrandKitsView.js` exists; `Brand Fingerprint` extraction (palette, typography, visual style) is not implemented — `lib/visual-intelligence.js` should feed it. Enforcement modes (Off/Suggest/Strong/Locked) are not wired into the prompt pipeline. |
| A5 | §9 Orchestrator | Subagents (Creative Director, Image Director, Brand Guardian, etc.) are defined as names in `agents.js` but not actually invoked as separate LLM roles with scoped context. Cost-approval flow (expected + max credits) is partial. |
| A6 | §10 Prompt Intelligence | Only a single-pass `prompt-expansion.js` exists. No Intent Normalizer, no Context Enrichment, no Model Dialect Compiler, no PromptGuide registry usage at generation time, no deterministic Validator. `PromptGuide`/`PromptGuideVersion` tables exist but are not read by the generation pipeline. |
| A7 | §11 Visual Intelligence | `lib/visual-intelligence.js` exists — verify it actually calls a multimodal LLM and writes `VisualAnalysis` rows; confirm it's used by Brand Kit onboarding, Canvas, and reference analysis. |
| A8 | §12 Wallet | `CreditWallet`/`CreditLedger`/`CreditReservation` tables exist but `generation-handler.js` still uses the old `debitCredits`/increment pattern. `lib/wallet.js` should be the single entry point. |
| A9 | §13 Admin | Admin components exist (`OverviewDashboard`, `ModelManager`, `PlanEditor`, `PromoManager`, `CmsEditor`) — audit that each is fully functional, no no-ops, reads from DB, and that `PromoManager` shows margin warnings (spec §48). |
| A10 | §14 Assets | `AssetLibrary.js` + `Asset` table exist — verify lineage (`parentAssetId`) is populated by `generation-handler.js` and that every provider output is ingested (spec §35-37). |
| A11 | Provider secrets | Audit `.env`/`ProviderConfig` — spec §18-20 says no plaintext provider keys in DB, migrate to secret manager/reference. Confirm `ProviderConfig` stores references, not raw keys. |
| A12 | Mobile | Three-pane layouts need bottom-sheet (settings) + drawer (inspector) on mobile per spec §13. Most V2 components only handle desktop. |

### 1.3 UX/UI quality gaps

- Studio shell icon rail is good but the **active tool's workspace** varies wildly in quality: Orchestrator and Image are polished; cinema/motion/clipping/marketing/influencer/audio/lipsync/recast all collapse to the generic `SimpleMode` chat. They feel like the same tool with a different icon.
- No consistent **empty state** across tools (some have `PremiumIdle`, some don't).
- No **result card reuse** pattern — each tool re-implements "show image/video, download, send to other tool".
- No **keyboard shortcut overlay** or discoverability beyond ⌘K.
- `StagedProgress` stage labels are hardcoded in three places (`StudioComponents.js`, `StagedProgress.js`, `DirectorWorkspace.js`). Unify.
- Cost quote color coding (green/yellow/red per spec §5.5) is only partially implemented in `useCreditCost`.

### 1.4 Prompt quality gaps

- `prompt-expansion.js` templates are generic. No model-specific dialect (Flux vs Midjourney vs Sora vs Kling vs Veo vs Suno) beyond 4 hardcoded entries. The `PromptGuide` registry is unused.
- Director planner must enforce the 10 Maestro prompt policies (spec §7.8) — `director-planner.js` has the validators but they need to be applied to the LLM output and shown in the UI.
- No negative-prompt library per tool/model.

---

## 2. Design System (canonical — follow exactly)

### 2.1 Tokens
- Easing: `EASE = [0.32, 0.72, 0, 1]`
- Spring: `{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }` (cards) / `{ stiffness: 420, damping: 30 }` (popovers)
- Brand color: `var(--color-brand)` (`#FF1B6B`)
- Surfaces: `.studio__glass`, `.studio__glass--strong`, `.studio__glass--brand-edge`
- Dark theme, colorful icon accents per tool, Framer Motion on every state change
- `prefers-reduced-motion` respected

### 2.2 Layout primitives (every Studio workspace)
- **Three-pane**: Inputs (240px, collapsible) · Canvas/Preview (flex) · Inspector (240px, collapsible)
- **Bottom bar**: PromptComposer + ModelSelector + CostQuote + GenerateButton
- **Mobile**: Inputs → bottom sheet, Inspector → drawer, bottom bar stays
- **Basic/Advanced toggle** persisted per workspace in `localStorage` key `helmies.studio.<tool>.mode`

### 2.3 Shared components (in `StudioComponents.js`)
Reuse, don't reinvent: `PromptComposer`, `ModelSelector`, `CostQuote`, `GenerateButton`, `AssetPicker`, `StagedProgress`, `BasicAdvancedToggle`, `ResultCard`, `EmptyState`, `KeyboardHint`. Every tool's workspace composes these.

### 2.4 Motion
- Page/section entrance: `initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} transition={{...SPRING}}`
- Result reveal: scale 0.96 → 1 with layoutId
- Progress stages: animated connectors, spinner on active, check on done
- No layout thrash; use `layout` prop sparingly

---

## 3. Execution Prompt (feed this to the agent before each phase)

> You are working on **Helmies Studio** (`helmies-studio` repo), a Next.js 16 / React 19 / Framer Motion / Tailwind 4 / Prisma+PostgreSQL / NextAuth v5 / Stripe app. The Helmies Agent merge is **abandoned** — do NOT introduce LibreChat, do NOT split the repo into `apps/`. Everything stays in the current single-app structure.
>
> **Read first:** `AGENTS.md` and `HELMIES_STUDIO_MASTER_MERGE_IMPLEMENTATION_SPEC.md` (skip §0 Executive Decision merge language and §5 final-repo `apps/` split; keep all other sections as the product contract).
>
> **Non-negotiables:** preserve the landing page visuals; never break existing generation; additive DB migrations only; provider keys server-side only; no hardcoded pricing (use `ModelPricing` + `pricing-engine`); keep Framer Motion; one wallet (`lib/wallet.js`); provider-agnostic UI; server-side quotes for every billable action; no dead buttons; no mock data in production paths; build complete features not scaffolds.
>
> **Design system:** use the tokens in §2 above. Every Studio workspace is three-pane (desktop) / bottom-sheet+drawer (mobile), composed from shared `StudioComponents`. Easing `[0.32,0.72,0,1]`, spring `stiffness:380,damping:30`. Dark theme, `.studio__glass` surfaces, brand `#FF1B6B`.
>
> **Order of work (do strictly in this order; finish each before the next; run `npm run lint` + typecheck after each):**
>
> 1. **Fix critical bugs** (Audit §1.1 B1–B10). Start with B1 (agent/chat PROVIDERS ReferenceError).
> 2. **Wallet unification** — route all credit ops through `lib/wallet.js` (reserve → execute → settle/refund via `CreditLedger`). Update `generation-handler.js`, `agent/run`, `workflows`, `director-executor`. Keep old `debitCredits` as a thin wrapper only if needed for back-compat.
> 3. **Prompt Intelligence Engine** — build the 5-pass pipeline in a new `lib/prompt-engine/` (normalizer, enricher, expander, dialect compiler reading `PromptGuide` rows, deterministic validator, optional polish). Replace `prompt-expansion.js` calls in `generation-handler.js` and `director-planner.js`. Record `PromptCompilation` rows.
> 4. **Studio workspaces** — promote every tool from `SimpleMode` to a real three-pane workspace composed from `StudioComponents`. Order: audio, cinema, lipsync, recast, influencer, marketing, motion, clipping. Each gets a real model selector (from registry), real cost quote, real progress, real result cards, basic/advanced toggle, mobile sheets. Remove `.bak` files.
> 5. **Canvas Compiler** — implement the compiler (spec §6.4): flatten guide, render masks, translate semantic roles to model-specific request. Wire into `CanvasWorkspace` generate flow. Add warnings for incompatible model/canvas combos.
> 6. **Director** — rewrite `director-planner.js` to the single-LLM-call Maestro methodology (one massive system prompt with all rules → JSON shot array). Add explicit per-shot continuity data (spec §7.7). Enforce the 10 prompt policies via validators on LLM output. Show policy violations in UI. Complete the repair/rerun flow.
> 7. **Brand Kits** — implement Brand Fingerprint extraction via `visual-intelligence.js`. Wire enforcement modes (Off/Suggest/Strong/Locked) into the prompt pipeline (pass 1 context enrichment).
> 8. **Orchestrator** — implement real subagent invocation (scoped LLM roles with scoped context), cost-approval flow (expected + max credits), persistent conversation+plan+execute in DB. First-party tools (`helmies.*`) as functions the orchestrator can call.
> 9. **Visual Intelligence** — verify `lib/visual-intelligence.js` writes `VisualAnalysis` rows and is called by Brand onboarding, Canvas, reference analysis, quality gate.
> 10. **Admin V2** — audit each admin component for no-ops; ensure `PromoManager` shows margin warnings, `ModelManager` reads/writes `ModelPricing` + `PromptGuide`, `CmsEditor` publishes to `CmsEntry`/`CmsRevision`, announcements target audiences.
> 11. **Asset Library** — ensure `generation-handler.js` creates `Asset` rows with lineage (`parentAssetId`) and ingests every provider URL into controlled storage. Add the asset action menu (open, add to Canvas, use as reference, edit, animate, lipsync, recast, analyze, add to Brand Kit, download, delete).
> 12. **Mobile + a11y + perf** — bottom sheets, drawers, touch canvas, skeletons, reduced-motion, keyboard nav, image optimization.
>
> After each phase: run `npm run lint`, fix all errors, verify no regressions in `generation-handler.js`, and update this file's checklist below by checking the box.

---

## 4. Phase Checklist

- [x] Phase 1 — Critical bugs fixed (B1–B10)
- [x] Phase 2 — Wallet unified through `lib/wallet.js`
- [x] Phase 3 — Prompt Intelligence 5-pass engine live
- [x] Phase 4 — All Studio workspaces promoted to three-pane
- [x] Phase 5 — Canvas Compiler implemented
- [x] Phase 6 — Director rewritten to Maestro methodology
- [x] Phase 7 — Brand Kits + Fingerprint + enforcement modes
- [x] Phase 8 — Orchestrator subagents + cost approval + persistence
- [x] Phase 9 — Visual Intelligence wired everywhere
- [x] Phase 10 — Admin V2 audited and complete
- [x] Phase 11 — Asset Library lineage + actions
- [x] Phase 12 — Mobile + a11y + perf pass

---

## 5. Per-page detail (what "best" means for each Studio page)

### Orchestrator (`/studio` default)
- Persistent conversation in DB (`AgentRun` already exists — use it).
- Plan card with expected + max credits, per-step model, per-step cost, confirm button.
- Subagent chips showing which specialist is active (Creative Director, Image Director, Brand Guardian…).
- Result cards with "Send to Image/Video/Canvas", "Save to project", "Add to Brand Kit".
- Cost approval threshold setting in `/settings`.

### Image Studio (`/studio/image`)
- Three-pane already exists — polish: drag-drop refs with role badges (Product/Style/Identity/Background), mask drawer, model card grid with quality tier + speed bars + credit cost, prompt inspector drawer showing all 5 passes, economy-model suggestion when insufficient credits.

### Video Studio (`/studio/video`)
- Same as Image plus: first/last-frame upload zones, duration pills from model registry, window prompts for long models, aspect-aware preview frame.

### Audio Studio (`/studio/audio`)
- Three-pane: left = model + voice/duration; center = waveform preview + lyrics; right = inspector. TTS vs Music vs SFX sub-modes. Suno custom mode fields when model supports.

### Cinema Studio (`/studio/cinema`)
- Three-pane: left = camera/lens/focal/aperture selectors with visual previews; center = preview; right = prompt inspector showing compiled cinematic prompt. Build prompt from camera params (already in `chatModes.js` — move into a real workspace).

### Motion / Vibe Studio (`/studio/vibe-motion`)
- Three-pane: left = mode (generate/edit) + aspect + duration; center = preview; right = inspector. Generate vs Edit sub-modes with distinct prompt fields.

### Clipping Studio (`/studio/clipping`)
- Three-pane: left = source video upload + highlights count; center = video player + timeline; right = list of extracted highlights with timestamps and download.

### Marketing Studio (`/studio/marketing`)
- Three-pane: left = avatar + product + platform; center = ad preview; right = script inspector. UGC ad builder with brand-kit injection.

### Lip Sync (`/studio/lipsync`)
- Three-pane: left = portrait upload + audio upload + model; center = preview; right = inspector. Result = talking video.

### Recast / Body Swap (`/studio/body-swap`)
- Three-pane: left = source video + reference face + model; center = preview; right = inspector.

### Influencer (`/studio/influencer`)
- Three-pane: left = persona builder (tabs from `INFLUENCER_TABS`); center = gallery; right = inspector. Persona persistence in `ProjectMemory`.

### Director (`/studio/director`)
- Three-pane: left = brief + platform + duration + brand + references; center = shot list + pipeline stages; right = shot inspector with continuity data, prompt policies status, rerun buttons per shot.

### Canvas (`/studio/canvas`)
- Three-pane: left = tools + layers; center = Fabric canvas; right = inspector (semantic role per object, prompt notes). Bottom = compile + generate with warnings.

### Workflows (`/studio/workflows`)
- Node-based builder; each node = a Helmies tool call; execution via `lib/workflows.js` through the wallet + gateway.

### Brand Kits (`/studio/brands`)
- List + editor; upload logo → fingerprint extraction; palette from references; enforcement mode selector; preview of brand constraints.

### Assets (`/studio/assets`)
- Grid + filters (type, project, model, date); lineage graph view; action menu per spec §40.

### Projects (`/studio/projects`) — if present
- Group conversations, assets, brand kit, canvases, workflows, director pipelines.

### Memory (`/studio/memory`)
- Characters, styles, assets, brands CRUD (already exists — verify completeness).

### Music (`/studio/music`)
- Suno + ElevenLabs unified workspace (currently `MusicStudio.js`).

### Video Edit (`/studio/video-edit`)
- Runway/Veo extend/Wan V2V (`VideoEditStudio.js`).

### Avatar (`/studio/avatar`)
- Kling avatar animation (`AvatarStudio.js`).

### Admin (`/admin`)
- Per §13 spec: Overview, Business, AI Platform, Users, Content, Operations. Each sub-page fully functional.

### Settings / Pricing / Login / Gallery
- Verify dynamic pricing from DB, credit display from wallet, gallery reads from `Asset` table.

---

## 6. Prompt library targets

For each model family, store a `PromptGuide` row (admin-editable) used by the dialect compiler:
- **Flux** (dev/schnell/2/kontext): descriptive prose, photographic, camera specs
- **Midjourney v7**: evocative artistic, comma syntax, no periods
- **Nano Banana / Imagen 4**: natural language, aspect-aware
- **GPT Image 1.5/2**: instructional, exact-text friendly
- **Seedream / Qwen / Wan**: descriptive with strong style tags
- **Kling (image+video)**: cinematic, motion-first
- **Sora 2**: multi-subject scene description, narrative arc
- **Veo 3**: realistic physics, lighting progression
- **Suno**: tags + style + title + instrumental + vocal gender
- **ElevenLabs TTS**: voice + stability + similarity + speed
- **Lip Sync / Recast**: minimal action prompt, identity preservation

Negative-prompt library per tool (image/video) stored in `PromptGuide` content.

Director prompt policies (10 rules) enforced as validators, shown in UI as pass/warn/fail chips.

---

## 7. Done definition

A phase is done when:
- `npm run lint` passes
- No new TypeScript/JS errors in `get_errors`
- The touched files follow the design system
- No dead buttons, no mock data, no hardcoded pricing
- The checklist box above is checked
- This file is updated with what changed