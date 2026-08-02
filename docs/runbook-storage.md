# Runbook: object storage (local disk / S3-compatible)

Media (generation outputs, user uploads) goes through one abstraction,
`src/lib/storage/` — `getDriver()` (`src/lib/storage/index.js`) picks the
active backend from `STORAGE_DRIVER`: `"local"` (default, unset is fine —
`src/lib/storage/local-driver.js`, today's production behavior, writes/reads
`public/media` and `public/uploads` on disk) or `"s3"`
(`src/lib/storage/s3-driver.js`, hand-rolled AWS SigV4 over `fetch`, no SDK,
path-style addressing so it targets any S3-compatible endpoint — MinIO, R2,
Backblaze, real S3 — unmodified). Every write goes through
`ingestFromUrl()` (`src/lib/storage/ingest.js`); every read goes through the
serving route, `src/app/api/media/local/[name]/route.js`, regardless of
which driver actually holds the bytes.

## Switching to S3

Set in `.env` (see `.env.example` for the full block with descriptions):

```
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.your-region.your-provider.com
S3_REGION=your-region
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
S3_PUBLIC_BASE_URL=https://cdn.your-domain.com   # optional, see below
```

Then **restart both processes**:

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
```

Both `helmies-studio` (the app) and `helmies-worker`
(`scripts/worker.mjs`, the generation job queue drain loop) call
`getDriver()` and re-resolve `STORAGE_DRIVER`/`S3_*` from `process.env` on
**every** call — nothing is cached at module load. That means a plain
`pm2 restart helmies-studio` alone is not enough: the worker is a separate
long-running process with its own `process.env` snapshot from whenever it
last started, and it's the worker that actually ingests provider output
(`src/lib/job-runner.js` → `ingestFromUrl`) for the async generation path.
Restart only the app and the worker keeps writing to disk (or reading stale
S3 credentials) while the app itself has already flipped — a split-brain
that's easy to miss because nothing errors loudly, media just keeps landing
in the wrong place. `ecosystem.config.cjs` declares both apps together
specifically so one `startOrReload` command reloads both.

`S3_PUBLIC_BASE_URL` is optional and, as of the URL-stability fix below,
does **not** change what gets persisted — `putObject` always returns the
same app-relative URL from both drivers. It's parsed and reserved for a
future caller that wants a direct CDN link (via `getSignedUrl()`
explicitly), not required to switch drivers.

## Preconditions — check these BEFORE flipping `STORAGE_DRIVER=s3` in production

- **Server clock must be within SigV4's signing tolerance.** AWS-compatible
  signature verification rejects requests whose `x-amz-date` is too far from
  the server's own clock (commonly ±15 minutes, but check your specific
  provider's docs — some are stricter). If the box's clock has drifted,
  **every single signed request fails** — `putObject`, `getObject`,
  `deleteObject`, `exists` all break at once, not gradually. Run `date -u`
  and compare against a trusted source (or just confirm NTP/`chronyd` is
  running) before switching.
- **CSP / image-domain allowlist must cover any new public origin** you
  introduce. Today's `next.config.js` CSP (`img-src 'self' data: blob:
  https:`, `media-src 'self' blob: https:`) and `images.remotePatterns`
  (`{ protocol: "https", hostname: "**" }`) are both wildcard-permissive for
  any HTTPS origin, so persisted gallery URLs — which are always
  app-relative `/api/media/local/<key>` paths served from `'self'` — need no
  change here. This still matters if you ever add a feature that points the
  *browser* directly at the bucket/CDN (e.g. exposing a `getSignedUrl()`
  direct-download link, or setting `S3_PUBLIC_BASE_URL` and later wiring it
  into something client-facing) — double check the CSP/image config still
  covers that origin before shipping such a feature, since it's easy to
  tighten those wildcards later without remembering why they were wide open.
- **The S3 driver's live path has never run against a real bucket.** Every
  behavior in `src/lib/storage/s3-driver.js`, including the SigV4 signing
  itself, is verified only against a *mocked* `fetch`
  (`tests/unit/storage-s3.test.mjs`) — there were no S3-compatible
  credentials available when it was written. Passing unit tests are not
  live verification. Before relying on this in production, do the full
  manual verification pass below against your real bucket, in a
  non-critical environment first if at all possible.

## Pre-existing local files keep working — no forced migration

Rows written before the switch point at files that only ever existed on
`public/media` / `public/uploads`, never in the S3 bucket. The serving
route handles this automatically: when the active driver is `s3` and the
object is missing there (or the S3 call fails outright — see
"Troubleshooting" below), it falls back to reading the same key straight
off local disk. Nothing needs to be backfilled to flip the switch safely.

Copying every existing local file into the bucket (so the local disk could
eventually be retired) is a deliberately **deferred, future task** — not
required to switch, and out of scope here.

## How to verify a switch actually worked

After restarting both processes with `STORAGE_DRIVER=s3` set:

1. **Upload** something that exercises the write path — either the studio
   upload flow or a real generation — and note the returned URL (it will
   look like `/api/media/local/<sha256-prefix>-<uuid>.<ext>`, same shape as
   the local driver; see "Persisted URLs" below for why).
2. **Confirm the object exists in the bucket itself**, not just that the
   app returned 200 — e.g. `aws s3 ls s3://<bucket>/<key>` (or your
   provider's equivalent / the bucket's web console) using the same `<key>`
   from the returned URL. This is the step that actually proves the S3
   write path works — a passing HTTP response alone doesn't rule out the
   local-disk fallback masking a broken S3 write.
