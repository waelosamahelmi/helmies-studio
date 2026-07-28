# Helmies Studio — Master Implementation Specification

**Status:** Implementation contract / single source of truth  
**Target product:** Helmies Studio  
**Target technical foundation:** `waelosamahelmi/helmies-studio` repository (single codebase — all features built here)  
**Reference repositories (concepts only, not merged):**  
- `Blizaine/Maestro`
- `cocktailpeanut/image-to-prompt`

**Specification date:** 2026-07-24  
**Primary implementation consumer:** DeepSeek / autonomous coding agents and human engineers

---

# 0. Executive Decision

The final product is one platform called **Helmies Studio**.

The `helmies-agent` project has been **abandoned**. All functionality that was previously planned to come from `helmies-agent` — the authenticated application shell, AI orchestration runtime, agent platform, conversations layer, tool system, skills system, MCP system, subagent system, memory runtime, and long-running/resumable execution foundation — must now be **built natively inside Helmies Studio**.

The current `helmies-studio` codebase is the **single foundation**. Its public landing page, existing provider integrations, generation APIs, pricing/credits logic, workflows, ProjectMemory concepts, database, Stripe-related commercial concepts, admin functions and useful media-generation code are all retained and **extended in place**.

There is no second repository to merge from. Everything is implemented within Helmies Studio.

The final URL model is:

```text
https://studio.helmies.fi/
    Existing Helmies Studio public homepage.
    The visual design must remain substantially unchanged.

https://studio.helmies.fi/pricing
    Public dynamic pricing.

https://studio.helmies.fi/login
    Shared authentication.

https://studio.helmies.fi/studio
    Final authenticated Helmies Studio application.

https://studio.helmies.fi/studio/agent
    Master Agent.

https://studio.helmies.fi/studio/image
    Image Studio.

https://studio.helmies.fi/studio/video
    Video Studio.

https://studio.helmies.fi/studio/director
    Director / multi-shot production.

https://studio.helmies.fi/studio/audio
    Audio, TTS, music and speech.

https://studio.helmies.fi/studio/lipsync
    Lip Sync.

https://studio.helmies.fi/studio/recast
    Recast / body-character replacement.

https://studio.helmies.fi/studio/influencer
    AI Influencer / Persona.

https://studio.helmies.fi/studio/workflows
    Workflow builder.

https://studio.helmies.fi/studio/brands
    Brand Kits.

https://studio.helmies.fi/studio/assets
    Asset library.

https://studio.helmies.fi/studio/projects
    Projects.

https://studio.helmies.fi/studio/admin
    Super-admin control plane.
```

---

# 1. Non-Negotiable Rules for the Coding Agent

1. Read this entire file before making architecture changes.
2. Treat this file as the product contract.
3. Do not redesign the approved public landing page.
4. Preserve its existing visual language, motion, layout, major sections and overall impression.
5. It is allowed to optimize SEO, accessibility, performance, data loading and responsiveness.
6. Replace hard-coded pricing with data from the platform database without visually redesigning pricing cards unless needed for correctness.
7. The authenticated `/studio` application must be built as a first-class authenticated shell inside Helmies Studio, not imported from an external Agent project.
8. Do not copy the old Helmies Studio public tool shell wholesale into the authenticated `/studio` area; build a proper authenticated application shell within the same codebase.
9. Reuse useful generation/backend logic from Helmies Studio.
10. Do not create a second competing Agent runtime.
11. Helmies Studio must build a single mature orchestration runtime natively (agents, subagents, tools, skills, MCP, memory, resumable jobs). Do not depend on an external Agent runtime.
12. Agent, manual Studios, Workflows and Director must all execute media through the same Model Gateway.
13. No manual Studio may call a provider directly.
14. No Agent tool may call a provider directly outside the Model Gateway.
15. No Workflow node may call a provider directly.
16. No Director shot may call a provider directly.
17. No private provider key may reach the browser.
18. No private provider key may be placed in model context.
19. No new provider secret may be stored plaintext in the commercial database.
20. Existing plaintext provider credentials must be migrated to a secret manager/reference mechanism.
21. Every billable action must have a server-side price calculation.
22. Every expensive action must show a preflight quote before execution.
23. The quote must show credits needed, current balance and expected remaining balance.
24. Multi-step Agent/Director runs must show total expected and maximum cost.
25. Credits must never be hard-coded independently in UI components.
26. Model inputs must be driven by a Model Registry and schemas.
27. Do not scatter `if model === "..."` logic through the UI.
28. Provider-specific request translation belongs in provider/model adapters.
29. Historical generation records must retain a pricing snapshot.
30. Every paid operation must be idempotent.
31. Every provider job must map to a generation job.
32. Every credit change must map to a ledger transaction.
33. Every privileged admin action must be audited.
34. Long-running generations must run through job workers, not block normal web request processes.
35. Generated provider URLs must be ingested into Helmies-controlled storage.
36. Never depend on expiring provider URLs as permanent assets.
37. Every uploaded/generated media item must become an Asset record.
38. A Canvas must be persisted as editable JSON/document state, not just a flattened screenshot.
39. Prompt engineering must live in a shared Prompt Intelligence system.
40. Brand Kit context must be reusable by Agent, Studios, Workflows and Director.
41. Do not dump entire Brand Kits into prompts when only a subset is relevant.
42. Every Director run must be persistent and resumable.
43. Individual Director shots must be independently rerunnable.
44. Rerunning one shot must not rerun unaffected shots.
45. The Admin panel must control models, providers, prices, plans, promo codes, CMS content, announcements and feature flags.
46. Changes to plans/pricing in Admin must propagate to landing/pricing/checkout without code deployment.
47. Promo creation must include margin warnings.
48. The Admin Advisor must use deterministic calculator tools for financial numbers.
49. The LLM may explain financial calculations but must not invent them.
50. No required button may remain a no-op.
51. No production path may silently fall back to mock data.
52. No production DB reset is allowed during migration.
53. Existing users, subscriptions, Stripe identifiers and credits must be preserved.
54. Use additive migrations before destructive migrations.
55. Keep rollback options and feature flags during major migration phases.
56. Build and run tests after each phase.
57. Fix failing typecheck/lint/tests before marking a phase complete.
58. Do not stop after scaffolding.
59. Do not leave core functionality as TODOs.
60. Continue through all phases unless a genuine external blocker exists.

---

# 2. Maestro: Exact Logic, Prompting & Functionality Replication

Maestro is distributed under the WanGP Non-Commercial Evaluation License.

The analyzed license explicitly allows non-commercial evaluation but prohibits using Maestro or a derivative as part of a paid hosted service unless a separate commercial license is obtained.

Therefore the implementation strategy is:

**Exact behavior replication — reverse-engineer Maestro's logic, prompting, and functionality and reproduce them identically in Helmies Studio's own original source code.**

The product goal is that Helmies Studio's Director behaves **identically** to Maestro: the same planning logic, the same prompting, the same passes, the same prompt guides, the same rerun semantics, the same continuity rules, the same dashboard concepts, and the same user-visible results.

To achieve this without copying restricted source code:

- study Maestro's behavior, prompts, schemas, and flows as the authoritative reference;
- write detailed behavioral specs of each Maestro capability (inputs, outputs, prompt templates, pass ordering, schemas, edge cases, validation rules);
- implement that behavior in **original Helmies Studio code** that produces equivalent outputs;
- verify equivalence with side-by-side comparison tests against Maestro outputs where the license permits evaluation.

Helmies Studio must replicate the following Maestro capabilities exactly (behavior, not necessarily line-for-line code):

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

---

# 3. Product Philosophy

Helmies Studio must serve both ordinary users and advanced creators without forcing either group into the wrong interface.

## 3.1 Simple user experience

A simple user should be able to say:

> Create a 15-second premium Instagram launch ad for my coffee brand.

The user should not need to know:

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

## 3.2 Advanced user 

An advanced user may want:

- exact model
- exact provider route.
- multiple references.
- per-reference roles.
- seed.
- aspect ratio.
- resolution.
- duration.
- prompt.
- negative prompt.
- masks.
- inpaint.
- outpaint.
- exact text.
- Canvas composition.
- first frame.
- last frame.
- LoRA/provider-specific controls when applicable.
- shot-level planning.
- prompt inspection.
- exact credit quote.

The advanced user uses the manual Studios.

## 3.3 Same execution system

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

This is a permanent architecture invariant.

---

# 4. Product Layers

## Layer 1 — Public Website

Existing Helmies Studio Next.js landing page.

Responsibilities:
- marketing;
- SEO;
- public pricing;
- signup/login;
- studio descriptions;
- public announcements;
- public FAQ;
- model counts.

## Layer 2 — Authenticated Studio Shell

Built natively inside Helmies Studio as a first-class authenticated application shell (sidebar, account, conversations, routing, projects, assets, notifications, credits, billing shortcuts, command palette).

Responsibilities:
- sidebar;
- account;
- conversations;
- Master Agent;
- studio routing;
- projects;
- assets;
- notifications;
- credits;
- billing shortcuts;
- command palette.

## Layer 3 — Creative Workspaces

- Master Agent.
- Image Studio.
- Video Studio.
- Director.
- Audio Studio.
- Lip Sync.
- Recast.
- Influencer.
- Workflows.
- Brand Kits.
- Projects.
- Assets.

## Layer 4 — Creative Intelligence

- Prompt Intelligence.
- Brand Context.
- Visual Intelligence.
- Canvas Compiler.
- Director Planner.
- Quality Evaluator.
- Model Selector.
- Cost Optimizer.
- Continuity Engine.

## Layer 5 — Execution Platform

- Model Registry.
- Provider Registry.
- Model Gateway.
- Pricing Engine.
- Credits.
- Job Queue.
- Storage.
- Provider adapters.
- retries.
- webhooks.
- usage accounting.

## Layer 6 — Administration

- users.
- plans.
- prices.
- promo codes.
- providers.
- model registry.
- routes.
- CMS.
- alerts.
- margin advisor.
- analytics.
- refunds.
- audit.
- feature flags.

---

# 5. Final Repository Strategy

Use `helmies-studio` as the single technical base and build all functionality (including the agent runtime, conversations, tools, skills, MCP, etc.) directly within it. The `helmies-agent` repository is abandoned and is **not** a base for this project.

Recommended final logical structure:

```text
helmies-studio/
├── apps/
│   ├── landing/
│   │   └── preserved public Helmies Studio Next.js website
│   ├── studio-web/
│   │   └── Helmies Studio authenticated UI (built natively)
│   ├── platform-api/
│   │   └── commercial platform API
│   ├── agent-api/
│   │   └── agent/conversation runtime (built natively inside Helmies Studio)
│   ├── worker/
│   │   └── media and workflow job processors
│   ├── director-service/
│   │   └── Helmies Director planning service (Maestro-exact behavior, original code)
│   └── vision-service/
│       └── structured image/reference analysis
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
├── api/
│   └── agent/conversation runtime (built natively)
├── client/
│   └── authenticated Studio client (built natively)
├── packages/
│   └── shared Studio packages
├── prisma/
├── docker/
├── infra/
├── docs/
├── scripts/
├── docker-compose.yml
└── README.md
```

