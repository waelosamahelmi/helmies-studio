# Helmies Studio HTML 8 Command Universe Rebuild Plan

**Goal:** Rebuild the real `/studio` application so every routed tool, workflow, state, modal, model chooser, and generation experience follows HTML direction 8 (`theme-universe`) while preserving all production APIs and functionality.

**Reference:** `studio-design-concepts.html`, specifically `.theme-universe`, `renderUniverse()`, `renderUniverseWorkspace()`, `generationCanvas()`, the command palette, upload overlay, library views, builder views, and page-specific renderers.

**Non-goal:** Do not embed, iframe, or serve the static prototype as the application. It is a visual and interaction specification only. Production remains React, Next.js, authenticated, API-backed, and accessible.

## 1. Definition of identical

The redesign is complete only when all of the following are true:

- `/studio` and every `/studio/[tool]` route render real React components and real data.
- The persistent shell matches HTML 8: ambient orbital field, floating left instrument orbit, centered command entry, credit/account controls, recent-work constellation, and a spatial workspace rather than a conventional dashboard sidebar.
- Every creation tool uses the HTML 8 hierarchy: live stage at center, context/model intelligence floating at right, reference constellation near the stage, and prompt dock at the bottom.
- Model selection is image-led and searchable. Cards show the model background image, provider, capability, supported ratios, sizes, durations, pricing basis, exact estimate, and recommendation reason.
- Generation uses a responsive animated synthesis canvas. No linear progress bar, staged checklist bar, or fake percentage is the primary loading treatment.
- Specialized tools keep their appropriate UX. Director remains a shot planner, Canvas remains a true editor, Workflows remains a node builder, Assets remains a media library, and Agent remains conversational. They adopt the same visual language without being flattened into one generic layout.
- Loading, empty, error, confirmation, insufficient-credit, cancellation, retry, completion, and mobile states are designed for every route.
- All controls remain connected to their current APIs; no prototype-only buttons, invented data, dead actions, or placeholder panels ship.
- Visual comparison is performed at desktop, compact laptop, tablet, and phone widths for every route before completion is claimed.

## 2. Architecture decision

Use a shared Command Universe design system and a small set of workspace primitives, then migrate each real studio into the appropriate composition.

Do not solve this with global CSS selectors applied to unrelated markup. Shared behavior belongs in shared React components; tool-specific functionality stays in each tool component.

### New canonical structure

```text
src/components/studio/universe/
├── UniverseShell.js
├── UniverseTopbar.js
├── InstrumentOrbit.js
├── InstrumentIndex.js
├── RecentConstellation.js
├── CommandSurface.js
├── CreationWorkspace.js
├── ContextInspector.js
├── ReferenceConstellation.js
├── PromptDock.js
├── ModelBrowser.js
├── ModelCard.js
├── GenerationField.js
├── GenerationResult.js
├── PageHeader.js
├── Panel.js
├── EmptyState.js
├── ErrorState.js
└── universe-motion.js
```

`StudioClient.js` owns navigation and route-level state only. It must stop owning a second, expanded sidebar design. Creation studios compose `CreationWorkspace`; specialized studios use the lower-level Universe primitives directly.

## 3. Visual system extracted from HTML 8

### Color and surface tokens

- Canvas: `#09070c`, with a deep plum radial field centered behind the active workspace.
- Primary accent: Helmies coral `#ff416f`; use it for active navigation, focus, primary actions, generation energy, and meaningful selection only.
- Primary text: `#fff8fc`; secondary text: `#aa91a0`.
- Floating surface: translucent `rgba(21,15,24,.76)` with blur and a fine warm-pink hairline.
- Elevated/selected surface: `rgba(48,31,43,.68)`.
- Success: restrained mint `#65dca6`; destructive/error: accessible warm red distinct from the brand action color.
- No blue-purple AI gradients, light panels, or unrelated per-tool rainbow colors.

### Shape, type, and density

