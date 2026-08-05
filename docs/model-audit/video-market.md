# Video Market model audit (KIE `/market/*` — generic `/api/v1/jobs/createTask`)

Read-only documentation cross-check, 2026-08-05. No live API calls made. Source of the
DB snapshot: production `ModelPricing` table via read-only SQL over SSH (148 rows
matching video-family filters). Doc source: `https://docs.kie.ai/market/**` fetched by
5 parallel research passes (Kling; Bytedance+Hailuo; Wan; Grok/PixVerse/MiniMax-H3;
HappyHorse/Topaz/Infinitalk/Gemini-Omni/OmniHuman/Volcengine) — every page listed in
the task brief was fetched successfully, no 404s.

See `docs/MODEL_AUDIT.md` for the verdict legend and known bug classes 1–6. This file
adds new classes discovered in this pass:

- **#7 Model-field version-prefix/separator mismatch.** The stored `modelId`/
  `providerModelId` (crawled from the URL slug) does not always match the real
  `model` string the API expects — some families bake a version prefix, or use a
  different digit separator, that the URL slug omits.
- **#8 Generic fabricated video schema (systemic).** `CURATED_SCHEMAS`
  (`src/lib/model-catalog-core.mjs`) has **zero entries for any video/i2v/v2v/r2v/
  lipsync model** — only Suno music and ElevenLabs TTS are curated. Every single
  video-market row in the DB therefore gets `defaultSchemaForCapability`'s generic
  `{duration: enum[5,8,10], resolution: enum["480p","720p","1080p"], aspect_ratio:
  enum["16:9","9:16","1:1"]}` (plus `prompt`/`image_url`/`video_url` as applicable),
  regardless of what the real per-model doc says. This is wrong for nearly every
  model in this audit: wrong field name (`ratio` not `aspect_ratio` on
  `wan/2-7-text-to-video`; `quality` not `resolution` on all PixVerse endpoints),
  wrong enum casing (`768P`/`2K` on MiniMax-H3, not `480p`/`720p`/`1080p`), wrong
  required/optional flags, and missing fields entirely (`sound`, `negative_prompt`,
  `cfg_scale`, `camera_fixed`, `multi_shots`, `template_id`, `character_orientation`,
  etc. — none of these exist anywhere in the generic schema). Several models (Kling
  avatar pair, `hailuo/02-*-pro`) expose **no** duration/resolution/aspect_ratio at
  all, yet the generic schema still renders those controls in the studio UI.
- **#9 Capability-inference substring collision.** `inferCapability` (same file)
  checks patterns in a fixed order; a slug containing two different markers is
  filed under whichever ordered check comes first, not the more specific one. Found
  live: `volcengine/video-to-video-lip-sync` contains the substring `video-to-video`,
  which `VIDEO_TO_VIDEO_MARKERS` matches *before* the code ever reaches the
  `lip-sync|avatar|omnihuman|infinitalk|from-audio` check further down — so a
  lip-sync model is capability-filed as plain `video-to-video` and lands in the V2V
  studio, not the lipsync studio.
