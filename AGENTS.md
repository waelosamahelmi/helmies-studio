# Helmies Studio — AGENTS.md

**Project:** Helmies Studio — AI Creative Operating System
**Stack:** Next.js 16, React 19, Framer Motion, Tailwind CSS 4, Prisma + PostgreSQL, NextAuth v5, Stripe
**Live:** https://studio.helmies.fi
**Spec reference:** HELMIES_STUDIO_MASTER_MERGE_IMPLEMENTATION_SPEC.md

---

## 0. Product Philosophy

Helmies Studio serves both simple users and advanced creators through the same engine.

**Simple user** — says "Create a 15-second premium Instagram launch ad for my coffee brand." Doesn't need to know about models, seeds, provider names, scheduler concepts, or prompt dialects.

**Advanced user** — wants exact model, seed, aspect ratio, resolution, references, masks, inpaint/outpaint, Canvas composition, per-shot planning, prompt inspection, credit quotes.

**Same execution system** — UI changes, engine doesn't:
```
Simple User → Master Orchestrator → Model Gateway → Providers
Advanced User → Manual Studio → Model Gateway → Providers  
Workflow → Workflow Engine → Model Gateway → Providers
Director → Director Planner/Pipeline → Model Gateway → Providers
```

---

## 1. Architecture

```
helmies-studio/
├── src/
│   ├── app/
│   │   ├── page.js                  ← Public landing (Lenis scroll, Framer Motion)
│   │   ├── studio/page.js           ← Studio shell (icon rail + tab system)
│   │   ├── admin/page.js            ← Admin panel
│   │   ├── api/                     ← 47 API endpoints
│   │   │   ├── generate/            ← image, video, audio, lipsync, recast, etc.
│   │   │   ├── agent/               ← Orchestrator agent (chat, plan, run)
│   │   │   ├── stripe/              ← Checkout, portal, topup, webhook
│   │   │   └── admin/               ← Analytics, audit, models, pricing, users
│   │   ├── login/                   ← Auth pages
│   │   ├── settings/                ← Credits, API keys, billing
│   │   └── pricing/                 ← Pricing page
│   ├── components/
│   │   ├── landing/                 ← Hero, features, pricing cards
│   │   ├── studio/                  ← All Studio tool components
│   │   │   ├── ChatStudio.js        ← Routes between SimpleMode and OrchestratorMode
│   │   │   ├── modes/
│   │   │   │   ├── SimpleMode.js    ← Single-generation tool UI
│   │   │   │   └── OrchestratorMode.js ← AI agent chat
│   │   │   ├── chatModes.js         ← Tool definitions, model configs, input schemas
│   │   │   ├── ProjectMemory.js     ← Characters, styles, brands, assets
│   │   │   ├── WorkflowBuilder.js   ← Multi-step pipeline builder
│   │   │   └── StagedProgress.js    ← Animated generation progress
│   │   └── admin/                   ← Admin dashboard components
│   └── lib/
│       ├── generation-handler.js    ← Core pipeline (auth → rate limit → quote → execute → store → settle)
│       ├── generation.js            ← Generation CRUD with Prisma
│       ├── models.js                ← Model definitions & capabilities
│       ├── providers.js             ← Provider integrations
│       ├── pricing-engine.js        ← Credit cost calculation
│       ├── credits.js               ← Credit balance management
│       ├── credit-packs.js          ← Credit pack purchasing
│       ├── memory.js                ← ProjectMemory CRUD
│       ├── media-storage.js         ← Local & S3 media storage
│       ├── prompt-expansion.js      ← Prompt optimization
│       ├── quality-gate.js          ← Post-generation checks
│       ├── security.js              ← SSRF, upload validation
│       ├── video-assembly.js        ← FFmpeg clip joining
│       ├── workflows.js             ← Workflow execution
│       ├── agents.js                ← Orchestrator agent logic
│       └── prisma.js                ← Prisma client
├── prisma/schema.prisma             ← 18 models (PostgreSQL)
└── public/                          ← Static assets, videos, images
```

---

