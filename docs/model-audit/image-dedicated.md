# Image — Dedicated KIE APIs audit (4o Image API, Flux Kontext API)

Scope: the two DEDICATED image endpoints (each with its own request/response/callback
shape, distinct from the generic Market job endpoint `/api/v1/jobs/createTask` +
`/api/v1/jobs/recordInfo`). Read-only pass — no live API calls made, no code changed,
no commits. See `docs/MODEL_AUDIT.md` for the 6 known bug classes referenced below.

Pages fetched: `4o-image-api/{quickstart,generate-4-o-image,generate-4-o-image-callbacks,
get-4-o-image-details,get-4-o-image-download-url}.md`,
`flux-kontext-api/{quickstart,generate-or-edit-image,generate-or-edit-image-callbacks,
get-image-details}.md`. `https://docs.kie.ai/llms-full.txt` returned 404 — the page list
above (given in the task) is what was used; nothing extra was discovered on the sitemap
for these two families beyond what's already covered.

## Summary

| Verdict | Count |
|---|---|
| ✅ exists, correct | 0 |
| ❌ missing | 0 |
| ⚠️ exists, wrong logic | 2 |

Both real models in this scope have a live, **active** `ModelPricing` row, so neither is
"missing" in the narrow sense — but both rows are unreachable as configured: they're
routed through the generic Market job endpoint with a fabricated generic schema, not the
dedicated endpoint + real param names the docs specify. Functionally these are dead
(every real submit attempt against them should either 422 or send wrong fields), but
per the task's own verdict definitions ("row exists, IS reachable [DB-wise], something is
wrong") they're logged as ⚠️ rather than ❌ — the row is real and active, the *routing* is
wrong. Treat this as more urgent than a typical ⚠️: unlike most ⚠️ entries these are not
"one wrong enum casing", they're "wrong HTTP endpoint and wrong request envelope
entirely," which is functionally equivalent to ❌.

---

### kie/generate-4-o-image — 2026-08-05
**Studio/category:** image (text-to-image / image-to-image via GPT-4o)
**Verdict:** ⚠️ (functionally ❌ — unreachable as configured)
**DB row:** modelId=`generate-4-o-image` exists=yes isActive=true isDeprecated=false capability=`text-to-image` modelType=`image` endpoint=`generate-4-o-image` providerModelId=`generate-4-o-image` creditsCost=8 sourceUrl=`https://docs.kie.ai/4o-image-api/generate-4-o-image`

