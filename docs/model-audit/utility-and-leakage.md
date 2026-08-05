# Utility/plumbing API audit — 2026-08-05

Scope: KIE.ai infrastructure APIs every model call depends on (upload, webhook
verification, credits, download links, unified polling), plus a check for
KIE-hosted chat/LLM models leaking into the generation catalog. Read-only —
no live KIE calls made, no app code changed.

---

### file-upload-api (stream / url / base64) — 2026-08-05
**Area:** upload
**Verdict:** ⚠️ implemented but wrong (for user-uploaded i2i/i2v/v2v source media)
**Doc says:** Three endpoints, all on a *different host* than the main API:
`https://kieai.redpandaai.co/api/file-stream-upload` (multipart, `file` field),
`.../api/file-url-upload` (`{fileUrl}`), `.../api/file-base64-upload`
(`{base64Data}`). All return
`{success, code, msg, data:{fileId, fileName, fileSize, mimeType, fileUrl, downloadUrl, expiresAt}}`.
The `data.fileUrl`/`data.downloadUrl` is the value later handed to a
generation model's `image_url`/`video_url`/`audio_url` param.
**We do:** `src/app/api/upload/route.js` never calls any of KIE's three
upload endpoints — it validates the file (allowlist MIME + magic-byte sniff
via `src/lib/upload-sniff.js`), writes it to our own storage (local disk or
S3, `src/lib/storage/{local,s3}-driver.js`), and returns
`{ url: "/api/media/local/<uuid>.<ext>" }` — an **app-relative path**, by
deliberate design (`storage/index.js`'s header: "app-relative... stable and
driver-independent... never a presigned or bucket/CDN-direct URL").
That relative `Asset.url` is exactly what the studio components thread
straight into the generation payload with no transformation:
`src/components/studio/ImageStudio.js:80` (`image_url: reference?.url`),
`VideoStudio.js:149`, `RecastStudio.js:79`, `LipSyncStudio.js:366`,
`AvatarStudio.js:382`, `CanvasStudio.js:1243/1271/1278`. From there it flows
through `src/app/api/generate` → `generation-handler.js` (`body.image_url`
passed through verbatim, line 125) → `provider-payload-core.mjs` (copies
`params.image_url`/`video_url`/`audio_url` onto the outbound payload
unchanged, lines 31/45/66/76/91-92/100-102/125-126/135) →
`providers.js`'s `formatPayload` (`input: { prompt, ...rest }`) — **at no
point does anything prefix `NEXTAUTH_URL`/origin onto the value.** Searched
`generation.js`, `generation-handler.js`, `provider-payload-core.mjs`,
`job-runner.js`, `job-queue.js` for an absolutization step (`NEXTAUTH_URL`
+ `image_url`/`video_url`, `toAbsolute`, etc.) — none exists.
Net effect: when a user freshly uploads their own source image/video for
i2i/i2v/v2v, KIE's servers receive a literal string like
`"/api/media/local/3f2a...png"` as `image_url` — not a URI they can fetch.
This is invisible for the common case where the "reference" is actually a
*previous KIE-generated output* (those asset URLs are already absolute KIE
CDN links, e.g. `aiquickdraw.com`, per `net-allowlist.js`'s
`PROVIDER_DOMAINS`) — only a genuinely fresh user upload used as an i2i/i2v
source hits the broken path.
**Root cause class:** new — call it **#7: local-storage URLs never
absolutized before being handed to a provider that must fetch them
externally.** Not one of the 6 previously-logged classes.
**Fix needed:** In `provider-payload-core.mjs` (or a single choke point in
`providers.js::submitOnly`), before sending to KIE, rewrite any
`image_url`/`video_url`/`audio_url`/`face_url` value that starts with
`/api/media/local/` to `${NEXTAUTH_URL}${value}` (same prefixing
`net-allowlist.js` and `origin-check.js` already do elsewhere) — or switch
uploads to actually call KIE's `file-*-upload` endpoints and store the
returned `fileUrl` instead. The narrower fix (prefix at submit time) is
cheaper and doesn't touch the stable-URL storage design.
**Status:** logged — not fixed (read-only audit pass).

---

### common-api/webhook-verification — 2026-08-05
**Area:** webhook
**Verdict:** ⚠️ implemented but wrong (uses a different, incompatible auth scheme)
**Doc says:** KIE signs callbacks with HMAC-SHA256 over `${taskId}.${timestamp}`,
Base64-encoded, sent as `X-Webhook-Signature` (with `X-Webhook-Timestamp`
carrying the timestamp used in the digest). The signing secret
(`webhookHmacKey`) is generated on the KIE dashboard
(kie.ai/settings) and must be compared with `crypto.timingSafeEqual`.
**We do:** `src/app/api/webhooks/generation-complete/route.js` (and the
apparently-duplicate `src/app/api/webhooks/generation/route.js`, same code)
implements a completely different mechanism: it requires
`Authorization: Bearer ${WEBHOOK_SECRET}` (or, as a deprecated fallback,
`Bearer ${CRON_SECRET}`) as a plain shared secret — no HMAC, no
`X-Webhook-Signature`/`X-Webhook-Timestamp` header is ever read, no
`webhookHmacKey` is configured or referenced anywhere in the repo
(`generation-webhook.js` only reads `body.data?.taskId`/`request_id` fields,
never a signature). Cross-checked the submit side too: `providers.js`'s
`callBackUrl` (line 125) is built as a bare
`${NEXTAUTH_URL}/api/webhooks/generation-complete` with no secret/token
embedded in the URL either. KIE's real callback — which sends
`X-Webhook-Signature`/`X-Webhook-Timestamp`, not an `Authorization: Bearer`
header — would fail our own route's auth gate and get a 401 (or a 503 if
neither secret env var is set). This means an actual KIE-initiated webhook
call likely never successfully lands; the app's async completion path
appears to depend entirely on `pollProviderResult` in `providers.js` polling
`recordInfo` (confirmed correct against KIE's real endpoint, see below), not
on the webhook. The webhook endpoint is presently effective only as a
manually-authenticated internal/ops trigger, not a working KIE webhook
receiver.
**Root cause class:** new — **#8: webhook route authenticates with our own
static bearer secret instead of verifying KIE's documented HMAC signature.**
**Fix needed:** Implement KIE's documented HMAC-SHA256 check
(`crypto.createHmac('sha256', process.env.KIE_WEBHOOK_HMAC_KEY).update(`${taskId}.${timestamp}`).digest('base64')`,
compared with `crypto.timingSafeEqual` against `X-Webhook-Signature`) as the
actual gate for KIE-originated calls, keeping (or removing, if unneeded) the
current bearer-secret gate for any other caller. Also de-duplicate the two
identical route files.
**Status:** logged — not fixed (read-only audit pass).

---

### common-api/get-account-credits — 2026-08-05
**Area:** credits
**Verdict:** ❌ missing (never called — separate ledger, no provider-balance visibility)
**Doc says:** `GET https://api.kie.ai/api/v1/chat/credit`, Bearer auth,
response `{code, msg, data: <integer remaining credits>}`.
**We do:** Grepped the whole `src/` tree for `get-account-credits`,
`/api/v1/chat/credit`, and any account-credit-style reference — zero hits
outside `kie-sync.js`'s crawled-slug list (i.e. the doc page was crawled as
a "model" candidate by the sitemap sync, never wired up as an API call).
Our credit system (`CreditWallet`, `pricing-engine.js`'s
`calculateCredits`/`assertCreditsCoverCost`) is entirely our own internal
ledger — EUR-denominated credits charged to users, unrelated to and never
reconciled against KIE's own account balance.
**Root cause class:** new — **#9: no visibility into the upstream provider's
real remaining balance.** Not a broken call (nothing is called at all), so
this is closer to a missing capability than a wrong one.
**Fix needed:** Add a periodic (cron) call to `/api/v1/chat/credit`, log/alert
when it drops below a threshold. Risk if left as-is: KIE's account can run
out of credit with zero advance warning — the first symptom would be
production generations starting to fail at `createTask` (surfaced through
`brandError`'s `insufficient_balance` bucket), discovered only after users
hit it.
**Status:** logged — not fixed (read-only audit pass).

---

### common-api/download-url — 2026-08-05
**Area:** download
**Verdict:** ✅ correct (not needed — different, equally valid design)
**Doc says:** `POST /api/v1/common/download-url` mints a temporary,
expiring signed link for a KIE-hosted result.
**We do:** Never called (zero hits outside the crawled-slug list, same as
get-account-credits) — but this is deliberate, not an oversight. Instead of
serving users a temporary KIE link, `generation-handler.js` re-hosts every
provider output into our own storage via `ingestFromUrl` (falling back to
`/api/media/proxy?url=...` if that ingest fails, line 256-262), so completed
generations are served from `studio.helmies.fi`/S3 permanently, independent
of any KIE-side URL expiry. KIE's `download-url` endpoint would only be
useful for a design that streams straight from KIE's own CDN, which this
app does not do.
**Root cause class:** none — confirmed correct, different by design.
**Fix needed:** none.
**Status:** confirmed clean.

---

### market/common/get-task-detail (unified polling) — 2026-08-05
**Area:** polling
**Verdict:** ✅ correct
**Doc says:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>`,
Bearer auth, response
`{code, msg, data: {taskId, model, state: waiting|queuing|generating|success|fail, resultJson: "{resultUrls:[...]}"|"{resultObject:{...}}", failCode, failMsg, costTime, completeTime, createTime, updateTime, progress, creditsConsumed}}`.
**We do:** `src/lib/providers.js`'s `kie` adapter:
`buildPollUrl: (requestId) => \`/api/v1/jobs/recordInfo?taskId=${requestId}\`` —
exact path and param name match. `parsePoll` reads `data.resultJson` (parses
if string), extracts `r.resultUrls || r.result_urls`, status from
`(data.state || "").toLowerCase()`, error from `data.failMsg || data.error`
— all field names match the documented shape exactly (`state`, `resultJson`,
`resultUrls`, `failMsg`). `pollProviderResult` in the same file treats
`succeeded`/`success`/`completed` and `failed`/`error`/`fail` as terminal,
covering the doc's `success`/`fail` states plus tolerance for equivalent
spellings.
**Root cause class:** none — confirmed correct.
**Fix needed:** none.
**Status:** confirmed clean.

---

### chat/LLM catalog leakage check — 2026-08-05
**Area:** chat-leakage-check
**Verdict:** ✅ correct (clean — no live leakage; our chat/agent feature is entirely separate)
**Doc says:** N/A — checking whether KIE's own hosted chat models
(`market/chat`, `market/claude`, `market/gemini`, `market/grok`,
`market/codex` doc pages) were ingested by the sitemap crawl
(`src/lib/kie-sync.js`) as if they were image/video/audio generation models.
**We do:** Confirmed `src/lib/providers.js`'s `llmComplete`/`llmStream` (the
app's actual agent/chat feature) call `https://openrouter.ai/api/v1` using
`OPENROUTER_KEY` exclusively — no code path in the repo calls any KIE
`market/chat|claude|gemini|grok|codex` endpoint. Queried production
`ModelPricing` (via the app's own Prisma client on the live server, since
the app's real `DATABASE_URL` points at a local Postgres on
`localhost:5433`, not the stale Supabase URL in `/var/www/helmies-studio/.env`
that this session initially tried) for `modelId ILIKE
'%gpt-5%'|'%claude%'|'%gemini-2%'|'%gemini-3%'|'%grok-4%'|'%codex%'|'%chat%'`:
two rows matched, both benign:
- `google/gemini-3-1-flash-tts` — `modelType: "audio"`, `isActive: true`,
  `creditsCost: 13`. This is a legitimate **Gemini TTS** Market model
  (text-to-speech, an audio-generation product KIE genuinely sells under
  `/market/*`) — not KIE's hosted Gemini *chat/LLM* endpoint. Correctly
  categorized.
- `google/gemini-2.5-flash-openai` (the row flagged earlier this session) —
  `capability: null`, `modelType: "uncategorized"`, `isActive: false`,
  `isDeprecated: true`. This IS a stray sitemap-crawl artifact of a
  chat-adjacent doc page, but it is inert: not `isActive`, and its
  `modelType` is `"uncategorized"` rather than `image`/`video`/`audio`, so
  it cannot appear in, or be selected from, any generation studio. No
  `gpt-5`, `claude`, `grok-4`, or `codex` rows exist at all (active or
  inactive).
**Root cause class:** none — no live bug. The one dead/deprecated row is a
leftover of bug class #1 (docs-sitemap slugs) already described in
`docs/MODEL_AUDIT.md`, already neutralized by `isActive:false`.
**Fix needed:** none required for correctness. Optional hygiene: delete the
dead `google/gemini-2.5-flash-openai` row (or add a sync-time filter that
skips `/market/chat/`, `/market/claude/`, `/market/gemini/` (chat variant),
`/market/grok/`, `/market/codex/` doc paths outright) so no future crawl
recreates similar dead rows.
**Status:** confirmed clean.