## 2. What Already Exists (DO NOT BREAK)

| Feature | Status | Notes |
|---------|--------|-------|
| Landing page | ✅ Live | Lenis smooth scroll, Framer Motion, pricing cards |
| Studio shell | ✅ Live | Icon rail with hover flyouts, ⌘K, pending count badge |
| Image gen (T2I, I2I) | ✅ Live | Wavespeed, Atlas providers |
| Video gen (T2V, I2V) | ✅ Live | Async polling, staged progress |
| Audio gen | ✅ Live | TTS, music |
| Lip Sync | ✅ Live | Image + audio → video |
| Recast (body swap) | ✅ Live | Face replacement |
| Cinema / Motion / Clipping / Marketing | ✅ Live | Cinematic tools |
| AI Influencer | ✅ Live | Persona-based generation |
| Orchestrator Agent | ✅ Live | Chat-based, plan → execute (KEEP THIS — no LibreChat) |
| Workflows | ✅ Live | Multi-step pipeline builder |
| Project Memory | ✅ Live | Characters, styles, assets, brands |
| Credit system | ✅ Live | Balance, per-model pricing, Stripe |
| Admin panel | ✅ Live | Analytics, users, models, providers, refunds |
| Stripe billing | ✅ Live | Subscriptions, top-ups, webhooks |

---

## 3. Non-Negotiable Rules

1. Do NOT redesign the approved public landing page — preserve visual language, motion, layout
2. Do NOT break existing generation — users are actively generating
3. Do NOT reset the database — add tables, don't drop. Preserve all user data, credits, Stripe mappings
4. Do NOT expose provider secrets — keys stay server-side, never in client bundles
5. Do NOT hardcode pricing — all prices from database/pricing engine, not UI constants
6. Keep the animations — Framer Motion is core brand identity
7. Keep it simple — clean, uncluttered. No unnecessary chrome
8. One wallet — Agent, manual tools, workflows, Director all use same credit balance
9. Provider-agnostic UI — show capabilities, not provider names
10. Every billable action has server-side quote — client never calculates credits independently
11. Use our Orchestrator, not LibreChat — we have a working orchestrator, improve it
12. Do NOT copy Maestro source code (WanGP Non-Commercial License) — clean-room reimplement concepts only
13. No required button may remain a no-op
14. No production path may silently fall back to mock data
15. Do not stop after scaffolding — build complete, functional features

---

## 4. Design System & UX Philosophy

### Preserve from current
- Framer Motion animations — page transitions (layoutId), fade/slide entrances, EASE curve: [0.32, 0.72, 0, 1]
- Lenis smooth scroll on landing
- Icon rail sidebar with hover flyouts (Groups: AI Agents, Generate, Cinematic, Character)
- Dark theme with colorful icon accents per tool
- ⌘K command palette
- StagedProgress with animated stage labels

### Adopt from LibreChat's simplicity
- Clean, uncluttered — tight spacing, minimal chrome
- Sidebar-first navigation — the icon rail IS the app
- Contextual panels — slide-out, not separate pages
- Smooth micro-interactions — hover states, transitions polished but not over-designed
- No unnecessary modals — prefer inline editing, slide-out panels, bottom sheets on mobile
- Consistent typography and spacing tokens

---

## 5. PHASE 1 — Studio UX Overhaul (Three-Pane Layout)

Replace the current single-column chat UI with proper workspace layouts per tool.

### 5.1 Three-Pane Layout (Image, Video, Director)
```
┌──────────────┬────────────────────────┬──────────────┐
│ INPUTS       │                        │ INSPECTOR    │
│ model        │     CANVAS / PREVIEW   │ job info     │
│ references   │                        │ prompt       │
│ settings     │                        │ ask agent    │
│ advanced     │                        │              │
├──────────────┴────────────────────────┴──────────────┤
│ Prompt Composer      Model ▼    Cost    [Generate]   │
└──────────────────────────────────────────────────────┘
```
- Left (240px): Collapsible settings — model, references, output params
- Center: Canvas/preview with generation progress
- Right (240px): Inspector — job metadata, prompt inspector, agent access
- Bottom bar: Prompt + model + cost + generate button
- Mobile: Settings → bottom sheet, Inspector → drawer