- Manrope remains the primary family; numeric costs, timing, ratios, and technical metadata use the existing mono family with tabular numerals.
- Outer floating panels use approximately 20-22px radii. Inner fields use 10-12px. Media thumbnails use 8-10px.
- Stage receives the most space. Controls float around it instead of forming equal-width dashboard columns.
- Desktop target: 74px orbit rail, unconstrained central stage, 280-320px contextual inspector, and a 620-760px bottom prompt dock.

### Motion

- Ambient shell orbits rotate slowly and never communicate progress.
- Navigation selection moves with opacity, scale, and a short radial glow.
- Panels enter from their spatial origin: inspector from right, prompt from bottom, instrument index from left.
- GenerationField renders particles, connective rays, expanding rings, and a breathing core whose energy changes with real task state.
- All motion uses transforms/opacity or canvas rendering and has a reduced-motion static state.

## 4. Route and component audit

| Route/tool | Current real component | Current problem | Required HTML 8 outcome |
|---|---|---|---|
| Shell | `src/app/studio/StudioClient.js` | Universe styling is mixed with the old sidebar/topbar architecture; tool changes do not update the URL | Replace markup with `UniverseShell`; orbit contains eight quick instruments; full index contains all tools; command surface searches tools/actions/assets/models; selection uses `router.push('/studio/<tool>')`; recent constellation uses real assets |
| Agent | `modes/OrchestratorMode.js` | Large inline-style chat application, conventional header/drawer/cards | Command Universe conversation stage; brief composer at bottom; model/context drawer at right; plans appear as connected spatial nodes; generation outputs render inline through the canonical result component |
| Image | `ImageStudioV2.js` | Bespoke two-column controls and preview; separate model UX | Canonical creation workspace with image stage, reference constellation, prompt dock, smart image model browser, quote confirmation, synthesis field, and result actions |
| Video | `VideoStudioV2.js` | Uses older shared selector/progress components and a different layout from Image | Same canonical creation workspace, with source-image/video roles, duration/resolution compatibility, per-second pricing, video preview, and video-specific synthesis behavior |
| Audio | `AudioStudioV2.js` | Bespoke cards and progress treatment | Audio stage with waveform/orb visualization, voice/music/SFX mode context, audio-capable model imagery, duration pricing, playable result, download/save/remix actions |
| Director | `DirectorWorkspace.js` | Dense planner in a separate visual language | Universe production surface: production brief, shot constellation/storyboard, budget and continuity inspector, approvals, execution state, and per-shot regeneration using existing Director APIs |
| Music | `MusicStudio.js` | Large standalone mini-application with its own tabs/cards/progress | Universe audio composition desk retaining music/voice/SFX tabs; model browser and controls in context orbit; animated spectral synthesis field; real audio results and asset actions |
| Lip Sync | `LipSyncStudioV2.js` | Generic form layout | Dual source constellation for face/video and audio, compatibility-aware model cards, sync options in inspector, central preview, canvas generation state, and playable result |
| Recast | `RecastStudioV2.js` | Generic upload/control workspace | Explicit source-role constellation for identity and target scene/video, privacy warning, model compatibility, central before/after result, retry and save actions |
| Influencer | `InfluencerStudioV2.js` | Compact form without a coherent persona workflow | Persona studio with identity references, appearance/scene/pose context, campaign continuity controls, model imagery, central portrait stage, and save-to-project path |
| Avatar | `AvatarStudio.js` | Large bespoke workflow, old shared controls, linear progress concepts | Avatar workspace with portrait and driving-audio sources, model intelligence, duration/cost quote, central talking-avatar stage, synthesis canvas, playback and asset actions |
| Canvas | `CanvasWorkspace.js` + `CanvasEditor.js` | Workspace and editor use a separate overlay-heavy language | Preserve real artboard, selection, layer, mask, zoom, and transform logic; reskin chrome as a Universe tool constellation, floating layers/properties inspectors, and bottom contextual action dock |
| Cinema | `CinemaStudioV2.js` | Small form-like camera selector | Cinematic stage with image/reference constellation; camera, lens, focal length, aperture, and model controls in contextual inspector; prompt dock and generated still result |
| Motion | `MotionStudioV2.js` | Generic upload and settings form | Source media at center, motion direction prompt dock, duration/ratio in inspector, compatible video model browser, animated generation field, video playback result |
| Video Edit | `VideoEditStudio.js` | Standalone dense tool with older cards and staged progress | Central source/result viewer, bottom edit-direction dock, right edit/model inspector, source metadata, duration-aware quote, synthesis field, retry/download/save |
| Clipping | `ClippingStudioV2.js` | Basic upload form; misses HTML 8 editorial-intelligence concept | Three-part spatial editorial workspace: source viewer, transcript intelligence, detected moments; clip cards orbit the timeline; real analysis/generation states and exports |
| Marketing | `MarketingStudioV2.js` | Generic campaign form | Campaign direction stage with product/reference constellation, platform/output inspector, avatar/model backgrounds, brand context, quote, synthesis, and deliverable grid |
| Workflows | `WorkflowBuilder.js` | Node builder has its own card and inline-style system | Preserve reorder, variables, save, test, and run behavior; use a full spatial node field, floating step library, contextual step inspector, real connection states, and run visualization |
| Brand Kits | `BrandKitsView.js` | Conventional list/edit modal | Brand universe: kit index at left, living identity preview at center, colors/type/assets/fingerprint context at right, create/edit dialogs in the same visual system |
| Projects | `ProjectMemory.js` | Minimal list/card panel and incomplete information hierarchy | Project constellation with real project/memory data, characters/styles/assets groupings, search/filter, project detail surface, and reusable reference actions |
| Assets | `AssetLibrary.js` | Generic media grid and modal treatment | Media constellation/grid with real thumbnails, type filters, search, selection mode, preview inspector, favorites, download/delete/use-as-reference actions, import flow |
| Generations | `src/app/gallery` | Leaves the Studio shell and uses a separate gallery visual language | Rebuild as the HTML 8 generation library: media previews on desktop, status/model/cost/time metadata, filters, retry/cancel/download actions, and persistent Universe navigation |
| Settings | `src/app/settings` | Leaves the Studio shell and breaks product continuity | Rebuild profile, generation defaults, API keys, notifications, and security as a Universe account surface while preserving forms and API behavior |
| Billing | `src/app/pricing` plus Stripe actions | Marketing-style pricing is not the HTML 8 account/billing page | Add the authenticated Universe billing surface at `/settings?tab=billing` for balance, reserved/used credits, renewal, plan, top-ups, payment management, and ledger; keep `/pricing` as the public plan page |
| Admin | `src/app/admin` and `src/components/admin/*` | Separate admin design and navigation | Apply the same tokens and shell to authenticated operations pages; retain dense admin information architecture, tables, filters, sync, audit, refunds, users, pricing, models, flags, and CMS functions |
| Command palette | `CommandPalette.js` | Searches a hardcoded tool list only and uses old modal styling | Search tools, commands, recent assets, models, and destinations; grouped results, keyboard navigation, active result preview, Universe modal styling |
| Shared chat | `chat/*` | Header/input/messages/settings each use a separate chat design | Rebuild as Universe conversation primitives; preserve uploads, prompt enhancement, generation actions, message attachments, settings, and keyboard behavior |
| Shared generation UI | `StudioComponents.js`, `StagedProgress.js`, `RichIdle.js` | Duplicate selectors, generic stages and progress bars | Split into canonical PromptDock, ModelBrowser, GenerationField, EmptyState, Result, Quote, and source-role primitives; remove progress-bar UI from all active routes |
| Shared model data | `useModelCatalog.js`, `useCreditCost.js`, `useAllCreditCosts.js` | Correct data hooks but inconsistent presentation and some fallback behavior | Keep hooks; add a normalized view model exposing background, provider, capabilities, requirements, sizes, durations, price basis, compatibility, estimate, and recommendation copy |
| Generation state | `useAsyncGeneration.js` | Functional hook is decoupled from a unified visual state model | Preserve submission/polling; expose normalized phase, elapsed time, provider/model, cancellation availability, and output so every route drives GenerationField consistently |

