# Studio Shell UI Rebuild — Spec

Scope: the authenticated studio shell only (`src/app/studio/StudioClient.js` + shell CSS).
Tool panels (`src/components/studio/*.js`), auth, API routes, and the public landing page are out of scope.

Ground truth: 20 tools defined in `StudioClient.js` `TOOLS`. Routing stays `/studio/[tool]` → `initialTool` prop. `CommandPalette`, the pending-generations polling, and the `AnimatePresence` tool transition are preserved.

Design language: existing "Ethereal Glass" tokens only — `--color-void #0A0A0F`, `--color-brand #FF1B6B`, `--color-accent #7C3AED`, `--color-hairline`, `--studio-ease`, `--studio-dur`. No new colors. Motion is subtle and functional (feedback + state change only); `prefers-reduced-motion` is honored via `MotionConfig reducedMotion="user"` and CSS media queries.

---

## 1. Layout grid

Desktop (> 768px):

```text
┌──────────────┬────────────────────────────────────────┐
│              │  TOP BAR (56px)                        │
│   SIDEBAR    ├────────────────────────────────────────┤
│  248px /     │                                        │
│  72px icon   │           WORKSPACE                    │
│  collapsed   │        (tool panel, flex-1)            │
│              │                                        │
└──────────────┴────────────────────────────────────────┘
```

- The shell fills `calc(100dvh - 36px)` under the 36px announcement bar (existing `.studio` rule, unchanged).
- Sidebar is a fixed-width flex column; the workspace column (`.studio__content`) is `flex: 1; min-width: 0` so panels never shrink-wrap.
- No layout shift on tool switch: sidebar and top bar are static; only `.studio__body` content cross-fades (existing `AnimatePresence mode="wait"`, y ±12px, 0.5s `EASE`).

Mobile (≤ 768px):

```text
┌──────────────────────────┐
│  TOP BAR (compact, 52px) │
├──────────────────────────┤
│                          │
│        WORKSPACE         │
│                          │
├──────────────────────────┤
│  BOTTOM NAV (64px+safe)  │
└──────────────────────────┘
```

- Sidebar becomes a slide-over drawer (fixed, translateX(-100%) → 0, with `.studio__backdrop`).
- Bottom nav is `position: fixed` at the viewport bottom; `.studio__content` gets `padding-bottom: 64px + env(safe-area-inset-bottom)` so the workspace shrinks instead of being overlapped. No fixed-width overflow; tap targets ≥ 44px.

## 2. Sidebar model

Replaces the icon-rail + hover flyout. Flyouts are gone: every tool is one click away, always visible, grouped.

Structure (top → bottom):

1. **Head** — logo mark (links `/`), wordmark "Studio", collapse toggle (desktop only).
2. **Nav scroll area** — groups (below).
3. Groups are collapsible (header button with label, item count, chevron that rotates 90° when open; height animates via `grid-template-rows: 0fr/1fr` so there is no jump).

Group header is hidden in collapsed mode; groups separate with a hairline divider instead.

### Navigation IA (maps the existing 20 tools onto HELMIES_STUDIO_MASTER_UPGRADE.md §8)

| Group | Item | Tool id / href | Component (unchanged) |
|---|---|---|---|
| CREATE | Agent | `orchestrator` | `ChatStudio` |
| CREATE | Image | `image` | `ImageStudioV2` |
| CREATE | Video | `video` | `VideoStudioV2` |
| CREATE | Director | `director` | `DirectorWorkspace` |
| CREATE | Audio | `audio` | `AudioStudioV2` |
| CREATE | Music | `music` | `MusicStudio` |
| CREATE | Lip Sync | `lipsync` | `LipSyncStudioV2` |
| CREATE | Recast | `body-swap` | `RecastStudioV2` |
| CREATE | Influencer | `influencer` | `InfluencerStudioV2` |
| CREATE | AI Avatar | `avatar` | `AvatarStudio` |
| CREATE | Canvas | `canvas` | `CanvasWorkspace` |
| CREATE | Cinema | `cinema` | `CinemaStudioV2` |
| CREATE | Motion | `vibe-motion` | `MotionStudioV2` |
| CREATE | Video Edit | `video-edit` | `VideoEditStudio` |
| CREATE | Clipping | `clipping` | `ClippingStudioV2` |
| CREATE | Marketing | `marketing` | `MarketingStudioV2` |
| BUILD | Workflows | `workflows` | `WorkflowBuilder` |
| BUILD | Brand Kits | `brands` | `BrandKitsView` |
| BUILD | Projects | `memory` | `ProjectMemory` |
| BUILD | Assets | `assets` | `AssetLibrary` |
| LIBRARY | Generations | `/gallery` (link) | existing gallery page |
| ACCOUNT | Settings | `/settings` (link) | existing settings page |
| ACCOUNT | Billing | `/pricing` (link) | existing pricing page |
| ADMIN* | Dashboard | `/admin` (link) | existing admin page |

\* ADMIN renders only when `GET /api/auth/session` returns `user.role === "admin"` (same pattern as `Navbar.js`).

