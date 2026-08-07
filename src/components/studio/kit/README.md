# Studio Kit — build spec

Read this before rebuilding any tool. Everything here already exists and works.

## Principles

1. **The design system is shared; the layout is not.** Buttons, fields, chips,
   type and colour come from `system.css` so the product reads as one thing.
   The *layout* of each tool is built for that tool's craft. Do not force a
   shot board or a waveform editor into a three-pane workspace.
2. **One component tree at every width.** Never `isMobile ? <A/> : <B/>`.
   Media queries in CSS do the responsive work. Branching the tree remounts
   the tool on resize and drops in-flight generations.
3. **Never invent a number.** Cost comes from `useCreditCost`. Elapsed comes
   from the hook. No fake progress percentages, no hardcoded `"8c"`.
4. **Always render errors.** Most tools currently compute `error` and never
   show it, so failures are silent. `<Stage>` handles this if you pass `error`.
5. **All numerals are mono.** Use the `hs-mono` class or a kit component.

## Imports

```js
import {
  Shell, Workspace, Brief, ModelPicker, Stage, Rendering, Result, Idle, Fault,
  SpendMeter, CostTag, Sheet, Modal, Confirm,
  Field, Group, Segmented, Chips, RatioPicker, Toggle, Stepper, Slider,
  Dropzone, Specs, useUpload, Readout, mediaUrl, clock,
  IcImage, IcVideo, /* …see Icons.js */
} from "@/components/studio/kit";
```

## Hooks (exact contracts — verified)

```js
useModelCatalog({ modelType, capability, fallback })
  → { models, loading, error, source }
```
Model fields you can rely on: `id`, `displayName`, `name`, `provider`,
`endpoint`, `capability`, `credits`, `aspectRatios[]`, `resolutions[]`,
`durations[]`, `maxImages` (number, 0 when none), `hasDimensions`, `speedTier`.

> `aspectRatios`, `resolutions` and `durations` are **always arrays** (`[]` when
> absent). `![]` is `false`, so never filter with `!model.durations`. Filter
> capability with `matchesGroup(model, group)` from `@/lib/capability-groups`.
> Valid groups: `tti · iti · ttv · i2v · v2v · audio · lipsync`.
>
> Flags like `hasVoice`, `hasStartEndFrame`, `hasStability`, `isExtend` exist
> only on the static fallback list — the live catalog **never** emits them, so
> any UI gated on them is dead. Gate on real fields instead (`durations.length`,
> `maxImages > 0`), or show the control unconditionally.

```js
useAsyncGeneration()
  → { loading, result, error, elapsed, stage, submit, cancel, reset }

submit(tool, model, params)   // POST /api/generate/async {tool, model, ...params}
result                        // { url, creditsUsed, elapsed, ...raw }
error                         // string ("" when clean)
```

```js
useCreditCost(tool, model, params)
  → { cost, affordable, balance, remaining, shortfall, topUpPacks }
```
`tool` must be the **same string** you pass to `submit()`. A mismatch quotes one
price and charges another.

```js
apiFetch(url, init)  // from "@/lib/client-fetch"
```
**Throws** `ApiError` on any non-2xx — `res.ok` is always true at the call site,
so `if (!res.ok)` guards are dead code. Use try/catch. `err.status` is the code.

## Cross-tool systems (shared, wire once — never per tool)

Three capabilities span every studio. Each is recorded or rendered in ONE
place so a new tool inherits it for free. Do not reimplement them locally.

**Prompt history.** Recorded in `useAsyncGeneration`'s `submit` — every tool
routes through it, so nothing needs to call `recordPrompt` itself. Surfaced
by the `<History>` control inside `<Brief>`: pass `tool="<TOOL_ID>"` to Brief
and the recall button appears. Recorded at submit, not on success, because a
brief that failed is the one you most want back.

```js
<Brief tool="image" value={prompt} onChange={setPrompt} … />
```

