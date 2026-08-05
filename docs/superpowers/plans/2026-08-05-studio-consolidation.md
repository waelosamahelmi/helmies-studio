# Studio Consolidation & Model Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every model correct against its real API (per `docs/MODEL_AUDIT.md` + `docs/model-audit/*`), dead models removed, missing models added, Alibaba retired; the 20-tool nav consolidated into mode-switching studios; a real Suno music studio with timeline editing; voice cloning persisted and reusable; light mode.

**Architecture:** Phase M (models — the audit's fix plan A→I, Alibaba removal, admin schema editing) then Phase S (studio consolidation + music timeline + light mode) then final QA. DB stays the single source of truth for model existence/pricing/params; per-provider-family adapters (the `audio-payload-core.mjs` pattern) are code.

## Owner's design questions — answered (these ARE the decisions; build to them)

1. **Image studio** absorbs: Image (t2i), image-to-image/edit, upscale, **Cinema** (becomes a "Cinematic" preset mode — same t2i models with curated prompt scaffolding, not its own tool), **Influencer** (same — a preset mode), **Canvas** (becomes the "Canvas" mode inside Image — the compositing editor opens as a mode, not a separate rail item). Modes: **Create / Edit / Upscale / Canvas**, preset chips (Cinematic, Influencer) inside Create.
2. **Video studio** absorbs: Text-to-Video, Image-to-Video, **Motion** (ttv preset — mode merge), **Video Edit** (v2v), **Recast** (v2v preset), **Clipping** (timeline trim of an uploaded/generated clip). Modes: **Text→Video / Image→Video / Edit (v2v) / Clips (timeline)**.
3. **Audio studio** keeps Speech/Dialogue/Voice-clone/SFX modes + **Audio Tools** folds in as a "Tools" mode.
4. **Music becomes its own flagship studio** (the Suno docs justify it): generate, then a **timeline view** of the track where extend (append), replace-section (time-range picker), cover, add-vocals/instrumental, separate-vocals operate on the selected track/range via the real Suno endpoints. Persistent track history (generations already persist; the studio reads them back).
5. **Voice cloning persists.** New `VoiceProfile` DB model (userId, provider voice id, name, status) written by the Suno voice-clone workflow; TTS/music vocal modes list the user's cloned voices as selectable options.
6. **Perform studio** absorbs Lip Sync / Avatar / **Persona** as modes.
7. **Marketing** stays a distinct tool (campaign semantics, not a mode of video).
8. **Library** (Assets/Brands/Projects) and **Direct** (Agent/Director/Workflows) unchanged structurally.
9. Old tool URLs (`/studio/cinema` etc.) redirect to the new studio+mode (`/studio/image?mode=create&preset=cinematic`) — bookmarks must not break.
10. **Light mode**: full light theme via CSS custom-property swap on `[data-theme="light"]` + toggle in Shell (persisted localStorage + respects `prefers-color-scheme`), tokens defined alongside the dark ones in `system.css`. Landing page stays as-is (off-limits).

## Global Constraints
- All prior session constraints hold: NEVER touch live DATABASE_URL with migrate/push; test DB `postgresql://postgres:test@localhost:55432/test`; port-3399 kill rule before every Playwright run (`CI=1`); providers never user-visible; money invariants; route-manifest registration; commit footers (`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_011b4sNmey45tunVt3b9HZhr`); migrations authored offline, applied to test DB only, deployed with build-before-migrate.
- The six audit files in `docs/model-audit/` are the SOURCE OF TRUTH for real endpoints/params/enums — implementers read them, not the live docs (already extracted).
- Mobile project + a11y gates now exist — keep them green; new UI must pass the 44px/overflow/reachability sweeps.

---

## Phase M — model truth

### M1: Code-bug fixes (audit classes A, B, C, G)
**Files:** `src/lib/generation-handler.js` + `src/lib/provider-payload-core.mjs` (A: absolutize app-relative media URLs — `/api/media/local/<key>` → `${NEXTAUTH_URL}/api/media/local/<key>` — in ONE place before provider submit, never for already-absolute URLs); `src/lib/kie-sync.js` (B: id normalization — qwen2 stays qwen2, version dots preserved `seedance-1.5-pro`, no spurious `google/`/`gpt/` prefixes, PixVerse `-v6` segment, kling version-prefix forms per `video-market.md`; C: fix the "gemini"→llm skip bug — the MEDIA_EXCEPTIONS guard is wired to the wrong function; find why MiniMax-H3 never synced); `src/lib/model-catalog-core.mjs` (G: `cover-suno`→image output, `create-music-video`→video output, volcengine lipsync regex order, voice-clone kind coverage for all 8 steps, delete the 2 pure-callback rows via the backfill).
Tests per fix, pinned to the exact audit examples. Extend `scripts/fix-model-categories.mjs` to persist all of it.

### M2: Alibaba retirement + fabricated schemas (D) + dedicated adapters (E)
**Files:** `src/lib/providers.js` (remove the Alibaba adapter path from user-facing resolution — deactivate all 43 Alibaba rows via backfill, keep code able to read old Generation rows; per owner decision KIE-only now); `src/lib/model-catalog-core.mjs` `CURATED_SCHEMAS` (D: add vendor-family schemas for image+video using the REAL params/enums already extracted in `image-market.md` and `video-market.md` — Seedream, Nano Banana/Imagen, Flux2, Grok Imagine, GPT-Image, Ideogram, Qwen2/3, Z-Image, Topaz, Recraft, KIE-Wan, Kling, Seedance, Hailuo, PixVerse, MiniMax-H3, Infinitalk, Gemini-Omni, OmniHuman, Volcengine); new `src/lib/image-payload-core.mjs` + `src/lib/video-payload-core.mjs` adapters (E: 4o Image `/api/v1/gpt4o-image/generate`, Flux Kontext `/api/v1/flux/kontext/generate`, Runway `/api/v1/runway/generate` + aleph, Veo3 `/api/v1/veo/generate` + the TWO-STAGE 1080p/4K retrieval per `video-dedicated.md`), mirroring `audio-payload-core.mjs`'s dispatch pattern in `submitOnly`/poll.
Backfill + `scripts/verify-catalog.mjs` batches (I) run on the server AFTER deploy; missing models (Qwen3 image line, MiniMax-H3, Gemini-Omni) enter via corrected sync.

### M3: Suno quick wins (F) + admin schema editing
**Files:** `src/lib/audio-payload-core.mjs` (routes for `boost-music-style`, `generate-lyrics`, `generate-sounds` — no UI needed; plus `upload-and-cover-audio`, `upload-and-extend-audio`, `add-instrumental`, `add-vocals`, `separate-vocals` — AudioToolsStudio's existing upload supplies `audio_url`/file per `audio-music.md`); `src/components/admin/ModelManager.js` + `src/app/api/admin/models/route.js` (admin can view/edit a model's `inputSchema` JSON with validation + preview, so schema fixes no longer require code).

---

## Phase S — studios

### S1: Consolidated studios + nav regroup + redirects
**Files:** `src/components/studio/kit/tools.js` (new grouping: Direct{Agent,Director,Workflows} / Make{Image,Video,Audio,Music} / Perform{Perform,Marketing} / Library{Assets,Brands,Projects}); `ImageStudio.js` (modes Create/Edit/Upscale/Canvas + preset chips Cinematic/Influencer — CanvasStudio mounts as the Canvas mode), `VideoStudio.js` (modes T2V/I2V/Edit/Clips — VideoEditStudio+RecastStudio+MotionStudio+ClippingStudio fold in as modes/presets), `AudioStudio.js` (+Tools mode), new `PerformStudio.js` (LipSync/Avatar/Persona modes); `src/app/studio/[tool]/page.js` legacy-slug redirects with mode/preset query params; `StudioClient.js` map. Mode state in the URL (`?mode=`) so links/bookmarks work. E2E: every legacy slug redirects and renders; each mode lists only its capability pool; mobile sweeps stay green.

### S2: Music timeline studio + voice profiles
**Files:** rework `MusicStudio.js` — generate panel + **track timeline** (waveform-lite bar with time-range selection; extend appends via `extend-music`, `replace-section` takes the selected range, cover/add-vocals/add-instrumental/separate-vocals act on the selected track), track history from Generations; migration `VoiceProfile` (id,userId,provider,voiceId,name,status,createdAt) + the 5-step Suno voice-clone wizard in Audio's Voice-clone mode writing profiles; TTS + Music vocal pickers list the user's profiles. Money: every op quotes server-side as today.

### S3: Light mode
**Files:** `src/styles/system.css` (light token set under `[data-theme="light"]` for every `--ink/tx/line/…` token, WCAG-checked), `Shell.js` toggle (+localStorage + prefers-color-scheme default), `Providers.js`/`layout.js` early-set script to avoid flash. E2E: toggle persists across reload; a11y contrast sweeps pass in BOTH themes (extend the axe spec to run once per theme on core pages).

### S4: Final QA
Full gates all browsers+mobile; real generation smoke on prod (1 image, 1 video, 1 music, 1 TTS after ElevenLabs recovers); verification sweep batches; update `docs/MODEL_AUDIT.md` statuses; deploy runbook per phase.

## Self-Review
1. Every owner question above has a decision; audit classes A–I all mapped (M1: A/B/C/G, M2: D/E + Alibaba, M3: F + admin schemas, I after deploy).
2. No placeholders — implementers get exact params from `docs/model-audit/*`.
3. Deferred deliberately: Suno operations needing wholly new interaction concepts beyond S2's timeline (mashup 2-file, MIDI) — logged in audit as out-of-scope-for-now; webhook HMAC (class H) scheduled last, not in this plan's critical path.