### 5.2 Basic / Advanced Mode Toggle
- **Basic**: prompt, references, recommended model, aspect ratio, quality, cost
- **Advanced**: exact model, seed, resolution, masks, negative prompt, guidance scale
- Persist per workspace

### 5.3 Model Selector
- Show cards: display name, provider, quality tier badge, credit cost, speed indicator
- Auto-recommend based on inputs (reference count, quality mode, budget)
- Gray out incompatible: "This model supports 1 reference; you have 4"
- Group by capability, sort by quality/cost

### 5.4 Reference Upload
- Drag-and-drop zone with visual feedback
- Per-reference role selector: Product, Style, Identity, Background, First Frame, Last Frame
- Thumbnail previews with role badges

### 5.5 Cost Quote Display
- Before generation: estimated credits, maximum credits, current balance, balance after
- Color-coded: green (affordable), yellow (close), red (insufficient)
- Quick "Add credits" action if insufficient
- Economy alternative suggestion

### 5.6 Generation Progress
- Animated stage pipeline: Preparing → Submitting → Generating → Processing → Quality Check → Finalizing
- Image: subtle waves/mesh shimmer, blurred preview
- Video: frame-strip pulse, shot progress
- Agent: animated plan graph
- Respect prefers-reduced-motion

### 5.7 Contextual Agent Panel
Agent inside any Studio sees: current tool, model, prompt, references, Canvas, Brand Kit, project, errors
User can ask: "Make this more cinematic" / "Use a cheaper model" / "Improve composition"
Agent proposes changes; destructive changes require confirmation.

---

## 6. PHASE 2 — Canvas Editor (Core Differentiator)

The Canvas is NOT a drawing surface — it's a **visual instruction document**.

### 6.1 Core Features
- **Object types**: IMAGE, TEXT, SHAPE, FREE_DRAW, MASK_INCLUDE, MASK_EXCLUDE, ARROW, REGION, PROMPT_NOTE, COLOR_SWATCH, LOGO, REFERENCE, GUIDE, BACKGROUND
- **Semantic roles** per object: layout_reference, identity_reference, style_reference, product_reference, logo, background_reference, preserve_exactly, edit_target, remove_target, inpaint_region, text_content, color_reference, composition_anchor
- **Transform**: Move, resize, rotate, opacity
- **Layer panel**: Reorder (drag), visibility toggle, lock, duplicate, delete
- **Zoom**: 10%–200% with fit-to-screen
- **Undo/Redo**: Full history stack
- **Technology**: Fabric.js (object transforms, text editing, images, selection, grouping, free drawing)

### 6.2 Mask System
- Include mask (white on black): What to generate in
- Exclude/Preserve mask (black on white): What to preserve exactly
- Free-draw or shape-based creation

### 6.3 Canvas Document
- Persist as editable JSON (not flattened image)
- Autosave with version history
- Version snapshots: create, name, restore, compare

### 6.4 Canvas Compiler
Converts visual intent into model-ready instructions:
1. Flattened composition guide image
2. Inpaint mask / preservation mask
3. Reference assets with semantic roles
4. Region instructions with bounding boxes
5. Text requirements
6. Compiled prompt + negative prompt
7. Warnings for incompatible model/canvas combos

### 6.5 Canvas → Generate Flow
- Quote from compiled instructions
- Model-appropriate routing (if model supports multiple refs → send directly; single ref → flatten guide; masks → render exact mask; T2I only → textual spatial prompt)
- Result lineage: Canvas version → generation → asset

---

## 7. PHASE 3 — Director (Multi-Shot Production)

Clean-room implementation inspired by Blizaine/Maestro's architecture. No Maestro source code used.

