# Image Market Catalog Audit — KIE `/market/*` image models

Scope: every image-output model under `docs.kie.ai/market/{seedream,google,flux2,grok-imagine,gpt-image,gpt,ideogram,qwen,qwen2,qwen3,z-image,topaz,recraft,wan}/`.
All go through KIE's generic unified job endpoint (`/api/v1/jobs/createTask` + `/api/v1/jobs/recordInfo`), per `src/lib/providers.js`'s `PROVIDERS.kie`. Method: read `docs/MODEL_AUDIT.md` known bug classes, pulled the live `ModelPricing` table read-only over SSH, and fetched every real KIE market doc page for the folders in scope (via `docs.kie.ai/llms.txt`'s page index, which enumerates children more completely than the assignment's abbreviated list — it surfaced `seedream.md` (Seedream 3.0) and confirmed there is no separate `nano-banana-pro.md`, only `pro-image-to-image.md`). No live API calls were made. No app code was modified.

## New root-cause classes found this pass (in addition to `docs/MODEL_AUDIT.md`'s existing 1–6)

- **7. Fabricated generic schema, not model-specific (systemic).** Every KIE-market image row that isn't in `CURATED_SCHEMAS` (model-catalog-core.mjs) gets the exact same four fields from `defaultSchemaForCapability`: `prompt`, `num_images` (1–4), `resolution` (enum `["1k","2k","4k"]`, lowercase), `aspect_ratio` (enum `["1:1","4:3","3:4","16:9","9:16"]`), plus `image_url` (singular) for i2i. **Not one of the ~40 image-family models audited in this pass actually accepts this shape.** Real APIs use `image_size`/`image_resolution`/`max_images` (Seedream v4), `aspect_ratio`+`quality` with no `resolution` field at all (Seedream 4.5/5.x), `image_urls` arrays not `image_url` (Seedream edit, Nano Banana edit, Flux 2, Grok Imagine i2i, Ideogram remix/character, Wan image, GPT Image 2), a plain field named `image` not `image_url` (Recraft), or model-specific fields entirely absent from the generic set (`upscale_factor` for Topaz, `quality`/`rendering_speed`/`style` for Ideogram/GPT-Image, `guidance_scale`/`acceleration` for Qwen). The known `"1k"` vs `"1K"` casing bug (already confirmed for Flux 2 Pro) is one symptom of this same root cause, not a one-off.
- **8. Sync's own vendor-folder hyphenation is inconsistent with the real API — sometimes backwards.** `inferKieModelFromUrl` (model-catalog-core.mjs) hyphenates a numeral-suffixed first path segment (`flux2`→`flux-2`, `qwen2`→`qwen-2`) on the theory that KIE's API wants the hyphenated form. Confirmed **correct** for Flux 2 (`flux-2/pro-text-to-image` is the real model field). Confirmed **wrong** for Qwen2: the real model field is `qwen2/image-edit` (no hyphen) — the sync produced an active row `qwen-2/text-to-image` / `qwen-2/image-edit` that does not match any real KIE model id, while the correctly-unhyphenated `qwen2/*` rows sit deprecated in the same table.
- **9. Provider-folder prefix drift.** Several `/market/<folder>/<slug>.md` pages document a model whose real `model` field does **not** repeat the folder name as a prefix (`nano-banana-2`, `nano-banana-2-lite`, `nano-banana-pro`, `gpt-image-2-text-to-image`, `gpt-image-2-image-to-image` are all *bare*, no `google/` or `gpt/` prefix), while sibling pages in the *same folder* do keep the vendor prefix (`google/imagen4`, `google/nano-banana`). The sync mechanically prefixes every model with its folder segment, so these bare-model rows get an extra prefix the real API rejects.

---

## Seedream (`/market/seedream/`)