**Result handoff.** `<Stage>` renders a *Send to* menu on every result via
`kit/SendTo.js`, so a still can be animated or lip-synced without a
download/re-upload round trip. Targets come from `mediaKind(url)` in
`@/lib/studio-handoff` — a video is never offered "Animate". Pass `prompt` to
`<Stage>` so the brief travels with the asset.

To RECEIVE a handoff, a tool reads it once with `useHandoff()` and applies
what it understands, exactly like inbound `templateConfig`:

```js
const handoff = useHandoff();
useEffect(() => {
  if (!handoff) return;
  setSourceImage({ url: handoff.url });
  if (handoff.prompt) setPrompt(handoff.prompt);
}, [handoff]);
```

The payload is cleared on read, so returning to the tool later never
re-applies a stale asset.

**Keyboard.** Global shortcuts live in `StudioClient`, and the map users read
(`?`) is generated from the same `GO_KEYS` the listener uses — see
`components/studio/ShortcutHelp.js`. Add a shortcut there, not in a tool, and
never bind an unmodified key that would swallow a keystroke while typing.

## Layout archetypes (CSS lives in `studio.css`)

| Class | Shape | Use for |
|---|---|---|
| `.st-work` | controls · stage · inspector | image, video, cinema, motion, video-edit, recast, marketing, influencer |
| `.st-board` | horizontal shot strip | director |
| `.st-cut` | player + ruler + track + clip list | clipping |
| `.st-canvas` | tool palette · surface · layer stack | canvas |
| `.st-wave` | controls + waveform + transport | audio, music, lipsync, avatar |
| `.st-lib` | filter bar + item grid | assets, brands, memory |
| `.st-talk` | message feed + context side | orchestrator |
| `.st-flow` | step chain | workflows |
| `.st-sheet` | fieldset stack | record editors |

`<Workspace controls inspector>` wraps `.st-work` and turns both side panes
into sheets below 900px. For every other archetype, write the markup directly
against the classes above — they are already responsive.

## Reference implementation

`src/components/studio/ImageStudio.js` — read it. It shows the full pattern:
capability filtering, template config, settings that follow the model,
cost wiring, error rendering, and the Brief dock.

## Primitives cheat-sheet

```jsx
<Field label="Aspect ratio" hint="…" error="…">…</Field>
<Field label="Seed">{(id) => <input id={id} className="hs-input" />}</Field>

<Segmented value={v} onChange={set} options={[{value,label}]} />
<Chips options={[...]} value={v} onChange={set} scroll />
<RatioPicker options={["16:9"]} value={v} onChange={set} />
<Stepper value={n} onChange={set} min={1} max={10} suffix="s" />
<Slider value={n} onChange={set} min={0} max={1} step={.05} label="Weight" />
<Toggle checked={b} onChange={set} label="…" hint="…" />
<Dropzone value={file} onChange={set} accept="image/*" />       // handles /api/upload
<Dropzone value={list} onChange={set} multiple max={4} />
<Specs rows={[{k:"Ratio", v:"16:9"}]} />

<ModelPicker models={list} value={id} onSelect={setId} loading={b} />
<Stage generating result error stage elapsed model settings ratio
       onCancel onRetry onNew idle={<Idle …/>} />
<Brief value onChange onSubmit onCancel cost balance affordable shortfall
       generating stage disabled placeholder submitLabel />
```

Buttons: `hs-btn`, `+ hs-btn--primary|ghost|outline|danger`, `+ hs-btn--sm|lg|icon|block`.
Surfaces: `hs-card`, `hs-panel`, `hs-notice hs-notice--fault|caution|signal`.
Text: `hs-label` (mono micro-caps), `hs-eyebrow`, `hs-hint`, `hs-dim`, `hs-mute`.
Feedback: `hs-skel`, `hs-spin`, `hs-badge`, `hs-dot`, `hs-progress`.

## Copy rules

Sentence case. Active voice. Name the action, and keep the same word through
the flow (a button that says *Generate* produces a result titled *Generated*).
Empty states say what to do next. Errors say what happened and how to fix it —
they never apologise and are never vague.