### 7.1 Production Types
- **Music Video** — beat-aware shot planning aligned to audio. LLM analyzes BPM, sections (intro/verse/chorus/bridge/outro), energy, writes shots that hit downbeats. Speaker transcription & diarization.
- **Short Film** — screenplay-driven scenes with named characters, dialogue, continuity across cuts. Pacing-bias slider.
- **Ad/Product Video** — brand-focused, product hero shots, CTA ending
- **Social Campaign** — platform-optimized, multiple variants
- **Viral Video** — attention-grabbing, fast-paced, shareable

### 7.2 Director Orchestrator Architecture (from Maestro study)
Maestro uses a single-orchestrator pattern: one LLM call with a MASSIVE system prompt containing ALL rules, the LLM outputs a complete JSON array of shots. This avoids multi-call drift.

Key components:
- **Planner Registry**: music_video → MusicVideoPlanner, short_film → ShortFilmPlanner, etc.
- **Renderer Registry**: t2v → LtxT2VRenderer, i2v → LtxI2VRenderer, image_gen → ImageGenRenderer
- **Prompt Policies**: Centralized rules (no character names outside dialogue, no montage language, present tense, physical emotion only, explicit camera language, re-describe characters every shot)
- **Validators**: Validate shot plans before generation (total duration, continuity, references, unsupported modes, execution cycles)

### 7.3 Music Video Planner — Exact Methodology

**Inputs:** Song audio, transcript/lyrics, beat map, section labels (intro/verse/chorus/bridge/outro), performer map, optional reference image, user scene concept

**Single LLM Call structure:**
```
SYSTEM PROMPT contains:
- Character rules (physical descriptions, no names in prompts)
- Camera style rules (no vague terms, explicit framing/movement/angle/lens)
- Reference photo instructions (use as visual ground truth, match aesthetic)
- Music video rules (chorus=high energy, verse=intimate, instrumental=environment)
- Image prompt rules (no action verbs in static images, no meta-language)
- OUTPUT JSON schema (scene_goal, scene_type, subjects_on_screen, environment,
  visual_style, lighting, mood, action_beats, camera_plan, ending_beat,
  image_source, image_prompt, visual_changes, video_prompt, keyframe_prompts,
  window_prompts)
- Scene-anchoring rules (stay on-concept, don't hallucinate unrelated scenes)
- Simplicity rules (15-40 word video prompts, performance-driven)

USER PROMPT:
- Scene Concept: {user_brief}
- Song tempo: {bpm} BPM
- Clips: [{start, end, label, lyrics}]
```

**Section-based visual strategy (hard-coded, not LLM):**
```
intro:     wide establishing shot, subtle movement, building energy, atmospheric slow reveal
verse:     medium shot, subtle movement, steady energy, storytelling, character focus, intimate
chorus:    dynamic angle, dynamic movement, peak energy, bold, wide+close-up mix
bridge:    unique angle, moderate movement, contrasting energy, dreamy/surreal
outro:     wide shot, subtle movement, fading energy, pulling back, reflective
instrumental: sweeping shot, moderate movement, atmospheric, environment focus, textures
```

**Key Maestro design decisions to replicate:**
1. **Single LLM call per plan** — all rules in system prompt, output is complete JSON array. Avoids multi-pass drift
2. **Reference photo is visual ground truth** — when provided, every shot is anchored to it. When absent, LLM invents a consistent character+setting reused across all clips
3. **image_prompt FIRST, then visual_changes, then video_prompt** — field order matters for consistency
4. **keyframe_prompts default EMPTY** for music videos — model animates motion, camera, expressions on its own. Only use keyframes for specific visual changes that can't be inferred
5. **FORBIDDEN keyframe content for music videos**: performer pose changes, camera angle changes, expression shifts, lighting shifts, energy beats — model handles these
6. **15-40 word video prompts** — music-driven pacing, the model interpolates. Over-described = worse
7. **No character names in prompts** — use physical descriptors ("the woman in red", "the guitarist")
8. **No montage language** — "cut to", "montage", "series of shots" are forbidden in single-clip prompts
9. **No abstract emotions** — replace "feeling happy" with physical cues like "smiling, relaxed posture"
10. **Thinking budget: 4096 tokens** — give the LLM room to reason before outputting JSON