### Supporting component inventory

| File | Decision |
|---|---|
| `BeforeAfterSlider.js` | Keep behavior; restyle handles, labels, focus, and mobile interaction for Universe result comparison |
| `DevToolsPanel.js` | Keep internal functionality; move into a clearly separated developer utility surface using Universe tokens without exposing it to normal users |
| `chatModes.js` | Keep as the tool-schema/config boundary until model catalog fields fully replace static configuration; remove visual assumptions |
| `chat/AISuggestions.js` | Convert to compact prompt-direction suggestions attached to the prompt dock |
| `chat/ChatFeed.js` | Keep scrolling/anchoring behavior; adopt the central conversation stage |
| `chat/ChatHeader.js` | Replace with Universe contextual header; remove duplicate global navigation |
| `chat/ChatInput.js` | Merge presentation with canonical PromptDock while retaining chat attachments and enhancement behavior |
| `chat/ChatMessage.js` | Rebuild message, plan, generation, result, and error variants with canonical surfaces |
| `chat/GenerateButton.js` | Replace with the canonical generate action and quote state |
| `chat/SettingsDrawer.js` | Rebuild on ContextInspector and ModelBrowser; keep tool-specific settings logic |
| `modes/SimpleMode.js` | No current routed tool uses it; remove after import verification and cover its former schema-building behavior through active studio tests |
| `StudioComponents.js` | Decompose; do not continue as a 686-line mixed component library |
| `useModelCatalog.js` | Keep and extend normalized schema mapping; add loading/error/stale metadata |
| `useCreditCost.js` | Keep debounced quote behavior; expose unmatched-rule and insufficient-credit states explicitly |
| `useAllCreditCosts.js` | Keep only where comparison cards need parallel quotes; avoid requesting every quote when the browser is closed |
| `useAsyncGeneration.js` | Keep the API boundary; normalize phase/cancel/retry/output state and prevent component-specific polling implementations |

