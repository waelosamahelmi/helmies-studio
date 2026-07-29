# Studio Four-Direction Prototype Design

## Objective

Create one self-contained HTML reference prototype that redesigns the authenticated Helmies Studio experience in four fundamentally different product architectures. The artifact is a design and interaction reference, not a production replacement for the Next.js application.

## Artifact

- File: `studio-design-concepts.html`
- Runs directly in a modern browser without a server or build step.
- Contains all CSS, JavaScript, SVG icons, application data, and interaction logic.
- Uses remote photographic media with deterministic gradient fallbacks.
- Contains no placeholder copy, emoji icons, dead controls, or omitted page states.

## Directions

1. Obsidian Console: dark cinematic workspace, vertical rail, inspector, media stage, and vivid coral focus color.
2. Soft Operating System: bright calm workspace, compact icon rail, canvas-first hierarchy, floating inspector, and coral-pink focus color.
3. Signal Grid: industrial monochrome workspace, modular grid, command strip, technical telemetry, and coral-pink focus color.
4. Chromatic Broadcast Lab: dark production workspace, horizontal channel navigation, broadcast-scale composition, saturated coral fields, and kinetic media treatment.
5. Filmstrip Studio: cinematic production architecture with horizontal tool reel, scene indexing, timeline transport, and media-first hierarchy.
6. Modular Cards: organized module-based workspace with grouped launcher, adaptive tool frame, movable-card visual language, and operational telemetry.
7. Editorial Monolith: strict black-and-white art direction with oversized typography, vertical index, coral editorial markers, and page-scale transitions.
8. Command Universe: search-first spatial architecture with radial tool access, ambient orbital motion, contextual controls, and recent-work constellation.

Each direction changes layout, navigation, surface hierarchy, control placement, result treatment, and motion language. They are not color themes over one DOM layout.

## Product Coverage

The prototype exposes Agent, Image, Video, Director, Audio, Music, Lip Sync, Recast, Influencer, AI Avatar, Canvas, Cinema, Motion, Video Edit, Clipping, Marketing, Workflows, Brand Kits, Projects, Assets, Generations, Settings, Billing, and Admin.

Creation pages provide real category-specific controls. Image, video, audio, transformation, campaign, orchestration, canvas, library, project, account, billing, and administration views each receive tailored content rather than generic empty screens.

## Shared State and Interactions

- Persist selected direction and current page during the browser session.
- Switch direction while preserving the selected product page.
- Navigate through every page from each direction's native navigation.
- Edit prompts, select models, switch basic and advanced modes, adjust generation settings, select reference media, and inspect credit pricing.
- Run a simulated generation through preparing, submitting, generating, quality check, and ready stages using a continuous animated canvas synthesis field instead of a progress bar.
- Select from image-backed model cards ranked by prompt fit, expected quality, speed, provider, and credit cost.
- Expose cancel, retry, save, download, copy link, send to Canvas, and use as reference actions.
- Provide command palette, keyboard shortcuts, dismissible notices, filters, table selection, and mobile navigation.
- Honor `prefers-reduced-motion`.

## Visual and Content Rules

- Use an embedded SVG symbol library for interface icons.
- Do not use emojis.
- Do not use filler names such as Jane Doe, Acme, or lorem ipsum.
- Use credible project, model, brand, billing, and generation data aligned with Helmies Studio's actual capabilities.
- Maintain readable contrast, visible focus states, semantic buttons, labels, and ARIA states.
- Adapt at desktop, tablet, and mobile breakpoints.

## Verification

- Parse the file and confirm required semantic regions and unique IDs.
- Confirm all 24 product pages appear in the data model.
- Confirm all four direction renderers are registered and selectable.
- Confirm no emoji characters, placeholder terms, unfinished markers, or empty href attributes.
- Open the file in a browser, exercise direction switches, page navigation, settings, command palette, and the generation sequence.