### 7.4 ShotPlan Schema
```typescript
type ShotPlan = {
  id: string; index: number; title: string; durationSec: number;
  narrativeRole: string; sceneGoal: string;
  subjects: SubjectRef[];
  environment: string; spatialSetup: string; lighting: string; mood: string;
  camera: { framing: string; angle: string; lens: string; movement: string; intensity: string };
  imageStrategy: { mode: "generate" | "reference" | "reuse_previous_end_frame"; prompt: string; references: string[] };
  videoStrategy: { mode: "t2v" | "i2v" | "reference" | "extend"; prompt: string; modelRoute: string; keyframes?: string[]; windows?: string[] };
  audio?: { dialogue?: string; ambience?: string; effects?: string[] };
  continuity: string[];
}
```

### 7.5 Pipeline State Machine
```
draft → planning → awaiting_approval → quoted → queued →
generating_images → generating_video → generating_audio →
quality_check → assembling → completed
(Any state → paused, failed, cancelled)
```
Persist all state. Survives browser refresh. Resumable.

### 7.6 Shot Reruns & Repair
- Rerun: image only, video only, audio only, prompt polish only
- Rerunning one shot does NOT rerun unaffected shots
- Repair workflow: check + repair, regenerate missing images/videos, skip valid clips
- Repair continues when browser refreshed/closed
- After rerun: optionally reassemble final

### 7.7 Continuity Tracking (Maestro's secret sauce)
Per shot, track as EXPLICIT DATA (not LLM-guessed):
```
- character identity    ← Same person across shots
- outfit               ← Consistent clothing  
- product identity      ← Same product appearance
- environment           ← Consistent location/setting
- lighting              ← Matching light direction/quality
- time of day           ← Consistent or intentional progression
- screen direction      ← 180-degree rule, eye-line matches
- previous ending frame ← Shot N starts where Shot N-1 ended
- camera language       ← Consistent lens/framing vocabulary
```

### 7.8 Prompt Policies (deterministic rules enforced by validators)
```
no_character_names_outside_dialogue: true  ← Use descriptions, not names
dialogue_in_quotes: true                   ← "Hello" not Hello
chronological_action: true                 ← Describe in time order
single_paragraph: true                     ← No multi-paragraph prompts
present_tense: true                        ← "walks" not "walked"
no_montage_language: true                  ← No "cut to", "montage"
physical_emotion_only: true                ← No "feeling happy" — show it
explicit_camera_language: true             ← No "cinematic camera" — say "24mm wide, slow dolly in"
re_describe_characters_every_shot: true    ← Every shot reintroduces characters
no_meta_language_in_image_prompts: true    ← No "preserve", "maintain"
no_action_in_image_prompts: true           ← No "walks", "runs" in still image prompts
```

### 7.9 Director Design Philosophy (from Maestro)
1. **The plan IS the product** — ProductionPlan is first-class, users edit plans, not just approve
2. **Shots are independent units** — each generated, evaluated, rerun independently
3. **Continuity is explicit data** — don't rely on AI to maintain consistency
4. **Cost before execution** — per-shot costs and total before starting
5. **Repair, don't restart** — failed shot? Rerun that one. Don't waste credits on good shots
6. **Persistent and resumable** — survive browser refresh

---

## 8. PHASE 4 — Brand Kits

### 8.1 Data Model
- Name, description, website
- Logo variants (primary, secondary, icon)
- Color palette (primary, secondary)  
- Typography (heading font, body font, uploaded font files)
- Slogans, taglines
- Photography style, tone of voice
- Visual references (do's), negative references (don'ts)
- Enforcement mode: Off / Suggest / Strong / Locked

### 8.2 Brand Upload Intelligence
- Analyze uploaded logos: dimensions, dominant colors, transparent areas
- Extract palette from reference images
- Detect layout tendencies, typography, OCR text
- Derive visual fingerprint