## 5. Legacy component decision

The following components are not routed by `StudioClient` and must not be redesigned as separate products: `ImageStudio.js`, `VideoStudio.js`, `AudioStudio.js`, `CinemaStudio.js`, `ClippingStudio.js`, `LipSyncStudio.js`, `MarketingStudio.js`, `RecastStudio.js`, `AiInfluencerStudio.js`, `VibeMotionStudio.js`, `OrchestratorChat.js`, `PromptBar.js`, `RichModelPicker.js`, `RichSelect.js`, and the old `StagedProgress.js`.

After active routes migrate and import checks pass, delete these files or explicitly document the remaining consumer. Do not keep two implementations of the same studio.

`UniverseStudio.js`, `/api/studio/universe`, and `public/studio-universe-runtime.js` are prototype adapters. Remove them after the React implementation reaches visual parity. They must never be referenced by production routes.

## 6. Shared interaction contracts

### Model browser

- Opens as a large contextual surface, not a narrow select menu.
- Search by model/provider/capability.
- Filter by task, provider, input type, output type, duration, resolution, aspect ratio, and price basis.
- Background artwork occupies at least 40% of each card and has a readable tonal overlay.
- Selected card exposes requirements and disables incompatible settings instead of silently submitting invalid values.
- Recommendation is computed from the current inputs and desired output; it is never a static “best” badge.
- Cost comes from `/api/models/quote`; catalog capabilities come from `/api/models/catalog`.

### Reference constellation

