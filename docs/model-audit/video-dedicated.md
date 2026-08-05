# Video dedicated-API audit — Runway API + Veo3.1 API (KIE)

Scope: the two dedicated KIE video API families (Runway, Veo3.1), cross-referenced
against production `ModelPricing` rows and the current sync/provider code. Read-only
pass — no live submits, no code changes. See `docs/MODEL_AUDIT.md` bug class #6 for
background (dedicated API vs Market API confusion).

Doc source confirmed via `https://docs.kie.ai/llms.txt` (page list matches exactly the
task's given list, 8 EN pages per family + `/cn/` duplicates, no extra pages found).

## Summary

- 8 dedicated endpoints documented across Runway (`generate`, `record-detail`,
  `extend`, plus the separate Aleph v2v trio: `aleph/generate`,
  `aleph/record-info`, and the two callback pages) and Veo3.1 (`generate`,
  `record-info`, `get-1080p-video`, `get-4k-video`, `extend`, plus 3 callback pages).
- **0 ✅** — none of our `ModelPricing` rows correctly call a dedicated endpoint.
- **3 ⚠️** — `generate-ai-video`, `generate-aleph-video`, `generate-veo-3-video`:
  live, active, misfiled `modelType:"image"` rows that get routed at the generic
  Market job endpoint and 422.
- **1 additional ⚠️** — `extend-video`: also live/active, same generic-Market
  misrouting, previously not called out in `MODEL_AUDIT.md`.
- **1 ❌ (unmapped ⚠️→missing)** — `extend-ai-video`: DB row exists but is not the
  real Runway extend shape either.
- **6 legacy rows already deactivated** (`veo3`, `veo3-fast`, `veo3-i2v`,
  `veo3-extend`, `runway-aleph`, `runway-extend`) — dead placeholders from an
  older sync pass, `endpoint`/`providerModelId`/`inputSchema` all null,
  `isActive:false`, `isDeprecated:true`. Not part of the live catalog; listed for
  completeness only, no fix needed unless they get resurrected.
- **Runway `record-detail` / `record-info` / `get-1080p-video` / `get-4k-video`
  polling+retrieval endpoints have NO corresponding DB row at all** — they aren't
  "generate" verbs so `kie-sync.js`'s crawl (which keys everything off a single
  `modelId` per generate-style page) was never going to create one, and they don't
  need one: they're retrieval endpoints a per-family adapter must call directly,
  not separate catalog products.
- Root cause for all of the above is uniformly class #6: `src/lib/kie-sync.js`
  crawls the KIE sitemap and treats every page (dedicated-API or Market) as a
  generic Market model; `src/lib/providers.js`'s `kie` adapter has exactly one
  `buildUrl`, `POST /api/v1/jobs/createTask`, with no per-family branch — confirmed
  by reading both files directly (see "Code confirmation" below).

## Code confirmation

- `src/lib/kie-sync.js`: `extractModelId()` (lines 267-294) explicitly **strips**
  the `runway-api/` and `veo3-api/` URL prefixes (`cleaned.replace(/^veo3-api\//, "")...replace(/^runway-api\//, "")`)
  before taking the last path segment as `modelId` — i.e. the crawl actively
  discards the one signal that would tell it "this is a dedicated API page," and
  files the result as an ordinary Market model like anything else. `fetchKieModels()`
  (lines 306-387) has a `legacySuite` regex (`/^(suno-api|veo3-api|4o-image-api|flux-kontext-api|runway-api)\//`)
  that *recognizes* the four dedicated-API path prefixes, but the recognition is
  used only to decide whether to keep the page in the sync at all — never to route
  it through a different `endpoint`/adapter. There is no dedicated-API-aware branch
  anywhere in this file.