### 8.3 Brand Fingerprint
```json
{
  "palette": {"primary": ["#0D0D0D", "#D5B56D"], "secondary": ["#F4EFE6"]},
  "visual": {"contrast": "high", "lighting": "warm directional", "composition": "minimal centered", "texture": "premium matte"},
  "typography": {"heading": "Playfair Display", "body": "Inter"},
  "avoid": ["neon rainbow backgrounds", "cartoon style"]
}
```

### 8.4 Enforcement Modes
- **Off**: Brand info available but not enforced
- **Suggest**: Agent/UI suggests brand constraints
- **Strong**: Auto-inject constraints, warn on violations
- **Locked**: Enforce immutable rules (exact logo, colors, fonts)

---

## 9. PHASE 5 — Orchestrator Agent Improvements

Keep our existing orchestrator. Enhance with:

### 9.1 First-Party Tools
```
helmies.list_models          → Get available models with pricing
helmies.quote_generation     → Cost estimate before executing
helmies.generate_image       → Credit-aware image gen via Gateway
helmies.generate_video       → Credit-aware video gen
helmies.analyze_image        → Visual analysis (caption, palette, objects)
helmies.search_assets        → Find assets by type, project, date
helmies.get_brand_kit        → Load brand constraints
helmies.create_director_plan → Plan multi-shot production
helmies.run_director         → Execute director pipeline
helmies.get_job              → Check generation job status
helmies.retry_job            → Retry failed generation
```

### 9.2 Subagents
- **Creative Director**: Brief interpretation, concept, visual direction
- **Image Director**: Image strategy, reference roles, composition
- **Video Director**: Motion, shot duration, camera language
- **Brand Guardian**: Enforce brand constraints
- **Prompt Engineer**: Model-specific prompt compilation
- **Storyboard Agent**: Shot list, continuity, camera, pacing
- **Audio Agent**: TTS, voice, music, sound effects
- **Vision Analyst**: Scene caption, objects, OCR, palette, lighting
- **Quality Control Agent**: Prompt alignment, brand alignment, reference consistency
- **Cost Optimizer**: Model comparisons, cost/quality tradeoff
- **Assembly Agent**: Final sequence, media ordering, deliverables

### 9.3 Cost Approval Flow
- Multi-step plans show expected + maximum credits before execution
- Configurable approval threshold (auto-approve cheap operations)
- Retry budget enforced

### 9.4 Agent Media Results
- Generated media as rich cards (not raw JSON)
- Thumbnail, model, credits used, reuse settings button
- Send to other Studio tools directly from result card

---

## 10. PHASE 6 — Prompt Intelligence Engine

### 10.1 Pipeline
```
RAW INTENT → INTENT NORMALIZER → CONTEXT ENRICHMENT → CREATIVE EXPANSION → MODEL DIALECT COMPILER → DETERMINISTIC VALIDATOR → OPTIONAL POLISH → FINAL REQUEST
```

### 10.2 Pass 0 — Intent Normalization
Extract: goal, subject, action, environment, style, camera, mood, platform, aspect, exact text, immutable facts, references, negative constraints → structured JSON

### 10.3 Pass 1 — Context Enrichment
Add relevant: Brand Kit, project, visual analysis, Canvas, character/persona. Do NOT include unrelated project data.

### 10.4 Pass 2 — Creative Expansion
Add useful detail. NEVER silently alter immutable facts (product name, exact slogan, count of people, logo, specified colors).

### 10.5 Pass 3 — Model Dialect Compilation
Use model-specific Prompt Guides (versioned, stored in PromptGuideRegistry). Each model has its own guide that defines:
- Preferred syntax style (descriptive prose, concise tags, parameter-style)
- Field ordering (subject → environment → lighting → camera → style, or different)
- Supported features (reference count, negative prompt, masks, text rendering)
- Forbidden terms and preferred phrasing
- Duration-specific prompt windows (for video models)
- First/last-frame semantics

The compiler reads the model's PromptGuide and translates the normalized intent into that model's dialect. No "if model === X" scattered through code — all model-specific rules live in the PromptGuide records.

### 10.6 Pass 4 — Deterministic Validation
Validate: prompt length, unsupported parameters, reference count, duration, resolution, aspect, exact text compatibility, mask dimensions, conflicting controls. Do NOT use LLM alone for this.

