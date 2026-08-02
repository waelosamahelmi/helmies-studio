# Phase 4B — Object Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One storage abstraction with a local driver (today) and an S3-compatible driver (one env change away), one unified ingest path, plus the job-table index/retention batched in.

**Architecture:** `src/lib/storage/` exposes `putObject/getObject/deleteObject/getSignedUrl/exists` behind a driver chosen by `STORAGE_DRIVER` (`local` default, `s3`). `media-storage.js` and `media-download.js` collapse into one `ingestFromUrl()` used by all four current call sites. The serving route resolves through the driver so a bucket swap needs no code change. S3 driver is written against the AWS S3 REST API with SigV4 signed by node's crypto — **no new npm dependency**.

**Tech Stack:** unchanged. No new deps.

## Global Constraints

- Branch `feat/phase4b-object-storage` off `main`. Landing page untouched.
- NEVER run prisma migrate/db push against `.env` DATABASE_URL. Test DB only (`postgresql://postgres:test@localhost:55432/test`, container `helmies-test-pg`). Never print `.env` values.
- Gates each task: `npm run lint` (0 warnings), `npm run typecheck`, `npm test`, `npm run build`; integration where DB is touched.
- **Behavior must not change while `STORAGE_DRIVER=local`** — this deploys to a live service whose existing media lives in `public/media` and `public/uploads` and is served by `/api/media/local/[name]`. Existing URLs must keep working forever (old rows store them).
- The S3 driver's live path is **BLOCKED pending credentials** — it must be fully unit-tested against a mocked HTTP layer and marked BLOCKED for live verification, never falsely claimed as verified.
- Security invariants hold: upload sniffing (`src/lib/upload-sniff.js`) stays in front of every write; no new public route without a `security/route-manifest.json` entry.
- Commit convention + standard footers as prior phases.

## File Structure

```
src/lib/storage/index.js        (driver selection + the public API)
src/lib/storage/local-driver.js (public/media + public/uploads, current behavior)
src/lib/storage/s3-driver.js    (SigV4 over fetch, no SDK)
src/lib/storage/ingest.js       (ingestFromUrl — the single ingest path)
src/lib/media-storage.js        (thin back-compat shim → storage/ingest)
src/lib/media-download.js       (thin back-compat shim → storage/ingest)
src/app/api/media/local/[name]/route.js (serve via driver; local path unchanged)
prisma/schema.prisma + migration (GenerationJob.providerRequestId index; retention fields none — retention is a query)
src/lib/automation.js           (retention sweep leg)
.env.example                    (STORAGE_DRIVER, S3_* names only)
tests/unit/storage-*.test.mjs, tests/integration/storage-ingest.int.test.mjs
docs/runbook-storage.md
```

---

### Task 1: Storage abstraction + local driver + unified ingest

**Files:** create `src/lib/storage/{index.js,local-driver.js,ingest.js}`; rewrite `src/lib/media-storage.js` and `src/lib/media-download.js` as shims; test `tests/unit/storage-local.test.mjs`, `tests/unit/storage-ingest.test.mjs`

**Interfaces (exact, later tasks depend on these):**
- `getDriver()` → the active driver, chosen by `process.env.STORAGE_DRIVER` (`"local"` default).
- Driver contract: `putObject(key, buffer, contentType)` → `{ key, url }`; `getObject(key)` → `{ buffer, contentType }`; `deleteObject(key)`; `exists(key)` → boolean; `getSignedUrl(key, ttlSeconds)` → string (local driver returns the plain `/api/media/local/<key>` URL and ignores ttl).
- `ingestFromUrl(providerUrl, { contentType } = {})` → `{ url, key, bytes, sha256 }` — downloads, strips JPEG EXIF / PNG metadata (reuse the existing functions in `media-storage.js` verbatim — do not rewrite them), verifies content-length, and `putObject`s under `<sha256-prefix>-<uuid>.<ext>`.
- Back-compat shims keep the OLD signatures and return the OLD shapes so the four existing call sites (`director-executor.js` ×3, `generation-handler.js`, `generation-webhook.js`, `job-runner.js`) are untouched in this task: `storeMedia(providerUrl, contentType)` → url string; `downloadAllMedia(urls)` → same return shape it has today (READ IT FIRST — it may return a single url or an array; preserve exactly).

