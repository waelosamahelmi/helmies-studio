# Helmies Studio — Integration, Quality & Branding Setup Guide

> Companion doc to [helmies-studio-financial-model.md](helmies-studio-financial-model.md) (provider economics — read that first for *why* these providers) and [helmies-studio-review.md](helmies-studio-review.md) (existing bugs referenced below).
> This document covers: how to actually wire up the new providers, how to get outputs customers will rate highly, which open-source projects are worth studying or integrating for new features, and how to make everything feel 100% "Helmies" instead of a re-skinned reseller.

---

## 1. Provider integration — step by step

### 1.1 Current architecture (what's already right)

[src/lib/providers.js](src/lib/providers.js) already has the correct shape — confirmed by direct code read this pass, not just the file's apparent intent:

- A `PROVIDERS` registry keyed by provider name (`muapi`, `atlas`, `alibaba`, `wavespeed`, `openrouter`), each with `name`, `type`, `baseUrl`, `getKey()`. **All 5 entries already exist in code today** — WaveSpeed, Atlas, and Alibaba are already *registered*, just pointed at empty API keys.
- `resolveProvider(modelId)` — the exact confirmed logic: look up `ModelPricing.findUnique({ modelId })` → if it has a `providerName`, look up `ProviderConfig.findFirst({ name: providerName, isActive: true })` in the DB → if found, merge that row's `apiKey`/`baseUrl`/`markup` on top of the matching hardcoded `PROVIDERS` entry and return it. **If anything in that chain fails or comes up empty (including any thrown error — the catch block is silent), it falls straight back to `{ name: "muapi", ...PROVIDERS.muapi }`.** This matters operationally: a model with no `ModelPricing` row, or a `ProviderConfig` row that isn't `isActive`, or any transient DB hiccup, all resolve to MuAPI with no error surfaced anywhere — migration completeness has to be verified by checking the DB rows directly, not by watching for errors.
- `submitAndPoll(providerName, endpoint, payload, maxAttempts, interval)` — builds every request as `POST {baseUrl}/api/v1/{endpoint}` with **both** `x-api-key` and `Authorization: Bearer` headers set to the same key. **This exact `/api/v1/{endpoint}` path shape is MuAPI's own convention.** WaveSpeed and Atlas Cloud both publish their own REST API docs with their own path conventions (§1.2) — confirm rather than assume they're identical before routing them through this shared helper unmodified.
- `llmComplete(messages, options)` — already correctly calls OpenRouter's `/chat/completions`.

**You are not rebuilding this — you are finishing it.** The registry pattern, and the DB-driven per-model override, are the right call; don't replace them with hardcoded per-provider logic scattered across routes. The real gap is narrower than "build multi-provider support" — it's "populate the DB rows that already drive `resolveProvider()`, and fix the two places that bypass it entirely" (§1.2 steps 6 and 8).

### 1.2 Step-by-step setup

1. **Add real keys — the placeholders already exist.** Your `.env` already has the exact variables waiting, empty, under the comment `# Additional AI Providers (optional — MuAPI is default)`: `ATLAS_KEY=""`, `ALIBABA_KEY=""`, `WAVESPEED_KEY=""`, alongside the already-populated `MUAPI_KEY` and `OPENROUTER_KEY`. Sign up with WaveSpeed and Atlas Cloud, generate keys, paste them into these exact existing variable names — `providers.js`'s `getKey()` functions already read them, no renaming needed.
2. **Fix the Atlas base URL — confirmed bug, verified directly against their docs.** [src/lib/providers.js](src/lib/providers.js) hardcodes `baseUrl: "https://api.atlas.cloud"`. Atlas Cloud's real documentation lives at `atlascloud.ai` (docs at `www.atlascloud.ai/docs`, console at `console.atlascloud.ai`) — `atlas.cloud` is not their domain at all. Get the exact API host from their "Quick Start"/"API Keys" docs pages before wiring requests.
3. **Fix the Alibaba base URL and add mandatory workspace/region routing — confirmed requirement.** The current `baseUrl: "https://dashscope.aliyuncs.com"` is missing a required piece: Alibaba's own onboarding docs confirm you must embed a **Workspace ID directly in the base URL** and pick an explicit **region** (Beijing, Singapore, Tokyo, Frankfurt, or Hong Kong). Their documented pattern for Singapore is:
   ```
   https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
   ```
   For an EU-based setup, the Frankfurt region (`eu-central-1`, by the same pattern) is worth confirming as the lowest-latency/most GDPR-comfortable option — verify the exact region code on the Model Studio console's Workspace Management page rather than assuming it matches this pattern exactly. Note the split this creates: **Qwen (LLM) traffic** through this base URL is plain OpenAI-SDK-compatible sync chat completions (trivial — same shape as OpenRouter); **Wan/HappyHorse (video) traffic** uses DashScope's own async job API, a different, non-OpenAI-compatible shape (step 10).