### 10.7 Pass 5 — Optional Premium Polish
Modes: Off, Fast, Balanced, Premium. LLM reviews final prompt quality for expensive jobs.

### 10.8 Prompt Inspector (Advanced Mode)
User can view: Raw Intent, Normalized Intent, Brand Context, Visual Context, Canvas Context, Prompt Guide, Final Prompt, Negative Prompt, Normalized Request. May edit final prompt before generation.

### 10.9 Prompt Guide Registry
Categories: image/base, image/product, image/portrait, image/poster, video/base, video/cinematic, video/ugc, video/music-video, video/dialogue, audio/tts, audio/music, model/<id>
Admin: create, edit, diff, activate, rollback, benchmark. Every generation records guide versions.

---

## 11. PHASE 7 — Visual Intelligence Service

### 11.1 Capabilities
- Image caption/description
- Background analysis
- Color palette extraction
- Object/region detection with bounding boxes
- OCR / text region detection
- Lighting analysis (direction, quality, contrast, temperature)
- Style fingerprint
- Image comparison (similarity scoring)

### 11.2 Use Cases
- Reference analysis before generation, Brand Kit onboarding, Canvas interpretation, quality comparison, Agent visual understanding

### 11.3 Implementation
- Provider-agnostic interface (not tied to one model)
- MVP: cloud multimodal LLM
- Future: local Florence-2 compatible analyzer
- Cache analysis results per asset

---

## 12. PHASE 8 — Credit & Wallet System

### 12.1 Wallet Architecture
- Separate `available` and `reserved` balances
- Ledger: every credit change has a transaction record
- Reservation: lock credits during generation, release unused
- Types: signup, subscription_grant, topup, promo, reservation, generation, refund, admin_adjustment

### 12.2 Pricing Engine
Multiple strategies: fixed, per_image, per_megapixel, per_second, per_character, per_token, tiered
Formula: provider wholesale → +infra reserve → adjusted cost → /(1-targetMargin) → target retail → credits

### 12.3 Low Balance UX
"You need 640 credits. You have 420."
Actions: Add credits, Use economy model (~310 credits), Reduce params

---

## 13. PHASE 9 — Admin Panel V2

### 13.1 Navigation
```
Overview → BUSINESS (Revenue, Plans, Credit Packs, Promo Codes, Pricing, Margin Advisor)
→ AI PLATFORM (Models, Routes, Providers, Prompt Guides, Quality, Generations, Director)
→ USERS (Users, Teams, API Keys, Refunds)
→ CONTENT (Website Content, Announcements, Templates)
→ OPERATIONS (Jobs, Provider Health, Feature Flags, Audit Logs, System)
```

### 13.2 Key Features
- **Dashboard**: MRR, revenue, AI COGS, margin, credits sold/consumed, active users, success rate, charts
- **Model management**: CRUD with capability, inputSchema, uiSchema, pricing, limits, smoke tests
- **Provider management**: Health dashboard, latency, success rate, error rate, 429 rate, secret rotation
- **Pricing**: Plan editor, credit pack editor, dynamic pricing rules, effective dates
- **Promo codes**: Type (percentage/fixed/bonus), eligibility, limits, financial guardrail (auto-calculate margin impact)
- **CMS**: Editable landing content with draft→preview→publish, revision history
- **Announcements**: Message, style, link, dates, audience targeting
- **Admin Advisor**: Business questions answered with deterministic calculator tools (never LLM-invented numbers)
- **Audit log**: Every privileged action recorded

---

## 14. PHASE 10 — Asset Library

### 14.1 Asset Model
Every upload and generated output becomes an Asset: owner, project, type, source, storage key, dimensions, duration, mime type, bytes, model, generation job ID, parent asset ID, metadata, visual analysis, favorite flag

### 14.2 Lineage Tracking
Trace: parentAssetId → generationId → transformation. Full chain: original upload → image gen → video gen → lipsync → final

### 14.3 Asset Actions
Open preview, add to Canvas, use as reference, edit, animate, lip sync, recast, download, add to Brand Kit, save to project, delete (soft)