**Doc says:**
- `POST /api/v1/gpt4o-image/generate` (base `https://api.kie.ai`) — dedicated endpoint, flat JSON body (not the Market `{model, input:{...}}` envelope).
- Required: `size` (string enum) — `"1:1"`, `"3:2"`, or `"2:3"`.
- At least one of `prompt` (string) or `filesUrl` (array, up to 5 URLs) required.
- Optional: `filesUrl` (array of image URLs), `maskUrl` (string, edit-region mask), `nVariants` (integer: 1/2/4), `isEnhance` (bool, default false), `enableFallback` (bool, default false), `fallbackModel` (`"FLUX_MAX"` | `"GPT_IMAGE_1"`), `callBackUrl` (string), and the deprecated `fileUrl` (use `filesUrl` instead).
- Poll: `GET /api/v1/gpt4o-image/record-info?taskId=...` → `data.status` in `GENERATING` / `SUCCESS` / `CREATE_TASK_FAILED` / `GENERATE_FAILED`; also `data.successFlag` (0/1/2, note: doc text conflicts slightly between "2=failed" on the summary page vs the two named failure statuses on the details page — either way 1=success). Output URL: `data.response.resultUrls[]`.
- Callback payload (POST to `callBackUrl`): `{code, msg, data:{taskId, info:{result_urls:[...]}}}` — note callback field is snake_case `result_urls` while the polling endpoint uses camelCase `resultUrls` — genuinely different casing between the two delivery mechanisms, not a doc typo (repeated consistently across 3 separate fetched pages).
- `POST /api/v1/gpt4o-image/download-url` — separate helper, body `{taskId, url}`, returns a signed download link valid 20 minutes. Not itself a generation model; correctly has no catalog row (kie-sync.js's `extractModelId` explicitly excludes any path containing `download-url`).
- No pricing/credit figures published in the docs for this family.

**We actually send:** `src/lib/providers.js`'s `PROVIDERS.kie` adapter has no per-family branching — `buildUrl()` unconditionally returns `/api/v1/jobs/createTask` and `formatPayload()` unconditionally wraps everything as `{model, input:{prompt, ...rest}, callBackUrl}` (lines ~119-127). So a submit for this model goes to the generic Market job endpoint with `model:"generate-4-o-image"` — a doc-page slug, not a real KIE Market catalog id, which the real API rejects (`422 "model name...not supported"`, the exact class-1 failure mode already documented). Even setting that aside, the row's `inputSchema` (`src/lib/model-catalog-core.mjs`'s `defaultSchemaForCapability`, since `curatedSchemaEntry()` has no entry for `generate-4-o-image`) offers `aspect_ratio` (enum `1:1,4:3,3:4,16:9,9:16`) and `resolution` (enum `1k,2k,4k`) — neither of which exists on the real API. The real required field `size` (enum `1:1,3:2,2:3`) is entirely absent from the schema, so `applyRequiredDefaults` (`src/lib/provider-payload-core.mjs`) has nothing to fill even if the endpoint were fixed.
**Root cause class:** #6 (dedicated API vs Market API confusion) compounded by #2 (fabricated parameter values) and #1 (docs-sitemap slug as modelId) — all three apply to this one row simultaneously.
**Fix needed:** Give `PROVIDERS.kie` (or a new adapter) a per-endpoint branch keyed on modelId/family that POSTs `{prompt, size, filesUrl, maskUrl, nVariants, isEnhance, enableFallback, fallbackModel, callBackUrl}` to `/api/v1/gpt4o-image/generate` and polls `/api/v1/gpt4o-image/record-info?taskId=` reading `data.response.resultUrls`; replace the row's `inputSchema` with the real `size` enum instead of the fabricated `aspect_ratio`/`resolution` pair.

---

### kie/generate-or-edit-image (Flux Kontext Pro / Max) — 2026-08-05
**Studio/category:** image (text-to-image + image-editing, one endpoint selects tier via a `model` param)
**Verdict:** ⚠️ (functionally ❌ — unreachable as configured)
**DB row:** modelId=`generate-or-edit-image` exists=yes isActive=true isDeprecated=false capability=`image-to-image` modelType=`i2i` endpoint=`generate-or-edit-image` providerModelId=`generate-or-edit-image` creditsCost=10 sourceUrl=`https://docs.kie.ai/flux-kontext-api/generate-or-edit-image`

**Doc says:**
- `POST /api/v1/flux/kontext/generate` (base `https://api.kie.ai`) — dedicated endpoint, flat JSON body.
- Only truly required field: `prompt` (string).
- `inputImage` (string URI) is optional and only activates edit mode when present — this is a single generate-or-edit endpoint, not two, and it does NOT require an image (contradicts our row's capability/schema, see below).
- `model` (string enum, default `flux-kontext-pro`): `flux-kontext-pro` | `flux-kontext-max` — this is the tier selector; Pro and Max are NOT separate endpoints/catalog rows in the real API, they're one param.
- `aspectRatio` (camelCase!) enum: `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `16:21` (default `16:9`) — 7 values, and note the presence of `16:21` alongside `9:16` (two different "tall" ratios, not a typo).
- `outputFormat` enum: `jpeg` (default), `png`.
- `promptUpsampling` (bool, default false), `enableTranslation` (bool, default true), `safetyTolerance` (integer, 0-6 for generation / 0-2 for editing, default 2), `uploadCn` (bool, default false), `watermark` (string), `callBackUrl` (string).
- Poll: `GET /api/v1/flux/kontext/record-info?taskId=...` → `data.successFlag` 0=GENERATING, 1=SUCCESS, 2=CREATE_TASK_FAILED, 3=GENERATE_FAILED. Output URLs: `data.response.resultImageUrl` (persistent, 14-day expiry) and `data.response.originImageUrl` (echo of input, valid only 10 minutes — don't treat as a durable output).
- Callback payload: `{code, msg, data:{taskId, info:{resultImageUrl, originImageUrl}}}` — camelCase, singular (one image per task, not an array like the 4o family).
- No pricing/credit figures published in the docs for this family.

**We actually send:** Same generic-adapter problem as `generate-4-o-image` — `providers.js` sends `model:"generate-or-edit-image"` to `/api/v1/jobs/createTask`, a doc-slug the Market catalog doesn't recognize (class #1/#6). The stored `inputSchema` is the fabricated `defaultSchemaForCapability("image-to-image")` output (`curatedSchemaEntry()` has no entry for this modelId either): `prompt` (required), `image_url` (required, wrong name — real param is `inputImage` and it's optional, not required), `aspect_ratio` snake_case (wrong casing and wrong enum — ours has 5 values `1:1,4:3,3:4,16:9,9:16`, real has 7 including `21:9`/`16:21`), `resolution` enum `1k/2k/4k` (does not exist on the real API at all — Flux Kontext has no resolution/quality-tier param), `num_images` (does not exist — Flux Kontext returns exactly one image per task). Also: **the row's `capability`/`modelType` (`image-to-image`/`i2i`) is itself wrong** — because `image_url` is marked `required:true`, this model is filed as edit-only and would never appear in a pure text-to-image studio, but the real endpoint's primary/default mode is text-to-image (`inputImage` optional). Separately, `model` (the pro/max tier selector) is entirely missing from the schema, so there is no way for a user to reach Flux Kontext Max at all through this row — only whatever KIE's undocumented default is on an already-broken endpoint.
**Root cause class:** #6 (dedicated vs Market confusion) + #2 (fabricated params, wrong casing/enum) + #5-adjacent (capability misfiling: forced into image-to-image-only despite being primarily a text-to-image model with optional edit mode).
**Fix needed:** Add a dedicated-endpoint branch (`/api/v1/flux/kontext/generate` + `/api/v1/flux/kontext/record-info`) sending `{prompt, model, aspectRatio, outputFormat, inputImage?, promptUpsampling?, enableTranslation?, safetyTolerance?, watermark?, callBackUrl}`; change capability/modelType to `text-to-image`/`image` (or split into two rows, `flux-kontext-pro` and `flux-kontext-max`, differing only in the `model` field's fixed value) with `inputImage` optional; fix `aspectRatio` casing/enum; drop the fabricated `resolution`/`num_images` fields.

---

## Notes on adjacent legacy state (not separately scored — same two real models, no new catalog rows)

- `ModelPricing` already has 4 **deactivated** rows that were clearly probed and correctly killed against the generic Market endpoint for this exact family: `flux-kontext-pro`, `flux-kontext-dev`, `flux-kontext-pro-edit`, `flux-kontext-dev-edit` (all `isActive:false`, `isDeprecated:true`, `endpoint:null`, `inputSchema:null`). `flux-kontext-dev` is not part of the dedicated Flux Kontext API doc scope (Pro/Max only) — it looks like a separate Market-catalog slug and is out of scope here, noted only because its name is easy to confuse with the two real entries above.
- `src/lib/models.js` (a separate, older static catalog used by `src/lib/canvas-compiler.js` for the visual editor) still hardcodes `flux-kontext-dev` / `flux-kontext-pro` with `endpoint: "flux-kontext-pro"` etc. — i.e. a second, independent source of truth that predates the DB-driven `ModelPricing` system and still points at the same broken (generic-endpoint) routing. Not scored as its own catalog entry since it doesn't correspond to a `ModelPricing` row, but worth flagging: if `canvas-compiler.js`'s output ever reaches `submitOnly()` with these ids, it hits the identical class-6 bug.
- No catalog row of any kind exists for `4o-image-api/get-4-o-image-download-url` or `flux-kontext-api`'s callback page — correct, since neither is a generation model (kie-sync.js's crawler explicitly filters `download-url`, `callbacks`, `details`, `quickstart` paths out of model discovery).

## Most important finding

Both dedicated image families are **currently active in the live catalog** (not merely
missing) and would fail on submission today: `providers.js`'s `PROVIDERS.kie` adapter
has exactly one hardcoded route (`/api/v1/jobs/createTask` + `/api/v1/jobs/recordInfo`)
with no per-family branching, so every request for `generate-4-o-image` or
`generate-or-edit-image` goes out with the wrong endpoint, the wrong request envelope,
and a fabricated generic schema (`aspect_ratio`/`resolution`/`num_images` instead of the
real `size` or `aspectRatio`/`model`/`inputImage`). Unlike the already-deactivated
`flux-kontext-pro`/`flux-kontext-dev` rows, these two have evidently never been run
through `scripts/verify-catalog.mjs`'s probe-and-deactivate sweep, so end users can
currently select "GPT-4o Image" or the Flux Kontext editor in the product and spend
an attempt on a request that cannot succeed.