- Every input has a role: source image, identity, style, first frame, last frame, audio, target video, product, or brand asset.
- Accept file upload and selection from real assets.
- Show thumbnail, type, role, remove action, upload progress, validation error, and reorder where the provider schema allows it.
- The compact constellation floats near the stage; the expanded asset chooser is a modal surface.

### Prompt dock

- Multiline prompt with real text, attachment entry, enhance action, model summary, estimated credits, and generate action.
- `Ctrl/Cmd + Enter` submits only when validation and quote are ready.
- Expansion preserves the original prompt and allows undo.
- Tool-specific secondary prompts appear in contextual inspector, not as an endless form under the main prompt.

### Generation field

- Canvas resizes with `ResizeObserver` and DPR capped at 2.
- Visual energy maps to actual normalized phases: reserving, submitting, generating, processing, quality check, storing, complete.
- The center label shows meaningful state and elapsed time; it must not invent provider percentages.
- Cancel is shown only when cancellation is supported. Network loss shows a reconnecting state while polling continues.
- Reduced motion displays a static field with live textual status.

### Result surface

- Correct renderer for image, video, or audio.
- Show final cost, model, resolution/duration, render time, status, and output metadata from the API.
- Real actions only: download, save/favorite, open in Canvas when compatible, use as reference, retry, create variation, or new generation.

## 7. Implementation sequence

### Phase 0: lock behavior before visual changes

**Files:** `tests/studio-*.test.mjs`, new Playwright specs under `tests/e2e/`.

1. Enumerate all 20 tool IDs and assert each route mounts its real component.
2. Record current API calls and primary actions for every component.
3. Add route, upload, quote, generation, cancellation, result, and asset-action smoke coverage.
4. Add a permanent test forbidding `UniverseStudio` or an iframe in production routes.

### Phase 1: tokens and shell

**Files:** `src/styles/studio-universe.css`, `src/app/studio/StudioClient.js`, new `src/components/studio/universe/UniverseShell.js`, `UniverseTopbar.js`, `InstrumentOrbit.js`, `InstrumentIndex.js`, `RecentConstellation.js`.

1. Convert HTML 8 tokens to production CSS variables.
2. Replace the current sidebar/topbar markup with the actual Command Universe composition.
3. Synchronize active tool with `/studio/[tool]` routing and browser history.
4. Wire command entry, credits, pending jobs, account, recent assets, full tool index, mobile drawer, keyboard and focus behavior.

### Phase 2: canonical creation primitives

**Files:** new Universe primitives listed in section 2; refactor hooks only where needed.

1. Build and test CreationWorkspace, ContextInspector, ReferenceConstellation, PromptDock, ModelBrowser, ModelCard, GenerationField, GenerationResult, Quote, EmptyState, and ErrorState.
2. Drive them with real catalog, quote, upload, generation, polling, credit, and asset APIs.
3. Verify keyboard, reduced-motion, cancellation, retry, insufficient-credit, and network-error behavior.

### Phase 3: migrate the primary creation studios

**Files:** `ImageStudioV2.js`, `VideoStudioV2.js`, `AudioStudioV2.js`.

1. Migrate Image completely and use it as the canonical visual baseline.
2. Migrate Video with schema-aware inputs and per-second pricing.
3. Migrate Audio with waveform result and duration-aware controls.
4. Visual-check all states before using the pattern elsewhere.

### Phase 4: migrate transformation and campaign studios

**Files:** `LipSyncStudioV2.js`, `RecastStudioV2.js`, `InfluencerStudioV2.js`, `AvatarStudio.js`, `CinemaStudioV2.js`, `MotionStudioV2.js`, `VideoEditStudio.js`, `ClippingStudioV2.js`, `MarketingStudioV2.js`, `MusicStudio.js`.

Migrate one tool at a time. For each: retain its unique source roles and options, replace its layout and active shared UI, test its real API payload, then visually verify idle/upload/model/generating/result/error/mobile states.

### Phase 5: migrate intelligent and structural workspaces