### 14.4 Storage
All provider output ingested into controlled storage (never depend on expiring provider URLs). Signed URLs for browser access.

---

## 15. Image-to-Prompt Concepts (from cocktailpeanut/image-to-prompt)

Independently implement:
- **Scene caption** → VisualAnalysis.caption
- **Background description** → VisualAnalysis.background
- **Palette extraction** → VisualAnalysis.palette
- **Object boxes** → VisualAnalysis.regions
- **OCR** → VisualAnalysis.textRegions
- **Structured prompt** → StructuredVisualPrompt
- **Multi-image queue** → Batch analysis jobs

---

## 16. Database — New Models Needed

Beyond the 18 existing tables, add:

| Model | Purpose |
|-------|---------|
| CreditLedger | Immutable transaction log per credit change |
| CreditReservation | Temporary credit holds during generation |
| GenerationJob | Enhanced generation with parent/child, idempotency, stages, quote snapshots |
| GenerationJobEvent | Per-job stage/progress events |
| UsageEvent | Per-unit usage tracking (tokens, seconds, images) |
| CreditWallet | Available+reserved balance per user |
| PricingPlan | Admin-controlled subscription plans |
| PlanPrice | Plan pricing with billing period, effective dates |
| CreditPack | One-time credit pack definitions |
| PromoCode | Promotional codes with eligibility, limits, dates |
| PromoRedemption | Tracked promo usage per user |
| Asset | Central media table with lineage |
| AssetRelation | Many-to-many asset relationships |
| BrandKit | Brand identity configuration |
| BrandAsset | Brand ↔ asset junction with role |
| CanvasDocument | Editable canvas JSON with versioning |
| CanvasVersion | Immutable canvas snapshots |
| DirectorPipeline | Multi-shot production state |
| DirectorShot | Individual shot within pipeline |
| DirectorShotVersion | Immutable shot revision |
| PromptGuide | Model-specific prompt compilation rules |
| PromptGuideVersion | Versioned prompt guides with content |
| PromptCompilation | Per-generation prompt compilation record |
| VisualAnalysis | Cached image analysis results |
| QualityEvaluation | Per-generation quality scores |
| ProviderIncident | Provider health incident tracking |
| CmsEntry | Dynamic landing page content |
| CmsRevision | CMS revision history |
| SiteAnnouncement | Announcement bar content |
| AdminAdvisorScenario | Advisor question/answer records |
| Project | Campaign/project grouping |

---

## 17. Implementation Order

### Immediate (user-facing value)
1. Studio UX overhaul — three-pane layout, model selector, cost quotes, progress
2. Canvas Editor — core differentiator
3. Brand Kits — enables brand-aware generation everywhere

### Platform depth
4. Director — multi-shot production with Maestro methodology
5. Orchestrator improvements — creative tools, subagents, cost approval
6. Prompt Intelligence Engine — 5-pass pipeline
7. Credit & Wallet V2 — reservations, ledger, better pricing

### Operations
8. Admin Panel V2 — business dashboard, model/provider mgmt, CMS
9. Visual Intelligence — analysis service
10. Asset Library — central media management

### Polish
11. Mobile responsiveness — bottom sheets, drawers, touch canvas
12. Performance — skeletons, motion tokens, accessibility

---

## 18. Key Constraints Summary

1. Don't break landing page — visual regression test before deploy
2. Don't break existing generation — backward compatible
3. Don't reset database — additive migrations only
4. Never expose provider secrets — keys stay server-side
5. Never hardcode pricing — all from DB/pricing engine
6. Keep Framer Motion animations — core brand identity
7. Keep it simple — clean, uncluttered UI
8. One wallet — unified credit balance
9. Provider-agnostic UI — show capabilities, not provider names
10. Server-side quotes — client never calculates credits independently
11. Use our Orchestrator — not LibreChat
12. Clean-room Maestro concepts — no copied source code
13. No dead buttons — everything functional
14. No mock data in production paths
15. Build complete features, not scaffolding