- `src/lib/model-catalog-core.mjs`: `inferCapability(path)` (lines 511-526) has a
  video-token list (`kling|wan|seedance|hailuo|pixverse|happyhorse|runway|veo`) that
  DOES include `runway` and `veo` — but only as the *last-resort coarse "video"*
  fallback (line 524), reached only if none of the earlier, more specific T2V/I2V/V2V
  regexes matched first. The three misfiled ids (`generate-ai-video`,
  `generate-aleph-video`, `generate-veo-3-video`) never reach that fallback at all:
  none of their slugs contain `runway`/`veo`/`kling`/etc., or any t2v/i2v/v2v marker —
  the words "ai", "aleph", and "veo-3" (with a hyphen splitting "veo" from "3") don't
  match `\bveo\b`-style tokens, so `inferCapability` falls all the way through to its
  own last resort, `"media"`... which `inferKieModelFromUrl`'s call site never even
  reaches, because these three ids are pure numeric/no-modality-marker slugs that hit
  `defaultSchemaForCapability`'s image branch via the crawl's own `inferModelType()`
  in `kie-sync.js` (line 263's default `return "image"`) upstream of capability
  inference — confirming the misfiling: it's a *classification* bug (id has no clear
  video marker to either inference rule), exactly as the task description predicted.
- `src/lib/providers.js`: `PROVIDERS.kie` (lines 114-146) has exactly one
  `buildUrl: () => "/api/v1/jobs/createTask"` and one
  `buildPollUrl: (requestId) => "/api/v1/jobs/recordInfo?taskId=" + requestId` —
  no per-family special case for Runway or Veo3 (or anything else). Every KIE
  submit, regardless of `endpoint`, goes through this single generic Market path;
  `formatPayload` always wraps params as `{ model, input: { prompt, ...rest }, callBackUrl }`,
  which matches none of the real Runway/Veo3 request bodies below (they are FLAT
  bodies — `prompt`/`duration`/`quality`/`imageUrl` etc. directly on the JSON root,
  not nested under `input`).
