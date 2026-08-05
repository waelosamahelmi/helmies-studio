# Model Audit — page-by-page triage

Owner sends a KIE/Alibaba/provider API doc page for one model. For each, this file
records the verdict so batch fixes can happen after triage instead of one PR per model.

**Architecture confirmed (2026-08-05): already correct.** Every model lives in the
`ModelPricing` table (`prisma/schema.prisma`) — `modelId`, `endpoint`, `providerModelId`,
`inputSchema` (Json, field defs), `constraints`, `pricingRules`, `creditsCost`,
`providerCost`, `capability`/`modelType`, `isActive`, `isDeprecated`. Nothing is
hardcoded per-model in application code. Admin CRUD already exists:
`src/components/admin/ModelManager.js` + `src/app/api/admin/models/route.js`
(create/update/delete, enable/disable, reprice). **This audit is about data
correctness (right endpoint, right param names/casing, right capability), not
rebuilding the DB-driven system — that part is already done.**

## Verdict legend
- ✅ **exists, correct** — model row + submit/poll path verified against the real API shape.
- ❌ **missing** — no `ModelPricing` row, or the row exists but points at a doc-page slug the API rejects (`422 model name not supported`).
- ⚠️ **exists, wrong logic** — row exists and is *called*, but something about the request is wrong: param name/casing, missing required field, wrong route/shape, wrong capability/modelType, wrong pricing. Root cause and fix noted below; **not fixed inline during triage** — batched into one PR per class of bug once enough are logged.