3. **Confirm the URL serves** — request it (`curl -I
   https://your-app/api/media/local/<key>`) and check you get a 200 with
   the right `Content-Type`, not a 404 or a response quietly served from
   local disk. If step 2 confirmed the object is genuinely in the bucket,
   a 200 here confirms the S3 *read* path too.

Do this for at least one of every media type you expect to store (image,
video, audio) since the extension → Content-Type mapping and EXIF/PNG
metadata stripping are shared code paths but worth confirming once live.

## Persisted URLs are stable and driver-independent

`putObject` (both drivers) returns an app-relative
`/api/media/local/<key>` URL — this is what gets persisted into
`Generation.outputUrl`. It is never a presigned link (which would expire —
S3's default is a 1-hour TTL) and never a raw bucket/CDN URL (which would
break if the bucket or CDN domain ever changes). The serving route always
resolves the key back through whichever driver is active at *read* time, so
a persisted URL keeps working across a driver switch, a bucket migration,
or years later, without needing to know which backend actually holds the
bytes. `getSignedUrl()` still exists as a separate function for a caller
that genuinely needs a direct, time-limited link — it is not used for
anything that gets persisted.

## Troubleshooting

**Symptom: every upload/generation fails immediately after setting
`STORAGE_DRIVER=s3`, with an error naming a missing `S3_*` var.**
`src/lib/storage/s3-driver.js`'s `config()` throws immediately if any of
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY` is unset — read the error message, it names exactly
which var is missing. `scripts/check-env.mjs` also enforces this and will
fail a deploy if `STORAGE_DRIVER=s3` is set without all five (run it
manually with `node scripts/check-env.mjs` to check before restarting).

**Symptom: `STORAGE_DRIVER` is set to something other than `local` or
`s3` (a typo, e.g. `S3` or `"s3 "` with trailing whitespace).**
`getDriver()` throws `Unknown STORAGE_DRIVER "<value>" — expected "local"
or "s3"` for anything that isn't (case-insensitively) exactly `local` or
`s3`. Every read and write fails immediately and loudly — this is not a
silent misconfiguration. Check `process.env.STORAGE_DRIVER` on both the
app and the worker process (they can differ if only one was restarted —
see "Switching to S3" above).

**Symptom: `STORAGE_DRIVER=s3` is set correctly and healthy, but old media
still resolves — is it actually being served from the bucket?**
Not necessarily, and that's by design. The serving route tries the active
driver first; only when that driver either returns "not found" *or throws
outright* (e.g. mid-outage) does it fall back to reading straight off
local disk. A file that predates the S3 switch will always come from disk
regardless of whether S3 is healthy, because it was never uploaded there.
Use the bucket-listing step in "How to verify a switch actually worked"
above to confirm whether a *specific* file actually lives in the bucket —
don't infer it from the HTTP response alone.

**Symptom: an S3 outage or a run of 5xx responses from the endpoint, but
users report images/video are still loading.** This is the intended
behavior, not a bug: the serving route treats a thrown error from the
active driver (an outage, a timeout, a 5xx) exactly like a "not found"
result and falls through to the local-disk read. Anything that predates
the S3 switch keeps serving through the outage. Anything ingested *after*
the switch (S3-only, never written to disk) will still 404 during the
outage — there is no local copy for the fallback to find. Confirm the
scope of user impact from the DB (`Generation.outputUrl` rows created after
the cutover) rather than assuming "storage is degraded" means "everything
is down."

**Where does media actually live, on local?** `public/media` (everything
written by `ingestFromUrl` — generation outputs) and `public/uploads`
(user-uploaded source assets, `src/app/api/upload/route.js`). The local
driver's `getObject` checks `public/media` first, then falls back to
`public/uploads` — same order the pre-Phase-4B serving route used directly.

## Rolling back to local

Unset `STORAGE_DRIVER` (or set it to `local`) and restart both processes
the same way (`pm2 startOrReload ecosystem.config.cjs --update-env`).
Reads for anything already on local disk keep working immediately (nothing
to undo — the disk fallback made sure of that throughout). Anything
written to S3 while the switch was active is not automatically copied
back; those specific rows will 404 until/unless a backfill (see
"Pre-existing local files keep working" above) brings them onto disk, or
`STORAGE_DRIVER=s3` is restored.
