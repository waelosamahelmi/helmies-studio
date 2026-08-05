# PROGRESS.md — the single source of truth for session continuity

> **READ THIS FIRST in every new session.** This file is the handoff contract:
> what is done, what is in flight, what is next, and the rules that prevent a
> new session from corrupting work already underway. **Always follow the plan
> files; always update the checkboxes here the moment something merges or
> deploys; always note WHERE YOU STOPPED at the bottom before a session ends.**

## How to work (non-negotiable rules, learned the hard way)

1. **Plans are binding.** Active plan: `docs/superpowers/plans/2026-08-05-studio-consolidation.md` (phases M and S). Model truth data: `docs/MODEL_AUDIT.md` + `docs/model-audit/*` (doc-verified endpoints/params — build from these, don't re-fetch provider docs).
2. **Never** run prisma migrate/db push or ANY write against the `.env` DATABASE_URL — that is LIVE PRODUCTION with paying users. Test DB: `postgresql://postgres:test@localhost:55432/test` (container `helmies-test-pg`, shared — never drop it). Pass `TEST_DATABASE_URL` explicitly to integration/e2e commands.
3. **Port 3399 is shared** by every worktree's Playwright (`reuseExistingServer: !CI`). Before EVERY e2e run: kill all listeners on 3399, then run synchronously with `CI=1`. If many unrelated specs fail at once, you attached to another worktree's server — kill and re-run before believing anything.
4. **One agent per file region.** When dispatching parallel agents, give each an explicit DO-NOT-TOUCH list covering the other's files. `src/lib/model-catalog-core.mjs` is split-owned by function (inference vs CURATED_SCHEMAS) — never let two agents edit it blind.
5. **Server scripts must load env with `import "dotenv/config"`** (side-effect import, ordered with other imports). A `config()` call after imports runs AFTER prisma reads an empty DATABASE_URL → "SASL: client password must be a string" on the server.
6. **Commit as soon as gates pass** — sessions die on limits mid-task; deferred commits get lost. Footers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_011b4sNmey45tunVt3b9HZhr`.
7. **Deploy runbook** (server 69.62.126.13 via plink, dir /root/helmies-studio): fetch+reset to origin/main → `npm ci` → `npx prisma generate` → **build** → `npx prisma migrate deploy` (only if a migration shipped) → pm2 startOrReload + save → verify 200. Backfills (`fix-model-categories`, `fix-dedicated-models`, `retire-alibaba`, `seed-templates`, `verify-catalog`) run AFTER deploy, dry-run first, `--apply --yes` to write.
8. **Gates** for every change: `npm run lint && npm run typecheck && npx vitest run && npm run build`; integration where DB touched; Playwright all projects 0-failed. Never weaken an assertion — if a test exposes a product bug, fix the product.
9. Providers (KIE, retired-Alibaba, Suno/ElevenLabs as vendors) must NEVER appear in user-facing strings. Money: server-computed prices only; reserve→settle-or-release exactly once; `npm run reconcile` stays clean.
10. **KIE probe throttling:** verify-catalog probes get rate-limited (→ inconclusive, nothing written — safe). Space repeat sweeps by hours, use `--delay-ms 4000`, small `--only` batches.

## DONE (merged AND deployed to production)

- [x] **EDITSv1 E1–E8** (2026-08-03/04): catalog truth+mode separation, error envelope+ErrorPanel, agent sessions+honored approvals+per-asset review, Director editor+timeline+status-route fix, workflow visual editor (+params-Promise data-loss fix), mobile overhaul (44 offenders→0, mobile e2e project), announcements/popups/promos (DB-driven, admin-controlled, promo→Stripe coupons), Phase 8 ops (nightly backups live, alerts).
- [x] **Model audit** (2026-08-05): 169 models vs real docs — `docs/model-audit/*` (8 correct / 99 wrong / 52 missing, 9 root-cause classes).
- [x] **M1** (PR #35): upload-URL absolutization (class A), sync id-normalization tables (B: qwen2 unhyphenated, seedance dots, kling version prefixes, pixverse -v6, bare nano-banana-2/gpt-image-2), dropped-vendor gates (C: gemini-omni/omnihuman single-segment + llm-gate fix; MiniMax-H3 = stale sync, arrives via sync), classification (G: cover-suno→image, create-music-video→video, volcengine lipsync, voice-clone kinds, callback rows not-usable).
- [x] **M2** (PR #36): 140 curated real schemas across 20 families (replace-mode — fabricated fields can't bleed through); dedicated adapters 4o-image/flux-kontext/runway/aleph/veo3 incl. Veo3 two-stage 1080p/4K retrieval; extend rows parked inactive (`blocked-no-ui`); Alibaba retirement (code + scripts).
- [x] **Template seeds → KIE** (PRs #37, #38, #39): all seeds repointed off Alibaba; seed script creates a new version when the graph changes; all 12 seeds aligned with real schemas (first_frame_url, image_urls arrays, string durations). **Production: 12/12 published.**
- [x] **Production runbook executed** (2026-08-05): backfill applied (168 fixes), dedicated-models fix (7), Alibaba retired (43 rows + ProviderConfig), KIE sync ran (+12 new models incl. MiniMax-H3/Gemini-Omni, created inactive pending verification), templates re-seeded 12/12.
- [x] **Flagship verification probes**: callable now = seedance-1.5-pro, nano-banana-2/-lite/-pro, gpt-image-2-text-to-image, qwen2/text-to-image, qwen2/image-edit, generate-4-o-image, generate-or-edit-image (Flux Kontext), generate-ai-video (Runway). Suno generate-music + Gemini TTS verified earlier. Verdicts partially persisted (throttling stopped the rest — harmless).

## IN FLIGHT / NEXT (work top-to-bottom; ONE checkbox = one dispatchable unit)

- [ ] **M-stragglers** (small, single agent):
  - [ ] `kling-2.6/text-to-video`: schema types duration as number, provider wants STRING → fix curated schema (+ any sibling kling 2.6 entries), re-probe.
  - [ ] `kling-3.0/video` + `pixverse-v6/text-to-video`: probe said needs-param "This field is required" (nameless) — identify the missing field from `docs/model-audit/video-market.md`, fix schema/defaulting, re-probe.
  - [ ] `generate-veo-3-video`: dedicated adapter got 422 "Invalid model" — the Veo route's `model` field value is wrong; check `video-payload-core.mjs` against `docs/model-audit/video-dedicated.md`, fix, re-probe.
  - [ ] Full KIE verification sweep in batches (`--limit 25 --delay-ms 4000`, hours apart due to throttling) until every active model has a verdict; new-synced rows (MiniMax-H3, Gemini-Omni, OmniHuman) activate on callable verdicts.
- [ ] **M3** (plan phase M3): Suno quick wins (`boost-music-style`, `generate-lyrics`, `generate-sounds` route-only; `upload-and-cover-audio`, `upload-and-extend-audio`, `add-instrumental`, `add-vocals`, `separate-vocals` via existing AudioTools upload) in `audio-payload-core.mjs`; admin `inputSchema` editing (ModelManager UI + admin models route, validated JSON editor).
- [ ] **S1** (plan phase S1): consolidated studios — Image absorbs Canvas/Cinema/Influencer (modes+presets), Video absorbs Motion/VideoEdit/Recast/Clipping (modes), Audio +Tools mode, new PerformStudio (LipSync/Avatar/Persona), nav regroup, legacy-slug redirects with `?mode=`/`?preset=`. Mobile + a11y sweeps must stay green.
- [ ] **S2** (plan phase S2): Music timeline studio (extend/replace-section on time ranges, cover/vocals ops on selected track, history from Generations); `VoiceProfile` migration + Suno voice-clone wizard; TTS/Music vocal pickers list user profiles.
- [ ] **S3** (plan phase S3): light mode — `[data-theme="light"]` token set in system.css, Shell toggle, prefers-color-scheme default, no-flash init, axe contrast suite runs in BOTH themes.
- [ ] **S4**: final QA — full gates all projects; real generation smoke on prod (image+video+music+TTS when ElevenLabs recovers); update this file + `docs/MODEL_AUDIT.md` statuses; final QA report per EDITSv1 Definition of Done.
- [ ] **Deferred / backlog** (do NOT start before S4 unless the owner asks): Suno ops needing new UI concepts (extend-music time-UI beyond S2 scope decisions, replace-section already in S2, mashup 2-file, MIDI, voice-clone wizard is in S2); Runway/Veo `extend` UI (rows parked `blocked-no-ui`); webhook HMAC verification (audit class H); KIE `get-account-credits` balance visibility; `qwen3` image line activation after sync+verify; scheduled KIE-sync timer on the server (sync currently manual — decide cadence with owner); ElevenLabs re-probe when their upstream recovers.

## WHERE THE LAST SESSION STOPPED

> **Update this section every time you stop or hand off.**

2026-08-05 (this session): M phase complete through the production runbook; 12/12 templates published on prod (commit c899ffc deployed). Nothing in flight in any worktree. Next actions queued: dispatch M-stragglers + M3 (one agent), S1 (one agent) — max two parallel agents, disjoint files per rule 4.