4. **Confirm WaveSpeed's and Atlas's actual request shape before assuming MuAPI's.** Don't assume either follows MuAPI's `/api/v1/{endpoint}` convention (§1.1) — read WaveSpeed's own docs (`wavespeed.ai/docs`: "API Authentication," "REST API," "Submit Task," "Get Result," "Synchronous Mode") and Atlas's (`www.atlascloud.ai/docs`: "Quick Start," "Predictions," "API Keys") to confirm their real path/header conventions, then adjust `submitAndPoll()` (or branch per-provider inside it) to match.
5. **Model-by-model endpoint mapping.** For every model in [src/lib/models.js](src/lib/models.js) (`IMAGE_MODELS`, `I2I_MODELS`, `VIDEO_MODELS`, `I2V_MODELS`, `V2V_MODELS`, `LIPSYNC_MODELS`, `RECAST_MODELS`, `AUDIO_MODELS`, plus cinema/marketing/influencer configs), find the equivalent endpoint slug on WaveSpeed/Atlas. WaveSpeed's own model collection pages confirm naming like `seedance-2.0/image-to-video`, `wan-2.7/image-to-video-pro`, `qwen-image-2.0/text-to-image`, `kling-v3.0-std/image-to-video` — a genuinely different slug convention per model family than MuAPI's, so this is a real mapping exercise, not a find-and-replace.
6. **Populate `ProviderConfig`/`ModelPricing` via the admin panel.** This is the step that actually stops `resolveProvider()` from silently defaulting to MuAPI (§1.1) — every model needs an `isActive` `ProviderConfig` row for its provider *and* a `ModelPricing` row whose `providerName` points at it. Skipping a model here doesn't error, it just quietly keeps using MuAPI — verify by checking the DB directly, not by watching for errors.
7. **Fix the 3 studio routes that bypass dynamic pricing** (`image`, `video`, `lipsync` — flagged in the prior audit) so they call `resolveProvider()` + `calculateCredits()` instead of reading the static MuAPI-shaped table in `credits.js`.
8. **Fix the Orchestrator/Workflow bypass too — confirmed this pass, not in the original audit.** [src/lib/agents.js](src/lib/agents.js)'s `executeImageStep`, `executeVideoStep`, and `executeAudioStep` import `generateImage`/`generateVideo`/`generateAudio` **directly from `@/lib/muapi`**, completely independent of `resolveProvider()`. Fixing only step 7 is not sufficient — every Orchestrator plan and every Workflow run keeps silently calling MuAPI through this second path until it's fixed too.
9. **Generalize `muapi.js`.** Its exported functions (`generateImage`, `generateI2I`, `generateVideo`, `generateI2V`, `processV2V`, `processLipSync`, `generateAudio`, `processRecast`, `runClipping`, `runMotionGraphics`, `generateMarketingAd`, `uploadFile`) are currently hardcoded to MuAPI's request/response shape. Two options:
   - **Option A (faster):** duplicate the file per provider (`wavespeed.js`, `atlas.js`) with the same function signatures, and have both `generation-handler.js` *and* `agents.js`'s step-executors (step 8) pick the right module based on `resolveProvider()`'s result.
   - **Option B (cleaner, more work):** collapse all of them into one provider-agnostic module where each function takes a resolved `{ provider, endpoint }` pair and builds the request generically via `submitAndPoll()`. Do this once WaveSpeed/Atlas are proven stable, not on day one.