Deviations from §8, deliberately:
- **LIBRARY → "Generations" only.** Favorites and Templates have no destination in the codebase; shipping dead nav items would be fake completion. Generations maps to the existing `/gallery` page.
- **ACCOUNT → Settings + Billing.** Credits live in the top-bar chip (§3); there is no user-facing API-keys page separate from `/settings` (settings already covers "account, credits, and API keys"), and `/pricing` is the billing destination.
- §8's CREATE list names 8 tools; the remaining 8 existing tools are placed in CREATE by function (generation/editing surfaces) — BUILD is reserved for organizational surfaces per the spec's intent.

Tool item anatomy: color-tinted icon chip (per-tool `--tool-color`, existing colors from `TOOLS`), label, optional badge (numeric counts like `32`/`17` render neutral; `New` renders brand-tinted). Active item: brand-tinted background + 3px left indicator in the tool's color, `aria-current="page"`. Collapsed mode: icon-only, centered, native `title` tooltip.

Collapse-to-icons toggle: in the sidebar head, chevron rotates 180°. Width animates 248px → 72px (transition on `width`, no content reflow in workspace because it is flex). Choice persists in `localStorage` (`helmies.studio.sidebar`), applied on mount.

## 3. Top bar

Left: mobile menu button (≤768px only) · active tool icon chip (tool color) · tool label (weight 650) + one-line desc (dim, truncated).

Right (in order):
1. **⌘K trigger** — search icon + "Search tools" + `⌘K` kbd chip; icon-only on mobile. Opens the existing `CommandPalette` (⌘K/Ctrl+K global listener unchanged).
2. **Pending jobs** — renders only when `pendingCount > 0`: pulsing brand dot + count + "running" label; whole chip links to `/gallery`. Polling logic unchanged (`/api/generations/status?limit=50`, 10s base, 1.5× backoff to 60s, pauses on `document.hidden`).
3. **Credits chip** — bolt icon + balance from `GET /api/credits` (`{ credits }`), links `/settings`. Renders a `···` placeholder before first response so the bar never shifts; hides nothing on 401 (just stays at placeholder).

Order is stable; the jobs chip inserts between ⌘K and credits only while jobs run.

## 4. Command palette

Unchanged component and behavior. Entry points: ⌘K/Ctrl+K anywhere, top-bar button, and (mobile) the same button. Selecting a tool sets `activeTab` exactly as today.

## 5. Mobile behavior

- **Bottom nav** (always visible): Agent, Image, Video, Assets, Menu. First four jump straight to those tools (icon + 10px label, active = brand tint). Menu opens the drawer.
- **Drawer**: the full grouped sidebar (identical content to desktop, always expanded width) sliding in from the left with backdrop; closes on backdrop tap, item select, or the close button.
- The old horizontal tab strip is removed from the shell. `studio__tabs`/`studio__tab` CSS stays untouched because `MusicStudio.js` reuses those classes internally.
- ⌘K stays reachable (icon in top bar); credits stay one tap away (top-bar chip).

## 6. Motion spec

| Moment | Motion | Why |
|---|---|---|
| Tool switch | Existing cross-fade (opacity + y ±12px, 0.5s, `EASE`, `mode="wait"`) | State change |
| Drawer open/close | translateX + backdrop fade, 0.35s `EASE` | Spatial model |
| Group expand/collapse | `grid-template-rows 0fr↔1fr` + chevron rotate, 220ms | Feedback |
| Sidebar collapse | width 248↔72px, 220ms `EASE` | Feedback |
| Hover/press | background fade 140ms; `:active` `scale(0.97)` on nav items and chips | Tactile feedback |
| Pending dot | existing `pendingPulse` keyframes | Live status |

Everything else is still. Reduced motion: `MotionConfig reducedMotion="user"` + `@media (prefers-reduced-motion: reduce)` zeroes CSS transitions/keyframes in shell classes.

## 7. States

- **Loading**: credits chip shows `···` until `/api/credits` resolves; admin group simply isn't rendered until session resolves (no skeleton — group is additive).
- **Empty**: tool panels own their empty states (`studio__empty*` classes, untouched).
- **Error**: credits fetch failure leaves the placeholder, no retry loop; generations polling already backs off to 60s max. Sidebar never depends on network.
- **No tool match**: falls back to `orchestrator` (existing behavior).

## 8. Accessibility

- Sidebar is `<nav aria-label="Studio tools">`; group headers are `<button aria-expanded>`; active tool has `aria-current="page"`.
- All icon-only controls have `aria-label` (menu, close, collapse, ⌘K, credits).
- `:focus-visible` ring on every interactive shell element (2px brand outline, offset).
- Contrast: labels `--color-text` on void; dim text only for descriptions at ≤11px against `#0A0A0F` glass — AA for large/bold, and never the sole carrier of state (active also has indicator bar + background).
- Drawer traps no focus but closes on Escape via the existing palette pattern; backdrop click closes.
- Bottom nav targets ≥ 44px; `env(safe-area-inset-bottom)` respected.

## 9. What does not change

- All 20 tool ids, labels, colors, badges, components, and `/studio/[tool]` routing.
- `CommandPalette`, pending-generations polling, `initialModel` prop threading.
- Tool-panel CSS (`studio__glass`, `studio__tabs`, `studio__empty*`, etc.) — verified by grep that only `StudioClient.js` referenced the removed rail/flyout classes; old rail/flyout CSS is left dormant, not deleted, to keep the diff reviewable.
