# Audio/Music catalog audit — Suno API, ElevenLabs, Gemini TTS — 2026-08-05

Scope: every `modelType:'audio'` row backed by KIE's dedicated Suno API (music,
utilities, voice-clone) plus the four ElevenLabs and two Gemini TTS Market
models. Read-only pass: doc pages fetched from docs.kie.ai, cross-checked
against `src/lib/audio-payload-core.mjs` / `model-catalog-core.mjs` /
`providers.js` as they exist on branch `fix/audio-generation` (PR #34, not yet
merged to `main`), and the live `ModelPricing` table (SSH, read-only query).

See `docs/MODEL_AUDIT.md` for verdict legend and known bug classes (#1–#6).
Two new root-cause notes from this pass:
- **#7 Output-type misfiling** — a "Suno API" row whose real output is an
  image or a video, not audio, but is still stored as `modelType:'audio'`.
- **#8 Voice-clone kind-split** — `audioKind()`'s regex only matches the
  literal token `voice-generate`, so 6 of the 8 Suno voice-clone workflow
  steps fall through to the generic `"utility"` bucket instead of
  `"voice-clone"`, scattering one workflow across two studio surfaces.

Summary counts (31 entries): **5 ✅ / 1 ⚠️ / 25 ❌**.

---

## Music generation

### suno/generate-music — 2026-08-05
**Studio/category:** audio-music
**Verdict:** ✅
**DB row:** modelId=generate-music exists=yes isActive=true audioKind=music
**Doc says:** `POST /api/v1/generate`, flat body: `prompt`, `customMode`, `instrumental`, `model` (engine enum V4/V4_5/V4_5PLUS/V4_5ALL/V5/V5_5), `callBackUrl`; custom-mode-only `style`/`title`/`negativeTags`/`vocalGender`/`duration` (duration only on V5_5+custom). Poll `GET /api/v1/generate/record-info?taskId=`. No source track needed. Pricing not published on the page.
**We actually send / implement:** `buildSunoMusicBody` in audio-payload-core.mjs builds exactly this shape; `SUNO_MUSIC_RE` matches `generate-music` and bare `suno-vN` ids; poll parsed by `parseSunoPoll`/`isSunoPollBody`. Confirmed working via a real production call this session (per task context).
**Needs a UI affordance?** No — already the from-scratch composer flow.
**Root cause class:** was #3/#6, now fixed.
**Fix needed:** none — already correct. (Only outstanding step: merge `fix/audio-generation` to `main`.)

---

## Suno music-suite operations (transformers/utilities) — none implemented

All 16 rows below share the same diagnosis: `audioProviderFamily()` in
audio-payload-core.mjs only recognizes `generate-music`/bare-`suno-vN`
(→ Suno music route), `elevenlabs/text-to-speech*`, `elevenlabs/text-to-dialogue*`,
and `*-tts` (→ Gemini). None of these 16 ids match any of those regexes, so
each one falls through to `formatAudioRequest → null` and rides
`providers.js`'s generic branch: `POST /api/v1/jobs/createTask` with
`{ model: modelId, input: { prompt, ...rest } }`. Every one of these is a
**dedicated Suno-API operation on its own path** (per root cause class #6),
so the generic Market endpoint answers `422 "The model name you specified is
not supported"` for all of them — same failure class KIE gave for
`generate-music` before PR #34's fix, just never fixed for the other 16
siblings. Every DB row's `inputSchema` is also still the templated
`{ prompt: string }` stub (class #2) — none of the real required fields
(`audioId`, `uploadUrl`, `taskId`, `infillStartS`, …) exist in the schema the
UI renders from, so even a corrected route would have no fields to collect
the right values from yet.

### suno/extend-music — 2026-08-05
**Studio/category:** audio-music (transformer)
**Verdict:** ❌
**DB row:** modelId=extend-music exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/generate/extend`. Required: `defaultParamFlag`, `audioId` (source track), `model`, `callBackUrl`; if `defaultParamFlag:true` also `prompt`/`style`/`title`/`continueAt`. Needs a prior generation's `audioId`.
**We actually send / implement:** not implemented; generic route with wrong fields (`prompt` only, no `audioId`/`continueAt`/`defaultParamFlag`) → 422.
**Needs a UI affordance?** Yes — needs a **source track's audioId**, not a raw uploaded file. AudioToolsStudio's Dropzone produces a `source.url` (a URL), not a KIE `audioId` from a prior generation; extending requires the app to have kept the `audioId` from the track's own generation, or use `upload-and-extend-audio` instead (which does take a raw URL).
**Root cause class:** #6 (dedicated-API 422) + #2 (schema stub)
**Fix needed:** add an `extend-music` case to `audio-payload-core.mjs` targeting `/api/v1/generate/extend`, sourcing `audioId` from the app's own generation-history record (not a fresh upload), plus a real `inputSchema`.

### suno/upload-and-cover-audio — 2026-08-05
**Studio/category:** audio-music (transformer)
**Verdict:** ❌
**DB row:** modelId=upload-and-cover-audio exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/generate/upload-cover`. Required: `uploadUrl` (≤8 min audio), `prompt`, `customMode`, `instrumental`, `model`, `callBackUrl`; custom mode additionally needs `style`/`title`.
**We actually send / implement:** not implemented; generic route sends `prompt` only → 422.
**Needs a UI affordance?** Yes, but AudioToolsStudio's existing Dropzone → `source.url` is exactly the right shape here (a plain uploaded-file URL, not a prior task id) — this is the cleanest of the 16 to wire up.
**Root cause class:** #6 + #2
**Fix needed:** add family mapping `uploadUrl: params.audio_url` → `/api/v1/generate/upload-cover`; real `inputSchema` (`uploadUrl`,`customMode`,`instrumental`,`model`,`style`,`title`).

### suno/upload-and-extend-audio — 2026-08-05
**Studio/category:** audio-music (transformer)
**Verdict:** ❌
**DB row:** modelId=upload-and-extend-audio exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/generate/upload-extend`. Required: `uploadUrl`, `defaultParamFlag`, `continueAt` (seconds), `model`, `callBackUrl`.
**We actually send / implement:** not implemented; generic route → 422.
**Needs a UI affordance?** Yes — AudioToolsStudio's Dropzone supplies `uploadUrl`; `continueAt` needs a new numeric field (a timestamp within the uploaded track) that doesn't exist in the studio today.
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/generate/upload-extend`; add `continueAt` field to the studio + real `inputSchema`.

### suno/add-instrumental — 2026-08-05
**Studio/category:** audio-music (transformer)
**Verdict:** ❌
**DB row:** modelId=add-instrumental exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/generate/add-instrumental`. Required: `uploadUrl`, `title`, `tags`, `negativeTags`, `callBackUrl`.
**We actually send / implement:** not implemented; generic route sends `prompt` only (no `title`/`tags`/`uploadUrl`) → 422.
**Needs a UI affordance?** Yes — Dropzone supplies `uploadUrl`; needs `title`/`tags`/`negativeTags` text fields, which the current single-`prompt` AudioToolsStudio form doesn't expose.
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/generate/add-instrumental`; expand form fields; real `inputSchema`.

### suno/add-vocals — 2026-08-05
**Studio/category:** audio-music (transformer)
**Verdict:** ❌
**DB row:** modelId=add-vocals exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/generate/add-vocals`. Required: `prompt`, `title`, `negativeTags`, `style`, `uploadUrl`, `callBackUrl`.
**We actually send / implement:** not implemented; generic route → 422 (missing `title`/`style`/`uploadUrl`).
**Needs a UI affordance?** Yes — same shape as add-instrumental.
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/generate/add-vocals`; add `title`/`style`/`negativeTags` fields; real `inputSchema`.

### suno/boost-music-style — 2026-08-05
**Studio/category:** audio-tools (enhancement)
**Verdict:** ❌
**DB row:** modelId=boost-music-style exists=yes isActive=true audioKind=enhancement
**Doc says:** `POST /api/v1/style/generate`. ONE required field: `content` (style description string). No source audio at all — it's a text-in/text-out style-tag booster, not an audio transform.
**We actually send / implement:** not implemented; generic route sends `{model, input:{prompt}}` — wrong field name (`content` vs `prompt`) → likely 422/validation error even though no audio is needed.
**Needs a UI affordance?** No — it's pure text, already what AudioToolsStudio's prompt box provides; only the field name is wrong.
**Root cause class:** #4 (field-name mismatch), easiest fix of the 16.
**Fix needed:** family mapping `{ path: "/api/v1/style/generate", body: { content: prompt } }` — one line.

### suno/cover-suno — 2026-08-05
**Studio/category:** MISFILED — image, not audio
**Verdict:** ❌
**DB row:** modelId=cover-suno exists=yes isActive=true audioKind=utility (modelType=audio, capability=audio)
**Doc says:** `POST /api/v1/suno/cover/generate`. Generates **album-cover ARTWORK (image files)** from a `taskId`, not audio — "Generate personalized cover images based on original music tasks," typically 2 images. Required: `taskId`, `callBackUrl`.
**We actually send / implement:** not implemented; also stored under the wrong `modelType`/`capability` entirely — this is an image-generation endpoint filed as an audio row.
**Needs a UI affordance?** N/A until reclassified — belongs in an image studio fed by a prior music `taskId`, not AudioToolsStudio.
**Root cause class:** #7 (new — output-type misfiling), same shape as MODEL_AUDIT.md's #5 (video-as-image misfiling) but for audio-as-image.
**Fix needed:** re-`modelType`/`capability` to image (or a dedicated "cover-art" capability), then build the dedicated route.

### suno/replace-section — 2026-08-05
**Studio/category:** audio-music (transformer)
**Verdict:** ❌
**DB row:** modelId=replace-section exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/generate/replace-section`. Required: `prompt`,`tags`,`title`,`infillStartS`,`infillEndS`,`fullLyrics`, plus EITHER `taskId`+`audioId` (existing track) OR `uploadUrl`+`model` (fresh upload). Time window 6–60s, ≤50% of track length.
**We actually send / implement:** not implemented; generic route sends only `prompt` → 422.
**Needs a UI affordance?** Yes, and it's the most UI-heavy of the 16: needs a start/end time-range picker plus full replacement lyrics, on top of the source track.
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/generate/replace-section`; add time-range + lyrics fields; real `inputSchema`.

### suno/generate-persona — 2026-08-05
**Studio/category:** audio-voice-clone-adjacent (character persona, reusable across future generations)
**Verdict:** ❌
**DB row:** modelId=generate-persona exists=yes isActive=true audioKind=voice-clone
**Doc says:** `POST /api/v1/generate/generate-persona`. Required: `taskId`+`audioId` (from a completed Generate/Extend Music call — model must be v3.5+), `name`, `description`. Optional `vocalStart`/`vocalEnd` (10–30s window). One Persona per audioId, ever.
**We actually send / implement:** not implemented; generic route → 422.
**Needs a UI affordance?** Yes — needs the app's OWN prior-generation `taskId`/`audioId` (post-hoc, chained off a completed `generate-music` call), not a raw file upload; AudioToolsStudio's Dropzone can't supply this.
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/generate/generate-persona`; UI surface for "turn this generated track into a Persona" chained off generation history.

### suno/generate-mashup — 2026-08-05
**Studio/category:** audio-music (transformer, multi-source)
**Verdict:** ❌
**DB row:** modelId=generate-mashup exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/generate/mashup`. Required: `uploadUrlList` (array, **exactly 2 URLs**), `prompt`, `customMode`, `model`, `callBackUrl`; custom mode adds `style`/`title`.
**We actually send / implement:** not implemented; generic route → 422.
**Needs a UI affordance?** Yes — and beyond what AudioToolsStudio has: needs **two** source tracks, not one. Current Dropzone is single-file.
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/generate/mashup`; extend AudioToolsStudio (or a dedicated mashup surface) to accept 2 uploads.

### suno/generate-lyrics — 2026-08-05
**Studio/category:** audio-tools utility (text output, not audio)
**Verdict:** ❌
**DB row:** modelId=generate-lyrics exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/lyrics`. Required: `prompt` (≤200 chars), `callBackUrl`. Returns 2–3 lyric variations as text.
**We actually send / implement:** not implemented; generic route posts to `/api/v1/jobs/createTask` instead of `/api/v1/lyrics` → 422. (Field name `prompt` happens to already match, but the path doesn't.)
**Needs a UI affordance?** No — pure text in/out, already what the prompt box provides. Output rendering (text, not an audio player) is a display concern, not a submit-shape one.
**Root cause class:** #6, otherwise trivial.
**Fix needed:** family mapping `{ path: "/api/v1/lyrics", body: { prompt } }` — one line, cheapest fix in the whole suite besides boost-music-style.

### suno/convert-to-wav — 2026-08-05
**Studio/category:** audio-tools (conversion)
**Verdict:** ❌
**DB row:** modelId=convert-to-wav exists=yes isActive=true audioKind=conversion
**Doc says:** `POST /api/v1/wav/generate`. Required: `taskId`, `audioId`, `callBackUrl`. No `prompt` field at all — this needs identifiers from a PRIOR generation, not text.
**We actually send / implement:** not implemented; generic route sends only `prompt` (a field this endpoint doesn't even accept) → 422.
**Needs a UI affordance?** Yes — needs `taskId`+`audioId` from generation history, not a raw upload (a track has to have been generated through this app's Suno flow first; there's no "convert an arbitrary uploaded file to WAV" mode per the doc).
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/wav/generate` sourcing `taskId`/`audioId` from generation history; drop the `prompt` requirement from the schema entirely.

### suno/separate-vocals — 2026-08-05
**Studio/category:** audio-tools (enhancement)
**Verdict:** ❌
**DB row:** modelId=separate-vocals exists=yes isActive=true audioKind=enhancement
**Doc says:** `POST /api/v1/vocal-removal/generate`. Required: `audioId` plus EITHER `taskId` (prior generation) OR `audioUrl` (raw upload, ≤20MB); optional `type` (`separate_vocal`/`split_stem`/`split_stem_advanced`, pricing differs 10/50/20 credits). This is the one op in the suite with published per-mode pricing.
**We actually send / implement:** not implemented; generic route sends `prompt`+`audio_url` (AudioToolsStudio's Dropzone already produces `audio_url`, which is CLOSE to the doc's `audioUrl` but wrong casing, and `audioId` is still missing) → 422.
**Needs a UI affordance?** Partially there — AudioToolsStudio's Dropzone already supplies a raw file URL. Needs casing fix (`audio_url`→`audioUrl`) and a `type` selector to expose the 10/50/20-credit pricing tiers honestly.
**Root cause class:** #6 + #4 (casing) + #2
**Fix needed:** family mapping to `/api/v1/vocal-removal/generate` with `audioUrl: params.audio_url`, `type` field, and per-mode `creditsCost`.

### suno/generate-midi — 2026-08-05
**Studio/category:** audio-tools (conversion)
**Verdict:** ❌
**DB row:** modelId=generate-midi exists=yes isActive=true audioKind=conversion
**Doc says:** `POST /api/v1/midi/generate`. Required: `taskId` **from a completed Vocal Separation task** (not a music-generation task), `callBackUrl`; optional `audioId`.
**We actually send / implement:** not implemented; generic route → 422.
**Needs a UI affordance?** Yes, and it's chained TWO levels deep: requires a separate-vocals task to have already run and completed, then feeds that task's id in here. No raw-upload path exists per the doc.
**Root cause class:** #6 + #2
**Fix needed:** family mapping to `/api/v1/midi/generate`; UI must chain off a completed separate-vocals job, not accept a direct upload.

### suno/create-music-video — 2026-08-05
**Studio/category:** MISFILED — video, not audio
**Verdict:** ❌
**DB row:** modelId=create-music-video exists=yes isActive=true audioKind=utility (modelType=audio, capability=audio), creditsCost=2
**Doc says:** `POST /api/v1/mp4/generate`. Required: `taskId`+`audioId` (from Generate/Extend Music), `callBackUrl`; optional `author`/`domainName` watermark text. **Produces an MP4 video file**, not audio.
**We actually send / implement:** not implemented; also filed under the wrong `modelType`/`capability`, same as `cover-suno`.
**Needs a UI affordance?** N/A until reclassified — belongs in a video studio fed by a prior music `taskId`, not AudioToolsStudio.
**Root cause class:** #7 (output-type misfiling)
**Fix needed:** re-`modelType`/`capability` to video; then family mapping to `/api/v1/mp4/generate`.

### suno/generate-sounds — 2026-08-05
**Studio/category:** audio-sfx
**Verdict:** ❌
**DB row:** modelId=generate-sounds exists=yes isActive=true audioKind=sfx
**Doc says:** `POST /api/v1/generate/sounds`. Required: `prompt` (≤500 chars), `model` (enum `V5`/`V5_5`). Optional `soundLoop`,`soundTempo`,`soundKey`,`grabLyrics`,`callBackUrl`. No source track.
**We actually send / implement:** not implemented; `SUNO_MUSIC_RE` requires the literal substring `generate-music`, so `generate-sounds` does NOT match despite being on a near-identical dedicated route — falls to generic → 422.
**Needs a UI affordance?** No — text-only, already what the prompt box provides; just needs its own route + required `model` enum default.
**Root cause class:** #6 (a Suno-family sibling that SHOULD have gotten the same fix as generate-music but didn't)
**Fix needed:** add a dedicated family (or extend `SUNO_MUSIC_RE`-style matching) targeting `/api/v1/generate/sounds` with a default `model:"V5_5"`.

---

## Suno voice-clone workflow — entirely unimplemented (8 endpoints)

None of these 8 match any family in `audioProviderFamily()`. Two
(`suno-voice-generate`, `suno-voice-generate-callback`) classify as
`audioKind:"voice-clone"` and surface in `AudioStudio`'s "Voice cloning"
segment as a single-shot "Build voice" submit — but the doc's real flow is a
5-call chain (validate → user records the phrase externally → generate with
`verifyUrl` → poll record-info → optionally regenerate/check-voice), which no
single-shot form can express. The other 6 fall through `audioKind()`'s regex
(`/voice-generate|voice-clone|persona/` only matches the literal token
`voice-generate`) into the generic `"utility"` bucket and surface inside
AudioToolsStudio instead — mislabeled as an audio-enhancement utility even
though none of them take an audio-track upload; they take a recorded-phrase
URL, or just a bare `taskId` for polling/regenerating. This is root cause
**#8**, new this pass.

### suno/suno-voice-validate — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=utility (should be voice-clone)
**Doc says:** `POST /api/v1/voice/validate`. Required: `voiceUrl` (a recording the USER already has), `vocalStartS`, `vocalEndS`; optional `language`, `callBackUrl`. Returns a `taskId` + a server-generated validation phrase for the user to read aloud and re-upload.
**We actually send / implement:** not implemented; generic route sends `prompt` → 422.
**Needs a UI affordance?** Yes — a wholly new "record/upload yourself reading this phrase" step, step 1 of a 5-step wizard that doesn't exist yet.
**Fix needed:** dedicated family + a real voice-clone wizard surface (out of scope for a single-form fix).

### suno/suno-voice-validate-info — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=utility
**Doc says:** `GET /api/v1/voice/validate-info?taskId=`. Returns the validation phrase text + status. Read-only poller, no body.
**We actually send / implement:** not implemented (no GET-with-query-param path exists for this id at all; would need its own poll wiring, not a submit).
**Needs a UI affordance?** It's a poll step, not a submit — belongs inside the wizard's step 1→2 transition.
**Fix needed:** wire as a poll (like `SUNO_POLL_PATH`), not a submit-with-prompt.

### suno/suno-voice-generate — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=voice-clone (correctly classified, but unimplemented and orphaned in a single-shot form)
**Doc says:** `POST /api/v1/voice/generate`. Required: `taskId` (from validate step), `verifyUrl` (the user's recorded phrase). Optional `voiceName`,`description`,`style`,`singerSkillLevel`.
**We actually send / implement:** not implemented; generic route sends `prompt` → 422. AudioStudio's "Build voice" submit has neither a prior `taskId` nor a `verifyUrl` to send — its single free-text description field doesn't map to any required field here at all.
**Needs a UI affordance?** Yes — this is step 3 of the wizard; needs the chained `taskId` from step 1 and an uploaded `verifyUrl` recording, not a text description.
**Fix needed:** same as above — dedicated family + wizard, not a fix to the existing single form.

### suno/suno-voice-generate-callback — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=voice-clone
**Doc says:** not a callable endpoint — it's the webhook payload shape delivered to `callBackUrl` after `suno-voice-generate` completes.
**We actually send / implement:** stored as a fully separate catalog row with the generic `{prompt}` schema, as if it were its own submittable model — it isn't one.
**Needs a UI affordance?** No — this shouldn't be a `ModelPricing` row at all.
**Fix needed:** deactivate/remove; callback shapes aren't models. (Same class as the `*-details`/`*-callbacks` pages that correctly did NOT get synced as rows — this one slipped through.)

### suno/suno-voice-record-info — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=utility
**Doc says:** `GET /api/v1/voice/record-info?taskId=`. Returns `voiceId` (usable in future generations), status, error fields. Read-only poller.
**We actually send / implement:** not implemented as a poll; stored as a submittable `{prompt}` row.
**Needs a UI affordance?** It's a poll step (wizard step 4), not a submit form.
**Fix needed:** wire as a poll; drop the fabricated `prompt` schema.

### suno/suno-voice-regenerate — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/voice/regenerate`. Required: `taskId`, `calBackUrl` (note: doc's own field is misspelled `calBackUrl`, not `callBackUrl` — worth a live probe before trusting the doc literally, since KIE's other 20+ endpoints all use `callBackUrl`).
**We actually send / implement:** not implemented; generic route → 422.
**Needs a UI affordance?** Just a "retry validation phrase" button chained off an existing `taskId` — no new input fields, just the right route.
**Fix needed:** dedicated family targeting `/api/v1/voice/regenerate`; verify the `calBackUrl` vs `callBackUrl` spelling with a live probe before shipping (doc typo risk).

### suno/suno-voice-validate-callback — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=utility
**Doc says:** webhook payload shape for the validate step, same non-model nature as `suno-voice-generate-callback`.
**We actually send / implement:** stored as its own submittable `{prompt}` row — shouldn't exist as a model.
**Needs a UI affordance?** No.
**Fix needed:** deactivate/remove.

### suno/suno-voice-check-voice — 2026-08-05
**Verdict:** ❌ **DB row:** exists=yes isActive=true audioKind=utility
**Doc says:** `POST /api/v1/voice/check-voice`. Required: `task_id` (note: snake_case, unlike every other Suno endpoint's camelCase `taskId` — a genuine one-off in KIE's own API). Returns `{isAvailable: bool}`.
**We actually send / implement:** not implemented; generic route sends `prompt` → 422 (and would send the wrong-cased `taskId` even if wired through the usual mapper, since this one field is a documented exception).
**Needs a UI affordance?** Minimal — a "check availability" button off an existing `taskId`.
**Fix needed:** dedicated family targeting `/api/v1/voice/check-voice` with the literal `task_id` casing (do not run this one through the normal camelCase mapper).

---

## ElevenLabs (Market-routed)

### elevenlabs/audio-isolation — 2026-08-05
**Studio/category:** audio-tools (enhancement)
**Verdict:** ⚠️
**DB row:** modelId=elevenlabs/audio-isolation exists=yes isActive=true audioKind=enhancement, creditsCost=3
**Doc says:** generic Market route `POST /api/v1/jobs/createTask`, `{model:"elevenlabs/audio-isolation", input:{audio_url}}`. `audio_url` is the ONLY input field documented; no `prompt`/`text` field exists for this model at all. Max 10MB, formats mpeg/wav/aac/mp4/ogg.
**We actually send / implement:** `audioProviderFamily()` deliberately does NOT claim this id (per the code's own comment, "takes a plain audio_url and is verified working as-is") — it rides the fully generic branch `{model, input:{prompt, ...rest}}`. AudioToolsStudio's Dropzone does correctly add `audio_url` to `rest`, so `input.audio_url` DOES get sent — but `input.prompt` (always populated, since the studio's submit button is gated on `prompt.trim()`) rides along too, a field the doc never lists as accepted. The code comment claims this is verified working; that claim predates this pass and could not be re-verified here (read-only, no live calls permitted).
**Needs a UI affordance?** Already has one (Dropzone → `audio_url`) — the concern is the extraneous `prompt`, not a missing upload path.
**Root cause class:** #2 — DB `inputSchema` still lists `prompt` as the (only) required field, which is backwards; `audio_url` isn't in the schema at all despite being the actual requirement.
**Fix needed:** correct `inputSchema` to require `audio_url` and make `prompt` optional/absent for this row; confirm live that the extra `prompt` key doesn't 422.

### elevenlabs/text-to-dialogue-v3 — 2026-08-05
**Studio/category:** audio-dialogue
**Verdict:** ✅ (implementation correct; currently blocked by an ElevenLabs-side outage per this session's live probes, not a bug here)
**DB row:** modelId=elevenlabs/text-to-dialogue-v3 exists=yes isActive=true audioKind=dialogue
**Doc says:** generic Market route, `input.dialogue: [{text, voice}]`, optional `stability` (0/0.5/1.0), `language_code`.
**We actually send / implement:** `buildElevenLabsDialogueInput` builds exactly `{dialogue:[{text, voice}], ...}`, resolving the studio's voice slugs (rachel/domi/…) to real ElevenLabs voice IDs via `ELEVENLABS_VOICE_IDS`. Matches the doc.
**Needs a UI affordance?** No.
**Root cause class:** was #4, fixed.
**Fix needed:** none. (Retest once the upstream ElevenLabs outage clears.)

### elevenlabs/text-to-speech-multilingual-v2 — 2026-08-05
**Studio/category:** audio-tts
**Verdict:** ✅
**DB row:** modelId=elevenlabs/text-to-speech-multilingual-v2 exists=yes isActive=true audioKind=tts
**Doc says:** generic Market route, `input.text` (not `prompt`), `input.voice` (not `voiceId`), optional `stability`,`similarity_boost`,`style`,`speed`(0.7–1.2),`timestamps`,`previous_text`,`next_text`,`language_code`.
**We actually send / implement:** `buildElevenLabsTtsInput` sends `text`+`voice`, maps `stability`/`similarity_boost`/`speed`/`style`/`language_code`/`timestamps`/`previous_text`/`next_text` via `ELEVENLABS_TTS_MAP`. DB `inputSchema` (speed/voice/prompt/stability/similarity_boost) matches. Confirmed working live this session (per task context).
**Needs a UI affordance?** No.
**Root cause class:** was #4, fixed.
**Fix needed:** none.

### elevenlabs/text-to-speech-turbo-2-5 — 2026-08-05
**Studio/category:** audio-tts
**Verdict:** ✅
**DB row:** modelId=elevenlabs/text-to-speech-turbo-2-5 exists=yes isActive=true audioKind=tts
**Doc says:** same shape as multilingual-v2 (`text`,`voice`, same optional fields).
**We actually send / implement:** same `buildElevenLabsTtsInput` path — matches.
**Needs a UI affordance?** No.
**Root cause class:** was #4, fixed.
**Fix needed:** none.

---

## Google Gemini TTS (Market-routed)

### google/gemini-3-1-flash-tts — 2026-08-05
**Studio/category:** audio-tts (multi-speaker dialogue engine used in single-voice mode)
**Verdict:** ✅
**DB row:** modelId=google/gemini-3-1-flash-tts exists=yes isActive=true audioKind=tts, creditsCost=13
**Doc says:** generic Market route, `input.speakers:[{speaker_id, voice_name, accent, ...}]` + `input.dialogue_turns:[{speaker_id, text}]`; optional `temperature`,`scene`,`sample_context`.
**We actually send / implement:** `buildGeminiTtsInput` builds a one-speaker `speakers`/`dialogue_turns` pair from the studio's single prompt+voice, or forwards caller-supplied multi-speaker arrays verbatim. Confirmed working live this session, real audio returned (per task context).
**Needs a UI affordance?** No for single-voice; a true multi-speaker dialogue UI (like ElevenLabs' dialogue mode) would be a nice-to-have, not a bug.
**Root cause class:** was #4, fixed.
**Fix needed:** none.

### google/gemini-2-5-pro-tts — 2026-08-05
**Studio/category:** audio-tts
**Verdict:** ❌
**DB row:** no row — this modelId does **not** exist in `ModelPricing` at all (confirmed by direct SQL query filtered on `modelType='audio'`, ordered by modelId — absent).
**Doc says:** generic Market route `https://docs.kie.ai/google/gemini-2-5-pro-tts.md` (note: NOT under `/market/google/`, unlike its 3.1-flash sibling — a slightly different sitemap path but still Market-routed per the page's own text: "Model Type: Market-routed model"). Same shape as gemini-3-1-flash-tts: `speakers[]` (with `speaker_id`,`voice_name` from a 30-voice list, `accent`, optional `audio_profile`/`style`/`pace`) + `dialogue_turns[]`.
**We actually send / implement:** not implemented — nothing to implement against, since it isn't in the catalog. `GEMINI_TTS_RE` (`/gemini[a-z0-9.\-]*-tts($|[^a-z])/`) WOULD match `gemini-2-5-pro-tts` if the row existed, so the mapping code is already ready for it.
**Needs a UI affordance?** No — same single-voice pattern as gemini-3-1-flash-tts once the row exists.
**Root cause class:** new — catalog sync gap (the `/google/gemini-2-5-pro-tts` page's off-pattern path, outside `/market/google/`, likely wasn't picked up by `kie-sync.js`'s sitemap walk the same way its Market-namespaced sibling was).
**Fix needed:** add a `ModelPricing` row for `google/gemini-2-5-pro-tts` (Market, `modelType:audio`, `capability:text-to-speech`) — the payload code needs no changes, only the catalog entry.

---

## Cross-cutting findings (not per-model)

1. **Voice-clone kind-split (#8, new).** `AUDIO_KIND_RULES`'s voice-clone regex
   (`/voice-generate|voice-clone|persona/`) only matches `suno-voice-generate`
   and `suno-voice-generate-callback` by literal substring; the other 6
   voice-clone-workflow ids (`validate`, `validate-info`, `validate-callback`,
   `record-info`, `regenerate`, `check-voice`) all fall to the `"utility"`
   catch-all and surface in AudioToolsStudio next to genuine audio-editing
   tools, despite none of them accepting an audio-track upload. Fix: extend
   the regex to `/voice-generate|voice-clone|persona|^suno-voice-/` (or match
   on the `suno-voice-` prefix directly) so all 8 land together, then decide
   whether a dedicated voice-clone wizard (5-step chain) replaces the current
   single-shot "Build voice" form in `AudioStudio.js`.

2. **Output-type misfiling (#7, new).** `cover-suno` (image) and
   `create-music-video` (MP4 video) are both stored under `modelType:'audio'`
   / `capability:'audio'`. Same bug class as MODEL_AUDIT.md's existing #5
   (video-as-image misfiling in the image catalog) — the sitemap-driven sync
   filed both under their SOURCE API family (Suno) rather than their OUTPUT
   type. Neither belongs in an audio studio once reachable.

3. **`inputSchema` is uniformly wrong across all 16 unimplemented Suno-suite
   rows and all 8 voice-clone rows** (root cause #2): every single one is the
   templated `{ prompt: { type: "string", required: true, maxLength: 5000 } }`
   stub, regardless of whether the real endpoint wants `audioId`, `uploadUrl`,
   `taskId`, `infillStartS`/`infillEndS`, `voiceUrl`, or nothing resembling
   text at all (`content`, `task_id`). Fixing the routes in
   `audio-payload-core.mjs` without also fixing these schemas would leave the
   admin UI and cost calculator collecting/pricing the wrong fields.

4. **Two rows are pure webhook-callback payload shapes, not models**
   (`suno-voice-generate-callback`, `suno-voice-validate-callback`) — every
   OTHER callback page in the Suno sitemap (`generate-music-callbacks`,
   `extend-music-callbacks`, etc.) correctly did NOT get synced as a
   `ModelPricing` row; these two slipped through. Should be deactivated like
   the already-deprecated `elevenlabs-tts-*`/`gemini-*-tts` legacy rows.

## Summary for the caller

- **31 entries audited.** ✅ 5 (generate-music, 3× ElevenLabs, gemini-3-1-flash-tts) / ⚠️ 1 (elevenlabs/audio-isolation, schema-only issue) / ❌ 25.
- **Of the 25 ❌:** 1 is a missing catalog row (`google/gemini-2-5-pro-tts` — code is ready, just needs the DB row). The other 24 are real Suno-API rows with no dedicated route wired up yet.
- **Genuinely fixable with just an UPLOADED-FILE UI affordance** (AudioToolsStudio's existing Dropzone → `uploadUrl`/`audioUrl` is the right shape, no new UI concept needed): `upload-and-cover-audio`, `upload-and-extend-audio`, `add-instrumental`, `add-vocals`, `separate-vocals` (casing fix only) — **5 operations**.
- **Fixable with NO new UI at all**, just a route/field fix in audio-payload-core.mjs: `boost-music-style`, `generate-lyrics`, `generate-sounds` — **3 operations** (cheapest wins in the whole set).
- **Need a NEW UI concept beyond a single file upload** (time-range picker, 2-file mashup, chained taskId from generation history, a real 5-step voice-clone wizard): `extend-music`, `replace-section`, `generate-persona`, `generate-mashup`, `generate-midi`, `convert-to-wav`, and all 6 real voice-clone steps — **12 operations**.
- **Need reclassification before they can be fixed at all** (wrong modelType/capability, output isn't audio): `cover-suno`, `create-music-video` — **2 operations**.
- **Should be deleted, not fixed** (webhook shapes stored as models): `suno-voice-generate-callback`, `suno-voice-validate-callback` — **2 rows**.