10. **Alibaba Model Studio adapter for video only (separate, smaller effort).** Only the Wan/HappyHorse *video* side needs a dedicated adapter — Qwen/LLM traffic (step 3) is already OpenAI-compatible and needs none. Write a small `alibaba.js` adapter scoped to video model IDs, using the confirmed workspace+region base URL from step 3, and route just those model IDs to it via `resolveProvider()`. Do this *after* the primary WaveSpeed/Atlas migration is stable.
11. **Adopt webhooks — confirmed available on both target providers, not just a hope.** WaveSpeed (`wavespeed.ai/docs`: "How to Use Webhooks," "Verify Webhooks") and Atlas Cloud (`www.atlascloud.ai/docs`: "Webhooks" — "Get notified automatically when your async image and video tasks complete") both **explicitly document webhook support** (see §1.3).
12. **Use WaveSpeed's confirmed Synchronous Mode for fast models.** Their docs list a dedicated "Synchronous Mode" page and advertise "images in under 2 seconds" — for fast image models specifically, you may be able to skip the submit/poll/webhook dance entirely and just `await` a direct response, simplifying that code path considerably versus video (advertised at "under 2 minutes," where async + webhook still makes sense).

**Bonus for your own dev workflow (not customer-facing):** both WaveSpeed and Atlas Cloud publish MCP servers (`wavespeed.ai` and `www.atlascloud.ai/docs`: "MCP Server" — usable directly in Cursor, Claude Desktop, VS Code). Worth wiring into your own editor while doing this migration, purely to interactively explore and test models without writing throwaway scripts.

### 1.3 Fix the polling architecture — this is a real reliability bug, not just an optimization

`submitAndPoll()` currently allows up to **900 attempts at a 2-second interval — i.e. a single serverless function can sit polling for up to 30 minutes.** Your `package.json` dependencies show no queue/worker infrastructure (no BullMQ, Redis, Inngest, or Trigger.dev) — meaning this loop runs **inline inside the Next.js API route's own execution**, on whatever hosting platform you're on. Most serverless hosts cap function execution well below 30 minutes (commonly seconds to a couple of minutes on standard tiers). **Any generation that takes longer than your host's timeout is likely already being silently cut off in production**, wasting the credits already charged and confusing the user with no clear failure reason.

Two independent fixes, both worth doing:

1. **Adopt webhooks where the provider supports them** (MuAPI already does; check WaveSpeed/Atlas docs — most modern generation APIs offer a callback URL parameter). Instead of the Next.js function polling, the provider POSTs to a `/api/webhooks/generation-complete` route when the job finishes. This eliminates the long-held function entirely — the request that kicks off a generation returns immediately, and a separate lightweight webhook route updates the DB + notifies the client (e.g. via polling from the *client* every few seconds, which is cheap, or a websocket/SSE push).
2. **Where webhooks aren't available**, move the poll loop out of the request/response cycle: kick off the job, store its `request_id`, return immediately to the client, and use a scheduled/background function (platform cron, or a lightweight queue like Vercel's `waitUntil`, Inngest, or Trigger.dev) to check status and update the DB. The client polls *your own* fast DB-backed status endpoint, not the provider directly.

This single fix improves reliability, cuts compute cost (no more idle 30-minute functions), and makes the frontend able to show accurate real-time progress instead of a spinner that might silently time out (this also directly feeds into the UI/motion doc — see [helmies-studio-ui-motion.md](helmies-studio-ui-motion.md)).

---

## 2. Getting outputs customers will actually like

Swapping providers only matters if the *output quality* customers see goes up. A few concrete, implementable practices:

### 2.1 Prompt engineering layer (don't send raw user text to the model)

Your `OrchestratorChat` / `agents.js` already sits between the user and the generation call — use that position. Before forwarding a prompt to any image/video model:

- **Auto-expand terse prompts** via the OpenRouter LLM call you already have (`llmComplete()`): a user typing "a dog on a beach" should become a fuller, model-appropriate prompt (lighting, camera angle, style cues) unless they've opted into "raw prompt" mode. This is the single highest-leverage quality lever available and costs a fraction of a cent in LLM tokens per generation.
- **Model-specific prompt templates.** Kling, Veo, Wan, and Seedance each respond best to differently structured prompts (some want cinematography language, some want literal shot lists, some want negative prompts). Maintain a small per-model prompt template/system-prompt map rather than one generic wrapper for all models.
- **Negative-prompt and safety defaults** applied server-side (consistent quality floor + moderation) rather than trusting every user to write good negative prompts themselves.