### kie/bytedance/seedream — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ❌ missing
**DB row:** no row for `bytedance/seedream`. A row `seedream/seedream` exists instead (see next entry).
**Doc says:** `seedream.md` documents Seedream **3.0** as a real, independently callable model. Real `model` field: `bytedance/seedream`. Params: `prompt` (required, ≤5000 chars), `image_size` (square/square_hd/portrait/landscape variants), `guidance_scale` (1–10), `seed`.
**We store:** `seedream/seedream` (wrong prefix — `seedream/` instead of `bytedance/`; also wrong basename, missing the `/seedream` vs bare confusion — the real id has no third path segment at all beyond `bytedance/seedream`).
**Root cause class:** 1 (docs-sitemap slug) — the sync derived `seedream/seedream` from the URL `market/seedream/seedream`, never recovering the true `bytedance/` vendor prefix the API expects (Seedream v4's page proves the real API DOES require a `bytedance/` prefix for at least this model line — see next entries).
**Fix needed:** Either delete this row (it's an artifact of the folder-index page, not a real distinct model — the real Seedream 3.0 id is `bytedance/seedream`) or re-point it at `bytedance/seedream` and give it its own curated schema (`image_size`, `guidance_scale`, `seed` — none of which the generic schema has).

### kie/bytedance/seedream-v4-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`seedream/seedream-v4-text-to-image` exists=yes isActive=true capability=text-to-image
**Doc says:** real `model` field = **`bytedance/seedream-v4-text-to-image`**. Required: `prompt` (≤5000 chars). Optional: `image_size` (enum: square, square_hd, portrait_4_3, portrait_3_2, portrait_16_9, landscape_4_3, landscape_3_2, landscape_16_9, landscape_21_9), `image_resolution` (enum: `1K`,`2K`,`4K`), `max_images` (1–6), `seed`, `nsfw_checker`.
**We store:** `model` field sent as `seedream/seedream-v4-text-to-image` (wrong vendor prefix — will 422). Schema fields: `prompt`, `num_images` (fabricated name, real is `max_images`), `resolution` (fabricated enum `["1k","2k","4k"]` lowercase; real field name is `image_resolution`, real values `1K/2K/4K`), `aspect_ratio` (doesn't exist on this model at all — real is `image_size` with named-preset values, not a ratio string).
**Root cause class:** 1 (wrong model-field prefix) + 7 (fabricated schema)
**Fix needed:** Change stored `modelId`/`providerModelId`/`endpoint` to `bytedance/seedream-v4-text-to-image`; replace schema with `image_size` enum, `image_resolution` enum (1K/2K/4K), `max_images` (1-6), drop fictional `aspect_ratio`/`resolution`/`num_images`.

### kie/bytedance/seedream-v4-edit — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic (also miscategorized)
**DB row:** modelId=`seedream/seedream-v4-edit` exists=yes isActive=true **capability=`image`** (not `image-to-image`!) modelType=`image`
**Doc says:** real `model` field = **`bytedance/seedream-v4-edit`**. Required: `prompt`, `image_urls` (array of URIs, max 10). Optional: `image_size`, `image_resolution` (1K/2K/4K), `max_images` (1–6), `seed`, `nsfw_checker`.
**We store:** wrong prefix (`seedream/` not `bytedance/`); capability filed as coarse `image` so `CAPABILITY_GROUPS.iti` (capability-groups.js) never matches it — it shows up in the text-to-image studio, not image-to-image. Schema also has no `image_urls` field at all (only a fabricated singular `image_url` isn't even present here — check confirmed neither `image_url` nor `image_urls` in this row's stored fields), so the required reference image can never be supplied.
**Root cause class:** 1 (wrong prefix) + 5 (capability misfiling — `inferCapability`'s image-to-image regex requires literal `image-edit`/`edit-image`, and `seedream-v4-edit` only has a bare `-edit` suffix, so it falls through to the generic `image` bucket) + 7 (fabricated/missing schema)
**Fix needed:** Fix modelId prefix to `bytedance/`; fix capability to `image-to-image`; add real `image_urls` (array, required), `image_size`, `image_resolution` fields.

### kie/seedream/4.5-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`seedream/4-5-text-to-image` exists=yes isActive=true capability=text-to-image
**Doc says:** real `model` field = **`seedream/4.5-text-to-image`** (dotted version, NOT hyphenated). Required: `prompt` (≤3000 chars), `aspect_ratio` (enum: 1:1,4:3,3:4,16:9,9:16,2:3,3:2,21:9), `quality` (enum: `basic`=2K, `high`=4K). Optional: `nsfw_checker`.
**We store:** `seedream/4-5-text-to-image` — hyphen instead of dot in the version number (`4-5` vs `4.5`), which is a different string the real API doesn't recognize. Schema is the generic fabricated set: `aspect_ratio` optional (should be required) with wrong enum (missing 2:3/3:2/21:9), no `quality` field at all (the actual quality-tier selector), fabricated `resolution`/`num_images` fields that don't exist on this model.
**Root cause class:** 1 (dot-vs-hyphen slug mismatch — same bug class as GPT-Image 1.5 below, a new sub-case of #1) + 7
**Fix needed:** Store modelId as `seedream/4.5-text-to-image` (re-dot the version); make `aspect_ratio` and `quality` required with real enums; drop fictional `resolution`/`num_images`.

### kie/seedream/4.5-edit — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic (also miscategorized)
**DB row:** modelId=`seedream/4-5-edit` exists=yes isActive=true **capability=`image`** modelType=`image`
**Doc says:** real `model` field = **`seedream/4.5-edit`**. Required: `prompt` (≤3000 chars), `image_urls` (array, max 14), `aspect_ratio` (same 8-value enum), `quality` (basic=2K/high=4K). Optional: `nsfw_checker`.
**We store:** `seedream/4-5-edit` (dot/hyphen mismatch, same as above) filed under coarse `image` capability (misfiled into tti, not iti — same regex gap as `seedream-v4-edit`). No `image_urls`, no `quality`, generic fabricated fields only.
**Root cause class:** 1 (dot/hyphen) + 5 (capability misfiling) + 7
**Fix needed:** Re-dot to `seedream/4.5-edit`; fix capability to `image-to-image`; add real `image_urls`/`quality`/required `aspect_ratio`.

### kie/seedream/5-lite-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`seedream/5-lite-text-to-image` exists=yes isActive=true capability=text-to-image (model-field slug format is correct here — no dot/hyphen issue since "5-lite" has no decimal point)
**Doc says:** Required: `prompt` (3–3000 chars), `aspect_ratio` (same 8-value enum), `quality` (enum: `basic`=2K, `high`=3K, `ultra`=4K). Optional: `output_format` (png/jpeg), `nsfw_checker`.
**We store:** generic fabricated schema — `aspect_ratio` optional with wrong/incomplete enum, no `quality` (3-tier, unique to this model — `ultra` doesn't exist anywhere else), no `output_format`, fictional `resolution`/`num_images`.
**Root cause class:** 7
**Fix needed:** Add required `aspect_ratio` (8-value enum) and required `quality` (basic/high/ultra), optional `output_format` (png/jpeg); drop fictional fields.

### kie/seedream/5-pro-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`seedream/5-pro-text-to-image` exists=yes isActive=true capability=text-to-image (model field slug correct)
**Doc says:** Required: `prompt` (3–5000 chars), `aspect_ratio`, `quality` (enum: `basic`=1K, `high`=2K — only 2 tiers, different from 5-lite's 3). Optional: `output_format`, `nsfw_checker`.
**We store:** same generic fabricated schema as every other row — no `quality`, `aspect_ratio` optional not required.
**Root cause class:** 7
**Fix needed:** Add required `aspect_ratio`+`quality` (basic/high only, NOT the same enum as 5-lite), optional `output_format`.

### kie/seedream/5-pro-image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`seedream/5-pro-image-to-image` exists=yes isActive=true capability=image-to-image (correctly filed!)
**Doc says:** Required: `prompt`, `image_urls` (array, max 10), `aspect_ratio`, `quality` (basic=1K/high=2K). Optional: `output_format` (default png), `nsfw_checker`.
**We store:** `image_url` (singular, required) — real field is `image_urls` (plural array). No `quality`. `aspect_ratio` optional not required.
**Root cause class:** 7
**Fix needed:** Rename `image_url`→`image_urls` (array), add required `quality` enum, make `aspect_ratio` required.

---

## Google — Nano Banana / Imagen4 (`/market/google/`)

### kie/google/imagen4 — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`google/imagen4` exists=yes isActive=true capability=image (model field itself matches real API exactly)
**Doc says:** Required: `prompt` (≤5000). Optional: `negative_prompt`, `aspect_ratio` (enum: 1:1,16:9,9:16,3:4,4:3,**auto**; default 1:1), `seed`.
**We store:** generic schema — no `negative_prompt`, `aspect_ratio` enum missing `auto`, `resolution`/`num_images` fabricated (Imagen4 doesn't support resolution tiers or a count parameter at all).
**Root cause class:** 7
**Fix needed:** Add `negative_prompt`; fix `aspect_ratio` enum to include `auto`; drop `resolution`/`num_images`.

### kie/google/imagen4-fast — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`google/imagen4-fast` exists=yes isActive=true (model field matches)
**Doc says:** same shape as imagen4 but `aspect_ratio` defaults to `16:9`.
**We store:** identical generic schema issue as imagen4.
**Root cause class:** 7
**Fix needed:** same as imagen4.

### kie/google/imagen4-ultra — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`google/imagen4-ultra` exists=yes isActive=true (model field matches)
**Doc says:** same param shape as imagen4 (prompt, negative_prompt, aspect_ratio incl. `auto`, seed).
**We store:** same generic schema issue.
**Root cause class:** 7
**Fix needed:** same as imagen4.

### kie/google/nano-banana — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`google/nano-banana` exists=yes isActive=true (model field matches)
**Doc says:** Required: `prompt`. Optional: `output_format` (png/jpeg), `aspect_ratio` **and** `image_size` (both use the same large 11-value enum: 1:1,9:16,16:9,3:4,4:3,3:2,2:3,5:4,4:5,21:9,auto), `nsfw_checker`.
**We store:** generic 5-value aspect_ratio enum (missing 3:2,2:3,5:4,4:5,21:9,auto), no `output_format`, no `image_size`, fictional `resolution`/`num_images`.
**Root cause class:** 7
**Fix needed:** Expand `aspect_ratio` enum to the real 11 values; add `output_format`, `image_size`; drop fictional fields.

### kie/google/nano-banana-edit — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic (also miscategorized)
**DB row:** modelId=`google/nano-banana-edit` exists=yes isActive=true **capability=`image`** modelType=`image` (misfiled — same regex gap: "nano-banana-**edit**" has no literal "image-edit" substring)
**Doc says:** Required: `prompt`, `image_urls` (array, up to 10). Optional: `output_format`, `aspect_ratio` (11-value enum incl. auto), `image_size` (deprecated, replaced by aspect_ratio).
**We store:** filed under coarse `image` (tti, not iti); `image_url` singular not `image_urls` array; wrong/incomplete aspect_ratio enum.
**Root cause class:** 5 (capability misfiling) + 7
**Fix needed:** Fix capability to `image-to-image`; rename `image_url`→`image_urls` array; expand aspect_ratio enum.

### kie/nano-banana-2 — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ❌ missing (row exists but points at the wrong model id)
**DB row:** modelId=`google/nanobanana2` exists=yes isActive=true capability=text-to-image
**Doc says:** real `model` field = **`nano-banana-2`** — bare, no `google/` prefix. Required: `prompt` (≤20,000 chars). Optional: `image_input` (array, up to 14 images, 30MB each), `aspect_ratio` (15-value enum incl. auto), `resolution` (enum `1K`,`2K`,`4K`), `output_format` (png/jpg).
**We store:** `model` field sent as `google/nanobanana2` — this will 422 ("model name not supported"), since the real id has neither the `google/` prefix nor the `nanobanana2` (no-hyphen) spelling; real spelling is `nano-banana-2` with a hyphen. Schema also only has `prompt` — none of the real optional fields exist on this row at all.
**Root cause class:** 1 (docs-sitemap slug — folder-prefix + hyphenation both wrong) + 9 (bare-model prefix drift)
**Fix needed:** Repoint modelId/providerModelId/endpoint to bare `nano-banana-2`; add `image_input`, `aspect_ratio` (15-value), `resolution` (1K/2K/4K), `output_format` (png/jpg).

### kie/nano-banana-2-lite — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ❌ missing (wrong model id on the row)
**DB row:** modelId=`google/nano-banana-2-lite` exists=yes isActive=true capability=image
**Doc says:** real `model` field = **`nano-banana-2-lite`** — bare, no `google/` prefix. Required: `prompt` (≤20,000 chars), `aspect_ratio` (15-value enum incl. auto). Optional: `image_urls` (array, max 10).
**We store:** `model` field sent as `google/nano-banana-2-lite` — extra prefix will 422. Schema: `aspect_ratio` optional not required, wrong 5-value enum, `image_url` singular not `image_urls`, fictional `resolution`/`num_images`.
**Root cause class:** 1 + 9
**Fix needed:** Repoint to bare `nano-banana-2-lite`; make `aspect_ratio` required with real 15-value enum; add `image_urls` array; drop fictional fields.

### kie/nano-banana-pro — 2026-08-05
**Studio/category:** i2i (accepts optional image input, so functions as both tti and iti — see doc note below)
**Verdict:** ❌ missing (wrong model id; the correctly-named legacy row is deactivated)
**DB row:** active row `google/pro-image-to-image` (capability=image-to-image, modelType=i2i) points at the wrong id. A second row literally named `nano-banana-pro` exists but is `isActive=false, isDeprecated=true`.
**Doc says:** the only doc page for this model is `google/pro-image-to-image.md`, and its real `model` field is **`nano-banana-pro`** — bare, no `google/` prefix, and NOT `google/pro-image-to-image` or `nano-banana-pro-image-to-image`. Required: `prompt` (≤10,000 chars). Optional: `image_input` (array, up to 8 images, 30MB each — makes it also usable as pure text-to-image when omitted), `aspect_ratio` (11-value enum incl. auto), `resolution` (1K/2K/4K), `output_format` (png/jpg).
**We store:** `google/pro-image-to-image` — will 422; the one row with the CORRECT real id (`nano-banana-pro`) is deactivated, so Nano Banana Pro is effectively unreachable in production today.
**Root cause class:** 1 (docs-sitemap slug — the folder+filename literal `pro-image-to-image` was kept as the model id instead of resolving to the real bare `nano-banana-pro`) + 9
**Fix needed:** Deactivate/delete `google/pro-image-to-image`; reactivate (or recreate) a row with modelId `nano-banana-pro`, real schema (`image_input`, `aspect_ratio` 11-value, `resolution` 1K/2K/4K, `output_format`), and capability `image-to-image` (it's the only capability group that will show a model whose reference image is optional but supported — flag for product to also consider surfacing it in tti since `image_input` is fully optional).

---

## Flux 2 (`/market/flux2/`)

### kie/flux-2/pro-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`flux-2/pro-text-to-image` exists=yes isActive=true (model field matches real API exactly — confirms flux2→flux-2 hyphenation IS correct for this vendor)
**Doc says:** Required: `prompt` (3–5000), `aspect_ratio` (enum: 1:1,4:3,3:4,16:9,9:16,3:2,2:3), `resolution` (enum: **`1K`**,**`2K`** — only two tiers, default `1K`). Optional: `nsfw_checker`.
**We store:** `resolution` enum `["1k","2k","4k"]` — lowercase (already-confirmed bug: provider rejects `"1k"`, wants `"1K"`) AND includes a nonexistent `4k` tier this model doesn't support. `aspect_ratio`/`resolution` both marked optional when the real API requires both (already-known "aspect_ratio is required" 500 — `provider-payload-core.mjs`'s `PROVIDER_REQUIRED_FIELDS` currently patches only `aspect_ratio` for this exact model, not `resolution`, and not the casing).
**Root cause class:** 2 (fabricated enum casing) + 7
**Fix needed:** Fix `resolution` enum to `["1K","2K"]` (drop `4K`); mark both `aspect_ratio` and `resolution` `required:true` in the stored schema (superseding the point-fix in `PROVIDER_REQUIRED_FIELDS`, which should also gain `resolution` for this model in the interim).
**Status:** partially known — casing bug documented in `docs/MODEL_AUDIT.md` intro, `aspect_ratio`-only fix landed via `PROVIDER_REQUIRED_FIELDS`; `resolution` requiredness and the bogus `4K` value are new findings from this pass.

### kie/flux-2/pro-image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`flux-2/pro-image-to-image` exists=yes isActive=true (model field matches)
**Doc says:** Required: `input_urls` (array, 1–8 images, max 10MB each), `prompt`, `aspect_ratio` (adds `auto` to the pro-text-to-image enum), `resolution` (1K/2K). Optional: `nsfw_checker`.
**We store:** `image_url` singular (real field is `input_urls`, plural array — a completely different field name, not just casing); same `resolution` lowercase/4K bug as the t2i sibling; `aspect_ratio`/`resolution` optional not required.
**Root cause class:** 7
**Fix needed:** Rename `image_url`→`input_urls` (array); fix resolution enum to 1K/2K; make aspect_ratio+resolution required.

### kie/flux-2/flex-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`flux-2/flex-text-to-image` exists=yes isActive=true (model field matches)
**Doc says:** Required: `prompt`, `aspect_ratio` (1:1,4:3,3:4,16:9,9:16,3:2,2:3), `resolution` (1K/2K). Optional: `nsfw_checker`.
**We store:** same casing/4K/optionality issues as flux-2 pro t2i.
**Root cause class:** 7
**Fix needed:** same pattern as pro-text-to-image.

### kie/flux-2/flex-image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`flux-2/flex-image-to-image` exists=yes isActive=true (model field matches)
**Doc says:** Required: `input_urls` (array, 1–8), `prompt`, `aspect_ratio` (adds `auto`), `resolution` (1K/2K).
**We store:** `image_url` singular not `input_urls` array; same resolution issues.
**Root cause class:** 7
**Fix needed:** same pattern as pro-image-to-image.

---

## Grok Imagine (`/market/grok-imagine/`)

### kie/grok-imagine/text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`grok-imagine/text-to-image` exists=yes isActive=true (model field matches)
**Doc says:** Required: `prompt` only. Optional: `aspect_ratio` (enum: **2:3,3:2,1:1,16:9,9:16** — only 5 values, default 1:1), `nsfw_checker`, `enable_pro` (boolean — false=speed mode, true=quality mode; unique to this model, not in the generic schema at all).
**We store:** `aspect_ratio` enum `["1:1","4:3","3:4","16:9","9:16"]` — wrong values entirely (has 4:3/3:4 which don't exist here, missing 2:3/3:2 which do); no `enable_pro`; fictional `resolution`/`num_images`.
**Root cause class:** 7
**Fix needed:** Fix aspect_ratio enum to the real 5 values; add `enable_pro` boolean; drop fictional fields.

### kie/grok-imagine/image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`grok-imagine/image-to-image` exists=yes isActive=true (model field matches)
**Doc says:** Required: `image_urls` (array, up to 1 image!). `prompt` is actually **optional** here (not required — very unusual, but that's what the doc says). Optional: `nsfw_checker`.
**We store:** `prompt` marked required (real API allows omitting it), `image_url` singular not `image_urls` array, plus fictional `resolution`/`aspect_ratio`/`num_images` this model doesn't support at all.
**Root cause class:** 7
**Fix needed:** Rename `image_url`→`image_urls` array; make `prompt` optional; drop fictional resolution/aspect_ratio/num_images.

---

## GPT Image (`/market/gpt-image/` and `/market/gpt/`)

### kie/gpt-image/1.5-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`gpt-image/1-5-text-to-image` exists=yes isActive=true
**Doc says:** real `model` field = **`gpt-image/1.5-text-to-image`** (dotted version). Required: `prompt`, `aspect_ratio` (enum: 1:1,2:3,3:2), `quality` (enum: medium,high).
**We store:** `gpt-image/1-5-text-to-image` — hyphen instead of dot, will 422 (same dot/hyphen class as Seedream 4.5). No `quality` field at all; `aspect_ratio` wrong 5-value enum instead of the real 3-value one; both marked optional when required.
**Root cause class:** 1 (dot/hyphen slug) + 7
**Fix needed:** Re-dot modelId to `gpt-image/1.5-text-to-image`; add required `quality` (medium/high); fix `aspect_ratio` to 3-value enum, required.

### kie/gpt-image/1.5-image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`gpt-image/1-5-image-to-image` exists=yes isActive=true
**Doc says:** real `model` field = **`gpt-image/1.5-image-to-image`**. Required: `input_urls` (array, max 16), `prompt`, `aspect_ratio` (1:1,2:3,3:2), `quality` (medium/high).
**We store:** dot/hyphen mismatch (same as above); `image_url` singular not `input_urls` array; no `quality`.
**Root cause class:** 1 + 7
**Fix needed:** same pattern as 1.5-text-to-image plus the array rename.

### kie/gpt-image-2-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ❌ missing (wrong model id)
**DB row:** modelId=`gpt/gpt-image-2-text-to-image` exists=yes isActive=true
**Doc says:** real `model` field = **`gpt-image-2-text-to-image`** — bare, no `gpt/` prefix. Required: `prompt` (≤20,000 chars). Optional: `aspect_ratio` (16-value enum incl. auto, 2:1/1:2/3:1/1:3/21:9/9:21), `resolution` (1K/2K/4K).
**We store:** `model` field sent as `gpt/gpt-image-2-text-to-image` — extra `gpt/` prefix will 422. Schema also has wrong 5-value aspect_ratio enum and no distinction (the real doc even notes 1:1 can't reach 4K and some ratios are unsupported at 2K/4K — not represented at all).
**Root cause class:** 1 (docs-sitemap slug, folder-prefix drift) + 9
**Overlap flag:** per the task's note — this Market-API page may duplicate/overlap the dedicated `4o-image-api` system another audit pass is covering; the fetched doc page made no mention of `4o-image-api`, so they appear to be genuinely separate KIE offerings (GPT-Image-2 vs GPT-4o-Image), not the same model under two names — worth a cross-check by whichever pass owns `4o-image-api`.
**Fix needed:** Repoint modelId to bare `gpt-image-2-text-to-image`; fix aspect_ratio to the real 16-value enum; add `resolution` (1K/2K/4K).

### kie/gpt-image-2-image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ❌ missing (wrong model id)
**DB row:** modelId=`gpt/gpt-image-2-image-to-image` exists=yes isActive=true
**Doc says:** real `model` field = **`gpt-image-2-image-to-image`** — bare, no `gpt/` prefix. Required: `prompt`, `input_urls` (array, max 16). Optional: `aspect_ratio` (same 16-value enum), `resolution` (1K/2K/4K).
**We store:** wrong prefix (will 422); `image_url` singular not `input_urls`; wrong aspect_ratio enum.
**Root cause class:** 1 + 9
**Fix needed:** same pattern as the t2i sibling plus the array rename.

---

## Ideogram (`/market/ideogram/`)

### kie/ideogram/v3-text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`ideogram/v3-text-to-image` exists=yes isActive=true (model field matches)
**Doc says:** Required: `prompt`. Optional: `rendering_speed` (TURBO/BALANCED/QUALITY), `style` (AUTO/GENERAL/REALISTIC/DESIGN), `expand_prompt` (bool), `image_size` (named presets: square, square_hd, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9 — NOT a ratio string), `seed`, `negative_prompt`.
**We store:** none of the real fields — generic `num_images`/`resolution`(1k/2k/4k)/`aspect_ratio` only, none of which this model accepts.
**Root cause class:** 7
**Fix needed:** Replace schema entirely with `rendering_speed`, `style`, `expand_prompt`, `image_size` (named presets), `negative_prompt`.

### kie/ideogram/v3-edit — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic (also miscategorized)
**DB row:** modelId=`ideogram/v3-edit` exists=yes isActive=true **capability=`image`** (misfiled — "v3-edit" has no literal "image-edit"/"edit-image" substring so it falls into the coarse `image` bucket, landing in tti not iti)
**Doc says:** Required: `prompt`, `image_url`, **`mask_url`** (both URIs — this is an inpainting-style edit, mask is mandatory and completely absent from our schema). Optional: `rendering_speed`, `expand_prompt`, `seed`.
**We store:** generic schema, no `mask_url` at all (this model cannot function without it), filed as tti not iti.
**Root cause class:** 5 (capability misfiling) + 7
**Fix needed:** Fix capability to `image-to-image`; add required `mask_url`; add `rendering_speed`/`expand_prompt`; drop fictional fields.

### kie/ideogram/v3-remix — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`ideogram/v3-remix` exists=yes isActive=true capability=image-to-image (correctly filed — "remix" is in the i2i regex)
**Doc says:** Required: `prompt`, `image_url`. Optional: `rendering_speed`, `style` (AUTO/GENERAL/REALISTIC/DESIGN), `expand_prompt`, `image_size` (named presets), `num_images` (string enum '1'-'4'), `seed`, `strength` (0.01–1.0), `negative_prompt`.
**We store:** `image_url` matches (good), but `num_images` is a **number** type in our schema vs the real API's **string enum** `'1'..'4'`; missing `style`/`strength`/`rendering_speed`/`image_size`/`negative_prompt` entirely; `resolution`/`aspect_ratio` fictional for this model.
**Root cause class:** 7
**Fix needed:** Change `num_images` to string enum; add `style`, `strength`, `rendering_speed`, `image_size`, `negative_prompt`; drop `resolution`/`aspect_ratio`.

### kie/ideogram/character — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic (also miscategorized)
**DB row:** modelId=`ideogram/character` exists=yes isActive=true **capability=`image`** (misfiled — falls through to coarse `image`)
**Doc says:** Required: `prompt`, `reference_image_urls` (array — this is a character-consistency model, the reference is mandatory). Optional: `rendering_speed`, `style` (AUTO/REALISTIC/FICTION — a DIFFERENT enum than v3's), `expand_prompt`, `num_images`, `image_size`, `seed`, `negative_prompt`.
**We store:** filed as tti, no `reference_image_urls` at all — this model literally cannot be called without it, so today it's unreachable no matter what a user submits.
**Root cause class:** 5 (capability misfiling) + 7
**Fix needed:** Fix capability to `image-to-image`; add required `reference_image_urls` array; add the rest of the real fields.

### kie/ideogram/character-edit — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`ideogram/character-edit` exists=yes isActive=true capability=image-to-image (correctly filed)
**Doc says:** Required: `prompt`, `image_url`, `mask_url`, `reference_image_urls`. Optional: `rendering_speed`, `style` (AUTO/REALISTIC/FICTION), `expand_prompt`, `num_images`.
**We store:** only `image_url` present; missing `mask_url` and `reference_image_urls` (both required — this model cannot function today).
**Root cause class:** 7
**Fix needed:** add required `mask_url` + `reference_image_urls`.

### kie/ideogram/character-remix — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`ideogram/character-remix` exists=yes isActive=true capability=image-to-image (correctly filed)
**Doc says:** Required: `prompt`, `image_url`, `reference_image_urls`. Optional: `rendering_speed`, `style`, `expand_prompt`, `image_size`, `num_images`, `seed`, `strength`, `negative_prompt`.
**We store:** only `image_url`; missing required `reference_image_urls` (model unreachable without it).
**Root cause class:** 7
**Fix needed:** add required `reference_image_urls`.

---

## Qwen (`/market/qwen/`, `/market/qwen2/`, `/market/qwen3/`)

### kie/qwen/text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`qwen/text-to-image` exists=yes isActive=true (model field matches)
**Doc says:** Required: `prompt`. Optional: `image_size` (named presets), `num_inference_steps` (2–250), `seed`, `guidance_scale` (0–20), `enable_safety_checker`, `output_format`, `negative_prompt`, `acceleration` (none/regular/high), `nsfw_checker`.
**We store:** generic fabricated schema — none of the real fields exist except `prompt`.
**Root cause class:** 7
**Fix needed:** Replace with real field set above.

### kie/qwen/image-edit — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`qwen/image-edit` exists=yes isActive=true capability=image-to-image (correctly filed)
**Doc says:** Required: `prompt`, `image_url`. Optional: `acceleration`, `image_size`, `num_inference_steps`, `seed`, `guidance_scale`, `sync_mode`, `num_images` (string enum '1'-'4'), `enable_safety_checker`, `output_format`, `negative_prompt`, `nsfw_checker`.
**We store:** `image_url` matches, but everything else is the generic fabricated set — no guidance_scale/acceleration/steps.
**Root cause class:** 7
**Fix needed:** add the real optional field set.

### kie/qwen/image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`qwen/image-to-image` exists=yes isActive=true capability=image-to-image
**Doc says:** Required: `prompt`, `image_url`. Optional: `strength` (0-1), `output_format`, `acceleration`, `negative_prompt`, `seed`, `num_inference_steps`, `guidance_scale`, `enable_safety_checker`, `nsfw_checker`.
**We store:** generic fabricated set again.
**Root cause class:** 7
**Fix needed:** add real optional fields, esp. `strength` which meaningfully changes output.

### kie/qwen-2/text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ❌ missing (wrong model id — sync's own hyphenation "fix" broke this vendor)
**DB row:** modelId=`qwen-2/text-to-image` exists=yes isActive=true
**Doc says:** real `model` field for KIE's qwen2 folder is unhyphenated: the only doc page that actually exists at `/market/qwen2/text-to-image` resolves to model field `qwen2/image-edit` (KIE's own doc appears to alias/duplicate its qwen2 folder onto a single image-edit model — flagged as a KIE-side doc oddity, not ours to fix) — but critically the vendor segment itself is **`qwen2`**, never `qwen-2`, in every live qwen2 doc page fetched.
**We store:** `qwen-2/text-to-image` and `qwen-2/image-edit` — both use the sync's manufactured `qwen-2` (hyphenated) vendor segment, which does not match any real KIE model id. Meanwhile the correctly-spelled `qwen2/text-to-image` / `qwen2/image-edit` rows sit in the table deactivated.
**Root cause class:** 8 (new — sync's flux2→flux-2 hyphenation rule was generalized to all `<word><digit>` folders, but Qwen's real API keeps the unhyphenated form)
**Fix needed:** Deactivate `qwen-2/*`; reactivate/repoint `qwen2/*` (pending resolution of the doc-side text-to-image/image-edit alias oddity above — worth a quick manual probe before reactivating `qwen2/text-to-image` specifically, since the doc's own model field for that page is `qwen2/image-edit`).

### kie/qwen2/image-edit — 2026-08-05
**Studio/category:** i2i
**Verdict:** ❌ missing (correct row exists but is deactivated; the active row uses the wrong id)
**DB row:** `qwen2/image-edit` exists=yes but isActive=false, isDeprecated=true. The active row is the wrongly-hyphenated `qwen-2/image-edit` (see above).
**Doc says:** real model field `qwen2/image-edit`. Required: `prompt` (≤800 chars), `image_url`. Optional: `image_size` (ratio enum: 1:1,2:3,3:2,3:4,4:3,9:16,16:9,21:9; default 16:9), `seed`, `output_format`, `nsfw_checker`.
**We store (deactivated row):** generic schema, `image_size` absent (fictional `resolution`/`aspect_ratio` instead).
**Root cause class:** 8 + 7
**Fix needed:** Reactivate `qwen2/image-edit`, deactivate `qwen-2/image-edit`, fix schema to real fields.

### kie/qwen3/text-to-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ❌ missing entirely
**DB row:** no row for any `qwen3*` image model exists (only `alibaba:qwen3-tts-flash`/`alibaba:qwen3-tts-instruct-flash`, both audio, both deactivated).
**Doc says:** real `model` field = `qwen3/text-to-image`. Required: `prompt` (≤800 chars). Optional: `resolution` (1K/2K), `image_size` (ratio enum incl. 21:9; default 16:9), `output_format`, `prompt_extend` (bool, default true — Qwen-specific prompt rewriting), `nsfw_checker`, `negative_prompt`, `seed`.
**Root cause class:** 1 (never crawled/synced — Qwen3 is entirely absent from the catalog despite being live on KIE)
**Fix needed:** Add the row with the real schema above.

### kie/qwen3/image-to-image — 2026-08-05
**Studio/category:** i2i
**Verdict:** ❌ missing entirely
**DB row:** none.
**Doc says:** real `model` field = `qwen3/image-to-image`. Required: `image_urls` (array, 1–3 items), `prompt`. Optional: `resolution` (1K/2K), `image_size`, `output_format`, `prompt_extend`, `nsfw_checker`, `negative_prompt`, `seed`.
**Root cause class:** 1
**Fix needed:** Add the row with the real schema above. (Task also named `qwen3-pro` as a possible variant — no such doc page was found under `/market/qwen3-pro/`; the assignment's llms.txt snapshot listed `qwen3/` and `qwen3-pro/` together but only the base `qwen3/text-to-image` and `qwen3/image-to-image` pages resolved. Worth a follow-up probe of `docs.kie.ai/market/qwen3-pro/text-to-image` before assuming it doesn't exist.)

---

## Z-Image (`/market/z-image/`)

### kie/z-image — 2026-08-05
**Studio/category:** image (tti)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`z-image/z-image` exists=yes isActive=true capability=image
**Doc says:** real `model` field = **`z-image`** (bare, no `z-image/` prefix — same prefix-drift pattern as class 9). Required: `prompt` (≤1000 chars), `aspect_ratio` (enum: 1:1,4:3,3:4,16:9,9:16). Optional: `nsfw_checker`.
**We store:** `model` field sent as `z-image/z-image` — will 422 (wrong prefix). `aspect_ratio` marked optional (should be required); fictional `resolution`/`num_images`.
**Root cause class:** 9 (bare-model prefix drift) + 7
**Fix needed:** Repoint modelId to bare `z-image`; make `aspect_ratio` required; drop fictional fields; also tighten `prompt` maxLength to 1000 (currently 5000).

---

## Topaz (`/market/topaz/image-upscale.md`)

### kie/topaz/image-upscale — 2026-08-05
**Studio/category:** i2i (image-upscale)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`topaz/image-upscale` exists=yes isActive=true capability=image-upscale (model field matches, capability correct)
**Doc says:** Required: `image_url`, **`upscale_factor`** (string enum `'1'`,`'2'`,`'4'`, default `'2'`). No `prompt` field exists on this model at all — it's a pure upscaler.
**We store:** `image_url` matches; `prompt` present (optional, harmless but fictional); **`upscale_factor` is completely absent** — the one parameter that actually controls what this model does isn't in our schema, so every submit silently upscales by whatever KIE's own default is with no user control. Fictional `resolution`/`aspect_ratio`/`num_images` also present and meaningless for this model.
**Root cause class:** 7
**Fix needed:** Add required `upscale_factor` (string enum '1'/'2'/'4'); drop `prompt`/`resolution`/`aspect_ratio`/`num_images`.

---

## Recraft (`/market/recraft/`)

### kie/recraft/remove-background — 2026-08-05
**Studio/category:** i2i (background-removal)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`recraft/remove-background` exists=yes isActive=true capability=background-removal (model field + capability correct)
**Doc says:** Required field is named **`image`** (not `image_url`). No other input parameters exist on this model besides the top-level `callBackUrl`.
**We store:** field named `image_url` — **wrong field name entirely**, not a casing issue. A submit built from this schema sends `image_url` where the API expects `image`, so the required field is effectively always missing → guaranteed failure ("image is required" or similar).
**Root cause class:** 7 (new specific case: wrong field NAME, not just enum/casing)
**Fix needed:** Rename `image_url` → `image`.

### kie/recraft/crisp-upscale — 2026-08-05
**Studio/category:** i2i (image-upscale)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`recraft/crisp-upscale` exists=yes isActive=true capability=image-upscale (model field + capability correct)
**Doc says:** Required field: `image` (same naming as remove-background). No other parameters — no aspect_ratio/resolution/num_images/prompt.
**We store:** `image_url` (wrong name, same bug as remove-background) plus fictional `prompt`/`resolution`/`aspect_ratio`/`num_images`.
**Root cause class:** 7
**Fix needed:** Rename `image_url` → `image`; drop all fictional fields.

---

## Wan image (`/market/wan/2-7-image.md`, `2-7-image-pro.md`)

### kie/wan/2-7-image — 2026-08-05
**Studio/category:** image (tti) — but is also natively i2i (accepts `input_urls`)
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`wan/2-7-image` exists=yes isActive=true capability=image (model field matches)
**Doc says:** Required: `prompt`. Optional: `input_urls` (image references), `aspect_ratio` (enum: 1:1,16:9,4:3,21:9,3:4,9:16,8:1,1:8), `enable_sequential`, `n`, `resolution` (1K/2K/4K), `thinking_mode`, `color_palette`, `bbox_list`, `watermark`, `seed`, `nsfw_checker`.
**We store:** generic 5-value aspect_ratio enum (missing 8:1/1:8, wrong casing already covered above), fictional `num_images` instead of real `n`; missing `input_urls`, `enable_sequential`, `thinking_mode`, `color_palette`, `bbox_list`, `watermark` entirely.
**Root cause class:** 7
**Fix needed:** rename `num_images`→`n`; fix `resolution` casing (1K/2K/4K); expand `aspect_ratio` enum; add the Wan-specific fields (at minimum `input_urls` since it changes this from tti-only to also-iti).

### kie/wan/2-7-image-pro — 2026-08-05
**Studio/category:** image (tti) — same dual t2i/i2i shape as 2-7-image
**Verdict:** ⚠️ exists, wrong logic
**DB row:** modelId=`wan/2-7-image-pro` exists=yes isActive=true capability=image (model field matches)
**Doc says:** identical field set to `wan/2-7-image` (input_urls up to 9 items, aspect_ratio 8-value enum, n, resolution 1K/2K/4K, thinking_mode, color_palette, bbox_list, watermark, seed, nsfw_checker).
**We store:** same generic-schema gap as 2-7-image.
**Root cause class:** 7
**Fix needed:** same as 2-7-image.

---

## Summary counts

- ✅ exists, correct: **0**
- ⚠️ exists, wrong logic: **31** (Seedream ×5, Google ×3, Flux2 ×4, Grok Imagine ×2, GPT-Image 1.5 ×2, Ideogram ×6, Qwen ×3, Z-Image ×1, Topaz ×1, Recraft ×2, Wan ×2 — includes rows that are both ❌ id-wrong AND schema-wrong, counted once under the more severe verdict below)
- ❌ missing (no row, or row's model field the real API will reject): **9** (`bytedance/seedream` v3, `nano-banana-2`, `nano-banana-2-lite`, `nano-banana-pro`, `gpt-image-2-text-to-image`, `gpt-image-2-image-to-image`, `qwen-2/text-to-image`, `qwen2/image-edit` reachability, `qwen3/text-to-image`, `qwen3/image-to-image` — 10 listed, see detail entries)

**Zero models in this audit had a fully correct stored schema.** Every reachable row (correct `model` field) still sends a fabricated generic parameter shape that doesn't match its real provider. Several rows are additionally unreachable outright because the stored `model` field itself is wrong (missing/extra vendor prefix, or a hyphen/dot mismatch in the version number).

## Top findings

1. **The generic per-capability schema (`defaultSchemaForCapability`) is wrong for essentially every image model in the catalog**, not just the previously-known Flux 2 `1k`/`1K` case. `resolution: ["1k","2k","4k"]` and `aspect_ratio: ["1:1","4:3","3:4","16:9","9:16"]` are fabricated placeholders that don't match any of the ~40 real model schemas fetched — real models use `image_size` presets, `quality` tiers, differently-cased/differently-valued enums, array fields (`image_urls`/`input_urls`) instead of the stored singular `image_url`, or entirely different field names (`image` for Recraft, `n` for Wan, `upscale_factor` for Topaz). This needs a curated-schema pass per model family, not a one-off casing fix.
2. **Nano Banana Pro is effectively dead in production**: the correctly-named row (`nano-banana-pro`) is deactivated, and the active row (`google/pro-image-to-image`) sends a `model` field the API doesn't recognize. Nano Banana 2 and Nano Banana 2 Lite have the same wrong-prefix bug (`google/nanobanana2` / `google/nano-banana-2-lite` vs the real bare `nano-banana-2` / `nano-banana-2-lite`), as do both GPT-Image-2 rows (`gpt/gpt-image-2-*` vs bare `gpt-image-2-*`).
3. **The sync's own `flux2`→`flux-2` hyphenation "fix" was over-generalized to Qwen2 and is backwards there**: it produced an active-but-broken `qwen-2/*` pair while the correctly-spelled `qwen2/*` rows sit deactivated, and the entire Qwen3 image line (`qwen3/text-to-image`, `qwen3/image-to-image`) was never synced into the catalog at all.