Do not force a destructive filesystem reorganization in the first implementation commit.

A staged implementation may keep existing structure while new commercial services are added.

---

# 6. Production Routing

Recommended:

```text
studio.helmies.fi/
    -> landing service

studio.helmies.fi/pricing
    -> landing service

studio.helmies.fi/login
    -> shared login

studio.helmies.fi/studio/*
    -> authenticated studio-web

studio.helmies.fi/api/platform/*
    -> platform-api

studio.helmies.fi/api/agent/*
    -> agent-api

studio.helmies.fi/api/generate/*
    -> platform-api / execution gateway

studio.helmies.fi/api/director/*
    -> platform-api

studio.helmies.fi/api/vision/*
    -> platform-api
```

Internal Python services must not be exposed directly to browsers.

---

# 7. Landing Page Preservation Contract

The current public homepage is approved.

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
- replacing the homepage with an external Agent UI.
- redesigning the homepage to look like a generic chat product.
- changing its visual identity merely for consistency with `/studio`.

Create visual regression snapshots before migration.

---

# 8. Studio Navigation

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

Admin role also sees:

```text
ADMIN
    Dashboard
```

Do not expose 70+ model names in the sidebar.

Models are controls inside relevant workspaces.

---

# 9. Master Agent

The Master Agent is the primary simple-mode experience.

It is a creative production manager, not only a chatbot.

## 9.1 Capabilities

The Master Agent can:

- discuss and refine creative intent;
- inspect attached images;
- inspect project assets;
- load a Brand Kit;
- analyze visual references;
- create a structured plan;
- delegate to subagents;
- select models;
- choose cost/quality modes;
- quote costs;
- show balance impact;
- request approval;
- execute steps;
- monitor jobs;
- evaluate outputs;
- selectively retry;
- assemble deliverables;
- save assets to a project;
- create workflows from successful sequences.

## 9.2 Example

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

---

# 10. Subagents

Recommended subagents:

## Creative Director

Responsible for:
- brief interpretation;
- concept;
- narrative;
- visual direction;
- overall coherence.

## Image Director

Responsible for:
- image generation strategy;
- reference selection;
- T2I/I2I/edit route;
- image prompt structure;
- composition requirements.

## Video Director

Responsible for:
- motion;
- shot duration;
- first/last frames;
- image-to-video strategy;
- model-specific video prompting.

## Brand Guardian

Responsible for:
- brand palette;
- logo use;
- typography;
- visual style;
- tone constraints;
- brand violation detection.

## Prompt Engineer

Responsible for:
- prompt dialect;
- model guide;
- negative prompt;
- prompt compression/expansion;
- immutable constraints.

## Storyboard Agent

Responsible for:
- shot list;
- continuity;
- camera;
- pacing.

## Audio Agent

Responsible for:
- TTS;
- voice;
- music;
- sound effects;
- timing.

## Vision Analyst

Responsible for:
- scene caption;
- objects;
- regions;
- OCR;
- palette;
- lighting;
- visual style;
- reference semantics.

## Quality Control Agent

Responsible for:
- prompt alignment;
- brand alignment;
- visual/reference consistency;
- technical validity;
- targeted rerun recommendation.

## Cost Optimizer

Responsible for:
- model comparisons;
- cost/quality tradeoff;
- budget-aware alternatives.

## Assembly Agent

Responsible for:
- final sequence;
- media ordering;
- deliverables;
- export.

All subagents must use the same Gateway and wallet.

---

# 11. Helmies Studio Agent Runtime Capabilities to Build

Build the following runtime capabilities natively inside Helmies Studio:

- Agents.
- subagents.
- tools.
- tool search.
- deferred tools.
- skills.
- manual skills.
- always-apply skills.
- MCP.
- user-scoped MCP.
- OAuth-aware MCP.
- memory tools.
- summarization.
- context pruning.
- code execution.
- file authoring.
- HITL / ask-user.
- background tasks.
- resumable jobs.
- streaming.
- usage accounting.
- provider abstraction.
- reasoning-history handling.
- multi-model support.
- conversation persistence.

Do not rebuild these inside a separate old Next.js tool shell — build them directly into Helmies Studio's authenticated application.

---

# 12. Helmies First-Party Agent Tools

Create first-party tools:

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

Every tool:
- validates ownership;
- validates entitlement;
- uses normalized inputs;
- uses Model Gateway;
- returns structured results;
- never reveals provider secrets.

---

# 13. Manual Studio Layout

Desktop:

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

Mobile:
- main workspace stays central;
- settings become bottom sheet;
- inspector becomes drawer;
- prompt bar remains accessible;
- Agent becomes contextual drawer.

---

# 14. Basic vs Advanced Mode

Every Studio supports:

## Basic

Only:
- prompt;
- primary references;
- recommended model;
- aspect;
- quality;
- cost.

## Advanced

Expose:
- exact model;
- seed;
- resolution;
- references;
- masks;
- negative prompt;
- model-specific options;
- advanced prompt inspector;
- provider route if allowed;
- Canvas;
- detailed controls.

The user's preference is persisted per workspace.

---

# 15. Image Studio

Supported modes:

- Text to Image.
- Image to Image.
- Image Edit.
- Multi Reference.
- Inpaint.
- Outpaint.
- Composition Canvas.
- Product Image.
- Poster/Typography.
- Character Reference.
- Batch Variations.

Core UI:
- references left;
- Canvas/preview center;
- result/history right;
- bottom prompt/generate;
- contextual Agent.

---

# 16. Canvas — Core Differentiator

The Canvas is not a simple drawing surface.

It is a **visual instruction document**.

A user can:
- upload reference image;
- place it in a specific position;
- scale it;
- rotate it;
- add another image;
- add a logo;
- type exact text;
- scribble;
- draw an arrow;
- draw a rectangle;
- mark "remove";
- mark "keep exactly";
- paint an inpaint mask;
- paint a preservation mask;
- write "make this marble";
- create a rough visual composition.

Then the user clicks:

**Generate Professional Image**

Helmies converts the rough Canvas into model-appropriate structured inputs.

---

# 17. Canvas Technology

Recommended implementation:
- Fabric.js as the first candidate because it supports object transforms, text editing, images, selection, grouping and free drawing;
- custom raster mask layer;
- Web Worker/OffscreenCanvas for expensive preprocessing where supported;
- high-resolution server/client export path.

Perform a short technical spike comparing Fabric.js and React-Konva before committing.

Do not manually implement all selection, resize, rotate and text-editing primitives on raw Canvas unless necessary.

---

# 18. Canvas Object Types

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

Each object has:
- ID.
- z-index.
- normalized coordinates.
- transforms.
- opacity.
- visibility.
- lock state.
- semantic role.
- optional prompt note.
- source Asset ID.

---

# 19. Canvas Semantic Roles

Possible roles:

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

The semantic role is more important than the visual object type.

A normal uploaded image can mean:
- "copy this subject";
- "copy this style";
- "use this layout";
- "keep this product exactly".

The user can select a role; the Agent may recommend one.

---

# 20. Canvas Document Schema

Persist editable JSON.

Example:

```json
{
  "version": 1,
  "width": 1080,
  "height": 1350,
  "aspectRatio": "4:5",
  "background": {
    "type": "color",
    "value": "#F4F1EA"
  },
  "objects": [
    {
      "id": "product_1",
      "type": "image",
      "assetId": "asset_123",
      "role": "product_reference",
      "x": 0.50,
      "y": 0.61,
      "width": 0.34,
      "height": 0.40,
      "rotation": 0,
      "locked": false
    },
    {
      "id": "headline",
      "type": "text",
      "role": "text_content",
      "text": "SUMMER DROP",
      "fontFamily": "BrandHeading",
      "x": 0.50,
      "y": 0.18
    }
  ],
  "instructions": [
    "premium editorial lighting",
    "keep the product logo legible"
  ]
}
```

---

# 21. Canvas Compiler

The Canvas Compiler converts visual intent into:

1. flattened composition guide;
2. clean source render;
3. inpaint mask;
4. preservation mask;
5. reference assets;
6. semantic reference roles;
7. region instructions;
8. text requirements;
9. composition JSON;
10. compiled prompt;
11. negative prompt;
12. model-specific request.

---

# 22. Canvas Model Strategy

Models have different capabilities.

If model supports:
- multiple references -> send them directly.
- one image -> flatten composition guide.
- masks -> render exact mask.
- region prompting -> translate regions.
- T2I only -> convert composition into textual spatial prompt.
- text rendering -> preserve exact text field.
- no exact text -> warn user and recommend compatible model.

The user should not need to understand these differences in Basic mode.

---

# 23. Canvas History

Required:
- undo.
- redo.
- autosave.
- version snapshots.
- duplicate.
- rename.
- restore.
- before/after.
- generation lineage.

Never overwrite the source Canvas version when generating.

---

# 24. Visual Intelligence

Create internal service:
**Helmies Vision**.

This independently implements the useful behavior seen in image-to-prompt.

Input:
- one or multiple images.

Output:

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

Use cases:
- reference analysis;
- image-to-prompt;
- Brand Kit onboarding;
- Canvas interpretation;
- OCR;
- palette extraction;
- quality comparison;
- style fingerprinting.

---

# 25. Vision Provider Interface

Do not permanently tie the product to Florence-2.

```ts
interface VisionAnalyzer {
  analyzeImage(input: AnalyzeImageInput): Promise<VisualAnalysis>
  compareImages(input: CompareImagesInput): Promise<VisualComparison>
}
```

Possible implementations:
- local Florence-compatible service.
- cloud multimodal LLM.
- future specialized visual-analysis model.

Admin selects routes.

---

# 26. Prompt Intelligence Engine

Prompt quality is a platform capability.

Pipeline:

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

---

# 27. Prompt Pass 0 — Intent Normalization

Extract:
- goal;
- subject;
- action;
- environment;
- style;
- camera;
- mood;
- platform;
- aspect;
- exact text;
- immutable facts;
- references;
- negative constraints.

Produce structured JSON.

---

# 28. Prompt Pass 1 — Context Enrichment

Add relevant:
- Brand Kit;
- project;
- visual analysis;
- Canvas;
- character/persona;
- previous approved asset references.

Do not include unrelated project data.

---

# 29. Prompt Pass 2 — Creative Expansion

Add useful detail.