**Files:** `modes/OrchestratorMode.js`, `chat/*`, `DirectorWorkspace.js`, `WorkflowBuilder.js`, `CanvasWorkspace.js`, `CanvasEditor.js`.

1. Agent: conversation, planning nodes, confirmation, execution, output messages.
2. Director: brief, planning, storyboard, approval, execution, rerun.
3. Workflows: templates, nodes, reorder, variables, save, test and run.
4. Canvas: artboard, layers, selection, masking, transforms, generation and export.

These are independent layouts sharing the same tokens and floating-surface language; do not force them into CreationWorkspace.

### Phase 6: migrate organization workspaces

**Files:** `AssetLibrary.js`, `BrandKitsView.js`, `ProjectMemory.js`.

1. Replace generic cards/modals with media, brand, and project constellations.
2. Preserve all fetch, create, edit, delete, select, and reuse operations.
3. Add explicit loading, empty, error, destructive-confirmation, and success states.

### Phase 6B: migrate connected Studio destinations

**Files:** `src/app/gallery/*`, `src/app/settings/*`, `src/app/pricing/*`, `src/app/admin/*`, `src/components/admin/*`, plus shared authenticated shell components.

1. Rebuild Generations as the real HTML 8 library view and retain generation actions.
2. Rebuild authenticated Settings with its complete account sections and API-key workflows.
3. Separate public plan marketing from the authenticated billing/credit management surface, while preserving Stripe checkout and portal flows.
4. Apply the Universe product shell and tokens to Admin without reducing its operational density or removing any admin destination.
5. Ensure navigation into and out of these destinations preserves product continuity and offers a direct return to the last active Studio tool.

### Phase 7: consolidate and remove obsolete UI

1. Replace imports from `StudioComponents.js`, `RichModelPicker.js`, `RichSelect.js`, `RichIdle.js`, and `StagedProgress.js` in active routes.
2. Use `rg` to prove legacy components have no consumers.
3. Delete inactive duplicate studios and the static-prototype production adapter.
4. Remove dormant old-shell and old-panel CSS only after screenshot comparison passes.

### Phase 8: exhaustive verification and deployment

1. Run unit/integration tests and `npm run build`.
2. Exercise every route at 1440x900, 1280x800, 768x1024, and 390x844.
3. For each route capture: idle, populated inputs, model browser, generation, completed result, error, and mobile.
4. Compare shell and creation surfaces directly against HTML 8 screenshots using a parity checklist.
5. Test with reduced motion, keyboard-only navigation, slow API responses, failed uploads, insufficient credits, and an empty account.
6. Deploy only after all 20 route checklists pass. Verify production HTTP, PM2 logs, APIs, and authenticated browser behavior.

## 8. Per-route completion checklist

A route may be marked complete only when:

- It uses Universe tokens and canonical primitives where applicable.
- It contains no old sidebar, equal-column dashboard, legacy model dropdown, progress bar, or generic staged checklist.
- Every visible control performs a real action or is correctly disabled with an explanation.
- Model requirements match the selected provider schema.
- Quote and final charged cost are visible and correct.
- Upload, validation, empty, generating, completion, cancellation, retry, and error states work.
- Desktop and mobile screenshots have been compared against the HTML 8 design language.
- Existing API behavior and credit reservation/settlement tests pass.

## 9. Release gates

- **Gate A:** shell parity approved before individual studio migration.
- **Gate B:** Image, Video, and Audio establish and validate the shared creation system.
- **Gate C:** all transformation/campaign studios migrated with real payload tests.
- **Gate D:** Agent, Director, Workflow, and Canvas pass functional regression suites.
- **Gate E:** Assets, Brand Kits, and Projects pass data-operation tests.
- **Gate F:** no active import of legacy visual components and no prototype iframe/adapter in production.
- **Gate G:** all routes pass the screenshot/state matrix and production build.

No deployment should occur between gates unless the completed work is hidden behind a disabled feature flag. This prevents another partially rebuilt Studio from replacing the functioning application.