- **#10 "gemini" substring swallows Gemini-Omni into the LLM-chat filter.**
  `kie-sync.js`'s own `inferModelType(path)` has `if (p.includes("gemini")) return
  "llm";` for chat-model detection, and `fetchKieModels` unconditionally
  `continue`s past any model typed `"llm"`. `gemini-omni-video`/`-audio`/
  `-character` are real video/voice/character generation model pages (confirmed:
  none 404'd, all documented against the real `createTask` endpoint), but their
  slugs contain "gemini", so every sync run silently drops them — not a capability
  bug, an outright exclusion from the crawl. `MEDIA_EXCEPTIONS` in
  `model-catalog-core.mjs` names exactly these three ids, but it only guards the
  *separate* `LLM_SEGMENTS.has(family)` exact-match check inside
  `inferKieModelFromUrl` (which never actually fires for them — "gemini-omni-video"
  is not `=== "gemini"`) — it does nothing about `kie-sync.js`'s own independent
  `inferModelType`, which is where the real drop happens. The exceptions list is a
  fix for a bug that isn't the one actually excluding these models.

---

## Summary counts

- ✅ exists-correct: 3
- ❌ missing (no active row, or active row the API rejects by real slug/id): 11
- ⚠️ exists-wrong-logic (reachable but wrong params/capability/pricing): 61
- Vendors fully absent from the catalog: **MiniMax-H3** (3/3 models, 0 DB rows of
  any kind), **Gemini-Omni** (3/3 models — root cause #10 above)

---

## Kling (`/market/kling/*`) — 15 doc pages, 15 DB rows (all present structurally)

### KIE/kling/text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ❌
**DB row:** modelId=`kling/text-to-video` exists=yes isActive=true modelType=video capability=text-to-video providerName=KIE
**Doc says:** real `model` field is **`kling-2.6/text-to-video`** — version-prefixed, not `kling/text-to-video`. Params: `prompt`(req), `sound`(req, bool), `aspect_ratio`(req, enum `1:1`/`16:9`/`9:16`), `duration`(req, enum `5`/`10`), `callBackUrl`(opt). Pricing unit not shown on page.
**We store:** modelId `kling/text-to-video` sent as `model`; generic schema (`duration`[5,8,10], `resolution`[480p/720p/1080p], `aspect_ratio`[16:9/9:16/1:1]) — missing `sound` entirely, wrong duration enum, has a fabricated `resolution` field this model doesn't take.
**Root cause class:** #1 (docs-sitemap slug) + #7 (version-prefix) + #8 (fabricated schema). Matches the live 422 already confirmed this session.
**Fix needed:** change `modelId`/`providerModelId`/`endpoint` to `kling-2.6/text-to-video`; replace schema with `{prompt, sound, aspect_ratio, duration}` exactly.

### KIE/kling/image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️ (likely ❌ — same family as text-to-video)
**DB row:** modelId=`kling/image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video providerName=KIE
**Doc says:** real `model` likely `kling-2.6/image-to-video` (same version-prefix pattern as the sibling text-to-video page). Params: `prompt`(req), `image_urls`(req, array), `sound`(req, bool), `duration`(req, enum `"5"`/`"10"`), `callBackUrl`(opt).
**We store:** `kling/image-to-video`; generic schema uses `image_url` (singular) not `image_urls` (array), no `sound`, wrong duration enum, fabricated `resolution`/`aspect_ratio`.
**Root cause class:** #1/#7/#8.
**Fix needed:** verify/adopt `kling-2.6/image-to-video` model string; schema `{prompt, image_urls[], sound, duration}`.

### KIE/kling/v25-turbo-image-to-video-pro — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`kling/v25-turbo-image-to-video-pro` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model `kling/v2-5-turbo-image-to-video-pro` (dashed `v2-5`, our id is `v25` no dash). Params: `prompt`(req), `image_url`(req), `tail_image_url`(opt), `duration`(opt, enum `"5"`/`"10"`, default `"5"`), `negative_prompt`(opt), `cfg_scale`(opt, 0–1 step 0.1).
**We store:** id `kling/v25-turbo-image-to-video-pro` — missing the dash in `v2-5` vs doc's `v2-5-turbo`; generic schema has no `tail_image_url`/`negative_prompt`/`cfg_scale`, fabricated `resolution`/`aspect_ratio` this model doesn't take.
**Root cause class:** #1/#7/#8.
**Fix needed:** confirm exact `model` string (`kling/v2-5-turbo-image-to-video-pro`); add real optional fields, drop fabricated `resolution`/`aspect_ratio`.

### KIE/kling/v25-turbo-text-to-video-pro — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`kling/v25-turbo-text-to-video-pro` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model `kling/v2-5-turbo-text-to-video-pro`. Params: `prompt`(req); optional `duration`(`5`/`10`), `aspect_ratio`(`16:9`/`9:16`/`1:1`), `negative_prompt`, `cfg_scale`(0–1 step 0.1, default 0.5).
**We store:** generic schema missing `negative_prompt`/`cfg_scale`, fabricated `resolution` field that doesn't exist for this model.
**Root cause class:** #7/#8.
**Fix needed:** same as above — verify model string, add `negative_prompt`/`cfg_scale`, drop `resolution`.

### KIE/kling/ai-avatar-standard — 2026-08-05
**Studio/category:** lipsync
**Verdict:** ⚠️
**DB row:** modelId=`kling/ai-avatar-standard` exists=yes isActive=true modelType=lipsync capability=avatar-video
**Doc says:** model `kling/ai-avatar-standard`. Params: `image_url`(req), `audio_url`(req), `prompt`(req), `callBackUrl`(opt). **No duration/resolution/aspect_ratio at all.**
**We store:** generic avatar-video schema still injects `duration`[5,8,10]/`resolution`/`aspect_ratio` fields the API doesn't accept — capability's own default schema (`defaultSchemaForCapability`) adds these for any capability containing "video" including `avatar-video`.
**Root cause class:** #8.
**Fix needed:** curate this model — schema should be exactly `{image_url, audio_url, prompt}`.

### KIE/kling/ai-avatar-pro — 2026-08-05
**Studio/category:** lipsync
**Verdict:** ⚠️
**DB row:** modelId=`kling/ai-avatar-pro` exists=yes isActive=true modelType=lipsync capability=avatar-video
**Doc says:** model `kling/ai-avatar-pro`. Same params as standard: `image_url`(req), `audio_url`(req), `prompt`(req). No enums.
**We store:** same fabricated duration/resolution/aspect_ratio issue as standard.
**Root cause class:** #8.
**Fix needed:** curate — `{image_url, audio_url, prompt}` only.

### KIE/kling/v2-1-master-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`kling/v2-1-master-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches exactly. Params: `prompt`(req), `image_url`(req), `duration`(opt, `5`/`10`), `negative_prompt`(opt), `cfg_scale`(opt, default 0.5), `callBackUrl`(opt).
**We store:** generic schema missing `negative_prompt`/`cfg_scale`, has fabricated `resolution`/`aspect_ratio`.
**Root cause class:** #8.
**Fix needed:** add real optional fields, drop fabricated ones.

### KIE/kling/v2-1-master-text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`kling/v2-1-master-text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req), `duration`(opt, `5`/`10`, default `5`), `aspect_ratio`(opt, `16:9`/`9:16`/`1:1`, default `16:9`), `negative_prompt`(opt), `cfg_scale`(opt).
**We store:** generic schema close on `duration`/`aspect_ratio` (right values, coincidentally) but missing `negative_prompt`/`cfg_scale`, and adds a fabricated `resolution` field this model does not take.
**Root cause class:** #8.
**Fix needed:** add `negative_prompt`/`cfg_scale`, drop `resolution`.

### KIE/kling/v2-1-pro — 2026-08-05
**Studio/category:** video-i2v (note: DB files this as coarse `video`/`text-to-video`-shaped, but doc requires `image_url` — image-direction)
**Verdict:** ⚠️
**DB row:** modelId=`kling/v2-1-pro` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** model matches. Params: `prompt`(req), `image_url`(**req**), `duration`(opt), `negative_prompt`(opt), `cfg_scale`(opt), `tail_image_url`(opt).
**We store:** capability=coarse `video`, which `capability-groups.js`'s `ttv` group includes — this model REQUIRES `image_url` and would 500/fail if submitted from the T2V studio with no image. Schema is also missing `negative_prompt`/`cfg_scale`/`tail_image_url` and has a fabricated `resolution`/`aspect_ratio`.
**Root cause class:** #5 (capability misfiling — this one genuinely needs `image_to_video` capability, unlike the kling/* models the code comment says are deliberately left coarse) + #8.
**Fix needed:** re-file capability as `image-to-video` (moves it out of the T2V pool into I2V); add real optional fields.

### KIE/kling/v2-1-standard — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ❌ (confirmed live-422'd this session)
**DB row:** modelId=`kling/v2-1-standard` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** page shows model string `kling/v2-1-standard` matching the slug exactly — no alternate string visible on the page itself, unlike its siblings. Params: `prompt`(req), `image_url`(req), `duration`(opt), `negative_prompt`(opt), `cfg_scale`(opt).
**We store:** matches the doc's literal string, yet the live probe this session got 422 "model name not supported." The doc page content does not explain the discrepancy — either the doc is stale/aspirational (KIE catalog access can lag doc publication) or the live probe sent something the API rejected for another reason. Also mis-capabilitied as coarse `video` despite requiring `image_url` (same #5 issue as v2-1-pro).
**Root cause class:** #1 (doc ≠ live reality, unresolved) + #5.
**Fix needed:** deactivate until a fresh live probe either confirms the string works with a minimal valid payload or KIE support confirms the model is retired; if reactivated, re-file capability as `image-to-video`.

### KIE/kling/motion-control — 2026-08-05
**Studio/category:** video (Kling's own "motion transfer" capability — not modeled by our capability taxonomy at all)
**Verdict:** ❌
**DB row:** modelId=`kling/motion-control` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** real `model` is **`kling-2.6/motion-control`** (version-prefixed, same pattern as text-to-video). Params live nested under `input`: `prompt`(opt), `input_urls`(req), `video_urls`(req), `character_orientation`(req, enum `image`/`video`), `mode`(req, enum `720p`/`1080p`).
**We store:** wrong model string (`kling/motion-control` vs real `kling-2.6/motion-control`); generic schema has none of `input_urls`/`video_urls`/`character_orientation`/`mode` — this model REQUIRES a source video and image and cannot run with just `prompt`.
**Root cause class:** #1/#7/#8.
**Fix needed:** fix model string to `kling-2.6/motion-control`; curate schema with the real 4 fields; this is arguably a v2v/reference capability, not coarse video — needs a dedicated capability or curated UI.

### KIE/kling/motion-control-v3 — 2026-08-05
**Studio/category:** video
**Verdict:** ⚠️
**DB row:** modelId=`kling/motion-control-v3` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** model `kling-3.0/motion-control` (version-prefixed, `3.0` not `v3`). Params: `prompt`(opt), `input_urls`(req), `video_urls`(req), `mode`(opt, enum `std`=720p/`pro`=1080p), `character_orientation`(opt), `background_source`(opt, enum `input_video`/`input_image`).
**We store:** id `kling/motion-control-v3` — doesn't match real `kling-3.0/motion-control`; schema fabricated/generic, missing all 5 real fields.
**Root cause class:** #1/#7/#8.
**Fix needed:** fix model string; curate schema.

### KIE/kling/kling-3-0 — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ❌ (confirmed live-422'd this session)
**DB row:** modelId=`kling/kling-3-0` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** real `model` is **`kling-3.0/video`** — completely different from `kling/kling-3-0` (no shared prefix pattern with the other Kling pages at all). Params: `prompt`, `image_urls`, `sound`, `duration`(enum `'3'`–`'15'`), `aspect_ratio`(`16:9`/`9:16`/`1:1`), `mode`(enum `std`/`pro`/`4K`, mapping to fixed resolutions per aspect ratio), `multi_shots`, `multi_prompt`, `kling_elements`.
**We store:** wrong model string entirely — explains the confirmed 422. Generic schema also missing `sound`/`mode`/`multi_shots`/`multi_prompt`/`kling_elements`, and its `resolution` field doesn't exist on this model (resolution is derived from `mode` + `aspect_ratio` instead).
**Root cause class:** #1/#7/#8. This is the clearest confirmed instance of #7 in the whole audit.
**Fix needed:** change model string to `kling-3.0/video`; curate the real 8-field schema.

### KIE/kling/v3-turbo-text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`kling/v3-turbo-text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches slug. Params: `prompt`(req), `duration`(req, range 3–15s, default `5`, no fixed enum), `aspect_ratio`(req, enum `1:1`/`9:16`/`16:9`), `resolution`(req, enum `720p`/`1080p`).
**We store:** generic schema marks these fields optional when the doc says required, and duration enum `[5,8,10]` doesn't match the doc's free 3–15s range.
**Root cause class:** #2 (fabricated enum) + #8 (required/optional mismatch).
**Fix needed:** curate: all three fields required; duration as a ranged number 3–15, not a 3-value enum.

### KIE/kling/v3-turbo-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`kling/v3-turbo-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req), `image_urls`(req, array), `duration`(req, 3–15s range, default `5`), `resolution`(req, enum `720p` default/`1080p`).
**We store:** generic schema uses `image_url` singular not `image_urls` array; duration enum wrong; no `aspect_ratio` on this model per doc but generic schema fabricates one.
**Root cause class:** #2/#8.
**Fix needed:** curate `{prompt, image_urls[], duration, resolution}`, drop fabricated `aspect_ratio`.

---

## Bytedance / Seedance (`/market/bytedance/*`) — 9 doc pages, 9 DB rows (all present)

### KIE/bytedance/seedance-2 — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ✅
**DB row:** modelId=`bytedance/seedance-2` exists=yes isActive=true modelType=video capability=video
**Doc says:** model `bytedance/seedance-2`. Params: `prompt`(req); optional `first_frame_url`, `last_frame_url`, `reference_image_urls`, `reference_video_urls`, `reference_audio_urls`, `return_last_frame`, `generate_audio`, `resolution`(enum `480p`/`720p`/`1080p`/`4k`), `aspect_ratio`(enum incl. `1:1`/`4:3`/`3:4`/`16:9`/`9:16`/`21:9`/`adaptive`), `duration`(int 4–15, default 5), `web_search`, `nsfw_checker`.
**We store:** generic schema's `{aspect_ratio, resolution, duration}` subset is a correct, valid subset — matches the exact params the live production probe already confirmed working. `resolution` enum in our schema (`480p/720p/1080p`) is missing the real `4k` option; `aspect_ratio` enum is missing `21:9`/`adaptive`; `duration` enum `[5,8,10]` doesn't match the real 4–15 range but 5 and 10 are both valid values inside that range so a picker built on it would still submit legally.
**Root cause class:** n/a — this is the one confirmed-working model in the family. Minor: enum completeness (#2), not blocking.
**Fix needed:** widen `resolution` enum to include `4k`, `aspect_ratio` to include `21:9`/`adaptive`, `duration` to the real 4–15 range — cosmetic completeness only, not a functional bug.

### KIE/bytedance/seedance-2-fast — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ❌ (confirmed live-422'd this session)
**DB row:** modelId=`bytedance/seedance-2-fast` exists=yes isActive=true modelType=video capability=video
**Doc says:** model string matches the slug exactly (`bytedance/seedance-2-fast`) — **no id mismatch found**. Params identical shape to seedance-2, but narrower `resolution` enum: only `480p`/`720p` (**no 1080p/4k**).
**We store:** id matches doc, so the confirmed 422 is NOT an id/slug bug like Kling's — either (a) our generic schema's `resolution` enum includes `1080p`, which this narrower model rejects if a caller happened to send it, or (b) the model is genuinely unavailable to this KIE account/plan despite being documented. Cannot fully resolve without a fresh probe using a resolution actually inside the real `480p`/`720p` range.
**Root cause class:** new — doc/reality mismatch not explained by id or enum alone; needs a second live probe with `resolution: "720p"` before concluding it's genuinely dead.
**Fix needed:** re-probe with a doc-valid payload before deciding whether to deactivate; narrow schema's resolution enum to `480p`/`720p` regardless.

### KIE/bytedance/seedance-2-mini — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️ (untested live, but schema definitely wrong)
**DB row:** modelId=`bytedance/seedance-2-mini` exists=yes isActive=true modelType=video capability=video
**Doc says:** model matches slug. Params like seedance-2 minus `return_last_frame`/`callBackUrl` in the shown example; `resolution` enum only `480p`/`720p`; `duration` 4–15s.
**We store:** generic schema's `resolution` enum (`480p/720p/1080p`) includes an invalid `1080p` for this tier; `duration` enum `[5,8,10]` doesn't match the real 4–15 range (5 and 10 happen to be valid).
**Root cause class:** #2.
**Fix needed:** narrow `resolution` enum to `480p`/`720p`.

### KIE/bytedance/seedance-1-5-pro — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ❌ (confirmed live-422'd this session)
**DB row:** modelId=`bytedance/seedance-1-5-pro` exists=yes isActive=true modelType=video capability=video
**Doc says:** real `model` field uses a **dot**, not a dash: **`bytedance/seedance-1.5-pro`**, not `bytedance/seedance-1-5-pro`. Params: `prompt`(req), `input_urls`, `aspect_ratio`(**req**, enum `1:1`/`4:3`/`3:4`/`16:9`/`9:16`/`21:9`), `resolution`(opt, enum `480p`/`720p`/`1080p`), `duration`(**req**, range 4–12s), `fixed_lens`, `generate_audio`, `nsfw_checker`.
**We store:** wrong separator in the id — this is almost certainly the exact cause of the confirmed 422 (same failure mode as Kling's #7 issues, different family). Generic schema also marks `aspect_ratio`/`duration` optional when doc says required.
**Root cause class:** #1/#7 (dot vs dash) + #8 (required/optional).
**Fix needed:** change model string from `bytedance/seedance-1-5-pro` to `bytedance/seedance-1.5-pro`; mark `aspect_ratio`/`duration` required.

### KIE/bytedance/v1-pro-fast-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`bytedance/v1-pro-fast-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req), `image_url`(req), `resolution`(opt, enum `"720p"`/`"1080p"` — no 480p), `duration`(opt, enum `"5"`/`"10"`), `nsfw_checker`(opt). **No `aspect_ratio` field at all.**
**We store:** generic schema fabricates an `aspect_ratio` field this model doesn't accept, and `resolution` enum includes invalid `480p`.
**Root cause class:** #8.
**Fix needed:** drop `aspect_ratio`; narrow `resolution` enum to `720p`/`1080p`.

### KIE/bytedance/v1-pro-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`bytedance/v1-pro-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req), `image_url`(req), `resolution`(enum `480p`/`720p`/`1080p`), `duration`(enum `5`/`10`), `camera_fixed`(opt), `seed`(opt), `enable_safety_checker`(opt), `nsfw_checker`(opt). No `aspect_ratio`.
**We store:** generic schema fabricates `aspect_ratio`; missing `camera_fixed`/`seed`/`enable_safety_checker`.
**Root cause class:** #8.
**Fix needed:** drop `aspect_ratio`; add `camera_fixed`/`seed`/`enable_safety_checker`.

### KIE/bytedance/v1-pro-text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`bytedance/v1-pro-text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req), `aspect_ratio`(enum `21:9`/`16:9`/`4:3`/`1:1`/`3:4`/`9:16`), `resolution`(enum `480p`/`720p`/`1080p`), `duration`(enum `5`/`10`), `camera_fixed`, `seed`, `enable_safety_checker`, `nsfw_checker`.
**We store:** generic `aspect_ratio` enum missing `21:9`; missing `camera_fixed`/`seed`/`enable_safety_checker`.
**Root cause class:** #2/#8.
**Fix needed:** widen `aspect_ratio` enum; add the 3 missing optional fields.

### KIE/bytedance/v1-lite-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`bytedance/v1-lite-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req), `image_url`(req), `resolution`(enum `480p`/`720p`/`1080p`), `duration`(enum `'5'`/`'10'`), `camera_fixed`, `seed`, `enable_safety_checker`, `end_image_url`(opt), `nsfw_checker`. No `aspect_ratio`.
**We store:** fabricates `aspect_ratio`; missing `end_image_url`/`camera_fixed`/`seed`/`enable_safety_checker`.
**Root cause class:** #8.
**Fix needed:** curate the real field set.

### KIE/bytedance/v1-lite-text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`bytedance/v1-lite-text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req, max 10000 chars), `aspect_ratio`(default `16:9`, enum `16:9`/`4:3`/`1:1`/`3:4`/`9:16`/`9:21`), `resolution`(default `720p`, enum `480p`/`720p`/`1080p`), `duration`(default `5`, enum `5`/`10`), `camera_fixed`, `seed`(default −1), `enable_safety_checker`, `nsfw_checker`.
**We store:** `aspect_ratio` enum missing `9:21`; missing `camera_fixed`/`seed`/`enable_safety_checker`; `prompt.maxLength` unset (default schema uses 5000, doc allows 10000).
**Root cause class:** #2/#8.
**Fix needed:** widen enums, add missing fields, raise `prompt.maxLength` to 10000.

---

## Hailuo (`/market/hailuo/*`) — 6 doc pages, 6 DB rows (all present)

### KIE/hailuo/2-3-image-to-video-pro — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`hailuo/2-3-image-to-video-pro` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req, max 5000), `image_url`(req), `duration`(opt, enum `'6'`/`'10'`, default `'6'`), `resolution`(opt, enum `768P`/`1080P` — **uppercase P**, 10s not supported at 1080p), `nsfw_checker`. No `aspect_ratio`.
**We store:** generic schema uses lowercase `480p/720p/1080p` enum and fabricates `aspect_ratio`; real enum is `768P`/`1080P` (uppercase, different values entirely — `480p`/`720p` are not even valid for this model).
**Root cause class:** #2 (enum casing/values completely wrong) + #8 (fabricated field).
**Fix needed:** replace `resolution` enum with `768P`/`1080P`; replace `duration` enum with `6`/`10`; drop `aspect_ratio`.

### KIE/hailuo/2-3-image-to-video-standard — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`hailuo/2-3-image-to-video-standard` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** same shape as pro: `duration` enum `'6'`/`'10'`, `resolution` enum `768P`/`1080P`, 10s unsupported at 1080p.
**We store:** same wrong casing/enum issue as pro variant.
**Root cause class:** #2.
**Fix needed:** same fix as 2-3-pro.

### KIE/hailuo/02-text-to-video-pro — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`hailuo/02-text-to-video-pro` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req, max 1500), `prompt_optimizer`(opt bool), `nsfw_checker`(opt bool, default false). **No duration/resolution/aspect_ratio exposed at all** — fully fixed internally.
**We store:** generic schema still renders `duration`/`resolution`/`aspect_ratio` controls that this model doesn't accept, and doesn't have `prompt_optimizer`; `prompt.maxLength` is 5000 in our schema vs the real 1500.
**Root cause class:** #8.
**Fix needed:** curate to `{prompt(maxLength 1500), prompt_optimizer, nsfw_checker}` only, no video-shape fields.

### KIE/hailuo/02-image-to-video-pro — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`hailuo/02-image-to-video-pro` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req, max 1500), `image_url`(req), `end_image_url`(opt), `prompt_optimizer`(opt), `nsfw_checker`(opt). No duration/resolution/aspect_ratio.
**We store:** same fabricated-fields issue as the text-to-video pro sibling.
**Root cause class:** #8.
**Fix needed:** curate to real 5-field set.

### KIE/hailuo/02-text-to-video-standard — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`hailuo/02-text-to-video-standard` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req), `duration`(opt, enum `'6'`/`'10'`), `prompt_optimizer`(opt), `nsfw_checker`(opt). No resolution/aspect_ratio.
**We store:** generic schema has wrong duration enum (`5/8/10` vs real `6/10`) and fabricates `resolution`/`aspect_ratio`.
**Root cause class:** #2/#8.
**Fix needed:** curate `{prompt, duration:[6,10], prompt_optimizer, nsfw_checker}`.

### KIE/hailuo/02-image-to-video-standard — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`hailuo/02-image-to-video-standard` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req), `image_url`(req), `end_image_url`(opt), `duration`(opt, enum `'6'`/`'10'`, default `'10'`), `resolution`(opt, enum `512P`/`768P`, default `768P`), `prompt_optimizer`, `nsfw_checker`.
**We store:** `resolution` enum wrong (`480p/720p/1080p` lowercase vs real `512P`/`768P` uppercase, no overlap at all); `duration` enum wrong; missing `end_image_url`/`prompt_optimizer`; fabricates `aspect_ratio`.
**Root cause class:** #2/#8.
**Fix needed:** curate the real 6-field set with correct enum casing.

---

## Wan — KIE-routed (`/market/wan/*`) — 16 doc pages, 16 DB rows (all present)

**Important distinction called out per the task brief:** every row below has `providerName=KIE` and a `wan/2-X-...` (slash, hyphenated digits) modelId — these go through KIE's generic Market endpoint. This is a **completely separate provider path** from the `alibaba:wan2.X-...` rows (colon-prefixed, no slash, dotted version) confirmed callable earlier this session via Alibaba's own direct multimodal-generation route. Do not merge findings across the two — the KIE rows below never touch Alibaba's API at all, and vice versa. Both families happen to model similarly-named products (Wan 2.5/2.6/2.7) from two different upstream routes KIE and Alibaba each expose independently.

**Global doc finding:** all 16 real `model` values use hyphens through the version number (`wan/2-7-text-to-video`), matching our stored ids exactly — **no id/slug mismatch found anywhere in this family**, unlike Kling/Bytedance. The bugs here are entirely schema-shape (#8) and one capability-inference issue.

### KIE/wan/2-2-a14b-image-to-video-turbo — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-2-a14b-image-to-video-turbo` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `image_url`(req), `prompt`(req); optional `resolution`(enum `480p`/`720p`, default `720p`), `enable_prompt_expansion`, `seed`, `acceleration`(enum `none`/`regular`), `nsfw_checker`. **No duration, no aspect_ratio.**
**We store:** generic schema fabricates `duration` and `aspect_ratio`; `resolution` enum includes invalid `1080p`.
**Root cause class:** #8.
**Fix needed:** curate the real 7-field set, drop `duration`/`aspect_ratio`.

### KIE/wan/2-2-a14b-text-to-video-turbo — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-2-a14b-text-to-video-turbo` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req); optional `resolution`(`480p`/`720p`), `aspect_ratio`(`16:9`/`9:16` only), `enable_prompt_expansion`, `seed`, `acceleration`, `nsfw_checker`. **No duration.**
**We store:** generic schema fabricates `duration`; `resolution`/`aspect_ratio` enums both too wide (include invalid `1080p`/`1:1`).
**Root cause class:** #8.
**Fix needed:** drop `duration`; narrow enums to the real 2-value sets.

### KIE/wan/2-2-a14b-speech-to-video-turbo — 2026-08-05
**Studio/category:** lipsync (avatar-video) — currently filed as generic `video`
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-2-a14b-speech-to-video-turbo` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** model matches. Params: `prompt`(req), `image_url`(req), `audio_url`(req); optional `num_frames`(40–120), `frames_per_second`(4–60), `resolution`(enum `480p`/`580p`/`720p`), `negative_prompt`, `seed`, `num_inference_steps`, `guidance_scale`, `shift`, `nsfw_checker`.
**We store:** capability is coarse `video`, landing this in the T2V pool per `capability-groups.js`'s `ttv` group — but the model REQUIRES `image_url` and `audio_url`, so a T2V submission with only `prompt` would fail. Schema also missing all 9 real optional fields, fabricates `duration`/`aspect_ratio`.
**Root cause class:** #9 (capability-inference miss — `inferCapability`'s avatar/lip-sync regex list doesn't include "speech-to-video" as a marker, so this falls through to the generic video bucket) + #8.
**Fix needed:** add "speech-to-video" to the lip-sync/avatar marker regex in `inferCapability`, re-file as `avatar-video`; curate real schema.

### KIE/wan/2-2-animate-move — 2026-08-05
**Studio/category:** video-r2v/v2v (image+video → video)
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-2-animate-move` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** model matches. Params: `video_url`(req), `image_url`(req); optional `resolution`(`480p`/`580p`/`720p`), `nsfw_checker`. No prompt field visible, no duration/aspect_ratio.
**We store:** coarse `video` capability lands this in T2V pool despite requiring both `video_url` AND `image_url` with no prompt at all — cannot run from a text-only studio. Generic schema fabricates `prompt`(required)/`duration`/`aspect_ratio`, none of which the model needs/accepts as shown.
**Root cause class:** #5/#9 (capability) + #8 (schema).
**Fix needed:** this needs a capability this taxonomy doesn't currently have (image+video → video with no prompt) — at minimum re-file out of coarse `video`/ttv; curate real 4-field schema.

### KIE/wan/2-2-animate-replace — 2026-08-05
**Studio/category:** video-r2v/v2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-2-animate-replace` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** model matches. Params: `video_url`(req, mp4/mov/mkv ≤10MB), `image_url`(req, jpeg/png/webp ≤10MB); optional `resolution`(`480p`/`580p`/`720p`, default `480p`), `nsfw_checker`.
**We store:** same issue as animate-move — coarse `video` capability, fabricated `prompt`/`duration`/`aspect_ratio` fields.
**Root cause class:** #5/#9/#8.
**Fix needed:** same as animate-move.

### KIE/wan/2-6-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-6-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req, max 5000), `image_urls`(req, array max 1); optional `duration`(enum `'5'`/`'10'`/`'15'`, default `'5'`), `resolution`(enum `720p`/`1080p`, default `1080p`), `multi_shots`, `nsfw_checker`. No `aspect_ratio`.
**We store:** generic schema uses `image_url` singular not `image_urls` array; `duration` enum `[5,8,10]` includes invalid `8`; fabricates `aspect_ratio`; missing `multi_shots`.
**Root cause class:** #2/#8.
**Fix needed:** curate real field names/enums.

### KIE/wan/2-6-text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-6-text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req); optional `duration`(`'5'`/`'10'`/`'15'`), `resolution`(`720p`/`1080p`), `multi_shots`, `nsfw_checker`. No `aspect_ratio`.
**We store:** fabricates `aspect_ratio`; `duration` enum wrong (`8` invalid); missing `multi_shots`.
**Root cause class:** #2/#8.
**Fix needed:** curate real fields.

### KIE/wan/2-6-video-to-video — 2026-08-05
**Studio/category:** video-v2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-6-video-to-video` exists=yes isActive=true modelType=v2v capability=video-to-video
**Doc says:** model matches. Params: `prompt`(req), `video_urls`(req, array up to 3); optional `duration`(`"5"`/`"10"`), `resolution`(`"720p"`/`"1080p"`), `multi_shots`, `nsfw_checker`.
**We store:** default v2v schema (from `defaultSchemaForCapability`) uses singular `video_url` not the real array `video_urls`; missing `multi_shots`; fabricates `aspect_ratio`; `duration` enum wrong.
**Root cause class:** #8.
**Fix needed:** curate real fields.

### KIE/wan/2-6-flash-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-6-flash-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req, max 1500), `image_urls`(req, array, single image ≥256×256, ≤10MB), `audio`(bool, pricing-relevant — shown required in example); optional `duration`(`'5'`/`'10'`/`'15'`), `resolution`(`720p`/`1080p`), `multi_shots`, `nsfw_checker`.
**We store:** missing `audio` field entirely (this is a **pricing-relevant** field per the doc, so its absence also risks a wrong price quote, not just a rejected request); wrong `image_url`(singular)/array mismatch; `prompt.maxLength` 5000 in our schema vs doc's 1500.
**Root cause class:** #8, and a pricing-rule gap (`pricingRules`/`ModelPricing.pricingRules` presumably doesn't have an `audio`-conditional rule either — out of this audit's direct verification but flagged).
**Fix needed:** curate real fields including `audio`; check `pricingRules` for an audio-true/false price split.

### KIE/wan/2-6-flash-video-to-video — 2026-08-05
**Studio/category:** video-v2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-6-flash-video-to-video` exists=yes isActive=true modelType=v2v capability=video-to-video
**Doc says:** model matches. Params: `prompt`(req, max 1500), `video_urls`(req, array up to 3); optional `duration`(`"5"`/`"10"`), `resolution`(`"720p"`/`"1080p"`), `audio`(bool, pricing-relevant), `multi_shots`, `nsfw_checker`.
**We store:** same `audio`-field gap as the sibling image-to-video-flash, plus array/singular mismatch on `video_url(s)`.
**Root cause class:** #8 + pricing-rule gap.
**Fix needed:** same as flash-image-to-video.

### KIE/wan/2-5-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-5-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req, max **800** chars), `image_url`(req, singular — matches our schema here), `duration`(**req** here, unlike the 2.6/2.7 lines where it's optional; enum `"5"`/`"10"`); optional `resolution`(`720p`/`1080p`), `negative_prompt`, `enable_prompt_expansion`, `seed`, `nsfw_checker`.
**We store:** `duration` marked optional when doc says required for this specific model (differs from siblings — the generic schema can't express per-model required-ness); `prompt.maxLength` 5000 vs real 800; fabricates `aspect_ratio`; missing `negative_prompt`/`enable_prompt_expansion`/`seed`.
**Root cause class:** #8.
**Fix needed:** curate: `duration` required, `prompt.maxLength=800`, add missing optional fields, drop `aspect_ratio`.

### KIE/wan/2-5-text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-5-text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req, max 800), `duration`(**req**, `'5'`/`'10'`); optional `aspect_ratio`(`'16:9'`/`'9:16'`/`'1:1'` — this one's the only 2-5/2-6 model that DOES have aspect_ratio), `resolution`(`720p`/`1080p`), `negative_prompt`, `enable_prompt_expansion`, `seed`, `nsfw_checker`.
**We store:** `duration` marked optional (should be required); `prompt.maxLength` wrong (5000 vs 800); missing `negative_prompt`/`enable_prompt_expansion`/`seed`.
**Root cause class:** #8.
**Fix needed:** curate real field set/required-ness.

### KIE/wan/2-7-text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-7-text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req, 1–5000); optional `negative_prompt`, `audio_url`, `resolution`(`720p`/`1080p`, default `1080p`), **`ratio`** (NOT `aspect_ratio` — field is literally named `ratio`; enum `16:9`/`9:16`/`1:1`/`4:3`/`3:4`, default `16:9`), `duration`(int 2–15, default 5), `prompt_extend`(default true), `watermark`(default false), `seed`, `nsfw_checker`.
**We store:** our generic schema's field is named `aspect_ratio`, which this model's real API **does not accept** — the actual accepted field is `ratio`. This is a field-name mismatch that would silently no-op (KIE would likely ignore an unrecognized field or apply its own default) rather than error, making it hard to notice without a doc read. Also missing `negative_prompt`/`audio_url`/`prompt_extend`/`watermark`/`seed`.
**Root cause class:** #8, specifically a field-NAME bug (not just enum) — worth calling out on its own since it's silent, not a 422.
**Fix needed:** rename `aspect_ratio` → `ratio` in this model's curated schema (once one exists) and change `duration` from an enum to an int range 2–15.

### KIE/wan/2-7-image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-7-image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `prompt`(req, max 5000); optional `negative_prompt`, `first_frame_url`, `last_frame_url`, `first_clip_url`, `driving_audio_url`, `resolution`(`720p`/`1080p`, default `1080p`), `duration`(int 2–15, default 5), `prompt_extend`, `watermark`, `seed`, `nsfw_checker`. **No `image_url`/`image_urls` at all** — uses `first_frame_url`/`last_frame_url` instead, and **no `aspect_ratio`/`ratio`** either.
**We store:** generic i2v default schema requires `image_url` (per `defaultSchemaForCapability`'s `capability.includes("image-to-")` branch) — this model doesn't have that field name at all, it's `first_frame_url`. A studio submit built from the generic schema would send the wrong field name and the real image would never reach the model. Also fabricates `aspect_ratio`.
**Root cause class:** #8, field-name bug (like sibling t2v's `ratio` issue) — likely blocks real usage since the "required" `image_url` field the UI collects has nowhere correct to go.
**Fix needed:** curate: drop generic `image_url`, add `first_frame_url`(req-equivalent)/`last_frame_url`/`first_clip_url`/`driving_audio_url`; drop fabricated `aspect_ratio`.

### KIE/wan/2-7-videoedit — 2026-08-05
**Studio/category:** video-v2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-7-videoedit` exists=yes isActive=true modelType=v2v capability=video-to-video
**Doc says:** model matches. Params: `video_url`(req); optional `prompt`(max 5000, unusually optional here), `negative_prompt`, `reference_image`, `resolution`(`720p`/`1080p`), `aspect_ratio`(this one DOES use `aspect_ratio`, enum `16:9`/`9:16`/`1:1`/`4:3`/`3:4`), `duration`(int, `0` or 2–10, default 0), `audio_setting`(enum `auto`/`origin`), `prompt_extend`, `watermark`, `seed`, `nsfw_checker`.
**We store:** default v2v schema marks `prompt` required (defaultSchemaForCapability's `prompt.required = true` for anything not upscale/background-removal) but this model's `prompt` is genuinely optional; missing `reference_image`/`audio_setting`/`prompt_extend`/`watermark`/`seed`; `duration` enum wrong shape (0-or-2–10 int range, not our 3-value enum).
**Root cause class:** #8.
**Fix needed:** curate real fields, `prompt` optional here specifically.

### KIE/wan/2-7-r2v — 2026-08-05
**Studio/category:** video-r2v
**Verdict:** ⚠️
**DB row:** modelId=`wan/2-7-r2v` exists=yes isActive=true modelType=video capability=reference-to-video (already correctly grouped in `r2v` per `capability-groups.js`)
**Doc says:** model matches. Params: `prompt`(req, max 5000); optional `negative_prompt`, `reference_image`(array max 5), `reference_video`(array max 5), `first_frame`, `reference_voice`, `resolution`(`720p`/`1080p`), `aspect_ratio`(`16:9`/`9:16`/`1:1`/`4:3`/`3:4`, default `16:9`), `duration`(int 2–10, default 5), `prompt_extend`, `watermark`, `seed`, `nsfw_checker`.
**We store:** DB row's `inputSchema` (read directly this session, shown in the raw query output) has `image_url`(required, `providerField: "img_url"`), `video_url`(required), `resolution` enum `["720p","1080p"]`(required), `duration` enum `[5,10,15]`(required), `audio`/`audio_url`/`watermark`/`prompt_extend`(optional) — **this is actually a hand-curated-looking schema, not the generic default**, but it still uses singular `image_url`/`video_url` (with a `providerField: img_url` remap) instead of the doc's real array fields `reference_image`/`reference_video`; it also marks `resolution`/`duration`/`image_url`/`video_url` as required when the doc shows only `prompt` is required and everything else (including `resolution`/`duration`) is optional with defaults.
**Root cause class:** #8, but distinct from the rest of the family — someone already hand-wrote a schema for this one and got the field names/required-ness wrong rather than leaving it fully generic.
**Fix needed:** rewrite this specific curated schema to match the doc: `prompt` required only; `reference_image[]`/`reference_video[]`/`first_frame`/`reference_voice` optional; `resolution`/`aspect_ratio`/`duration` optional with the doc's defaults.
**Note:** capability=`reference-to-video`, correctly grouped by `capability-groups.js`'s `r2v: ["reference-to-video"]`.

---

## Grok Imagine (`/market/grok-imagine/*`) — 5 doc pages, only 3 have active DB rows

### KIE/grok-imagine/text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`grok-imagine/text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req, max 5000); optional `aspect_ratio`(default `2:3`, enum `2:3`/`3:2`/`1:1`/`16:9`/`9:16`), `mode`(default `normal`, enum `fun`/`normal`/`spicy`), `duration`(int 6–30, step 1), `resolution`(default `480p`, enum `480p`/`720p`/`1080p`), `nsfw_checker`.
**We store:** generic schema's `aspect_ratio` enum is missing `2:3`/`3:2` (the model's actual defaults!); `duration` enum `[5,8,10]` doesn't overlap the real 6–30 range at all (5 and 8 are BELOW the minimum of 6 — an invalid submission if picked); missing `mode`.
**Root cause class:** #2 (enum values genuinely out of range, not just incomplete) + #8.
**Fix needed:** curate: `duration` as int range 6–30 (not enum); widen `aspect_ratio`; add `mode`.

### KIE/grok-imagine/image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`grok-imagine/image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `image_urls`(opt, array max 7), `task_id`(opt), `index`(opt, 0–5), `prompt`(opt, max 5000), `mode`(enum `fun`/`normal`/`spicy`), `duration`(int 6–30), `resolution`(enum `480p`/`720p`/`1080p`), `aspect_ratio`(default `16:9`, enum `2:3`/`3:2`/`1:1`/`16:9`/`9:16`), `nsfw_checker`. Notably `image_urls` itself is optional (can drive from `task_id`+`index` instead of a fresh image).
**We store:** generic schema requires `image_url`(singular, required=true) — wrong field name AND wrong required-ness; `duration` enum invalid range again (5/8/10 vs real 6–30 minimum).
**Root cause class:** #8.
**Fix needed:** curate the real optional-`image_urls`/`task_id`/`index` shape; fix duration range.

### KIE/grok-imagine/upscale — 2026-08-05
**Studio/category:** video-v2v (upscale)
**Verdict:** ⚠️
**DB row:** modelId=`grok-imagine/upscale` exists=yes isActive=true modelType=i2i capability=image-upscale
**Doc says:** model matches. Params: `task_id`(req — only Kie-generated videos can be upscaled, no arbitrary `video_url`), `resolution`(opt, enum `720p`/`1080p`, default `720p`).
**We store:** **capability is `image-upscale`/modelType `i2i`, but this is a VIDEO upscaler** (`grok-imagine/upscale`, operates on a video `task_id`, not an image) — this is a straight video/image capability misfiling (bug class #5 from the base audit doc). It's currently invisible to any video studio and instead shows up as an image tool, where it would fail immediately (no `task_id` concept in an image-upscale UI, and the real required field isn't `image_url`/`video_url` at all).
**Root cause class:** #5 (capability misfiling) — likely because `inferCapability`'s generic `/upscale/` check does `path.includes("video") ? "video-upscale" : "image-upscale"`, and the path `grok-imagine/upscale` contains neither "video" nor "image" as a literal substring, so it falls to the `image-upscale` default.
**Fix needed:** re-file capability as `video-upscale`; curate schema to `{task_id, resolution}`, no `image_url`/`video_url`.

### KIE/grok-imagine/extend — 2026-08-05
**Studio/category:** video-v2v (extend an existing generated video)
**Verdict:** ❌
**DB row:** no active row (only a legacy flat `grok-imagine-extend`, isActive=false, isDeprecated=true, modelType=uncategorized, capability=null — pre-dates the current slash-form sync and was never replaced)
**Doc says:** model `grok-imagine/extend`. Params: `task_id`(req), `prompt`(req), `extend_at`(opt, min 2), `extend_times`(req, e.g. `"6"`/`"10"`). Only Kie-generated videos can be extended.
**We store:** nothing active — the model is fully documented and real but absent from the live catalog entirely.
**Root cause class:** new — genuinely missing from the current sync's output; not explained by the LLM-segment or Gemini-substring exclusions (family="grok-imagine" isn't in `LLM_SEGMENTS`), and `inferCapability("grok-imagine/extend")` would resolve fine via the `\/extend\b` marker in `VIDEO_TO_VIDEO_MARKERS`. Most likely explanation: this doc page is newer than the last successful sitemap crawl, or the sitemap simply hasn't listed it yet.
**Fix needed:** re-run `syncKieModels()`/verify the sitemap includes this URL; if present, the row should sync automatically and only need schema curation (`{task_id, prompt, extend_at, extend_times}`).

### KIE/grok-imagine/1-5-preview — 2026-08-05
**Studio/category:** video-t2v/i2v (combined)
**Verdict:** ❌
**DB row:** no row of any kind found
**Doc says:** real `model` field is **`grok-imagine-video-1-5-preview`** — breaks the `vendor/action` slug pattern entirely (dashes, no slash) that every other model in this vendor and most others follow. Params: `prompt`(req, max 4096 — narrower than the other Grok endpoints' 5000), `image_urls`(opt array max 7), `aspect_ratio`(enum `1:1`/`16:9`/`9:16`/`3:2`/`2:3`/`auto`, default `auto`), `resolution`(enum `480p`/`720p`/`1080p`, default `480p`), `duration`(int 1–15, default 8), `nsfw_checker`.
**We store:** no row — and even if a future sitemap crawl found `market/grok-imagine/1-5-preview`, the crawler's URL-derived id would be `grok-imagine/1-5-preview` (slash form), which does **not** match the real `model` string `grok-imagine-video-1-5-preview` at all — this would need a manual override the same way the Kling version-prefix cases do, not just a sync re-run.
**Root cause class:** new (missing) + #7 (would still be wrong even once synced, due to the non-conforming model string).
**Fix needed:** add a manual/curated row with `providerModelId = "grok-imagine-video-1-5-preview"` — this one can't be fixed by re-syncing alone.

---

## PixVerse (`/market/pixverse/*`) — 5 doc pages, 5 DB rows (all present)

### KIE/pixverse/text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`pixverse/text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** real model is **`pixverse-v6/text-to-video`** (has a `-v6` version segment our stored id `pixverse/text-to-video` doesn't carry). Params: `prompt`(req); optional `aspect_ratio`(default `16:9`, enum incl. `4:3`/`1:1`/`3:4`/`9:16`/`2:3`/`3:2`/`21:9`), **`quality`** (NOT `resolution` — enum `360p`/`540p`/`720p`/`1080p`, default `720p`), `duration`(**req**, 1–15 int), `generate_audio_switch`, `generate_multi_clip_switch`, `seed`.
**We store:** wrong model string (missing `-v6`); field name `resolution` in our schema vs the model's real `quality` field (another silent field-name mismatch, like Wan's `ratio` case); `duration` marked optional when doc says required.
**Root cause class:** #1/#7 (missing version segment) + #8 (field name `quality` vs `resolution`, silent).
**Fix needed:** fix model string to `pixverse-v6/text-to-video`; rename schema field to `quality`; mark `duration` required.

### KIE/pixverse/image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`pixverse/image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** real model `pixverse-v6/image-to-video`. Params: `prompt`(req, 3–5000), `image_urls`(req, array up to 2, ≤20MB each), `quality`(req, same 4-value enum), `duration`(req unless `template_id` used), `generate_audio_switch`, `generate_multi_clip_switch`, `seed`, `template_id`(mutually exclusive with `duration`, ~50 numeric options).
**We store:** wrong model string; `image_url` singular vs real array; `resolution` vs real `quality`; missing `template_id`/`generate_audio_switch`/`generate_multi_clip_switch`.
**Root cause class:** #1/#7/#8.
**Fix needed:** fix model string, curate real fields.

### KIE/pixverse/transition — 2026-08-05
**Studio/category:** video (image1+image2 → transition video) — no matching capability in our taxonomy, currently coarse
**Verdict:** ⚠️
**DB row:** modelId=`pixverse/transition` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** real model `pixverse-v6/transition`. Params: `prompt`(req), `first_frame_image_url`(req), `last_frame_image_url`(req), `quality`(req), `duration`(req), `generate_audio_switch`, `seed`.
**We store:** coarse `video` capability, lands in T2V pool despite requiring two images and no way to submit from a text-only studio; wrong model string; generic schema has neither `first_frame_image_url` nor `last_frame_image_url`.
**Root cause class:** #1/#7 + #5/#9 (capability) + #8 (schema).
**Fix needed:** fix model string; this needs a capability this taxonomy doesn't model well (dual-image transition) — at minimum move out of the ttv pool.

### KIE/pixverse/extend — 2026-08-05
**Studio/category:** video-v2v
**Verdict:** ⚠️
**DB row:** modelId=`pixverse/extend` exists=yes isActive=true modelType=video capability=video (coarse)
**Doc says:** real model `pixverse-v6/extend`. Params: `prompt`(req, 3–5000), `duration`(req), `quality`(req), `taskId` OR `video_url`(mutually exclusive, one req), `generate_audio_switch`, `seed`.
**We store:** coarse `video` capability (should be `video-to-video` — it always operates on an existing video, either by `taskId` or `video_url`), wrong model string, missing `taskId`/`quality`/`generate_audio_switch`.
**Root cause class:** #1/#7 + #5 (capability) + #8.
**Fix needed:** fix model string; re-file capability as `video-to-video`; curate real fields.

### KIE/pixverse/reference-to-video — 2026-08-05
**Studio/category:** video-r2v
**Verdict:** ⚠️
**DB row:** modelId=`pixverse/reference-to-video` exists=yes isActive=true modelType=video capability=reference-to-video (correctly grouped in `r2v`)
**Doc says:** doc calls this "PixVerse V6 Fusion API." Real model `pixverse-v6/reference-to-video`. Params: `prompt`(req, 3–5000), `image_references`(req, array 1–7, each `{type: enum subject/background}`), `aspect_ratio`(default `16:9`), `quality`(default `720p`), `duration`(default 5, 1–15), `generate_audio_switch`, `seed`.
**We store:** wrong model string (missing `-v6`); schema likely doesn't model the structured `image_references[].type` object shape at all (generic reference-to-video default would give a flat `image_url`); `resolution` vs real `quality`.
**Root cause class:** #1/#7/#8.
**Fix needed:** fix model string; curate the structured `image_references` array field.

---

## MiniMax-H3 (`/market/minimax-h3/*`) — 3 doc pages, 0 DB rows — entire vendor missing

### KIE/minimax-h3/text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ❌
**DB row:** no row of any kind — SQL search across all video-type/vendor-keyword filters returned zero MiniMax matches
**Doc says:** model `minimax-h3/text-to-video`. Params: `prompt`(req, 1–7000 chars), `aspect_ratio`(req, enum `21:9`/`16:9`/`4:3`/`1:1`/`3:4`/`9:16`), `duration`(req, int 4–15), `resolution`(opt, default `2K`, enum `768P`/`2K` — **uppercase, no lowercase variant at all**).
**We store:** nothing.
**Root cause class:** new — a fully real, documented vendor confirmed on this pass (page loaded cleanly, references the real `createTask` endpoint) that never entered the catalog at all. Not explained by any of the sync's known exclusion paths (family "minimax-h3" isn't an LLM segment, doesn't contain "gemini").
**Fix needed:** confirm this vendor is in KIE's sitemap; if so the sync should have picked it up — investigate why it didn't (possibly added to docs after last crawl, or nested under a URL shape `inferKieModelFromUrl` doesn't handle). Once synced, curate: `resolution` enum must be `768P`/`2K` (uppercase) — the generic schema's lowercase `480p/720p/1080p` would be entirely invalid here.

### KIE/minimax-h3/image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ❌
**DB row:** no row
**Doc says:** model `minimax-h3/image-to-video`. Params: `prompt`(req, 1–7000), `duration`(req, 4–15 int); `first_frame_url`/`last_frame_url`(conditional — at least one required, JPG/JPEG/PNG/WEBP/HEIC/HEIF), `resolution`(opt, `768P`/`2K`).
**We store:** nothing.
**Root cause class:** new (missing vendor).
**Fix needed:** same as text-to-video — investigate sync gap, add row + curated schema once present.

### KIE/minimax-h3/reference-to-video — 2026-08-05
**Studio/category:** video-r2v
**Verdict:** ❌
**DB row:** no row
**Doc says:** model `minimax-h3/reference-to-video`. Params: `prompt`(req, 1–7000), `duration`(req, 4–15); `reference_image_urls`(max 9)/`reference_video_urls`(max 3) — at least one of image/video required; `reference_audio_urls`(opt, max 3, requires an image/video also present); `aspect_ratio`(default `adaptive`), `resolution`(default `2K`, `768P`/`2K`).
**We store:** nothing.
**Root cause class:** new (missing vendor).
**Fix needed:** same as siblings.

---

## HappyHorse (`/market/happyhorse/*`) — 4 doc pages, 4 DB rows (all present)

### KIE/happyhorse/text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`happyhorse/text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req); optional `resolution`(enum `720p`/`1080p`), `aspect_ratio`(enum `16:9`/`9:16`/`1:1`/`4:3`/`3:4`), `duration`(int 3–15, default 5), `seed`.
**We store:** generic schema's `resolution` enum includes invalid `480p`; `duration` enum `[5,8,10]` includes invalid `8` (real range is 3–15 free int); missing `seed`.
**Root cause class:** #2/#8.
**Fix needed:** narrow `resolution` enum, switch `duration` to an int range, add `seed`.

### KIE/happyhorse/image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`happyhorse/image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `image_urls`(req, array — not `image_url`); optional `prompt`, `resolution`(`720p`/`1080p`), `duration`(default 5), `seed`. No `aspect_ratio`.
**We store:** wrong field name/shape (`image_url` singular required vs real `image_urls` array; `prompt` required in our schema but optional per doc); fabricates `aspect_ratio`.
**Root cause class:** #8.
**Fix needed:** curate real field shape.

### KIE/happyhorse/reference-to-video — 2026-08-05
**Studio/category:** video-r2v (correctly grouped)
**Verdict:** ⚠️
**DB row:** modelId=`happyhorse/reference-to-video` exists=yes isActive=true modelType=video capability=reference-to-video
**Doc says:** model matches. Params: `prompt`(req), `reference_image`(req, array); optional `resolution`(`720p`/`1080p`), `aspect_ratio`(default `16:9`), `duration`(default 5), `seed`.
**We store:** default r2v schema shape unknown without a curated entry — likely generic `image_url` singular, not `reference_image` array.
**Root cause class:** #8.
**Fix needed:** curate `reference_image[]` field name.

### KIE/happyhorse/video-edit — 2026-08-05
**Studio/category:** video-v2v
**Verdict:** ⚠️
**DB row:** modelId=`happyhorse/video-edit` exists=yes isActive=true modelType=v2v capability=video-to-video
**Doc says:** model matches. Params: `prompt`(req), `video_url`(req); optional `reference_image`(array), `resolution`(`720p`/`1080p`), `audio_setting`(enum `auto`/`origin`), `seed`. Video duration 3–60s, aspect ratio range "1:2.5–2.5:1" (not a fixed enum).
**We store:** generic v2v default is closest match here (`prompt`+`video_url` both present) but missing `reference_image`/`audio_setting`/`seed`, and fabricates a fixed `aspect_ratio` enum where the real constraint is a continuous ratio range.
**Root cause class:** #8.
**Fix needed:** add missing optional fields; document the ratio range instead of a fake enum.

---

## HappyHorse 1.1 (`/market/happyhorse-1-1/*`) — 3 doc pages, 3 DB rows (all present)

### KIE/happyhorse-1-1/image-to-video — 2026-08-05
**Studio/category:** video-i2v
**Verdict:** ⚠️
**DB row:** modelId=`happyhorse-1-1/image-to-video` exists=yes isActive=true modelType=i2v capability=image-to-video
**Doc says:** model matches. Params: `image_urls`(req, array); optional `prompt`, `resolution`(`720p`/`1080p`), `duration`(3–15, default 5). **No `aspect_ratio`.**
**We store:** wrong field name (`image_url` vs `image_urls`); fabricates `aspect_ratio`.
**Root cause class:** #8.
**Fix needed:** curate real fields.

### KIE/happyhorse-1-1/text-to-video — 2026-08-05
**Studio/category:** video-t2v
**Verdict:** ⚠️
**DB row:** modelId=`happyhorse-1-1/text-to-video` exists=yes isActive=true modelType=video capability=text-to-video
**Doc says:** model matches. Params: `prompt`(req); optional `resolution`(`720p`/`1080p`), `aspect_ratio`(enum incl. `4:5`/`5:4`/`9:21`/`21:9` in addition to the common set), `duration`(3–15, default 5).
**We store:** `aspect_ratio` enum missing `4:5`/`5:4`/`9:21`/`21:9`; `duration` enum wrong shape; `resolution` includes invalid `480p`.
**Root cause class:** #2.
**Fix needed:** widen enums.

### KIE/happyhorse-1-1/reference-to-video — 2026-08-05
**Studio/category:** video-r2v (correctly grouped)
**Verdict:** ⚠️
**DB row:** modelId=`happyhorse-1-1/reference-to-video` exists=yes isActive=true modelType=video capability=reference-to-video
**Doc says:** model matches. Params: `prompt`(req), `reference_image`(req, array up to 9); optional `resolution`(default `1080p`), `aspect_ratio`(default `16:9`, wide enum incl `4:5`/`5:4`/`9:21`/`21:9`), `duration`(default 5).
**We store:** likely generic singular `image_url`, not `reference_image[]` array — same shape gap as the base HappyHorse r2v model.
**Root cause class:** #8.
**Fix needed:** curate `reference_image[]`.

---

## Topaz / Infinitalk / Volcengine — single-model families, all present, real schema gaps

### KIE/topaz/video-upscale — 2026-08-05
**Studio/category:** video-v2v (upscale) — correctly grouped in `v2v: [..., "video-upscale"]`
**Verdict:** ⚠️
**DB row:** modelId=`topaz/video-upscale` exists=yes isActive=true modelType=v2v capability=video-upscale
**Doc says:** model matches. Params: `video_url`(req); optional `upscale_factor`(enum `'1'`/`'2'`/`'4'`, default `'2'`). Accepted types mp4/quicktime/x-matroska, max 50MB.
**We store:** `defaultSchemaForCapability`'s video-upscale branch gives `{video_url(req), duration, resolution, aspect_ratio}` — this model doesn't take duration/resolution/aspect_ratio at all, it takes `upscale_factor`, a field the generic schema doesn't have.
**Root cause class:** #8.
**Fix needed:** curate `{video_url, upscale_factor: enum['1','2','4']}`, drop the 3 fabricated fields.

### KIE/infinitalk/from-audio — 2026-08-05
**Studio/category:** lipsync (avatar-video, correctly grouped)
**Verdict:** ⚠️
**DB row:** modelId=`infinitalk/from-audio` exists=yes isActive=true modelType=lipsync capability=avatar-video
**Doc says:** model matches. Params: `image_url`(req), `audio_url`(req), `prompt`(req, max 5000); optional `resolution`(default `480p`, enum `480p`/`720p` only), `seed`(10000–1000000).
**We store:** generic avatar-video schema fabricates `duration`/`aspect_ratio` (this model has neither); `resolution` enum incorrectly includes `1080p`, which isn't valid for this model (only `480p`/`720p`).
**Root cause class:** #8.
**Fix needed:** curate `{image_url, audio_url, prompt, resolution: enum[480p,720p], seed}`.

### KIE/volcengine/video-to-video-lip-sync — 2026-08-05
**Studio/category:** lipsync (avatar-video) — currently mis-filed as `video-to-video`
**Verdict:** ⚠️
**DB row:** modelId=`volcengine/video-to-video-lip-sync` exists=yes isActive=true modelType=v2v capability=video-to-video
**Doc says:** model matches. Params: `mode`(req, enum `lite`/`basic`), `video_url`(req), `audio_url`(req); optional `separate_vocal`, `open_scenedet`, `align_audio`(default true), `align_audio_reverse`, `templ_start_seconds`. No duration/resolution/aspect_ratio.
**We store:** capability is `video-to-video` (lands this in the V2V studio, alongside generic video editors), not `avatar-video`/lipsync where it belongs — this is the confirmed **#9 capability-inference substring collision**: the slug `volcengine/video-to-video-lip-sync` contains the literal substring `video-to-video`, which `inferCapability`'s `VIDEO_TO_VIDEO_MARKERS` regex matches before the function ever reaches its separate `lip-sync|avatar|omnihuman|infinitalk|from-audio` check further down. Schema is also generic-v2v-shaped (`prompt`+`video_url`), missing `mode`/`audio_url`/`separate_vocal`/`open_scenedet`/`align_audio`/`align_audio_reverse`/`templ_start_seconds` entirely, and this model has no `prompt` field at all (our default schema marks `prompt` required).
**Root cause class:** #9 (capability) + #8 (schema, and a required-field-that-doesn't-exist bug: `prompt` marked required, model doesn't accept it).
**Fix needed:** reorder `inferCapability`'s checks so the lip-sync/avatar marker check runs BEFORE the video-to-video marker check (or make the video-to-video regex exclude `lip-sync`-suffixed slugs specifically); re-file this row's capability as `avatar-video`; curate the real 7-field schema with no `prompt`.

---

## Gemini Omni (`/market/gemini-omni-*`) — 3 doc pages, 0 usable DB rows — entire vendor missing

### KIE/gemini-omni-video — 2026-08-05
**Studio/category:** video-t2v/i2v (text/image/audio/character → video)
**Verdict:** ❌
**DB row:** no row of any kind
**Doc says:** model `gemini-omni-video`. Params: `prompt`(req), `duration`(req, enum `'4'`/`'6'`/`'8'`/`'10'`); optional `image_urls`, `audio_ids`, `video_list`, `character_ids`, `aspect_ratio`(`16:9`/`9:16`), `seed`, `resolution`(`720p`/`1080p`/`4k`).
**We store:** nothing.
**Root cause class:** #10 (new, high-confidence) — traced to `kie-sync.js`'s own `inferModelType(path)`, whose LLM-chat detection is `if (p.includes("chat") || p.includes("claude") || p.includes("gemini") || p.includes("grok") || p.includes("codex")) return "llm";`. Every "gemini-omni-*" market page's URL path contains the substring "gemini", so it's typed `"llm"`, and `fetchKieModels` does `if (type === "llm") continue;` unconditionally — silently dropping this real video-generation model from every sync run, forever, regardless of the `MEDIA_EXCEPTIONS` list in `model-catalog-core.mjs` (which guards a *different* check in `inferKieModelFromUrl` that never actually fires for this slug in the first place — it isn't wired to `kie-sync.js`'s independent `inferModelType`).
**Fix needed:** in `kie-sync.js`'s `inferModelType`, exempt the three known Gemini-Omni media slugs before the generic "gemini" LLM check (mirroring `MEDIA_EXCEPTIONS`, but applied in the file that actually needs it), or check `inferKieModelFromUrl`'s result first and only fall back to `inferModelType`'s LLM guess when that returned nothing.

### KIE/gemini-omni-audio — 2026-08-05
**Studio/category:** audio (voice construction, feeds `audio_ids` into gemini-omni-video/character)
**Verdict:** ❌
**DB row:** no row of any kind
**Doc says:** likely model `gemini-omni-audio` (not textually confirmed on the page itself per the research pass, but matches the file's own naming convention). Params: `audio_id`(req, enum of ~30 preset voice ids: achernar, achird, algenib, ...), `name`(req, max 210); optional `voice_description`(max 20000), `example_dialogue`(max 120). No duration/resolution/aspect_ratio — this is a voice profile constructor, not itself a generation call.
**We store:** nothing.
**Root cause class:** #10 (same "gemini" substring exclusion).
**Fix needed:** same fix as gemini-omni-video.

### KIE/gemini-omni-character — 2026-08-05
**Studio/category:** avatar/character asset construction (feeds `character_ids` into gemini-omni-video)
**Verdict:** ❌
**DB row:** legacy row `gemini-omni-character` exists but isActive=false, isDeprecated=true, modelType=uncategorized, capability=null — orphaned by the same exclusion, never refreshed by a working sync
**Doc says:** likely model `gemini-omni-character` (same caveat as audio). Params: `descriptions`(req), `image_urls`(req); optional `audio_ids`, `character_name`. Max 1 image per request, <20MB; `audio_ids` must come from the gemini-omni-audio endpoint; images must be public URLs.
**We store:** a dead legacy row from before the current slash-form sync convention, deactivated, with no capability at all — not remotely matching the real schema above.
**Root cause class:** #10.
**Fix needed:** same fix as gemini-omni-video; once fixed, this legacy row should be superseded rather than left dangling.

---

## OmniHuman 1.5 (`/market/omnihuman-1-5*`) — 3 doc pages, 2 active DB rows, root model missing

### KIE/omnihuman-1-5 (root) — 2026-08-05
**Studio/category:** lipsync (avatar-video)
**Verdict:** ❌
**DB row:** legacy flat row `omnihuman-1-5` exists but isActive=false, isDeprecated=true — no active slash-form row exists even though the two sub-model rows below (which depend on this one for their `mask_url` input) ARE active
**Doc says:** model `omnihuman-1-5`. Params: `image_url`(req), `audio_url`(req); optional `mask_url`(array, max 5 — typically produced by the `subject-detection` sub-model below), `prompt`(max ~300), `output_resolution`(enum `720`/`1080`, default `1080` — note: bare numbers, not `720p`/`1080p`), `pe_fast_mode`, `seed`(default −1).
**We store:** nothing active — an odd, asymmetric gap: the two auxiliary sub-models that exist specifically to feed this one's `mask_url` field are active, but the model they feed is not.
**Root cause class:** new — likely the same `extractModelId`/skip-logic split noted below (see human-identification entry) where the root single-segment `omnihuman-1-5` page needed at least a 2-part path (`rest.length < 2` in `inferKieModelFromUrl`) and fell through to the legacy `extractModelId` path, which never got reactivated after the old flat-id row was deprecated.
**Fix needed:** add an active row `omnihuman-1-5` with the real 5-field schema (`output_resolution` enum is bare `720`/`1080`, not `%p`-suffixed — the generic schema's `720p`/`1080p` values would be wrong even after reactivating).

### KIE/omnihuman-1-5/human-identification — 2026-08-05
**Studio/category:** lipsync-adjacent utility (produces an input for the root model, not itself a generation call)
**Verdict:** ⚠️
**DB row:** modelId=`omnihuman-1-5/human-identification` exists=yes isActive=true modelType=lipsync capability=avatar-video
**Doc says:** model `omnihuman-1-5/human-identification` — confirmed by the research pass as a genuinely independently-callable model in KIE's system (its own `model` field, its own `createTask`/`taskId`), used to help produce a `mask_url` for the root `omnihuman-1-5` call, not a documentation sub-section of it. Params: `image_url`(req, portrait JPG/PNG/JPEG, <5MB, max 4096×4096); optional `callBackUrl`.
**We store:** capability `avatar-video` groups it into the same lipsync studio pool as the actual generator, but this model produces an intermediate identification result, not a final video — a user picking it from the lipsync studio would get a non-video result. Schema also has the generic avatar-video fields (`duration`/`resolution`/`aspect_ratio` fabricated) when the real model takes only `image_url`.
**Root cause class:** #8 (schema) + a UX/studio-grouping concern (auxiliary utility mixed into the same pool as generators) worth a product decision, not purely a data bug.
**Fix needed:** curate `{image_url}` only; consider a distinct "utility" sub-kind (mirroring `audioKind()`'s pattern for audio utilities) so it doesn't present as a peer of the actual lipsync generator in end-user pickers.

### KIE/omnihuman-1-5/subject-detection — 2026-08-05
**Studio/category:** lipsync-adjacent utility
**Verdict:** ⚠️
**DB row:** modelId=`omnihuman-1-5/subject-detection` exists=yes isActive=true modelType=lipsync capability=avatar-video
**Doc says:** model `omnihuman-1-5/subject-detection`, independently callable, same shape as human-identification: `image_url`(req, portrait <5MB); optional `callBackUrl`.
**We store:** same issues as human-identification — fabricated video fields, mixed into the generator pool.
**Root cause class:** #8 + UX concern.
**Fix needed:** same as human-identification.

---

## Notes on scope items not otherwise covered

- `kie-sync.js`'s `extractModelId` function still contains an explicit `if (cleaned.includes("human-identification") || cleaned.includes("subject-detection")) return null;` skip rule — but that function is only reached as a *fallback* when `inferKieModelFromUrl` returns null, and `inferKieModelFromUrl` succeeds for both these 2-segment paths, so the skip never actually fires. The two rows exist in the DB as a result, and per this pass's doc research that's the CORRECT outcome (they are real independently-callable models) — the dead skip rule is stale code, not a live bug, but is worth deleting so a future reader doesn't assume these are filtered out when they aren't.
- No page across all 75 fetched (Kling 15, Bytedance 9, Hailuo 6, Wan 16, Grok 5, PixVerse 5, MiniMax-H3 3, HappyHorse 4, HappyHorse-1.1 3, Topaz 1, Infinitalk 1, Gemini-Omni 3, OmniHuman 3, Volcengine 1 = 75) disclosed a literal pricing rate/unit in the fetched markdown — KIE's per-model pricing appears to live on a separate pricing page, not the API reference pages themselves. `pricingRules`/`creditsCost` correctness could not be directly verified against a doc-stated rate for any model in this pass; the existing `KIE_PRICING_OVERRIDES` table in `kie-sync.js` is hand-maintained from `kie.ai/pricing`, a different source than what was fetched here.