## Known bug classes already found (context for new entries)
1. **Docs-sitemap slugs.** Catalog is built by crawling KIE's documentation sitemap (`src/lib/kie-sync.js`), so some stored `modelId`s are doc-page paths the API's `createTask` rejects with `422 "model name not supported"`. Fixed by `scripts/verify-catalog.mjs` (probe + deactivate) — not yet run across the full KIE catalog.
2. **Fabricated parameter values.** `inputSchema` enums (`resolution: ["1k","2k","4k"]` etc.) are template-generated, not the real provider values. Confirmed real-world mismatches: `1k` → provider wants `1K`; generic `size` → Alibaba wants `resolution: "1080P"`.
3. **Music/audio needed a different route entirely.** Suno lives on a flat-body endpoint with `model` as an engine selector, not the generic job endpoint. Fixed in `src/lib/audio-payload-core.mjs` (2026-08-05, PR #34).
4. **TTS field-name mismatch.** ElevenLabs error says `voiceId` but the accepted field is `voice`; `prompt` must be `text`. Fixed alongside #3.
5. **Capability misfiling.** Video-output models stored with `modelType:"image"` (`generate-veo-3-video`, etc.) so they appear in the wrong studio. Partial fix in PR #33 (pending merge).
6. **Dedicated API vs Market API confusion (found 2026-08-05, via https://docs.kie.ai/llms.txt).** KIE has TWO API systems:
   - **Dedicated APIs**, each with its own endpoint/callback shape: `4o-image-api`, `flux-kontext-api`, `runway-api`, `veo3-api`, `suno-api`.
   - **Market models** — everything under `/market/*` (Bytedance, Kling, Wan, Hailuo, PixVerse, ElevenLabs, Gemini TTS, etc.) — go through ONE generic unified job endpoint, with a shared `/market/common/get-task-detail.md` for polling.
   `kie-sync.js` crawls the whole sitemap and treats every page as a generic Market model, which is why dedicated-API pages 422 with "model name not supported": `generate-ai-video`/`extend-ai-video` (Runway), `generate-aleph-video` (Runway), `generate-veo-3-video` (Veo3.1), and most of the Suno suite. Fix requires per-family adapters (Suno's `generate-music` already got one, 2026-08-05 PR #34) rather than routing everything through the Market job endpoint.
   **Revises earlier verdict on the rest of the Suno suite:** previously called "genuinely unreachable" (needs a source-track id the studio can't supply) — that's a missing UI feature (an upload step, which `AudioToolsStudio` already has the shape for), not a dead API. Worth building once triage is further along.

---

## Consolidated results (2026-08-05) — 169 models audited against real docs.kie.ai pages

| Area | ✅ Correct | ⚠️ Wrong | ❌ Missing/dead | File |
|---|---|---|---|---|
| Image — dedicated (4o Image, Flux Kontext) | 0 | 2 | 0 | `model-audit/image-dedicated.md` |
| Image — market (~40 models) | 0 | 31 | 10 | `model-audit/image-market.md` |
| Video — dedicated (Runway, Veo3.1) | 0 | 4 | 6 | `model-audit/video-dedicated.md` |
| Video — market (75 models) | 3 | 61 | 11 | `model-audit/video-market.md` |
| Audio/Music (31 models) | 5 | 1 | 25 | `model-audit/audio-music.md` |
| Utility/plumbing + leakage check | — | 2 real bugs | — | `model-audit/utility-and-leakage.md` |
| **Total generation models** | **8** | **99** | **52** | |

**8 of 159 audited generation models are confirmed correct.** The 151 broken ones are not 151 separate bugs — they collapse into 9 root-cause classes, most fixable as a single pattern-level change.

## Fix plan — by root cause, with effort/impact

| # | Root cause | Models affected | Effort | Impact | Notes |
|---|---|---|---|---|---|
| A | **Upload URLs never absolutized before being sent to KIE** | All i2i/i2v/v2v when the source is a fresh user upload (not a prior generation) | S | **High — breaks a core workflow silently** | One utility function + one call site (`generation-handler.js` / `provider-payload-core.mjs`). Not a catalog issue at all. |
| B | **Sync normalization bugs** (`qwen2`→`qwen-2` reversed, `seedance-1-5` should keep the dot, wrong `google/`/`gpt/` prefixes stripped incorrectly, PixVerse missing `-v6`, Kling version-prefix mismatch) | ~30+ rows across image+video | S | High — fixes many rows at the next sync with zero schema work | All in `kie-sync.js`'s id-normalization logic. |
| C | **Two vendors never synced**: Gemini-Omni (real bug — anything containing "gemini" is typed `"llm"` and skipped; the guard meant to prevent this is wired to the wrong function) and MiniMax-H3 (cause not yet found) | 6 models | S | Medium | Gemini-Omni fix is one line once located. MiniMax-H3 needs a short investigation first. |
| D | **Fabricated generic schemas** — every non-curated model gets the same `resolution/aspect_ratio/duration` shape regardless of the real API | ~90+ models across image+video | M | **High — the single biggest lever** | The 6 audit files already contain the REAL param names/enums per vendor family, extracted from the actual docs. This is ~15-20 vendor-family `CURATED_SCHEMAS` entries (mirroring the pattern already used for audio), not 90 individual fixes. |
| E | **Dedicated-API routing never built** — 4o Image, Flux Kontext, Runway, Veo3.1 all currently hit the generic Market endpoint and 422/fail | 12 models, incl. Veo3 (named as a target) and Runway | M–L | High — these are flagship/premium models | Same adapter pattern already built for Suno music (`audio-payload-core.mjs`). Veo3 additionally needs a genuinely new two-stage HD/4K retrieval flow (base generate → separate follow-up call after success) — nothing in the codebase has this concept yet. Runway's `extend` needs a source-clip UI. |
| F | **Suno suite — quick wins only** | 8 of 24 ❌ rows (3 need only a route/field fix, 5 already have the upload UI they need via AudioToolsStudio) | S | Medium — extends Music beyond one working composer | The other 16 (12 need real new UI — time-range picker, mashup uploader, 5-step voice-clone wizard; 2 need reclassification; 2 should be deleted) are real feature work, recommend deferring as a separate epic. |
| G | **Misclassification bugs** — `cover-suno` produces an image not audio, `create-music-video` produces video not audio, Volcengine lipsync is caught by the v2v regex before the lipsync check, 6 of 8 Suno voice-clone steps land in the generic "utility" bucket instead of voice-clone | ~9 models | S | Medium — correctness, not blocking | Classification-logic fixes, same style as the E1 catalog work earlier this session. |
| H | **Webhook signature mechanism is wrong entirely** (HMAC-SHA256 expected, we require a static bearer token KIE can never send) | 0 models — infra only | S–M | Low — polling already covers completion, confirmed working | Correctness/robustness fix, not currently blocking any generation. Lowest priority. |
| I | **Verification sweep** across the full KIE image+video catalog | Whatever's still genuinely dead after A–G | trivial to run | Seals the result | Should run AFTER the code fixes above, not before — running it first would waste probes deactivating models that a code fix would have made callable, and the sweep can't fix wrong schemas, only detect callable-vs-not. |

**Recommended order:** A → B → C (all small, all real code bugs, fix data for free) → D (biggest lever) → E (flagship models, higher effort) → F+G (polish) → I (seal) → H (lowest priority, do whenever).

## Log

<!-- One entry per page reviewed. Newest first. -->

### Template
```
### <provider>/<model-id> — <date>
**Studio/category:** image | video-t2v | video-i2v | video-v2v | audio-tts | audio-music | ...
**Verdict:** ✅ / ❌ / ⚠️
**DB row:** modelId=... exists=yes/no isActive=... capability=...
**What the doc page says:** endpoint, required params, param names/casing, pricing unit
**What we actually send:** (only if ⚠️/❌) diff vs the doc
**Root cause class:** (# from list above, or new)
**Fix needed:** one line, specific
**Status:** logged | batched into PR #... | fixed & deployed
```
