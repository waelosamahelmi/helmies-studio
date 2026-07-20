# Helmies Studio — Interactive UI & Motion Design Guide

> Companion doc to [helmies-studio-financial-model.md](helmies-studio-financial-model.md) and [helmies-studio-integration-setup.md](helmies-studio-integration-setup.md).
> This document is about *feel*: making the Studio as interactive and alive as ChatGPT, Kling, Midjourney, and Runway, without throwing away what's already distinctive about Helmies' current design.

---

## 0. Starting point: what's already genuinely good — don't undo this

A direct read of [src/styles/globals.css](src/styles/globals.css) and [src/components/studio/RichIdle.js](src/components/studio/RichIdle.js) shows the foundation is already well above average:

- **OLED void black** (`#0A0A0F`) + **brand magenta** (`#FF1B6B`, with light/dark variants) + a purple accent (`#7C3AED`) — a confident, distinctive palette, not a generic dark-mode default.
- **Nohemi / Clash Display / Plus Jakarta Sans / JetBrains Mono** — a real premium type system, not Inter/Roboto.
- **"Double-bezel" nested card architecture** (`.bezel` class: outer hairline shell + inset highlight pseudo-element + `cubic-bezier(0.32, 0.72, 0, 1)` transitions) is *already implemented* — this is the exact "machined hardware" card technique that makes premium products (Linear, Arc, Vercel) feel expensive instead of templated.
- **Custom cursor** (crosshair for default, ring for interactive elements), branded text selection, branded scrollbar hover — small details most products skip entirely.
- **Fixed film-grain overlay** at low opacity with `mix-blend-mode: overlay` — correctly implemented as a `position: fixed` pseudo-element (not attached to scrolling content, so it doesn't tank performance).
- **`RichIdle.js`** already does more than a static empty state: a breathing icon animation, and auto-rotating tool-specific tips with a proper fade/slide transition on the same custom cubic-bezier curve used elsewhere.
- **`OrchestratorChat.js`'s empty state** already has ChatGPT-style example-prompt suggestion chips ("Image + Video," "Marketing campaign," "Website builder") that populate the input on click — another pattern this doc would otherwise recommend that's already in place.

**The gap isn't taste — it's coverage.** These patterns exist in a few places but haven't been extended to the moments that matter most in a generation studio: streaming chat, the generate-and-wait loop, the results gallery, and tool-switching. That's what this doc adds.

---

## 1. The Orchestrator chat — get it to ChatGPT-level interactivity

`OrchestratorChat.js` is the most-used surface in the product and the one users will subconsciously benchmark against ChatGPT/Claude. Concrete gaps to close:

### 1.1 Streaming, not pop-in
Responses should render token-by-token (or chunk-by-chunk) as they arrive from `llmComplete()`, not appear all at once. If the current implementation awaits a full completion before rendering, switch to a streamed response (OpenRouter supports streaming) and render incrementally with a lightweight blinking-cursor caret at the trailing edge while text is still arriving.

### 1.2 A real "thinking" state
Before the first token arrives, show a distinct state — not a generic spinner. A subtly pulsing, softly glowing orb/dot cluster (using the existing brand magenta, animating opacity/scale only — never layout properties) communicates "the Orchestrator is reasoning" and buys perceived patience. ChatGPT, Claude, and Perplexity all use a variant of this; it consistently outperforms a bare spinner in perceived responsiveness.

### 1.3 Tool calls are partially visible today — finish connecting the pieces, don't rebuild them
Direct code inspection shows this is further along than a typical first pass: `OrchestratorChat.js` already renders a **live step list** while executing (`liveSteps` — one row per step, a rotating-border spinner that swaps for the step's own icon on completion, staggered in with a 0.15s delay per row) and, separately, a **step-results list** (`stepResults` — "Step N: Generating image — Done/Failed"). The gap is that these are two disconnected, text-only lists, and the actual generated media only appears afterward, in a completely separate "results gallery" block at the very bottom of the whole conversation — so a user watching a 3-step plan run sees status text update in place, then has to scroll down and wait for *everything* to finish before seeing a single pixel of actual output.

**The fix is narrower than "add tool-call cards" — it's "collapse `liveSteps` + `stepResults` + the results gallery into one per-step card that starts as a spinner and morphs in place into that step's actual thumbnail the moment it completes,"** rather than making the user wait for the whole plan before seeing anything. This is a refactor of existing, already-reasonable building blocks (`STEP_LABELS`' icons/colors and the stagger timing are worth keeping exactly as-is), not new infrastructure.

### 1.4 Message-level micro-interactions
On hover over any message, reveal a small action toolbar (copy / regenerate / edit-and-resend) that fades/slides in — don't make these permanently visible (visual noise), and don't make them invisible until a deliberate hover (discoverability). A `group-hover` reveal with a 150–200ms fade is the right balance.

### 1.5 Command palette (Cmd/Ctrl+K)
A Linear/ChatGPT/Raycast-style command palette for jumping directly to a tool, model, or recent project — overlay with heavy backdrop-blur (only on this fixed overlay, never on scrolling content per the performance rules in §5), fuzzy search, arrow-key navigation. This is a small build for a large "this feels like a serious professional tool" signal, especially for power users running the same few tools repeatedly.

---

## 2. The generation studios — get them to Kling/Midjourney/Runway-level interactivity

This is where credits get spent, so this is where trust and delight matter most.

### 2.1 The prompt bar is the hero element
Kling and Midjourney both treat the prompt input as a persistent, dominant surface (bottom-anchored, expanding) rather than a small text field above a "Submit" button. Recommendation: a sticky, pill-shaped prompt bar (consistent with the existing rounded/bezel language) that **expands its toolbar** on focus — revealing model picker, aspect ratio, duration, reference-image wells — and collapses back to a clean single line when not focused. Reference-image chips (thumbnail + remove button) should sit inline inside the bar, not in a separate disconnected panel.

### 2.2 Rich model pickers, not `<select>` dropdowns
Confirmed directly in code: `ImageStudio.js`'s model picker is a plain HTML `<select>` whose `<option>` text is literally `{m.name} — {m.provider}` — today it's both visually generic *and* leaking raw provider names (see the branding checklist in [helmies-studio-integration-setup.md](helmies-studio-integration-setup.md) §4.2). Every studio already computes cost via `useCreditCost.js` (a debounced call to `/api/estimate`, already wired up) — surface it visually instead of leaving it wherever the current layout happens to put it. Each model option should render as a small card: thumbnail/preview, Helmies-branded name (no raw `provider` field), a speed/quality badge ("Fast" / "Cinematic"), and the credit cost inline — visible *before* generating. This mirrors how Kling and Runway present model choice and fixes both the generic-dropdown problem and the provider-leak problem in one component change.

### 2.3 Honest, staged progress — not a bare spinner
Providers generally don't expose granular percentage complete, but you can still avoid a dumb indeterminate spinner: show staged labels tied to elapsed-time heuristics per model type (e.g. "Queued → Rendering → Upscaling → Finalizing" for video, calibrated against typical durations you're already tracking). Once the webhook fix from [helmies-studio-integration-setup.md](helmies-studio-integration-setup.md) §1.3 lands, completion can push instantly instead of waiting for the next poll tick — pair that with a satisfying **completion reveal**: the result should blur-in and scale up from ~0.96 to 1.0 with a fade, never a hard pop-in.

### 2.4 Let people leave while something renders
Once generation moves off inline polling (see integration doc), users should be free to switch tools or navigate away while a job runs. Add a **non-blocking toast/notification** ("Your video is ready" + thumbnail, click to jump back) so background completion doesn't get silently missed — this single change removes the biggest reason users currently feel forced to "babysit" a spinner.

### 2.5 Before/after compare for edit-style tools
For I2I, upscale, recast, and lipsync tools, a **drag-divider before/after slider** (standard in Kling, Topaz, Photoroom) communicates the transformation far better than two separate static images. This is a well-understood, cheap-to-build pattern (a clipped absolutely-positioned overlay + a draggable handle) that reads as polish disproportionate to its build cost.

### 2.6 Hover-scrub previews in the gallery
Static poster frames for generated video make a gallery feel like a file list. On hover, scrub through the video's actual frames as the cursor moves across the thumbnail (YouTube/Netflix-style preview scrubbing) instead of just playing from the start or showing a frozen frame. Combine with lazy-loading (§5) so this doesn't mean 50 videos decoding simultaneously.

### 2.7 A masonry results grid that fills in live
Results should render into a **masonry/bento-style grid** (mixed aspect ratios, no forced uniform cropping) with skeleton shimmer placeholders that get replaced in place as generations complete — not a plain list that reflows awkwardly as items are added.

---

## 3. Cross-app continuity — make it feel like one product, not N separate tool pages

### 3.1 Shared-element transitions when switching tools
Switching between studio tools via the icon-rail sidebar currently likely triggers a full route change with a hard content swap. Use Framer Motion's `layoutId` on the icon-rail's active-state indicator and on shared structural elements (e.g. the prompt bar) so the transition between `/studio/image` and `/studio/video` **morphs** rather than cuts — this single technique is a large part of why apps like Linear and Arc feel "native" instead of "a website with pages."

### 3.2 Workflow Builder — it's a list-form editor today, not a node canvas; choose your investment level deliberately
Direct code inspection shows `WorkflowBuilder.js` is currently an **ordered-list form builder** — `addStep()`/`updateStep()`/`updateStepParam()`/`removeStep()` operating on a plain array of step objects, plus 3 hardcoded starter templates (Image → Video Pipeline, Marketing Campaign, Character → Scene) you can load in. There is no visual node/graph canvas today. Two honest paths forward, not one assumed default:
- **Cheap polish (days, not weeks):** keep the list-based model, but make steps drag-to-reorder (spring-based settle on drop, not instant snap), and draw a simple animated connecting line between consecutive step cards so the sequence *reads* as a pipeline even though it's still fundamentally a list.
- **Bigger investment (worth it only once workflows need branching/parallel steps, not just a sequence):** rebuild on an actual node-graph library (React Flow is the standard open-source reference) for real pan/zoom, animated dashed/flowing edges while a run is active, a minimap, and true non-linear branching — which the current array-of-steps data model doesn't support at all today and would need a schema change (`Workflow.steps` is currently a linear `Json` array) to represent a graph rather than a sequence.

Don't default to the second path just because it looks more impressive — take it only once non-linear workflows are actually needed; until then the first path captures most of the perceived-quality win for a fraction of the effort.

### 3.3 The credit balance should feel alive
When a generation completes and credits are deducted, animate the balance number **ticking down** rather than snapping to the new value instantly (a short, eased digit-roll, 400–600ms). This is a small, cheap detail that reads as "premium fintech polish" — the same category of micro-interaction Linear and Stripe's own dashboard use for numeric state changes.

---

## 4. Motion system — concrete parameters to standardize on

To keep everything feeling like one coherent system rather than a pile of one-off animations, standardize on:

- **Easing:** the custom cubic-bezier already in use, `cubic-bezier(0.32, 0.72, 0, 1)` (a decelerating "settle" curve) — reuse it everywhere rather than introducing more curves. Reserve a slightly springier curve (Framer Motion's `type: "spring"`, moderate stiffness/low damping) specifically for direct-manipulation feedback (button presses, drag handles), and the cubic-bezier for content entrances/transitions.
- **Button press physics:** primary actions (especially the "Generate" button — the single most-clicked element in the whole product) should scale down slightly on press (`active:scale-[0.98]`) and any nested trailing icon should shift diagonally on hover, so pressing it has tactile weight rather than a flat color-swap.
- **Entrance animations:** new content (chat messages, gallery results, tool-call cards) should resolve from a soft blurred/offset state (`opacity: 0, y: 12–16px`, optionally a light blur) into place — never appear statically. Reuse the `RichIdle.js` tip-rotation transition as the reference implementation; it's already correct.
- **Staggering:** when multiple items enter together (a batch of gallery results, a set of model picker cards), stagger their entrance by ~40–80ms per item rather than animating them all simultaneously — this reads as considerably more intentional for near-zero extra cost.

---

## 5. Performance guardrails (non-negotiable for a media-heavy app)

A generation studio has more simultaneous images/videos on screen than a typical marketing site, so these matter more here, not less:

- **Animate only `transform` and `opacity`.** Never animate `top`/`left`/`width`/`height` — especially important for the masonry grid and hover-scrub previews, both of which are already layout-expensive.
- **Scope `backdrop-blur` to fixed/sticky elements only** (command palette overlay, sticky prompt bar) — never to the scrolling gallery or chat history, or scroll performance will degrade as the list grows.
- **Virtualize long lists.** The gallery and generation-history views will grow unbounded per active user — render only what's near the viewport (a windowing library, or manual `IntersectionObserver`-gated rendering) rather than mounting every historical result at once.
- **Lazy-load and gate video decoding.** Don't let 20+ video thumbnails in a gallery all start decoding/playing at once — start playback only for the thumbnail currently hovered/in-view, and pause/unmount the rest.
- **Use `IntersectionObserver`/Framer Motion's `whileInView` for scroll-triggered reveals**, never a raw `scroll` event listener — the latter causes reflow thrashing and is especially costly on the kind of image/video-dense pages this product is full of.

---

## 6. Reference products, and what specifically to take from each

| Product | What to borrow |
|---|---|
| **ChatGPT** | Token streaming, visible tool-call cards, message-hover action toolbar, command palette |
| **Kling AI** | Bottom-anchored expanding prompt bar, rich visual model picker, generation queue as a live grid |
| **Midjourney** | Masonry gallery density, grid-based results-first browsing |
| **Runway** | Reference-driven generation UI (image/motion reference wells inline with the prompt), timeline-adjacent thinking for video tools |
| **Linear** | Command palette execution quality, number/counter micro-animations, shared-element route transitions |

None of these should be copied visually — Helmies' void-black/magenta identity is already distinctive and should stay. What's being borrowed is **interaction structure and motion timing**, not color or branding.

---

## 7. Priority order (highest impact first)

1. Streaming + visible tool-call cards in `OrchestratorChat.js` — the most-seen surface in the product.
2. Honest staged progress + non-blocking completion toast, once the webhook fix from the integration doc lands — directly fixes the current "silent spinner" experience.
3. Rich visual model picker with inline credit cost — cheap to build, directly reduces cost-surprise complaints.
4. Masonry results grid + hover-scrub thumbnails in the gallery.
5. Shared-element transitions between studio tools via the icon rail.
6. Before/after slider for edit/upscale/recast/lipsync tools.
7. Command palette (Cmd/Ctrl+K).
8. Animated credit-balance tick-down.
9. Workflow Builder node-canvas polish (animated edges, minimap, spring-based drag).