### 2.2 Model routing & fallback chains

- For every tool, define an ordered **fallback chain** (e.g. video: WaveSpeed → Atlas → [Alibaba if Wan/HappyHorse]) so a transient provider outage or a specific model being temporarily unavailable doesn't surface as a hard failure to the user — retry once on the next provider in the chain before failing.
- Track **per-model success/failure rates** (you already have an `Audit`-style table per the prior review) and use it to automatically deprioritize a flaky model/provider combination rather than needing a human to notice first.
- **Note what already exists, and extend it rather than duplicating it:** `agents.js` already has a `FALLBACKS` map and an `executeStepWithRetry()` function that retries a failed step against a *different model* (e.g. `flux-dev` → `flux-schnell` → `sdxl-image`) — but always on the same provider (MuAPI, hardcoded). Extend this same retry mechanism to also vary the *provider* for the same model, not just swap models — the two dimensions are complementary.

### 2.3 Consistency & continuity (this is what makes a "studio" feel professional, not a toy)

- Your `ProjectMemory.js` component is exactly the right foundation for this — extend it so character/style/seed references persist and get **automatically re-injected** into follow-up generations within the same project (e.g. reusing a reference face for AI-influencer content, or a consistent visual style across a marketing campaign's assets). This is the #1 complaint users have with generic AI generation tools ("every image looks like a different universe") and the #1 thing a *studio* product should solve.
- Where a provider supports seed control or reference-image conditioning, expose it — even as an "advanced" toggle — rather than always randomizing.

### 2.4 Quality gates before charging credits

- Run a fast automated check (resolution/duration/blank-frame/corruption check, or a moderation check) on the returned asset **before** finalizing the credit charge and showing it as "complete" to the user. If a provider returns a failed/garbage asset, auto-retry once via the fallback chain instead of charging the user for a bad result — this single behavior is a meaningful trust/retention lever, and MuAPI's own "0% charge on failed tasks" policy is worth matching or beating regardless of which provider you land on.

---

## 3. Feature integrations — real, current open-source references

These were verified live on GitHub (not from memory), so names, star counts, and descriptions below are accurate as of the research date.

### 3.1 In-studio video editor / timeline assembly

Right now, Helmies Studio generates isolated assets (a video clip, an image, a lipsync take) but has no way to **assemble them into a final cut** inside the product — that's a real gap versus where competitors like Kling/Runway are heading (bundling lightweight editing on top of generation). Relevant open-source projects to study or partially adopt:

| Project | Why it's relevant |
|---|---|
| [`walterlow/freecut`](https://github.com/walterlow/freecut) | "Professional-grade video editor that runs entirely in your browser" — React + TypeScript + WebGPU + WebCodecs, multi-track editing, keyframe animations, real-time preview, zero server upload needed. Closest match to a **fully client-side, embeddable timeline editor** you could integrate directly into the Studio shell. |
| [`openvideodev/react-video-editor`](https://github.com/openvideodev/react-video-editor) | React + [Remotion](https://www.remotion.dev/)-based, explicitly a "Capcut and Canva clone." Good reference for a more visual, drag-and-drop-first editing UI. |
| [`trykimu/videoeditor`](https://github.com/trykimu/videoeditor) | "Your Creative Copilot for Video Editing" — React/TS, also Remotion-based, positions itself as AI-assisted editing rather than pure manual timeline work. Closer to Helmies' existing "AI-first" positioning than a traditional NLE clone. |
| [`timoncool/videosos`](https://github.com/timoncool/videosos) | **The closest architectural analog to Helmies Studio itself** — a Next.js app doing in-browser AI video production (text-to-video, image-to-video, lipsync) against Veo 3.1/FLUX/Gemini/Imagen4, tagged with `fal-ai`, `runware`, `remotion`. Worth reading purely for UX/flow inspiration, since it's solving almost exactly your problem on almost exactly your stack. |
| [`mifi/editly`](https://github.com/mifi/editly) | Node.js **declarative, server-side** video assembly API (concatenate clips, add transitions/titles/music via a JSON spec, no UI). Good fit for an "auto-assemble my generated clips into one final video" backend feature that doesn't require building a full timeline UI first. |
| [Remotion](https://www.remotion.dev/) | The React-based programmatic video framework underlying several of the above. Worth adopting directly as the rendering engine for both "auto-assembled workflow output" and a lightweight in-app editor — but check its current license terms (Remotion is source-available with a company-size threshold above which a paid company license is required) before committing, since Helmies is a commercial product. |

**Recommended path:** don't build a full NLE from scratch. Start with `mifi/editly`'s declarative-assembly model server-side (cheap: "stitch these Workflow outputs into one final video with transitions") as a fast win, then evaluate `freecut`'s browser-native approach or a Remotion Player-based editor if user demand for manual timeline control shows up later.

### 3.2 Leveling up the Orchestrator agent

[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) ("The agent that grows with you," Python, MIT, 217k+ stars) is a real, extremely popular, actively-maintained open-source general-purpose agent framework — not a toy repo. Its surrounding ecosystem is directly relevant to where `src/lib/agents.js`'s current `planTask()`/`executeAgentRun()` implementation could go next:

| Repo | Relevance to Helmies' Orchestrator |
|---|---|
| [`hermes-agent`](https://github.com/NousResearch/hermes-agent) | Core agent loop design — study its tool-calling loop and "grows with you" memory model as a reference architecture for evolving beyond a single-shot plan-then-execute flow. |
| [`hermes-agent-self-evolution`](https://github.com/NousResearch/hermes-agent-self-evolution) | Self-improvement of prompts/skills using DSPy + GEPA. Directly applicable idea: let the Orchestrator's own system prompts/tool-selection logic improve from a history of successful vs. failed runs (you already log runs — this is the missing feedback loop). |
| [`Hermes-Function-Calling`](https://github.com/NousResearch/Hermes-Function-Calling) | The original function-calling cookbook/dataset this ecosystem is built on — useful reference if you want to tighten up how the Orchestrator selects and calls Helmies' own internal tools (image/video/lipsync/etc.) as structured function calls rather than free-text parsing. |
| [`hermes-paperclip-adapter`](https://github.com/NousResearch/hermes-paperclip-adapter) | An adapter pattern for plugging Hermes Agent into a different host app ("run Hermes as a managed employee in a Paperclip company"). Good structural reference for how to cleanly add new specialist agents to Helmies' Orchestrator without each one being a bespoke one-off. |

You don't need to fork or depend on `hermes-agent` directly (it's a general-purpose consumer agent, not a media-generation orchestrator) — treat it as an **architecture reference** for the tool-calling loop, self-evaluation, and adapter patterns, applied to your own domain-specific orchestrator.

### 3.3 What a competitor's own agent/workflow product looks like

Worth a quick look purely as UX inspiration (not for code): MuAPI itself ships **Workflows**, **Agents**, and a **Studio** product on top of its raw generation API — i.e., a competitor is already building the same "orchestrator + workflow builder" layer Helmies has in `WorkflowBuilder.js`/`OrchestratorChat.js`. Reviewing their public playground pages for UX patterns (not implementation) is fair game; copying their branding, copy, or asset pipeline is not, and isn't necessary — Helmies' existing agent/workflow foundation is already ahead of a bolt-on in terms of depth (Project Memory, per-tool studios) if executed well.

---

## 4. Branding — making every provider invisible to the customer

This is where the "how to brand them to us" question gets concrete. The goal: a customer should never be able to tell that Helmies Studio is calling WaveSpeed, Atlas, Alibaba, or OpenRouter underneath — they should only ever see "Helmies."

### 4.1 What MuAPI itself does here (context, not a recommendation)

Worth knowing about, since it directly informs the "how do I brand this" question: MuAPI's parent company (Vadoo Internet Services Pvt Ltd) runs a consumer product called **Vadoo.tv** (10M+ users) and separately sells a **"White Label AI Studio"** — literally a rebranded clone of Vadoo.tv with your logo/colors/domain, fully managed (they run the servers, models, billing), "launch in days." It's registration-gated (no public self-serve pricing), and you'd be shipping *their* exact feature set and roadmap under your name.

**This is explicitly not the recommendation here**, for two reasons: (1) it's built on the same MuAPI/Vadoo infrastructure the user has already decided to move away from, and (2) Helmies Studio already has a more differentiated, bespoke product half-built (Orchestrator, Workflows, Project Memory, per-tool studios, admin panel) — buying a generic white-label clone would mean throwing that away for a lowest-common-denominator product you don't own the code or roadmap of. It's mentioned here only so you're aware it exists as a *contrasting* fast-launch alternative, in case it's ever useful as a comparison point — not as a direction to take.

### 4.2 The actual branding checklist for Helmies' own stack

1. **Never expose raw provider/model names in the UI — confirmed this is happening today.** [src/components/studio/ImageStudio.js](src/components/studio/ImageStudio.js)'s model picker literally renders `{m.name} — {m.provider}` as the `<option>` text for every model in its dropdown — raw provider names (whatever `models.js` stores in each model's `provider` field) are shown to customers verbatim today. Replace with either a fully custom Helmies model name (e.g. "Helmies Cinematic Engine") or a neutral quality-tier label ("Fast / Balanced / Cinematic") instead of the raw `provider` field, in every studio component that follows this same pattern.
2. **Re-host all generated media on your own storage/CDN.** Don't return provider CDN URLs (e.g. `cdn.wavespeed.ai/...`) directly to the client — proxy/copy the file to your own storage (S3-compatible, Vercel Blob, etc.) server-side first. This matters for three reasons: brand consistency (no foreign domains in image `src`/video `src` attributes visible in devtools), continuity (if you later swap providers or a provider deletes old files, your users' content doesn't disappear), and it also lets you strip/rewrite file metadata.
3. **Strip or rewrite provider metadata/EXIF and any embedded watermarks** before serving files, and apply your own subtle branded watermark/signature if you want attribution on exported content.
4. **Branded error messages everywhere.** The codebase already has a `brandError()` helper per the prior audit — extend its use to *every* generation route (including the 3 that currently bypass shared logic), so a raw provider error (e.g. a WaveSpeed rate-limit message) never leaks to the customer verbatim.
5. **Server-side-only API keys, always.** Never let a provider's key or raw endpoint be reachable from client-side code/network tab — everything routes through your own `/api/generate/*` proxy routes, which you already do; just make sure this holds for every new provider added.
6. **Consistent voice in generated-content-adjacent copy** — loading states, tooltips, model descriptions should all read as written by Helmies, not inherited verbatim from a provider's own marketing copy for a model.

---

## 5. Summary / action list

1. Add WaveSpeed + Atlas Cloud to `providers.js` (fix the confirmed Atlas base URL bug first; add the confirmed workspace/region base URL for Alibaba if pursuing that adapter).
2. Remap `models.js` endpoint slugs per new provider; populate `ProviderConfig`/`ModelPricing` via the admin panel — this is what actually stops `resolveProvider()`'s silent fallback to MuAPI.
3. Fix the 3 routes that bypass dynamic pricing (`image`, `video`, `lipsync`) **and** `agents.js`'s `executeImageStep`/`executeVideoStep`/`executeAudioStep`, which separately hardcode `@/lib/muapi` and bypass `resolveProvider()` entirely.
4. Replace/generalize `muapi.js` so each generation function works against any resolved provider.
5. Move off inline 30-minute polling toward the webhooks both WaveSpeed and Atlas confirm they support (or a background job + fast client-side status polling) — this is a correctness fix, not just a nice-to-have.
6. Add a prompt-expansion layer + per-model prompt templates before forwarding to any generation model.
7. Extend `ProjectMemory` to auto-inject character/style/seed continuity into related generations.
8. Add a fast quality gate before finalizing a charge; auto-retry failed generations via the fallback chain instead of charging for bad output.
9. Evaluate `mifi/editly` for a fast, declarative "auto-assemble final video" feature; consider `freecut`/Remotion for a full in-browser editor later.
10. Use `hermes-agent`'s ecosystem (self-evolution, function-calling, adapter pattern) as architectural inspiration for leveling up `agents.js`.
11. Run through the full branding checklist in §4.2 so no provider name, URL, or raw error ever reaches a customer.

Continue to [helmies-studio-ui-motion.md](helmies-studio-ui-motion.md) for how the studio interface itself should look and feel once the above is in place.