Never silently alter immutable facts such as:
- product name;
- exact slogan;
- exact count of people;
- logo;
- specified colors;
- supplied identity.

---

# 30. Prompt Pass 3 — Model Dialect

Use model-specific guidance.

Examples:
- descriptive prose.
- concise tag structure.
- video action-camera-environment order.
- reference-ID syntax.
- first/last-frame semantics.
- duration-specific prompt windows.

Prompt Guide Registry stores versions.

---

# 31. Prompt Pass 4 — Deterministic Validation

Validate:
- prompt length.
- unsupported parameters.
- reference count.
- required reference.
- duration.
- resolution.
- aspect.
- exact text compatibility.
- mask dimensions.
- conflicting controls.
- provider-specific constraints.

Do not use LLM alone for deterministic validation.

---

# 32. Prompt Pass 5 — Optional Premium Polish

Modes:
- Off.
- Fast.
- Balanced.
- Premium.

For expensive jobs, an additional LLM can review final prompt quality.

Admin controls model route.

---

# 33. Prompt Inspector

Advanced users can open:

```text
Raw Intent
Normalized Intent
Brand Context
Visual Context
Canvas Context
Prompt Guide
Final Prompt
Negative Prompt
Normalized Request
```

They may edit the final prompt before generation.

Store both raw and compiled versions.

---

# 34. Prompt Guide Registry

Entities:
- PromptGuide.
- PromptGuideVersion.
- PromptRoute.

Guide categories:

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

Admin:
- create.
- edit.
- diff.
- activate.
- rollback.
- benchmark.

Every generation records guide versions.

---

# 35. Brand Identity / Brand Kit

Brand Kit is reusable creative memory.

Fields:
- brand name.
- description.
- website.
- logo variants.
- logo safe area.
- forbidden logo usage.
- primary colors.
- secondary colors.
- typography.
- uploaded font files.
- type hierarchy.
- photography style.
- illustration style.
- tone of voice.
- slogans.
- product images.
- packaging.
- previous content.
- desired references.
- negative references.
- audience.
- platform preferences.

---

# 36. Brand Upload Intelligence

When a user uploads references:
- run visual analysis;
- extract palette;
- detect layout tendencies;
- inspect typography;
- extract text;
- derive visual fingerprint.

Logo:
- transparent preview.
- dimensions.
- dominant colors.
- padding.

Fonts:
- validate.
- secure storage.
- never expose globally.

---

# 37. Brand Fingerprint

Example:

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
  "avoid": [
    "neon rainbow backgrounds",
    "cartoon style"
  ]
}
```

---

# 38. Brand Enforcement Modes

- Off.
- Suggest.
- Strong.
- Locked.

Locked mode:
- preserve logo rules.
- enforce brand palette where technically possible.
- use selected fonts for Canvas/text rendering.
- require confirmation for conflicts.

---

# 39. Projects

A Project groups:
- conversations;
- assets;
- Brand Kit;
- Canvases;
- workflows;
- Director pipelines;
- generations;
- notes;
- deliverables.

Example:
`Babylon Summer Campaign`.

The Agent can scope itself to one Project.

---

# 40. Assets

Every upload/generated output becomes an Asset.

Asset contains:
- owner.
- project.
- type.
- source.
- model.
- generation.
- dimensions.
- duration.
- prompt metadata.
- cost.
- visual analysis.
- storage key.
- lineage.
- favorites.
- tags.

Actions:
- Open.
- Add to Canvas.
- Use as reference.
- Edit.
- Animate.
- Lip Sync.
- Recast.
- Analyze.
- Add to Brand Kit.
- Save to project.
- Download.
- Delete.

---

# 41. Video Studio

Modes:
- Text to Video.
- Image to Video.
- Reference to Video.
- First/Last Frame.
- Video to Video.
- Extend.
- Retake.
- Motion Transfer.
- Product Video.
- UGC.
- Cinematic.

Advanced controls are schema-driven.

---

# 42. Director

Director is a multi-step production workspace, not a single model.

Inputs:
- creative brief;
- target duration;
- platform;
- aspect;
- Brand Kit;
- characters;
- products;
- references;
- script;
- lyrics;
- audio;
- budget mode;
- quality mode.

---

# 43. ProductionPlan

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

---

# 44. ShotPlan

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

---

# 45. Director Planning Passes

## Pass A — Creative Structure

Story beats and creative concept.

## Pass B — Shot Breakdown

Convert beats into bounded shots.

## Pass C — Image/Keyframe Prompts

Plan first frames and references.

## Pass D — Video Prompts

Compile model-specific motion instructions.

## Pass E — Validation

Check:
- total duration.
- continuity.
- references.
- unsupported modes.
- missing assets.
- impossible transitions.

## Pass F — Cost Plan

Quote every generation.

---

# 46. Director Approval

Before execution:

```text
Production: 15s Product Launch
Shots: 4

Shot 1
Image: 140 credits
Video: 520 credits

Shot 2
Image: reuse Shot 1 final frame
Video: 520 credits

Shot 3
Image: 140 credits
Video: 520 credits

Shot 4
Image: 140 credits
Video: 520 credits

Expected total: 2,500 credits
Maximum reserved: 2,900 credits