- `src/lib/audio-payload-core.mjs` (found at
  `C:\Users\Wael Helmi\helmies-studio\src\lib\audio-payload-core.mjs` — not present
  in this checkout's default `src/lib`, but referenced as the pattern to mirror):
  gives Suno a dedicated route + flat-body payload builder + its own poll shape,
  entirely separate from `PROVIDERS.kie`'s generic Market path. That is the shape a
  `runway-payload-core.mjs` / `veo3-payload-core.mjs` adapter needs to take.

---

## Runway API

### kie/runway-generate (`generate-ai-video`) — 2026-08-05
**Studio/category:** video (t2v when no `imageUrl`, i2v when `imageUrl` present — single endpoint, direction is a request-body branch, not two products)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`generate-ai-video` exists=yes isActive=true isDeprecated=false modelType=`image` capability=`text-to-image` endpoint=`generate-ai-video` providerModelId=`generate-ai-video` creditsCost=13
**Doc says:**
- `POST /api/v1/runway/generate` (base `https://api.kie.ai`)
- Body: `prompt` (string, required, max 1800 chars), `duration` (number, required, enum `5`|`10`), `quality` (string, required, enum `720p`|`1080p`), `imageUrl` (string, optional), `aspectRatio` (string, required for text-to-video only — omit when `imageUrl` given — enum `16:9`,`4:3`,`1:1`,`3:4`,`9:16`), `waterMark` (string, optional, `""` = none), `callBackUrl` (string, required per this page's table, though every KIE dedicated route in practice also lets it be omitted and just skips the webhook)
- Cross-field constraint: `duration=10` limits `quality` to `720p` max; `quality=1080p` limits `duration` to `5` max
- Submit response: `{ code, msg, data: { taskId } }` — task id at `data.taskId`
- Callback body: `{ code, msg, data: { task_id, video_id, video_url, image_url } }` — video URL at `data.video_url` (snake_case in the callback, camelCase `taskId` on submit — deliberate inconsistency in KIE's own docs)
- Poll (`GET /api/v1/runway/record-detail?taskId=...`): status at `data.state` (enum `wait`|`queueing`|`generating`|`success`|`fail`), video URL at `data.videoInfo.videoUrl`
- Pricing unit not stated on this page (KIE's public pricing page would need a separate check; out of scope here)
**We actually send:** generic Market job endpoint via `PROVIDERS.kie.buildUrl()` → `POST /api/v1/jobs/createTask` with body `{ model: "generate-ai-video", input: { prompt, num_images, resolution, aspect_ratio }, callBackUrl }` (from `submitOnly` in `src/lib/providers.js`). Wrong path (`/api/v1/jobs/createTask` instead of `/api/v1/runway/generate`), wrong body shape (nested `input` instead of flat; fabricated `resolution`/`num_images` fields that don't exist on this endpoint at all — this is an IMAGE schema, `defaultSchemaForCapability("text-to-image")`, applied to what is actually a video generator), and missing the real required fields `duration`/`quality`/`aspectRatio`. This is the exact 422 "model name not supported" failure noted in the task's known context.
**Root cause class:** #6 (dedicated vs Market confusion), compounded by the id-has-no-video-marker capability-misfiling bug described under "Code confirmation" above (`inferCapability("generate-ai-video")` → falls through to the image default).
**Fix needed:** (1) fix `modelType`/`capability` to `video`/`text-to-video` (or split into `image-to-video` when `imageUrl` supplied — likely simplest as one row with a conditional required field, matching the real API's own single-endpoint two-mode design); (2) build `src/lib/runway-payload-core.mjs` mirroring `audio-payload-core.mjs`'s shape: a flat-body payload builder producing `{ prompt, duration, quality, imageUrl?, aspectRatio?, waterMark?, callBackUrl }`, targeting `POST /api/v1/runway/generate`, with a dedicated poll adapter hitting `GET /api/v1/runway/record-detail?taskId=...` and reading `data.state`/`data.videoInfo.videoUrl`; (3) real `inputSchema` fields: `prompt` (string, required, maxLength 1800), `duration` (number, required, enum [5,10]), `quality` (string, required, enum ["720p","1080p"]), `imageUrl` (string, optional, uri), `aspectRatio` (string, conditionally required, enum ["16:9","4:3","1:1","3:4","9:16"]), `waterMark` (string, optional), plus a validation rule for the duration/quality cross-constraint.

### kie/runway-extend (`extend-ai-video`) — 2026-08-05
**Studio/category:** video (v2v — extends an existing generated clip)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`extend-ai-video` exists=yes isActive=true isDeprecated=false modelType=`video` capability=`text-to-video` endpoint=`extend-ai-video` providerModelId=`extend-ai-video` creditsCost=13
**Doc says:**
- `POST /api/v1/runway/extend`
- Body: `taskId` (string, required — must be a task ID from a prior `generate-ai-video` call, NOT a video URL), `prompt` (string, required), `quality` (string, required, enum `720p`|`1080p`), `waterMark` (string, optional), `callBackUrl` (string, optional)
- Submit response: `{ code, msg, data: { taskId } }`
- Callback: `{ code, msg, data: { image_url, task_id, video_id, video_url } }` — video at `data.video_url`
**We actually send:** generic Market job endpoint, body `{ model: "extend-ai-video", input: { prompt, duration, resolution, aspect_ratio }, callBackUrl }`. Wrong path, wrong shape, and — critically — this endpoint has no way to accept a `taskId` at all in the current schema (`duration`/`resolution`/`aspect_ratio` don't exist on the real extend endpoint; the real required field `taskId` referencing a prior Runway generation is entirely absent). Even if routed correctly, our studio has no UI concept of "which prior generation to extend" for this model, similar to the Suno "missing upload/source step" gap noted in `MODEL_AUDIT.md` bug class #6's closing paragraph.
**Root cause class:** #6, plus a UI/data gap (no way to reference a source `taskId`) analogous to the Suno "missing source track" gap.
**Fix needed:** modelType/capability already correctly `video`/`text-to-video` (leave as-is, though `video-to-video` may describe it more precisely since it operates on an existing clip, not from scratch — cross-check the studio's `extend-*` grouping convention before renaming). Needs a `runway-payload-core.mjs` extend route to `POST /api/v1/runway/extend` with body `{ taskId, prompt, quality, waterMark?, callBackUrl? }`, PLUS a UI/data change: the extend flow must let the user pick a prior Runway generation's `taskId` (persisted from that job's `submitData`), not send our own generic `duration`/`resolution` params. Until that UI exists, this is functionally unreachable even after the route is fixed — flag for the same follow-up as Suno's extend/cover flows.

### kie/runway-aleph-generate (`generate-aleph-video`) — 2026-08-05
**Studio/category:** video-v2v (Aleph is Runway's video-to-video style-transform model)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`generate-aleph-video` exists=yes isActive=true isDeprecated=false modelType=`image` capability=`text-to-image` endpoint=`generate-aleph-video` providerModelId=`generate-aleph-video` creditsCost=8
**Doc says:**
- `POST /api/v1/aleph/generate` (note: different path family than the other two Runway endpoints — `/api/v1/aleph/*`, not `/api/v1/runway/*`)
- Body: `prompt` (string, required), `videoUrl` (string, required — the source clip to transform), `callBackUrl` (optional), `waterMark` (optional), `uploadCn` (boolean, optional, default false), `aspectRatio` (optional, enum `16:9`,`9:16`,`4:3`,`3:4`,`1:1`,`21:9`), `seed` (integer, optional), `referenceImage` (string/uri, optional)
- Submit response: `{ code, msg, data: { taskId } }`
- Callback: `{ code, msg, data: { result_video_url, result_image_url }, taskId }` — note the callback's own field names (`result_video_url`) differ from the other two Runway callbacks (`video_url`) — do not assume a shared callback parser across the three Runway routes
- Poll (`GET /api/v1/aleph/record-info?taskId=...`): video at `data.response.resultVideoUrl`, thumbnail at `data.response.resultImageUrl`, status at `data.successFlag` (0=in progress/failed, 1=success — distinct 3-level semantics not spelled out beyond 0/1 on this page; `errorCode`/`errorMessage` populate on failure)
**We actually send:** generic Market job endpoint, body `{ model: "generate-aleph-video", input: { prompt, num_images, resolution, aspect_ratio }, callBackUrl }`. Wrong path entirely (not even `/api/v1/runway/*` — it's `/api/v1/aleph/*`), wrong body (missing required `videoUrl` entirely — this is a v2v model with no video-to-transform in an image schema), fabricated `resolution`/`num_images`.
**Root cause class:** #6, same capability-misfiling mechanism as `generate-ai-video` (the id `generate-aleph-video` also contains no t2v/i2v/v2v marker token — "aleph" is an opaque product name to the current regex-based inference).
**Fix needed:** fix modelType/capability to `v2v`/`video-to-video`; build the Aleph-specific submit/poll pair (can live in the same `runway-payload-core.mjs` file as a second route, since it shares the Runway family conceptually even though its literal path prefix is `/api/v1/aleph/` not `/api/v1/runway/`) targeting `POST /api/v1/aleph/generate` with body `{ prompt, videoUrl, aspectRatio?, waterMark?, uploadCn?, seed?, referenceImage?, callBackUrl? }` and poll `GET /api/v1/aleph/record-info?taskId=...` reading `data.response.resultVideoUrl`/`data.successFlag`. Real `inputSchema`: `prompt` (required), `videoUrl` (required, uri), `aspectRatio` (optional, enum `["16:9","9:16","4:3","3:4","1:1","21:9"]` — note `21:9` is NOT in our current fabricated enum), `seed` (optional, number), `referenceImage` (optional, uri).

### kie/runway-get-ai-video-details (`GET /api/v1/runway/record-detail`) — 2026-08-05
**Studio/category:** video (polling/retrieval endpoint, not a generation product)
**Verdict:** ❌ missing (no DB row expected or needed — see note)
**DB row:** n/a — no `ModelPricing` row exists or should exist for a poll-only endpoint
**Doc says:** `GET /api/v1/runway/record-detail?taskId=...`, response `{ code, msg, data: { taskId, parentTaskId, generateParam, state, generateTime, videoInfo, failCode, failMsg, expireFlag } }`; video at `data.videoInfo.videoUrl`; status at `data.state` (`wait`|`queueing`|`generating`|`success`|`fail`)
**We actually send:** nothing — no code path calls this endpoint at all; `PROVIDERS.kie.buildPollUrl` always builds `/api/v1/jobs/recordInfo` regardless of which family submitted the job.
**Root cause class:** #6 — this is the poll-side half of the missing Runway adapter, not a separate catalog bug.
**Fix needed:** the `runway-payload-core.mjs` adapter's poll function must call this endpoint (not the generic Market recordInfo) whenever the originating job was a Runway `generate`/`extend` submit — needs a way for `job-runner.js`/`providers.js` to know which poll URL builder to use per job, keyed off the model's family (Suno's dedicated-route pattern already establishes this precedent).

### kie/runway-get-aleph-video-details (`GET /api/v1/aleph/record-info`) — 2026-08-05
**Studio/category:** video-v2v (polling/retrieval endpoint)
**Verdict:** ❌ missing (no DB row expected — poll-only endpoint, same as above)
**DB row:** n/a
**Doc says:** `GET /api/v1/aleph/record-info?taskId=...`, response nests under `data.response.{resultVideoUrl,resultImageUrl}`, status `data.successFlag`, plus `errorCode`/`errorMessage`/`completeTime`/`createTime`
**We actually send:** nothing — same gap as above, and note the response shape differs from the other Runway poll endpoint (`data.videoInfo.videoUrl` vs `data.response.resultVideoUrl`) — a shared parser would be wrong for one of the two.
**Root cause class:** #6.
**Fix needed:** same adapter file, separate poll function per the Aleph route's distinct response shape — do not reuse the `generate-ai-video`/`extend-ai-video` poll parser for Aleph jobs.

---

## Veo3.1 API

### kie/veo3-generate (`generate-veo-3-video`) — 2026-08-05
**Studio/category:** video (t2v by default; i2v/reference modes selectable via `generationType` — again one endpoint covering several directions via a body field, not separate products)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`generate-veo-3-video` exists=yes isActive=true isDeprecated=false modelType=`image` capability=`text-to-image` endpoint=`generate-veo-3-video` providerModelId=`generate-veo-3-video` creditsCost=8
**Doc says:**
- `POST /api/v1/veo/generate`
- Body: `prompt` (string, required), `imageUrls` (array, optional, 1-2 URLs — 1 for "dynamic unfold", 2 for first/last-frame transition), `model` (string, optional, enum `veo3`|`veo3_fast` (default)|`veo3_lite` — this is KIE's internal quality-tier selector, distinct from our DB's `modelId`), `generationType` (string, optional, enum `TEXT_2_VIDEO`|`FIRST_AND_LAST_FRAMES_2_VIDEO`|`REFERENCE_2_VIDEO`), `aspect_ratio` (string, optional, enum `16:9` (default)|`9:16`|`Auto` — note **snake_case**, unlike Runway's camelCase `aspectRatio`), `resolution` (string, optional, enum `720p` (default)|`1080p`|`4k`), `duration` (integer, optional, enum `4`|`6`|`8` (default)), `callBackUrl` (optional), `enableTranslation` (boolean, optional, default false), `watermark` (string, optional), `enableFallback` (boolean, optional, deprecated)
- Submit response: `{ code, msg, data: { taskId } }`
- Callback: `{ code, msg, data: { taskId, info: { resultUrls: [...], originUrls: [...] }, fallbackFlag } }` — video URLs at `data.info.resultUrls` (array); `originUrls` holds the original-aspect-ratio version when not 16:9
- Poll (`GET /api/v1/veo/record-info?taskId=...`): status at `data.successFlag` (0=generating, 1=success, 2=failed, 3=generation failed — 4 distinct values, not a simple boolean), primary video URLs at `data.response.fullResultUrls`, also `data.response.resultUrls`/`originUrls`, resolution at `data.response.resolution`
- Pricing: "25% of the official Google pricing"; 4K costs ~2x a Fast-mode generation — no flat per-video unit stated
- **This is the "resolution requested inline but delivered via separate retrieval endpoints" behavior the task flagged as unusual**: requesting `resolution: "1080p"` or `"4k"` on the generate call does NOT put the 1080p/4k file directly in the callback/poll response — those still return the base (720p) `resultUrls`. The actual 1080p/4k asset must be fetched via the two separate endpoints below, and only after the base task reports success.
**We actually send:** generic Market job endpoint, body `{ model: "generate-veo-3-video", input: { prompt, num_images, resolution, aspect_ratio }, callBackUrl }` — wrong path (`/api/v1/jobs/createTask` vs `/api/v1/veo/generate`), wrong shape (nested `input`, and note the DB's `resolution` enum `["1k","2k","4k"]` is fabricated — the real values are `"720p"/"1080p"/"4k"`, and `num_images` doesn't exist on this endpoint at all — this is another image schema misapplied to a video model), missing `duration`/`generationType`/`imageUrls`/`model` fields entirely.
**Root cause class:** #6, same capability-misfiling pattern (`generate-veo-3-video`'s slug has no `\bveo\b`-matching token because of the `-3-` splitting it, per the "Code confirmation" analysis above).
**Fix needed:** fix modelType/capability to `video`/`text-to-video`; build `veo3-payload-core.mjs` (or a `veo3` route inside a shared `runway-payload-core.mjs`-style file) targeting `POST /api/v1/veo/generate` with the real flat body above; poll adapter must call `GET /api/v1/veo/record-info` and parse `data.successFlag`/`data.response.fullResultUrls`, NOT the generic `parsePoll`. Real `inputSchema`: `prompt` (required), `imageUrls` (optional, array of uri, maxItems 2), `model` (optional, enum `["veo3","veo3_fast","veo3_lite"]`), `generationType` (optional, enum `["TEXT_2_VIDEO","FIRST_AND_LAST_FRAMES_2_VIDEO","REFERENCE_2_VIDEO"]`), `aspect_ratio` (optional, enum `["16:9","9:16","Auto"]`), `resolution` (optional, enum `["720p","1080p","4k"]`), `duration` (optional, enum `[4,6,8]`), `watermark` (optional), `enableTranslation` (optional, boolean).

### kie/veo3-get-1080p (`GET /api/v1/veo/get-1080p-video`) — 2026-08-05
**Studio/category:** video (retrieval endpoint — separate 1080p tier fetch, the "unusual" behavior flagged in the task)
**Verdict:** ❌ missing (no DB row expected, but its absence from the pipeline is a real functional gap, not just a missing catalog entry)
**DB row:** n/a
**Doc says:** `GET /api/v1/veo/get-1080p-video?taskId=...&index=0` (taskId required, index optional default 0). Response `{ code, msg, data: { resultUrl } }` — a single URL, not an array. Prerequisite: base generation task must have already completed successfully; "1080P generation requires extra processing time — typically ~1-3 minutes" and callers should retry on non-200 with 20-30s intervals. Only valid when the base call's `aspect_ratio` was 16:9 (implied by the base quickstart's summary of this endpoint: "Obtains high-definition 1080P video (16:9 ratio)").
**We actually send:** nothing — the entire concept of a follow-up retrieval call for a higher resolution tier does not exist anywhere in `job-runner.js`/`providers.js`; a job is considered complete the moment the base poll returns success with whatever `outputs` it has.
**Root cause class:** #6, but also a structural gap beyond routing — even a correctly-routed `veo3-payload-core.mjs` needs NEW logic to (a) know the user requested 1080p, (b) wait for base success, (c) issue this second call, (d) retry it on non-200 for up to a few minutes, before the job can be marked truly complete. This is more than a payload-shape fix.
**Fix needed:** in the Veo3 adapter, after base-task success, if the request's `resolution` was `1080p`, poll `GET /api/v1/veo/get-1080p-video?taskId=...` (retry ~20-30s intervals, bounded attempts) and use its `data.resultUrl` as the final output instead of the base `resultUrls`; only then mark the job's outputs. Needs its own state — this can't just be `defaultParsePoll`.

### kie/veo3-get-4k (`POST /api/v1/veo/get-4k-video`) — 2026-08-05
**Studio/category:** video (retrieval endpoint — separate 4K tier fetch)
**Verdict:** ❌ missing (same class as 1080p above)
**DB row:** n/a
**Doc says:** unusually a **POST**, not GET (differs from the 1080p endpoint's GET) — `POST /api/v1/veo/get-4k-video` with JSON body `{ taskId (required), index? (default 0), callBackUrl? }`. Response `{ code, msg, data: { taskId, resultUrls: [...], imageUrls: [...] } }` — 4K URLs at `data.resultUrls` (array, unlike 1080p's single `resultUrl`). Prerequisites: base task complete, sufficient credits (~2x Fast-mode cost), aspect ratio must be 16:9 or 9:16, "requires significant extra processing time — typically ~5-10 minutes"; docs explicitly recommend using `callBackUrl` instead of polling given the long wait. Separate callback page (`get-veo-3-4k-video-callbacks.md`) documents that callback: `{ code, msg, data: { taskId, info: { resultUrls: [...], imageUrls: [...] } } }`, code 200 = "4K Video generated successfully", 500 = "The 4K version of this video is unavailable".
**We actually send:** nothing — same gap as 1080p, compounded by this endpoint being POST-with-its-own-callback rather than a simple GET poll, so it needs its own webhook receiver route too (or a dedicated internal poll loop if callbacks aren't used).
**Root cause class:** #6 + structural gap, same as 1080p entry.
**Fix needed:** same pattern as 1080p but bigger: when `resolution: "4k"` was requested, after base success, POST `/api/v1/veo/get-4k-video` with `{ taskId, callBackUrl }`; either register a second webhook path to receive the 4K callback (mirroring `generation-complete`'s existing webhook route, keyed by taskId) or poll with long (30s+) intervals for up to ~10 minutes. Given the existing webhook infra (`callBackUrl` param already flows through `formatPayload`), reusing the webhook path is more consistent with how the rest of the app already works than adding a long-lived poll loop.

### kie/veo3-extend (`extend-video`) — 2026-08-05
**Studio/category:** video (extends a completed Veo3 generation)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`extend-video` exists=yes isActive=true isDeprecated=false modelType=`video` capability=`text-to-video` endpoint=`extend-video` providerModelId=`extend-video` creditsCost=75 (note: this is far higher than any other model in this audit — worth a separate pricing sanity check once the routing is fixed, since 75 credits with no real request going through means this number was never validated against an actual provider cost)
**Doc says:**
- `POST /api/v1/veo/extend`
- Body: `taskId` (string, required, format `veo_task_*` — must reference a prior successful `generate-veo-3-video` task), `prompt` (string, required), `seeds` (integer, optional, range 10000-99999), `model` (string, optional, enum `fast` (default)|`quality`|`lite` — note this is a DIFFERENT enum than the generate endpoint's `model` field (`veo3`/`veo3_fast`/`veo3_lite`) despite the same field name), `watermark` (optional), `callBackUrl` (optional)
- Submit response: `{ code, msg, data: { taskId } }`
**We actually send:** generic Market job endpoint, body `{ model: "extend-video", input: { prompt, duration, resolution, aspect_ratio }, callBackUrl }`. Wrong path, wrong body, and — like Runway's extend — missing the required `taskId` referencing a prior generation entirely; our schema has no field for it. Same "no source task to extend" UI/data gap as `extend-ai-video`.
**Root cause class:** #6, plus the same missing-source-reference UI gap as Runway's extend.
**Fix needed:** build the Veo3 extend route in the adapter targeting `POST /api/v1/veo/extend` with `{ taskId, prompt, seeds?, model? (fast|quality|lite), watermark?, callBackUrl? }`; needs the same "pick a prior Veo3 generation to extend" UI capability as Runway's extend. Also re-validate the `creditsCost: 75` once a real request can succeed — it's a clear outlier next to every other row in this audit (8-13 credits) and was likely never checked against `KIE_PRICING_OVERRIDES`/`DEFAULT_PRICING` (neither table in `kie-sync.js` has an `extend-video`-specific entry, so this number's origin is unclear and should be re-derived from real Veo3 pricing, not assumed correct).

### kie/veo3-get-video-details (`GET /api/v1/veo/record-info`) — 2026-08-05
**Studio/category:** video (polling/retrieval endpoint)
**Verdict:** ❌ missing (no DB row expected — poll-only endpoint)
**DB row:** n/a
**Doc says:** covered fully under `generate-veo-3-video`'s entry above (same endpoint backs polling for both generate and extend jobs). Status at `data.successFlag` (0/1/2/3), video at `data.response.fullResultUrls`.
**We actually send:** `PROVIDERS.kie.buildPollUrl` always builds the generic `/api/v1/jobs/recordInfo`, never `/api/v1/veo/record-info`.
**Root cause class:** #6.
**Fix needed:** same adapter-level poll routing fix as Runway's `record-detail` entry above — needs a per-family poll URL, not the shared generic one.

---

## Legacy deactivated placeholder rows (context only, no action needed)

These six rows are already `isActive:false, isDeprecated:true` with `endpoint`,
`providerModelId`, and `inputSchema` all `null` — remnants of an earlier sync pass
(likely from when `kie-sync.js`'s `legacySuite` regex first recognized the
`runway-api`/`veo3-api` URL prefixes but before the current `extractModelId`
prefix-stripping logic existed). They are correctly inert and not part of the live
catalog; nothing here contradicts the analysis above.

| modelId | modelType | capability | isActive | isDeprecated |
|---|---|---|---|---|
| `veo3` | video | video | false | true |
| `veo3-fast` | video | video | false | true |
| `veo3-i2v` | video | video | false | true |
| `veo3-extend` | video | video | false | true |
| `runway-aleph` | video | video | false | true |
| `runway-extend` | video | video | false | true |

No fix needed unless a future sync pass resurrects one of these ids — if so, it
should be pointed at the real dedicated-API adapter described above rather than
re-filled with a Market-style schema.