- [ ] **Step 1: Failing unit tests** — `putObject` writes under `public/media` and returns a `/api/media/local/...` url; `ingestFromUrl` strips EXIF (feed a JPEG buffer with an APP1 segment, assert it's gone); returns a sha256 that matches the stored bytes; a content-length mismatch throws; the two shims return byte-identical shapes to today (snapshot the current behavior first by reading both files).
- [ ] **Step 2: Run, confirm fail. Step 3: Implement.** Move the EXIF/PNG strippers into `storage/ingest.js` unchanged.
- [ ] **Step 4: Gates + commit** — `feat: storage abstraction with local driver and one ingest path`

---

### Task 2: S3 driver (SigV4, no SDK) — live path BLOCKED

**Files:** create `src/lib/storage/s3-driver.js`; test `tests/unit/storage-s3.test.mjs`; modify `.env.example`, `scripts/check-env.mjs` (S3 vars required ONLY when `STORAGE_DRIVER=s3`)

**Interfaces:** same driver contract as Task 1. Config from `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` (optional; when absent `getSignedUrl` returns a presigned URL).

- [ ] **Step 1: Failing unit tests** with `fetch` mocked — `putObject` issues a PUT to `${S3_ENDPOINT}/${S3_BUCKET}/${key}` with an `Authorization: AWS4-HMAC-SHA256 …` header, `x-amz-content-sha256`, and `x-amz-date`; the signature is deterministic for a fixed key/date/payload (pin it with a known-answer test computed from the AWS SigV4 spec — write the expected value into the test and verify your implementation reproduces it); `getSignedUrl` produces a URL with `X-Amz-Expires` and `X-Amz-Signature` query params; `getObject` on a 404 returns null rather than throwing.
- [ ] **Step 2: Run, confirm fail. Step 3: Implement** SigV4 with `node:crypto` `createHmac`. Keep it to the four operations — no multipart, no listing.
- [ ] **Step 4: `check-env.mjs`** requires the S3 vars only when `STORAGE_DRIVER === "s3"`; `.env.example` documents all six names with a comment that the live path is unverified until credentials exist.
- [ ] **Step 5: Gates + commit** — `feat: s3-compatible storage driver (live path pending credentials)`. State BLOCKED-for-live in the report; do not claim live verification.

---

### Task 3: Serve through the driver; keep every existing URL working

**Files:** modify `src/app/api/media/local/[name]/route.js`; test `tests/unit/media-serve.test.mjs`

**Interfaces:** the route resolves bytes via `getDriver().getObject(key)`. When the active driver is `s3` AND the object is missing there, it MUST fall back to the local filesystem — old rows point at files that were never in S3. Keep `Content-Type` from the fixed extension map, `X-Content-Type-Options: nosniff`, and the existing CSP/sandbox headers exactly as they are today (Phase 3 review confirmed these are what neutralize polyglot uploads — do not weaken them).

- [ ] **Step 1: Failing tests** — local driver path byte-identical to today; with `s3` active and the object present, bytes come from the driver; with `s3` active and the object absent, it falls back to disk and still 200s; unknown key 404s; the three security headers are present in every case.
- [ ] **Step 2–3: Run, implement. Step 4: Gates + commit** — `feat: media serving resolves through the storage driver with local fallback`

---

### Task 4: Job index + retention, and the four call sites move to the unified ingest

**Files:** `prisma/schema.prisma` (+ migration `20260802120000_job_request_index`), `src/lib/automation.js`, and the four ingest call sites; tests `tests/unit/automation-retention.test.mjs`, `tests/integration/storage-ingest.int.test.mjs`

**Interfaces:**
- Migration: `CREATE INDEX "GenerationJob_providerRequestId_idx" ON "GenerationJob"("providerRequestId");` (the webhook does a lookup on it per callback — currently a seq scan).
- `pruneTerminalJobs({ olderThanDays = 30 })` exported from `@/lib/job-queue`: deletes `succeeded`/`failed`/`dead` rows older than the cutoff, returns `{ deleted }`. Add as a fifth `runAutomation` leg using the same `Promise.allSettled` per-leg isolation.
- Replace `storeMedia(...)`/`downloadAllMedia(...)` at the four call sites with `ingestFromUrl(...)`, adapting each to the richer return (`{url, key, bytes, sha256}`) — then DELETE the back-compat shims from Task 1.

- [ ] **Step 1: Failing tests** — `pruneTerminalJobs` deletes only terminal rows past the cutoff and never a `queued`/`running` row; `runAutomation` returns five legs and isolates a rejecting one; each converted call site stores and returns a working url (integration: real DB + real local driver, assert the file exists on disk and the generation's `outputUrl` resolves).
- [ ] **Step 2–3: Run, implement, delete the shims** (grep to prove zero remaining importers of `storeMedia`/`downloadAllMedia`).
- [ ] **Step 4: Gates + integration + commit** — `feat: unified ingest everywhere, job index and retention sweep`

---

### Task 5: Phase gate — docs, suites, CI, PR

- [ ] `docs/runbook-storage.md`: how to switch to S3 (set the six vars + `STORAGE_DRIVER=s3`, restart app AND worker), what to do about pre-existing local files (they keep serving via the fallback; optional backfill is a future task), and how to verify a switch (upload → check the object exists in the bucket → confirm the URL serves).
- [ ] Full gates + integration; `npm run reconcile` clean; landing diff empty; push; CI green.
- [ ] PR: **Risk level Medium** (no money-path change), runbook, and an explicit "S3 live path is UNVERIFIED — blocked on credentials" line in the risk register.

---

## Self-Review

1. **Coverage vs contract §2.4:** private-by-default + signed reads → T2 (`getSignedUrl`) and T3; content-type validation → already enforced by `upload-sniff.js` in front of writes (unchanged, noted); size limits → existing `MAX_BYTES` in the upload route; image re-encode/metadata strip → T1 (EXIF/PNG strippers preserved); SVG rejection → already in the MIME allowlist; output ingestion from provider URL → T1/T4; checksum + content-length validation → T1 (`sha256`, length check); storage lifecycle/retention → T4 (job rows) — **media retention/deletion jobs and user export/deletion are NOT in this plan** (they need the data-retention policy from contract §1.2's `docs/data-retention.md`); thumbnails/transcodes and CDN policy → deferred, needs a real bucket. State all three deferrals in the PR.
2. **Placeholders:** T1 has two "read the current file and preserve its exact shape" steps — real unknowns (`downloadAllMedia`'s return shape), each naming the file and the required outcome. No TBDs.
3. **Type consistency:** driver contract identical in T1/T2/T3; `ingestFromUrl` return `{url, key, bytes, sha256}` used the same way in T1 and T4; `pruneTerminalJobs` named consistently in T4.