Balance: 6,200
Expected remaining: 3,700
```

Actions:
- edit plan.
- choose Economy.
- choose Balanced.
- choose Premium.
- change model per shot.
- approve.

---

# 47. Director Pipeline State

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

Persist all state.

---

# 48. Director Shot Reruns

User can rerun:
- image only.
- video only.
- audio only.
- prompt polish only.

Do not rerun other shots.

After rerun:
- optionally reassemble final.

---

# 49. Director Continuity

Track:
- character identity.
- outfit.
- product identity.
- environment.
- lighting.
- time.
- screen direction.
- previous ending frame.
- next frame.
- camera language.

Continuity metadata is stored with each shot.

---

# 50. Director Dashboard

Show:
- overall progress.
- total planned credits.
- actual credits.
- planning passes.
- shots.
- image prompt.
- video prompt.
- references.
- model.
- seed.
- output.
- quality score.
- rerun controls.
- reassemble.

Basic users see simplified view.
Advanced users can inspect planning details.

---

# 51. Audio Studio

Unify:
- TTS.
- voice selection.
- voice clone where permitted.
- music.
- sound effects.
- ASR.

Price units can differ:
- characters.
- seconds.
- fixed job.

Gateway handles them.

---

# 52. Lip Sync

Common inputs:
- image or video.
- audio.
- optional prompt.
- resolution.

Model-specific controls are rendered from schema.

---

# 53. Recast

Inputs:
- source video.
- target identity/reference.
- target selector.
- optional prompt.
- mask/orientation where supported.

Add quality checks for obvious identity failure.

---

# 54. Influencer Studio

Upgrade from one-time prompt builder to persistent personas.

Persona:
- face description.
- body description.
- style.
- wardrobe.
- personality.
- reference assets.
- Brand Kit.
- content presets.

Outputs:
- consistent photos.
- social templates.
- videos through Video Studio.
- reusable references.

---

# 55. Workflows

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

Workflow nodes use Model Gateway.

The workflow must calculate maximum estimated credits before execution.

---

# 56. Model Gateway

This is the core backend abstraction.

Product code asks for capability.

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

Gateway:
- validates user.
- finds eligible models.
- applies preference.
- quotes.
- selects route.
- executes.
- accounts.

---

# 57. Model Registry

Every model record includes:

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

Required metadata:
- category.
- provider.
- speed tier.
- quality score.
- reference support.
- aspect ratios.
- resolutions.
- durations.
- text rendering.
- max references.
- provider regions.
- plan access.
- prompt guide.

---

# 58. Input Schema

Use JSON Schema or strict equivalent.

Normalized field types:

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

---

# 59. UI Schema

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

Generic renderer uses specialized components for asset/mask/aspect controls.

---

# 60. Provider Adapter

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

Adapter translates to provider-native fields.

The UI never needs provider parameter names.

---

# 61. Model Eligibility

Model is eligible only if:
- enabled.
- provider enabled.
- user plan permits.
- region permits.
- required inputs exist.
- reference count supported.
- output constraints supported.
- model health acceptable.
- user budget permits.

---

# 62. Cost Modes

User can choose:

## Best Quality
Premium model preference.

## Balanced
Default quality/cost.

## Economy
Cheapest acceptable.

## Manual
Exact model.

Agent uses the same mode.

---

# 63. Pricing Engine

Every action goes through server-side quote.

Support strategies:

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

Never use arbitrary JavaScript `eval` for pricing formulas.

---

# 64. Quote Formula

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

Store all assumptions in quote snapshot.

---

# 65. Quote Response

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

---

# 66. User Cost Confirmation

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

---

# 67. Credit Reservation

For variable jobs:
1. quote.
2. reserve maximum.
3. execute.
4. record actual provider cost.
5. calculate final credit charge.
6. settle.
7. release unused reservation.
8. refund fully on non-billable failure.

Wallet cannot become negative.

---

# 68. Generation Job State Machine

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

Parent jobs may contain child jobs.

---

# 69. Generation UX

Do not show generic spinner for minutes.

Image stages:
- Understanding.
- Preparing references.
- Generating.
- Quality check.
- Finalizing.

Video stages:
- Preparing shot.
- Submitting.
- Generating.
- Processing media.
- Quality check.
- Finalizing.

Agent:
- animate plan steps.

---

# 70. Motion During Generation

Image:
- subtle waves;
- animated mesh;
- low-cost shimmer;
- blurred preview if provider supports;
- stage labels.

Video:
- timeline pulse;
- frame strip;
- shot progress.

Respect `prefers-reduced-motion`.

Avoid excessive GPU use.

---

# 71. Agent Inside Manual Studio

A contextual Agent panel can see:
- studio.
- model.
- prompt.
- references.
- Canvas.
- Brand Kit.
- project.
- current error.

User can ask:
> Make this more cinematic.

> Use a cheaper model.

> Explain why this model cannot use these references.

> Improve the composition.

Agent proposes changes.
Destructive changes require user confirmation.

---

# 72. Project Memory vs Agent Memory

Keep separate.

Project Memory:
- explicit character.
- style.
- Brand Kit.
- asset.
- project notes.

Agent memory:
- conversational/user preferences.

Do not store both as undifferentiated JSON.

---

# 73. One Identity

The public site, Studio and Agent must use one user identity.

If immediate physical DB unification is difficult:
- use secure identity mapping/token exchange.
- maintain `platformUserId <-> agentUserId`.

Long term:
one Helmies account.

Credits always belong to platform user.

---

# 74. One Wallet

No separate:
- Agent credits.
- Studio credits.
- Workflow credits.
- Director credits.

Everything uses one wallet and ledger.

---

# 75. Asset Storage

Provider output:
1. provider returns result.
2. worker fetches safely.
3. validates.
4. stores in controlled object storage.
5. generates thumbnail/metadata.
6. creates Asset.
7. marks job complete.

Temporary provider URL is not final asset.

---

# 76. Asset Lineage

Store:

```text
parentAssetId
generationId
transformation
```

Trace:
image -> video -> lipsync -> final.

---

# 77. Quality Engine

Possible checks:
- valid file.
- expected dimensions.
- duration.
- corruption.
- prompt alignment.
- reference similarity.
- identity consistency.
- OCR text.
- brand colors.
- logo presence.

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

Do not automatically spend unlimited retries.

---

# 78. Prompt / Request Reproducibility

Every generation stores:
- raw prompt.
- normalized intent.
- compiled prompt.
- negative prompt.
- model.
- provider route.
- normalized params.
- provider params snapshot where safe.
- seed.
- references.
- Brand Kit.
- Canvas.
- Prompt Guide versions.
- quote.
- actual credits.

---

# 79. Reuse Settings

Every generation result has:
**Reuse settings**.

Open relevant Studio with exact reusable configuration.

---

# 80. Model Compatibility UI

When user changes inputs:
- incompatible models become unavailable.
- recommended compatible models move up.
- explain why.

Example:
> This model supports one reference image. You selected four.

Button:
> Choose compatible model.

---

# 81. Model Auto Selection

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

---

# 82. Model Benchmarks

Internal benchmark suite:
- prompts.
- references.
- output.
- latency.
- cost.
- human rating.

Use benchmark data to inform route quality score.

---

# 83. Prompt Benchmarks

Before activating Prompt Guide update:
- run benchmark prompts.
- compare old/new compiled prompt.
- review outputs.
- activate version.
- retain rollback.

---

# 84. Templates

Reusable templates:
- Instagram product.
- UGC ad.
- cinematic product.
- YouTube thumbnail.
- talking head.
- product hero.
- story reel.

A template stores normalized settings, not provider-specific request.

---

# 85. Responsive Studio

Desktop:
multi-pane.

Tablet:
collapsible settings.

Mobile:
- preview/canvas primary.
- settings bottom sheet.
- inspector drawer.
- fixed composer.
- model picker sheet.

Do not build desktop-only.

---

# 86. Command Palette

Retain/enhance `Ctrl/Cmd + K`.

Commands:
- Ask Agent.
- Image Studio.
- Video Studio.
- Director.
- open project.
- open Brand Kit.
- search assets.
- view credits.
- create workflow.

---

# 87. Icons

Use one consistent icon system plus custom Helmies brand icons.

Avoid mixed random icon libraries.

---

# 88. Accessibility

- keyboard.
- focus states.
- screen-reader labels.
- reduced motion.
- contrast.
- accessible dialogs.
- Canvas object list for keyboard editing.
- captions/transcripts where possible.

---


# 89. Current Helmies Studio Database — What Exists

The current Prisma/PostgreSQL schema already contains useful commercial foundations:

- User.
- Account.
- Session.
- VerificationToken.
- Subscription.
- Generation.
- CreditTransaction.
- AgentRun.
- Workflow.
- WorkflowRun.
- ProjectMemory.
- ProviderConfig.
- ModelPricing.
- FeatureFlag.
- ApiKey.
- AuditLog.
- RateLimit.
- Refund.

Do not discard this data.

Problems to solve:

1. `User.credits` is a single integer, but future reservations require available vs reserved accounting.
2. `Generation` is too generic for durable parent/child job execution.
3. `providerCost` uses Float; new financial values should use Decimal.
4. `ProviderConfig.apiKey` stores secret data in DB; migrate to secret references.
5. `ModelPricing` has one flat cost per model, insufficient for per-second/per-token/resolution/tier pricing.
6. Model capabilities and required input schemas are not normalized.
7. Current model definitions live partly in code.
8. ProjectMemory is too generic for Brand Kits, Assets, Personas and Projects.
9. There is no first-class Asset table.
10. There is no Canvas document/version model.
11. There is no Director pipeline/shot schema.
12. There is no Promo Code model.
13. There is no CMS model.
14. There is no Announcement model.
15. There is no historical pricing snapshot model.
16. There is no explicit Provider Incident / health model.
17. There is no deterministic Advisor scenario record.
18. There is no separate Quality Evaluation.
19. There is no normalized prompt-guide versioning.

---

# 90. Database Migration Strategy

Rules:

1. Back up production Postgres.
2. Back up Mongo.
3. Do not reset either DB.
4. Add new tables first.
5. Preserve old IDs.
6. Preserve Stripe customer/subscription mappings.
7. Preserve credit balances.
8. Backfill new wallet records from current `User.credits`.
9. Keep old `User.credits` temporarily as compatibility mirror.
10. Introduce new ledger/reservation API.
11. Migrate generation paths to wallet API.
12. Stop writing direct `User.credits`.
13. Validate balances.
14. Only later remove compatibility column if desired.
15. Keep `Subscription` during migration and gradually normalize plan references.
16. Migrate ProviderConfig credentials to secret references.
17. Seed Model Registry from existing hard-coded model catalogs.
18. Seed AiModelPrice from current ModelPricing.
19. Keep ModelPricing read compatibility until all routes use new pricing engine.
20. Every migration must be reversible where practical.

---

# 91. Recommended New Prisma Models

The exact syntax can be adapted to the final Prisma version.

## 91.1 AiProvider

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

`secretRef` points to a secret manager/Docker secret/environment secret identifier.

Never expose it to client.

---

## 91.2 AiModel

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

---

## 91.3 AiModelPrice

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

Example `params`:

```json
{
  "unitCost": 0.035,
  "unit": "image"
}
```

or:

```json
{
  "unit": "second",
  "tiers": {
    "720p": 0.05,
    "1080p": 0.075
  }
}
```

---

## 91.4 ModelRoute

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

Examples:
- `image.fast`.
- `image.standard`.
- `image.premium`.
- `video.fast`.
- `video.standard`.
- `video.premium`.
- `llm.orchestrator`.
- `llm.prompt`.
- `vision.analyze`.

---

## 91.5 GenerationJob

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

---

## 91.6 GenerationJobEvent

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

---

## 91.7 UsageEvent

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

---

## 91.8 CreditWallet

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

---

## 91.9 CreditLedger

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

Ledger types:
- signup.
- subscription_grant.
- topup.
- promo.
- reservation.
- reservation_release.
- generation.
- refund.
- admin_adjustment.

---

## 91.10 CreditReservation

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

---

## 91.11 PricingPlan

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

---

## 91.12 PlanPrice

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

---

## 91.13 CreditPack

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

---

## 91.14 PromoCode

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

Promo types:
- percent_discount.
- fixed_discount.
- bonus_credits.
- plan_override.

---

## 91.15 PromoRedemption

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

---

## 91.16 CmsEntry

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

---

## 91.17 CmsRevision

Immutable previous values.

---

## 91.18 SiteAnnouncement

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

---

## 91.19 Project

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

---

## 91.20 Asset

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

---

## 91.21 AssetRelation

For multiple parent relationships.

Examples:
- reference.
- derived_from.
- first_frame.
- brand_source.
- canvas_source.

---

## 91.22 BrandKit

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

---

## 91.23 BrandAsset

Fields:
- brandKitId.
- assetId.
- role.
- label.
- order.
- metadata.

Roles:
- primary_logo.
- secondary_logo.
- product.
- photography_reference.
- negative_reference.
- typography_reference.
- social_reference.
- packaging.

---

## 91.24 CanvasDocument

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

---

## 91.25 CanvasVersion

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

---

## 91.26 VisualAnalysis

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

---

## 91.27 PromptGuide

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

---

## 91.28 PromptGuideVersion

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

---

## 91.29 PromptCompilation

Store:
- job.
- user.
- guide versions.
- source.
- normalized intent.
- brand context summary.
- canvas context summary.
- final prompt.
- negative prompt.
- metadata.

This is useful for debugging and reproducibility.

---

## 91.30 DirectorPipeline

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

---

## 91.31 DirectorShot

Fields:
- pipelineId.
- index.
- status.
- ShotPlan JSON.
- imageAssetId.
- videoAssetId.
- audioAssetId.
- imageJobId.
- videoJobId.
- quality.
- prompt versions.
- timestamps.

---

## 91.32 DirectorShotVersion

Immutable shot revision.

---

## 91.33 QualityEvaluation

Fields:
- job.
- asset.
- evaluator route/model.
- technical.
- prompt alignment.
- reference consistency.
- brand consistency.
- text accuracy.
- result JSON.

---

## 91.34 ProviderIncident

Track:
- provider.
- model optional.
- start.
- end.
- status.
- error rate.
- detail.

---

## 91.35 AdminAdvisorScenario

Store:
- input assumptions.
- calculator output.
- LLM explanation.
- admin.
- timestamp.

---

# 92. One Wallet Migration

Current `User.credits` should migrate:

```text
CreditWallet.available = User.credits
CreditWallet.reserved = 0
```

Create opening ledger row:
`migration_opening_balance`.

During transition:
- wallet service writes both new wallet and compatibility `User.credits`.
- verify periodically.

Then:
- stop direct use of `User.credits`.
- use wallet service only.

---

# 93. Wallet Transaction Rules

Use DB transaction/row lock.

For reservation:

```text
available decreases logically by moving to reserved
total value is not destroyed
```

Recommended accounting model:

```text
wallet.available
wallet.reserved
```

When reserve 500:

```text
available -= 500
reserved += 500
```

When actual 430:

```text
reserved -= 500
available += 70
ledger generation debit = 430
```

Do not double-debit.

---

# 94. Pricing Plans

Admin-controlled.

Each plan has:
- name.
- public description.
- monthly/yearly prices.
- credits.
- max concurrency.
- max active jobs.
- allowed quality tiers.
- API access.
- Director access.
- Brand Kit limit.
- storage allowance.
- queue priority.
- selected premium model access.
- team seats later.

Do not hardcode plan names/credits in multiple files.

---

# 95. Landing Pricing

The current landing page uses static pricing arrays.

Replace with:

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
      "monthly": {
        "price": 49,
        "currency": "EUR",
        "credits": 1500
      },
      "yearly": {
        "displayMonthly": 39,
        "billedYearly": 468,
        "creditsPerMonth": 1500
      },
      "features": []
    }
  ]
}
```

Homepage keeps the same pricing card design.

---

# 96. Credit Packs

Admin-managed.

Fields:
- name.
- credits.
- price.
- currency.
- Stripe price.
- active.
- bonus.
- sort.

Advisor shows:
- effective price per credit.
- implied margin under typical usage.

---

# 97. Promo Codes

