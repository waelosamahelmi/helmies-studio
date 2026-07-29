# Studio Four-Direction Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single self-contained HTML reference prototype containing four complete, interactive redesigns of Helmies Studio.

**Architecture:** A static application shell stores product data and UI state in JavaScript. Four renderer functions generate structurally distinct shells around shared, category-specific page builders. Event delegation connects navigation, settings, dialogs, and a deterministic simulated generation state machine.

**Tech Stack:** Semantic HTML5, native CSS, vanilla JavaScript, embedded SVG symbol sprites.

## Global Constraints

- Create only one runtime artifact: `studio-design-concepts.html`.
- No frameworks, build step, placeholders, emoji icons, or dead controls.
- Represent all 24 specified product pages.
- Preserve current page when switching among four structurally different directions.
- Provide reduced-motion and responsive behavior.

---

### Task 1: Build application data and shared visual language

**Files:**
- Create: `studio-design-concepts.html`

**Interfaces:**
- Produces: `APP.pages`, `APP.models`, `APP.assets`, `APP.generations`, `icon(name)`, and tokenized CSS foundations.

- [ ] Add semantic document metadata, SVG symbol definitions, reset rules, typography, focus behavior, motion preferences, and responsive foundations.
- [ ] Add complete page, model, asset, generation, workflow, brand, billing, and account datasets.
- [ ] Render a functional concept switcher and global notification layer.

### Task 2: Build category-specific page content

**Files:**
- Modify: `studio-design-concepts.html`

**Interfaces:**
- Consumes: `APP` data and `icon(name)`.
- Produces: `renderWorkspace(page)`, `renderLibrary(page)`, `renderBuilder(page)`, `renderAccount(page)`, and `renderPage(page)`.

- [ ] Implement creation workspaces with prompt, references, model, settings, quote, preview, and results.
- [ ] Implement Agent and Director planning surfaces with task and shot states.
- [ ] Implement Canvas, Workflows, Brand Kits, Projects, Assets, and Generations with tailored controls and content.
- [ ] Implement Settings, Billing, and Admin views with credible account and operational data.

### Task 3: Build four independent product shells

**Files:**
- Modify: `studio-design-concepts.html`

**Interfaces:**
- Consumes: `renderPage(page)` and navigation data.
- Produces: `renderObsidian()`, `renderAtelier()`, `renderSignal()`, `renderSpatial()`, and `renderApp()`.

- [ ] Implement Obsidian Console with rail, media stage, inspector, and cinematic status line.
- [ ] Implement Editorial Atelier with masthead, index navigation, paper workspace, and art-direction tray.
- [ ] Implement Signal Grid with command strip, numbered module grid, telemetry, and sharp panel system.
- [ ] Implement Spatial Glass with ambient scene, floating dock, glass navigation, and contextual spatial inspector.

### Task 4: Add behavior and state transitions

**Files:**
- Modify: `studio-design-concepts.html`

**Interfaces:**
- Consumes: renderer interfaces and `APP.state`.
- Produces: delegated click/input/change/keydown handlers and generation state machine.

- [ ] Wire concept and page navigation while preserving state.
- [ ] Wire mode, model, ratio, quality, duration, upload, filter, drawer, dialog, and command palette controls.
- [ ] Implement generation confirmation, staged progress, completion result, cancellation, retry, and result actions.
- [ ] Add keyboard shortcuts, mobile navigation, toast feedback, and accessibility state updates.

### Task 5: Verify the artifact

**Files:**
- Verify: `studio-design-concepts.html`

**Interfaces:**
- Consumes: final artifact.
- Produces: structural and browser verification evidence.

- [ ] Run a static verification script that checks four directions, all pages, required functions, forbidden placeholder terms, and emoji ranges.
- [ ] Open the HTML in a browser and exercise all four direction switches, representative page categories, command palette, settings interactions, and generation completion.
- [ ] Inspect desktop and mobile screenshots for clipping, illegible contrast, broken layering, and inaccessible controls.
- [ ] Re-run the static verification after any visual fixes.

### Task 6: Add four advanced product architectures

**Files:**
- Modify: `studio-design-concepts.html`

**Interfaces:**
- Consumes: shared `renderPage(page)`, navigation data, animation canvas, and application state.
- Produces: `renderFilmstrip()`, `renderModular()`, `renderMonolith()`, and `renderUniverse()`.

- [ ] Add Filmstrip Studio with a media-production header, horizontal tool reel, scene markers, and timeline transport.
- [ ] Add Modular Cards with a utility shelf, grouped launcher, adaptive card frame, and visible workspace telemetry.
- [ ] Add Editorial Monolith with oversized vertical typography, typographic index, strict monochrome surfaces, and coral editorial markers.
- [ ] Add Command Universe with contextual radial navigation, search-first utility bar, ambient orbital motion, and recent-work constellation.
- [ ] Add direction-specific transitions, active-tool signals, responsive collapse rules, and reduced-motion fallbacks.
- [ ] Register all eight renderers in the direction switcher and verify every page remains reachable in each architecture.