Admin can configure:
- code.
- percentage discount.
- fixed discount.
- bonus credits.
- eligible plans.
- eligible credit packs.
- new customers only.
- minimum spend.
- max total uses.
- max uses/user.
- start/end.
- stackable.
- active.

Before save, calculate financial risk.

---

# 98. Promo Guardrail Example

Admin enters:
- 50% off Studio.
- 3 months.
- no usage restrictions.

System calculates:

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

Display:
- green/yellow/red warning.
- exact assumptions.
- ability for super admin to proceed with reason.

---

# 99. Admin Panel V2

Main navigation:

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

---

# 100. Admin Overview

Cards:
- users.
- paid users.
- MRR.
- ARR estimate.
- today revenue.
- today provider cost.
- gross AI margin.
- credits sold.
- credits consumed.
- generations.
- success rate.
- refunds.
- active jobs.

Charts:
- revenue vs AI COGS.
- margin.
- model spend.
- tool usage.
- plan distribution.
- conversion.
- churn.
- provider failures.

---

# 101. Admin Users

Admin can:
- search.
- view profile.
- view subscription.
- view wallet.
- view usage.
- view jobs.
- view refunds.
- view promo redemptions.
- grant credits.
- remove credits with validation.
- suspend generation.
- suspend API.
- suspend account.
- force logout.
- reset role.
- initiate data export/deletion workflow.

Every sensitive action:
- reason.
- audit.

---

# 102. Admin Models

Admin can:
- create model.
- edit.
- disable.
- hide.
- mark beta.
- mark recommended.
- choose provider.
- set capability.
- edit input schema.
- edit UI schema.
- define limits.
- set plan access.
- set prompt guide.
- configure pricing.
- assign routes.
- set priority.
- set timeout.
- set retries.
- run smoke test.

Raw JSON editing can exist in advanced admin view.

Normal admin form should validate schema.

---

# 103. Admin Provider

Display:
- name.
- enabled.
- endpoint.
- region.
- secret configured/not configured.
- health.
- latency.
- success.
- 429.
- spend.

Actions:
- disable.
- maintenance.
- rotate secret reference.
- change URL.
- update limits.
- test.

Never display secret after creation.

---

# 104. Model Route Admin

Example:

```text
image.standard

1. Model A — priority 10 — healthy
2. Model B — priority 20 — healthy
3. Model C — priority 30 — degraded
```

Admin can reorder.

Conditions:
- plan.
- quality mode.
- reference support.
- max cost.
- region.

---

# 105. Prompt Guide Admin

Features:
- list.
- edit.
- version.
- compare.
- benchmark.
- activate.
- rollback.

Do not mutate production guide with no history.

---

# 106. Admin Generations

Filters:
- user.
- model.
- provider.
- capability.
- project.
- Agent/Studio/Workflow/Director source.
- status.
- date.
- credits.
- provider cost.

Display:
- job timeline.
- quote.
- actual.
- safe error.
- assets.
- retries.

Actions:
- retry where safe.
- cancel.
- refund.
- mark incident.

---

# 107. Admin Director

Show:
- active pipelines.
- failed shots.
- total spend.
- average shots.
- pipeline duration.
- repairs.
- cost.

Admin can cancel abusive/stuck jobs.

---

# 108. Admin CMS

Do not build unrestricted page builder.

Editable approved keys:

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

Code provides safe defaults.
CMS overrides.

---

# 109. CMS Workflow

1. edit.
2. preview.
3. save draft.
4. publish.
5. revision created.
6. audit.
7. rollback available.

Do not inject raw arbitrary HTML without sanitization.

---

# 110. Announcement Bar

Fields:
- message.
- style.
- link.
- CTA.
- start.
- end.
- audience.
- locale.
- dismissible.
- priority.

Visible in:
- landing.
- Studio.

Use same public API.

---

# 111. Admin Advisor

The Admin Advisor is a business control assistant.

It can answer:

> Can I run 40% off Pro for three months?

> Which models have the worst margins?

> Should I raise video credit prices?

> What is the expected cost if users use 80% of included credits?

> Which plan has the highest AI COGS ratio?

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

Never let the LLM invent cost numbers.

---

# 112. Advisor Calculator Tools

```text
advisor.calculate_plan_margin
advisor.simulate_promo
advisor.compare_model_profitability
advisor.project_usage
advisor.calculate_break_even
advisor.calculate_credit_pack_margin
advisor.detect_cost_anomaly
```

Tool output is authoritative.

---

# 113. Advisor Inputs

- plan revenue.
- average credit usage.
- p50/p90/p100 usage scenarios.
- historical model mix.
- provider costs.
- infra reserve.
- payment fees.
- refunds.
- promo.
- tax assumptions if configured.

Advisor must clearly distinguish:
- observed data.
- configured assumptions.
- model forecast.

---

# 114. Advisor Warnings

Levels:
- Info.
- Caution.
- High Risk.

Example:
> High Risk: At 100% included-credit utilization, this plan loses approximately €4.20/user/month under the current model mix.

---

# 115. Admin Roles

Recommended:
- super_admin.
- finance_admin.
- support_admin.
- ai_ops.
- content_admin.

Least privilege.

Examples:
- content admin cannot view provider secrets.
- support admin cannot change pricing.
- finance admin cannot modify prompt guides.
- ai_ops cannot issue large credit grants without permission.

---

# 116. Public Site Content API

```text
GET /api/platform/public/cms?namespace=landing&locale=en
GET /api/platform/public/announcements
GET /api/platform/public/plans
GET /api/platform/public/stats
```

Cache public responses.

---

# 117. Public Model Counts

Instead of manual copy:
- count enabled public models.
- group by category.
- expose public-safe stats.

Marketing can display:
`70+ models` based on threshold formatting.

---

# 118. Authentication Unification

Current Helmies Studio uses NextAuth/Prisma.

Build a unified auth/user store inside Helmies Studio. There is no separate agent project to merge with.

Since `helmies-agent` is abandoned, there is no second auth system to reconcile.

Implementation path:

## Stage A
- Platform user remains commercial identity.
- Build agent runtime identity within the same Helmies Studio user store.
- one session/token exchange.

## Stage B
- Studio UI receives platform commercial context from the same session.

## Stage C
- all identity fully unified in one store from the start.

Credits, plans and billing always use platform user ID.

---

# 119. IdentityLink (not required)

Since `helmies-agent` is abandoned and all identity lives in Helmies Studio, an `IdentityLink` mapping table is **not required**.

If a future integration ever introduces a separate identity system, revisit this then.

---

# 120. Agent Commercial Context

At Agent request:
- resolve user from the unified Helmies Studio session.
- fetch plan.
- fetch wallet.
- fetch feature entitlements.
- attach to Helmies tool execution context.

Do not place complete billing records in LLM prompt.

Tools receive context server-side.

---

# 121. Docker Architecture

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
  mongodb:
  postgres:
  redis:
  meilisearch:
```

Object storage can be external.

---

# 122. Gateway / Reverse Proxy

Responsibilities:
- route root to landing.
- route `/studio` to Studio client.
- API routing.
- streaming.
- WebSockets.
- headers.
- compression.
- TLS termination if appropriate.
- body size limits.
- request IDs.

---

# 123. Mongo and Postgres

Keep both initially.

Mongo:
- Helmies Studio conversations.
- agents.
- messages.
- runtime entities.
- skills/MCP data.

Postgres:
- commercial identity mapping.
- billing.
- credits.
- pricing.
- providers.
- models.
- jobs.
- assets.
- projects.
- Brand Kits.
- Canvas.
- Director.
- CMS.
- admin.

Do not rewrite mature Helmies Studio persistence unnecessarily.

---

# 124. Redis

Use:
- BullMQ or equivalent.
- distributed locks.
- rate limits.
- job events.
- provider circuit state.
- cache.
- Agent reconnect/background mechanisms where existing runtime uses Redis.

Money remains Postgres source of truth.

---

# 125. Worker Queues

Recommended:

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

Priorities:
- paid interactive.
- free interactive.
- background.
- batch.

---

# 126. Provider Execution Worker

Worker:
1. loads job.
2. validates reservation.
3. resolves provider/model.
4. compiles provider request.
5. submits.
6. stores provider request ID.
7. polls/webhook.
8. ingests output.
9. quality check.
10. usage record.
11. settlement.
12. notify.

---

# 127. Retry Policy

Classify:
- validation error -> no retry.
- auth error -> incident, no blind retry.
- 429 -> delayed retry/fallback.
- 5xx -> retry.
- timeout before provider acceptance -> retry.
- unknown acceptance -> query provider before duplicating.

Never double-generate expensive jobs accidentally.

---

# 128. Provider Fallback

Fallback allowed only if:
- capability same.
- required inputs supported.
- output semantics compatible.
- price does not exceed approved maximum.
- user plan allows.
- prompt adapter available.

Otherwise ask for new approval/choice.

---

# 129. Circuit Breaker

Track rolling:
- success.
- 429.
- 5xx.
- timeout.
- latency.

When unhealthy:
- lower route.
- open circuit.
- alert Admin.

---

# 130. Vision Service

Internal API:

```text
POST /analyze
POST /analyze-batch
POST /compare
POST /ocr
POST /palette
```

Platform API owns user authentication and asset ownership.

The internal Vision service receives controlled files/URLs only.

---

# 131. Vision Deployment

MVP can use:
- cloud multimodal route for simplicity.

Optional:
- local Florence-compatible analyzer.

Provider interface makes it replaceable.

---

# 132. Director Service

Exact Maestro behavior replication in original code.

Responsibilities (must match Maestro exactly):
- planning (same multi-pass planning logic, same pass order, same prompts).
- shot schema (identical to Maestro ShotPlan).
- continuity (identical continuity rules).
- prompt drafts (identical prompt templates and guide content).
- plan validation (identical validation rules).
- cost operation list (identical operation enumeration).

It does NOT:
- directly debit credits.
- directly call arbitrary providers.
- own user authentication.
- permanently store billing.

Platform API owns commercial state.

---

# 133. Director Execution

Director plan produces executable operations.

Example:

```json
[
  {
    "shotId": "s1",
    "operation": "image.generate",
    "routeKey": "image.premium",
    "params": {}
  },
  {
    "shotId": "s1",
    "operation": "video.image_to_video",
    "routeKey": "video.standard",
    "dependsOn": ["s1-image"]
  }
]
```

Platform quotes operations.

---

# 134. Assembly Service

Can initially be part of worker.

Responsibilities:
- join video clips.
- preserve audio.
- normalize resolution/fps.
- final encoding.
- thumbnails.

Use FFmpeg.

---

# 135. Media Storage

Logical prefixes:

```text
users/<userId>/uploads/<assetId>
users/<userId>/projects/<projectId>/<assetId>
jobs/<jobId>/temp/*
brands/<brandKitId>/<assetId>
director/<pipelineId>/<shotId>/*
```

Private by default.

---

# 136. Signed URLs

Browser uploads/downloads:
- short-lived signed URLs.
- ownership validated before signing.

Do not use permanent public bucket URLs for private user assets.

---

# 137. Upload Security

Validate:
- file size.
- content type.
- actual decodability.
- dimensions.
- video duration.
- allowed extensions.
- malicious payload.

Strip unnecessary EXIF where appropriate.

---

# 138. SSRF

Critical because system fetches:
- provider result URLs.
- remote assets.
- MCP URLs.

Implement:
- domain allowlist for providers.
- IP/private-network blocking.
- redirect revalidation.
- size limits.
- content type validation.

Reuse mature SSRF protections already present in Helmies Studio where possible.

---

# 139. Provider Secrets

Use:
- Docker secrets.
- cloud secret manager.
- Vault-style solution.

DB:
`secretRef`.

Admin:
configured/not configured.

Never:
- show actual secret.
- send secret to browser.
- log secret.

---

# 140. Observability

Structured events include:
- request ID.
- platform user ID.
- job ID.
- parent job.
- capability.
- model.
- provider.
- quote ID.
- latency.
- status.
- credits.
- provider cost.
- safe error.

---

# 141. Metrics

Track:
- requests.
- successful jobs.
- failed jobs.
- provider cost.
- retail credits.
- gross margin.
- p50/p95 latency.
- provider 429.
- queue depth.
- job age.
- Director completion.
- Canvas compilation.
- quote abandonment.

---

# 142. Cost Anomaly Detection

Alert if:
- provider cost suddenly > configured expected.
- average video cost spikes.
- retries spike.
- provider response changes.
- margin falls below threshold.

---

# 143. Provider Diagnostics

Admin screen must solve current broken-generation/LLM problems.

Tests:
- auth.
- chat completion.
- streaming.
- image generation.
- video submission.
- video status.
- TTS.
- storage ingest.
- webhook/callback.
- quote.

A model cannot be activated until validation passes.

---

# 144. Contract Tests

Each provider adapter has:
- request fixture.
- expected provider body.
- success response.
- validation error.
- transient error.
- async job response.

Detect breaking API changes.

---

# 145. Agent Streaming

Keep mature Helmies Studio streaming/reconnect approach.

Generated media appears as tool result cards.

Do not embed huge base64 data.

---

# 146. Agent Tool Result

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

# 147. Agent Creative Plan Schema

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

---

# 148. Agent Plan Execution

Use DAG.

Independent steps can run in parallel if:
- no dependency.
- user concurrency permits.
- reservation exists.
- provider limits permit.

---

# 149. Approval Policy

Explicit approval required when:
- multi-step plan.
- cost > configurable threshold.
- batch.
- destructive action.
- external publish.
- pricing/subscription action.

Single manual Generate button is explicit approval of displayed quote.

---

# 150. Retry Budget

Plan quote includes:
- expected cost.
- maximum reserved.
- retry allowance.

Quality agent cannot exceed maximum without new approval.

---

# 151. Admin Business Aggregations

Create daily aggregate tables/jobs:

```text
provider_model_daily
capability_daily
plan_daily
user_cost_daily
promo_daily
```

Avoid recalculating whole history for every dashboard request.

---

# 152. Margin Calculation

Use Decimal.

Concept:

```text
providerCost
+ variable infra reserve
= adjustedCost

adjustedCost / (1 - targetGrossMargin)
= targetRetail
```

If policy uses multiplier:
- explicitly label it.

Do not call a `2.5x markup` a `60% margin` incorrectly.

---

# 153. Payment Fees

Configurable assumptions:
- percentage.
- fixed fee.
- region.

Advisor uses them.

---

# 154. Tax

Treat tax separately.

Do not hide VAT assumptions inside AI cost.

Admin Advisor shows whether scenario is pre/post-tax.

---

# 155. Infrastructure Reserve

Configure:
- global.
- per capability.

Example concept:
- LLM lower reserve.
- video higher reserve.

Reserve covers:
- retries.
- storage.
- transcode.
- operational overhead.

---

# 156. Admin Cost Simulator

Admin inputs:
- model.
- params.
- plan.
- target margin.
- promo.
- assumed utilization.

Outputs:
- wholesale cost.
- adjusted cost.
- retail credits.
- revenue.
- expected margin.
- worst-case margin.

---

# 157. Subscription Scenario

Admin can simulate:
- 20% utilization.
- 50%.
- 80%.
- 100%.
- historical p50.
- historical p90.

Use actual model mix where available.

---

# 158. Website CMS Safety

Do not allow CMS to edit:
- JavaScript.
- arbitrary React.
- route paths.
- sensitive HTML.

Allowed:
- strings.
- safe rich text.
- URLs.
- labels.
- selected media IDs.

---

# 159. CMS Preview

Admin can preview unpublished revisions using signed preview token.

Public users only see published revision.

---

# 160. Feature Flags

Initial:

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

---

# 161. Migration from Current `handleGeneration`

Current generation handler has useful behavior:
- authentication.
- rate limiting.
- prompt expansion.
- ProjectMemory injection.
- provider fallback.
- DB pricing override.
- credit checks.
- generation record.
- media storage.
- quality gate.
- refunds.

Refactor into:

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

---

# 162. Current ProjectMemory Migration

Existing types:
- character.
- style.
- asset.
- brand.

Migrate:

```text
character -> Persona/Project entity
style -> StylePreset
asset -> Asset
brand -> BrandKit
```

Keep compatibility reads during migration.

---

# 163. Current Orchestrator Migration

The current Helmies Studio Orchestrator already demonstrates useful UX:
- conversational clarification.
- Generate Plan.
- estimated credits.
- execution steps.
- progress.

Evolve it into the final Master Agent runtime built natively inside Helmies Studio.

The final Master Agent is the only orchestrator.

---

# 164. Current `/agent` Proxy

The old Next app previously could proxy `/agent/*` to an external chat runtime.

Final:
- `/studio` is the Helmies Studio authenticated app itself (built natively).
- landing and Studio are siblings behind gateway.
- not "Studio page embedding an external Agent product."

---

# 165. Helmies Studio Branding

Replace any customer-facing references to external chat products (e.g. LibreChat, Helmies Agent) with **Helmies Studio**.

Update:
- app title.
- logo.
- icons.
- emails.
- manifest.
- metadata.
- links.
- help.
- notifications.

Keep all legally required upstream attribution/license notices.

---

# 166. Studio Theme

The authenticated app should feel:
- premium.
- organized.
- creative.
- calm.
- fast.
- approachable.
- capable.

Do not inherit all current old Studio UI.

Use the Agent UI's cleaner organization as base.

Avoid:
- provider jargon everywhere.
- giant settings forms.
- gradients everywhere.
- excessive glow.
- cramped UI.

---

# 167. UI Motion System

Central tokens:
- fast.
- normal.
- slow.
- spring.
- generation wave.
- panel slide.
- result reveal.

All motion honors reduced-motion.

---

# 168. Loading Animation Philosophy

Animation should communicate work stage.

Image:
- wave/mesh.
- prompt particles.
- preview reveal.

Video:
- timeline.
- frame movement.
- shot stage.

Agent:
- plan graph.

Do not fake exact percentage if provider does not expose it.
Show stage + indeterminate/probabilistic progress.

---

# 169. Studio History

Every Studio:
- current session.
- persistent history.
- filters.
- model.
- cost.
- status.
- rerun.
- reuse settings.
- send to another Studio.

---

# 170. Result Actions

Image:
- edit.
- Canvas.
- animate.
- download.
- Brand Kit.
- project.

Video:
- extend.
- retake.
- lipsync.
- recast.
- Director.
- download.

---

# 171. Compare Mode

Support:
- side-by-side.
- swipe.
- overlay for images.

Useful for:
- models.
- prompts.
- Brand consistency.

---

# 172. Command Palette

Global:
- switch Studio.
- open Agent.
- open project.
- create Brand Kit.
- find asset.
- view wallet.
- create workflow.

---

# 173. Search

Search:
- conversations.
- projects.
- assets.
- workflows.
- Brand Kits.

Use current Meilisearch infrastructure where appropriate.

---

# 174. API Access

Pro/API users can use normalized Helmies API.

API keys:
- hashed.
- prefix.
- scopes.
- last used.
- rate limits.

Same Gateway and wallet.

---

# 175. Rate Limiting

Rate by:
- user.
- plan.
- API key.
- capability.
- IP for auth/public.

Generation concurrency also enforced.

---

# 176. Abuse Detection

Monitor:
- free account loops.
- repeated failures.
- refund abuse.
- API bursts.
- suspicious uploads.

Admin sees signals.

---

# 177. Security Headers

At edge:
- HSTS.
- CSP.
- Permissions-Policy.
- Referrer-Policy.
- X-Content-Type-Options.
- frame policy.

Ensure media workers/canvas are compatible.

---

# 178. User Data Controls

User:
- delete asset.
- delete project.
- clear Agent memory.
- delete account.
- export data.
- revoke API key.
- logout sessions.

---

# 179. Logging Privacy

Do not log:
- provider keys.
- OAuth tokens.
- passwords.
- card details.
- private asset bytes.

Raw prompts can exist in protected generation DB, not indiscriminate logs.

---

# 180. Analytics

Track:
- Studio opened.
- Agent plan created.
- quote shown.
- quote confirmed.
- quote abandoned.
- generation completed.
- generation failed.
- Canvas used.
- Brand Kit used.
- Director completed.
- subscription.
- topup.
- promo.

Do not send raw prompt text to marketing analytics by default.

---

# 181. North Star Metric

Candidate:
**completed creative deliverables per active paid creator**.

Not just number of generations.

---

# 182. CI

PR pipeline:
- secret scan.
- install.
- lint.
- TypeScript.
- unit.
- Prisma validation.
- integration.
- Python tests.
- landing build.
- Studio build.
- APIs build.
- Docker build.
- Playwright smoke.

---

# 183. Landing Visual Regression

Capture:
- desktop homepage.
- mobile homepage.
- pricing section.
- major service sections.

Fail review if unintentional layout change exceeds tolerance.

---

# 184. Unit Tests

Required modules:
- pricing.
- margin.
- promo.
- wallet.
- reservation.
- model eligibility.
- input validation.
- adapters.
- Prompt Compiler.
- Canvas Compiler.
- Brand Compiler.
- Director validator.
- quality evaluator.

---

# 185. Integration Tests

Use mocked providers.

Test:
- quote.
- reserve.
- submit.
- provider result.
- storage.
- settlement.
- refund.
- fallback.
- idempotency.

---

# 186. E2E Tests

Critical path:

1. login.
2. Studio loads.
3. wallet visible.
4. Image Studio.
5. reference.
6. model.
7. quote.
8. generate.
9. result Asset.
10. correct wallet.
11. open Asset in Canvas.
12. Canvas regenerate.
13. Agent can access result.

---

# 187. Admin E2E

1. admin edits plan price.
2. publish.
3. landing price changes.
4. checkout uses same product price.
5. audit row exists.

---

# 188. Promo E2E

1. create promo.
2. advisor warning generated.
3. activate.
4. eligible user redeems.
5. ineligible user rejected.
6. financial effect recorded.

---

# 189. Director E2E

1. project.
2. Brand Kit.
3. create 15-second ad.
4. plan shots.
5. quote.
6. approve.
7. execute.
8. fail one shot.
9. retry one.
10. reassemble.
11. final asset.

---

# 190. Canvas E2E

1. upload product.
2. place.
3. add text.
4. add reference.
5. draw mask.
6. autosave.
7. reload.
8. document restores.
9. compile.
10. quote.
11. generate.

---

# 191. Provider Smoke Tests

Before model active:
- credential.
- request schema.
- quote.
- provider request.
- status.
- output ingest.
- quality.
- settlement.

---

# 192. Deployment Environments

- local.
- test.
- staging.
- production.

Separate:
- Postgres.
- Mongo.
- Redis.
- storage.
- Stripe mode.
- provider keys.

---

# 193. Local Docker

Include:
- Mongo.
- Postgres.
- Redis.
- Meilisearch.
- MinIO.
- Mailpit.
- APIs.
- web.

Optional profiles:
- local vision.
- local director tooling.

---

# 194. Backups

Postgres:
- daily.
- PITR if possible.

Mongo:
- regular.
- restore tested.

Storage:
- version/lifecycle according to provider.

---

# 195. Production Migration Phases

## Phase 0 — Safety

- backup Postgres.
- backup Mongo.
- export Stripe mapping.
- inventory providers.
- inventory current environment.
- create migration branch.
- run current tests/build.

Acceptance:
- backups verified.
- baseline recorded.

## Phase 1 — Repository Shell

- base on `helmies-studio` (single repo).
- add landing app.
- route `/`.
- route `/studio`.
- preserve homepage.
- visual regression.

Acceptance:
- homepage unchanged.
- authenticated Studio UI works at `/studio`.

## Phase 2 — Identity

- unified Helmies Studio auth/user store.
- shared login.
- one wallet display.

Acceptance:
- one login experience.
- commercial user resolved from Studio session.

## Phase 3 — Wallet V2

- CreditWallet.
- CreditLedger.
- CreditReservation.
- migration.
- compatibility mirror.

Acceptance:
- balances identical to old system.
- reservation tests pass.

## Phase 4 — Model Registry

- AiProvider.
- AiModel.
- AiModelPrice.
- ModelRoute.
- seed importer from current model lists.
- admin model view.

Acceptance:
- all current production models represented.

## Phase 5 — Pricing Engine

- strategies.
- quote endpoint.
- credit calculation.
- margin config.
- plan entitlements.

Acceptance:
- quote matches known current models.

## Phase 6 — Job Engine

- GenerationJob.
- queues.
- worker.
- events.
- settlement.
- idempotency.

Acceptance:
- one image provider works end-to-end.

## Phase 7 — Image Studio V2

- native Agent UI workspace.
- dynamic controls.
- reference uploads.
- history.
- Asset output.
- Prompt Engine.

Acceptance:
- production image generation reliable.

## Phase 8 — Canvas

- library spike.
- document.
- autosave.
- objects.
- mask.
- compiler.
- quote/generate.

Acceptance:
- rough composition can produce valid generation request.

## Phase 9 — Vision

- VisualAnalysis.
- service.
- caption.
- palette.
- OCR.
- regions.
- batch.

Acceptance:
- reference analysis visible and reusable.

## Phase 10 — Brand Kits

- schema.
- UI.
- logo/font/reference assets.
- fingerprint.
- prompt context.

Acceptance:
- same Brand Kit works in Image Studio and Agent.

## Phase 11 — Agent Creative Tools

- quote tool.
- image tool.
- asset tools.
- Brand tools.
- subagents.
- plan.
- approval.

Acceptance:
- Agent creates a priced image task using same Gateway as Image Studio.

## Phase 12 — Remaining Studios

- Video.
- Audio.
- TTS.
- Lip Sync.
- Recast.
- Influencer.

Acceptance:
- all current key tools migrated.

## Phase 13 — Workflows

- normalized nodes.
- preflight cost.
- durable runs.

Acceptance:
- workflow uses same jobs/wallet.

## Phase 14 — Director

- Maestro-exact planner (original code, identical behavior).
- ProductionPlan.
- ShotPlan.
- prompt passes (same passes/order/content as Maestro).
- cost.
- execution.
- rerun.
- reassembly.

Acceptance:
- multi-shot production survives refresh and targeted rerun.

## Phase 15 — Admin V2

- business dashboard.
- plans.
- pricing.
- promo.
- models.
- providers.
- CMS.
- alerts.
- advisor.

Acceptance:
- commercial configuration no longer requires code deployment.

## Phase 16 — Landing Dynamic Data

- pricing API.
- CMS.
- announcements.
- model counts.

Acceptance:
- visual homepage unchanged but business data dynamic.

## Phase 17 — Hardening

- tests.
- load.
- security.
- backup.
- monitoring.
- performance.

## Phase 18 — Legacy Removal

Only after verified parity:
- remove old Studio UI.
- retire old Orchestrator.
- retire direct provider paths.
- retire old pricing reads.
- remove compatibility writes.

---

# 196. Phase Completion Protocol for DeepSeek

For every phase:

1. inspect actual repository.
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

---

# 197. DeepSeek Must Not Stop Because the Task Is Large

The implementation agent should:
- work phase by phase.
- keep progress file.
- continue until Definition of Done.
- use smaller commits.

It must not:
- declare project complete after scaffolding.
- stop after first working Studio.
- leave Director unimplemented.
- leave Admin buttons fake.
- defer required billing logic.
- replace real provider integrations with mock APIs.

---

# 198. Source Project Mapping — Current Helmies Studio

## Public `src/app/page.js`

Keep as landing source.

Change:
- hard-coded plan arrays -> public Plan API.
- manual model counts -> public stats.
- selected editable text -> CMS.

Do not redesign.

## Current `/studio`

Do not use as final shell.

Extract logic only.

## `SimpleMode`

Use as behavior reference:
- model settings.
- upload.
- prompt.
- generation.
- result.

Replicate exactly in final shell.

## `chatModes`

Use as migration seed for:
- Model Registry.
- input schemas.
- UI schemas.

Do not keep as long-term authority.

## `lib/models`

Use as model inventory seed.

## `handleGeneration`

Refactor into shared services.

## `lib/memory`

Migrate ProjectMemory.

## AdminPanel

Use current functionality as baseline; replace UI/architecture with Admin V2.

---

# 199. Source Project Mapping — Helmies Studio (native build)

Build natively inside Helmies Studio:
- Agent runtime.
- conversations.
- tools.
- subagents.
- skills.
- MCP.
- auth/security.
- memory.
- summarization.
- context.
- background jobs.
- resumability.
- usage tracking.
- provider support.

Extend Helmies Studio with:
- commercial identity.
- wallet.
- creative tools.
- workspaces.
- assets.
- Brand Kits.
- Studio navigation.
- generation artifacts.
- admin link.

Build clean extension points rather than depending on external Agent internals.

---

# 200. Source Project Mapping — Maestro Concepts

Replicate Maestro's exact behavior in original Helmies Studio code (same logic, prompting, schemas, and results — not copied source):

```text
Maestro ProductionPlan
    -> Helmies ProductionPlan (identical schema/logic)

Maestro ShotPlan
    -> Helmies ShotPlan (identical schema/logic)

Maestro planner passes
    -> Helmies Director Planning Passes (same passes, order, and prompts)

Maestro model prompt guides
    -> Helmies Prompt Guide Registry (same guide content/logic)

Maestro saved pipeline
    -> DirectorPipeline + DirectorShot (identical persistence semantics)

Maestro rerun image
    -> shot image rerun (identical rerun semantics)

Maestro rerun video
    -> shot video rerun (identical rerun semantics)

Maestro rejoin
    -> Assembly worker (identical rejoin/reassembly logic)

Maestro dashboard
    -> Director Dashboard (identical dashboard behavior)

Maestro workspaces
    -> Projects (identical workspace semantics)

Maestro prompt polish
    -> Prompt Intelligence Engine (identical polishing logic/prompts)
```

Do not copy restricted Maestro source code. Reproduce its exact behavior in original code, verified by equivalence tests.

---

# 201. Source Project Mapping — image-to-prompt Concepts

Independently implement:

```text
scene caption
    -> VisualAnalysis.caption

background description
    -> VisualAnalysis.background

palette
    -> VisualAnalysis.palette

object boxes
    -> VisualAnalysis.regions

OCR
    -> VisualAnalysis.textRegions

editable zones
    -> Canvas regions

structured prompt
    -> StructuredVisualPrompt

multi-image queue
    -> batch analysis jobs
```

Verify source licensing before any direct code reuse.

---

# 202. Prompt Compiler Pseudocode

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

---

# 203. Quote Pseudocode

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

---

# 204. Generation Pseudocode

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

---

# 205. Settlement Pseudocode

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

---

# 206. Admin Advisor Pseudocode

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

LLM never computes hidden finance values.

---

# 207. Pricing Consistency Invariant

The following surfaces must read the same pricing plan records:

- homepage.
- pricing page.
- checkout.
- Billing page.
- Agent upgrade recommendation.
- Admin.
- promo engine.
- advisor.

There must not be separate price constants.

---

# 208. Admin Offer Workflow

1. Admin creates promo draft.
2. Calculator runs.
3. Advisor explains risk.
4. Admin previews public effect.
5. Admin activates.
6. Stripe sync occurs if required.
7. public offer API updates.
8. audit logged.
9. analytics tracks redemptions.
10. promo expires automatically.

---

# 209. Admin CMS Workflow

1. Edit field.
2. Save draft.
3. Preview landing.
4. Publish.
5. revision snapshot.
6. cache invalidated.
7. audit logged.

---

# 210. Provider Health Workflow

1. metrics detect failure spike.
2. provider status degraded.
3. route priority adjusted automatically if configured.
4. Admin alert.
5. Agent/manual users receive safe fallback.
6. no raw provider error shown.

---

# 211. Low Balance UX

If quote exceeds balance:

```text
You need 640 credits.
You have 420.

Options:
- Add credits
- Use Economy model (~310 credits)
- Reduce duration to 3 sec (~390 credits)
```

Agent can generate alternatives automatically.

---

# 212. Failure UX

Bad:
`HTTP 422 invalid image_list`

Good:
> This model supports a maximum of two reference images, but four are selected.

Actions:
- Keep the first two.
- Switch to a compatible model.

---

# 213. History and Reproducibility

Each generation detail shows:
- Studio source.
- Agent/Workflow/Director source.
- model.
- date.
- credits.
- prompt.
- references.
- project.
- reuse.

Provider wholesale price remains admin-only unless product decides otherwise.

---

# 214. Final Definition of Done

The project is complete only when all of the following are true.

## Public Website
- current landing visual design preserved.
- dynamic plans.
- dynamic CMS.
- announcements.
- correct auth links.
- public model counts.

## Auth
- one user identity experience.
- Agent runtime mapped to platform user.

## Wallet
- one wallet.
- ledger.
- reservations.
- refunds.
- no negative balance.

## Model Platform
- model registry.
- input schemas.
- UI schemas.
- provider adapters.
- price rules.
- model routes.
- health.

## Agent
- one Master Agent.
- creative subagents.
- first-party creative tools.
- cost plan.
- user approval.
- persistent jobs.
- results as Assets.

## Image Studio
- native final UI.
- T2I.
- I2I.
- references.
- edit.
- inpaint/outpaint where supported.
- Canvas.
- prompt engine.
- history.
- pricing.

## Canvas
- editable objects.
- images.
- text.
- shapes.
- free draw.
- masks.
- semantic roles.
- persistence.
- versions.
- compiler.
- quote/generation.

## Vision
- reference analysis.
- palette.
- OCR/text regions.
- objects/regions.
- structured output.

## Brand
- Brand Kits.
- logos.
- fonts.
- colors.
- references.
- fingerprint.
- enforcement modes.
- Agent/Studio/Director integration.

## Video
- manual Video Studio.
- provider model schemas.
- async jobs.
- pricing.

## Audio
- TTS.
- music.
- ASR if configured.

## Lip Sync
- working.

## Recast
- working.

## Influencer
- persistent persona capabilities.

## Workflows
- Gateway-backed.
- quoted.
- durable.

## Director
- Maestro-exact behavior replication (original code).
- ProductionPlan.
- ShotPlan.
- multi-pass prompts (same passes/order/content as Maestro).
- persistent pipeline.
- quote.
- shot reruns.
- reassembly.
- dashboard.

## Assets/Projects
- central Assets.
- Projects.
- lineage.
- search.

## Admin
- dashboard.
- users.
- plans.
- credit packs.
- promo codes.
- pricing.
- providers.
- models.
- routes.
- prompt guides.
- generations.
- jobs.
- quality.
- CMS.
- announcements.
- advisor.
- audit.
- feature flags.

## Infrastructure
- Docker.
- Mongo.
- Postgres.
- Redis.
- queues.
- storage.
- backups.
- monitoring.
- provider diagnostics.

## Quality
- CI.
- unit.
- integration.
- E2E.
- visual regression.
- no broken LLM.
- no broken primary generation.
- no dead required controls.

---

# 215. Final Mental Model

Helmies Studio is not a collection of API forms.

It is a creative operating system.

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

All of these are one product:
**Helmies Studio**.


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

These are **migration seed values**, not permanently hard-coded product decisions.

The final Admin panel controls them.

Important inconsistency to resolve explicitly:

The current auth create-user event grants `100` signup credits, while the public Free pricing card advertises `10 credits/mo`.

Treat these as two separate concepts:

```text
Free plan recurring monthly credits
Signup welcome bonus credits
```

Both must become configurable.

Recommended configuration:

```text
PricingPlan.monthlyCredits
SignupCampaign.welcomeCredits
```

Do not assume the signup bonus equals monthly Free credits.

---

# Appendix B — Normalized Capability Registry

The initial capability registry should include at least:

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

---

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
      "prompt": {
        "type": "string",
        "maxLength": 4000
      },
      "image": {
        "type": "asset",
        "accept": ["image/*"]
      },
      "durationSec": {
        "type": "integer",
        "enum": [5, 10]
      },
      "aspectRatio": {
        "type": "string",
        "enum": ["16:9", "9:16", "1:1"]
      },
      "resolution": {
        "type": "string",
        "enum": ["720p", "1080p"]
      },
      "seed": {
        "type": "integer",
        "minimum": -1
      }
    }
  },

  "uiSchema": {
    "prompt": {
      "control": "prompt-composer",
      "group": "Main"
    },
    "image": {
      "control": "asset-picker",
      "label": "First Frame",
      "group": "References"
    },
    "durationSec": {
      "control": "segmented",
      "label": "Duration",
      "suffix": "s",
      "group": "Output"
    },
    "aspectRatio": {
      "control": "aspect-picker",
      "group": "Output"
    },
    "resolution": {
      "control": "segmented",
      "group": "Output"
    },
    "seed": {
      "control": "seed",
      "advanced": true,
      "group": "Advanced"
    }
  },

  "pricingRule": {
    "strategy": "per_second_resolution",
    "params": {
      "720p": 0.05,
      "1080p": 0.075
    }
  },

  "limits": {
    "maxReferenceImages": 1
  },

  "promptGuideKey": "video/model-y"
}
```

---

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

`ProviderExecutionContext` may contain:
- secret resolved server-side.
- timeout.
- request ID.
- user internal ID for audit.
- job ID.

It must not expose secrets to product code.

---

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

---

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

For a harmless small provider price update within configured tolerance, the server may honor a recent quote.

For a material increase, generate new quote.

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

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
    {
      "type": "product_asset",
      "assetId": "asset_product"
    },
    {
      "type": "exact_text",
      "value": "SUMMER DROP"
    }
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

---

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

---

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

---

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

---

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

---

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

---

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

---

# Appendix X — Public API Matrix

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

---

# Appendix Y — Admin API Matrix

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

---

# Appendix Z — Environment Variable Contract

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

No provider secret.

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

Provider-specific credentials should be resolved by the Platform/Gateway secret layer rather than broadly copied into every service.

---

# Appendix AA — Docker Compose Skeleton

Illustrative only; adapt to existing Helmies Studio compose.

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
      - mongodb
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

  mongodb:
    image: mongo:8
    restart: unless-stopped

  redis:
    image: redis:7
    restart: unless-stopped

  meilisearch:
    image: getmeili/meilisearch
    restart: unless-stopped
```

Do not blindly replace currently working pinned DB versions without migration testing.
Use versions compatible with current production data.

---

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

Queue payload does not contain provider secret.

---

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

---

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

---

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

---

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

The browser may use it for UI.
Server remains authority.

---

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

---

# Appendix AH — Prompt Guide Storage Example

```json
{
  "key": "video/cinematic/base",
  "version": 4,
  "content": "Model-facing guide...",
  "config": {
    "maxPromptChars": 4000,
    "supportsNegativePrompt": true,
    "order": [
      "subject",
      "action",
      "environment",
      "camera",
      "lighting",
      "style"
    ]
  }
}
```

---

# Appendix AI — Model Price Examples

Examples only; actual provider pricing is admin-managed and effective-dated.

```json
{
  "strategy": "per_image",
  "params": {
    "unitCost": 0.035
  }
}
```

```json
{
  "strategy": "per_second_resolution",
  "params": {
    "rates": {
      "720p": 0.05,
      "1080p": 0.075
    }
  }
}
```

```json
{
  "strategy": "token",
  "params": {
    "inputPerMillion": 0.10,
    "outputPerMillion": 0.40
  }
}
```

---

# Appendix AJ — Model Importer

Write a one-time/importable script:

```text
scripts/import-current-model-registry.ts
```

Sources:
- current `src/lib/models`.
- current `chatModes`.
- current `ModelPricing`.
- current provider config.

Output:
- AiProvider.
- AiModel.
- AiModelPrice.
- ModelRoute seeds.

The script must be idempotent.

---

# Appendix AK — Provider Secret Migration

Current ProviderConfig has `apiKey`.

Migration:

1. read provider rows in secure migration environment.
2. create secret in secret manager.
3. store secret reference.
4. test provider.
5. null/remove plaintext key after verified migration.
6. audit.
7. ensure backups containing plaintext are protected under retention policy.

Never print key to migration logs.

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

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
| existing `api/server/controllers/agents` | mature Agent runtime |
| existing Agent MCP modules | external tool connectivity |
| existing Agent skills modules | reusable creative skills |
| current Helmies Studio `src/lib/models` | migration seed only |
| current Helmies Studio `chatModes` | migration seed only |
| current generation handler | service extraction source |
| current AdminPanel | baseline requirements, not final UI |

---

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

---

# Appendix AV — Final DeepSeek Instruction Block

Copy this intent into the coding-agent context when implementation starts:

```text
You are implementing the final Helmies Studio according to
HELMIES_STUDIO_MASTER_MERGE_IMPLEMENTATION_SPEC.md.

Read the entire file before making changes.

Do not ask product questions already answered in the specification.

Work sequentially through the migration phases.

The current public landing page is visually protected.
Do not redesign it.

The `helmies-agent` project is abandoned and is NOT used.
The `helmies-studio` codebase is the single foundation and is built out natively into the final authenticated application and Agent-runtime foundation.

The old helmies-studio public tool shell is a source of commercial database data, generation providers, pricing, workflows and useful backend logic that must be evolved in place rather than blindly rewritten.

Do not maintain or import a second Agent runtime.
Helmies Studio builds its own Master Agent runtime natively.

Agent, manual Studios, Workflows and Director must all use the same Model Gateway, Pricing Engine, wallet and job system.

Replicate Maestro's exact Director behavior (logic, prompting, schemas, results) in original Helmies Studio code. Do not copy Maestro source code verbatim unless a valid commercial license has been obtained. Equivalence must be verified by side-by-side comparison tests.

Do not expose provider secrets.

Do not hardcode models or prices in random UI components.

Do not reset production databases.

Do not stop at scaffolding.

For each phase:
- inspect
- migrate
- implement
- test
- build
- fix
- document
- continue

The project is not complete until the Definition of Done in the specification is satisfied.
```

---

# Appendix AW — Architecture Diagram

```text
                         ┌────────────────────────────┐
                         │ studio.helmies.fi         │
                         └──────────────┬─────────────┘
                                        │
                               ┌────────▼────────┐
                               │ Gateway / Edge │
                               └──────┬─────┬────┘
                                      │     │
                         /             │     │ /studio
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

MongoDB
    Helmies Studio agent runtime

PostgreSQL
    users/commercial mapping
    wallet/billing
    models/pricing
    jobs/assets/projects
    Brand Kits/Canvas
    Director/Admin/CMS

Redis
    queues/cache/locks/realtime

Object Storage
    all user/generated media
```

---

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
