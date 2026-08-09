// Helmies Studio — Durable Generation Job Queue (Phase 4A)
//
// Postgres-backed queue mechanics for provider generation calls. This module
// is a PURE STATE MACHINE over the GenerationJob table (prisma/schema.prisma)
// — it contains no provider-calling logic and no credit/wallet logic. The
// runner (a later task) is the only caller that decides what a status
// transition means for money; this module just moves rows through:
//
//   queued (claimable)
//     -> running (leased by a worker, via claimNextJob)
//        -> succeeded / failed  (terminal, credits settled/refunded by the runner)
//        -> dead                (terminal after maxAttempts or timeout, credits refunded by the runner)
//        -> queued              (retry, via failJob, or crashed-worker recovery via reapExpiredLeases)
//
// Concurrency: claimNextJob is the only function where two workers could
// race for the same row. It uses a single `UPDATE ... WHERE id = (SELECT ...
// FOR UPDATE SKIP LOCKED)` statement (see below) so the row selection and the
// claim happen atomically — there is no read-then-write gap for two workers
// to both select the same "queued" row (the Phase 3 rate-limit bug hid
// exactly in that kind of gap; see src/lib/rate-limit.js's header for the
// history). Every other mutation here (heartbeatJob, failJob's retry/dead
// transition, reapExpiredLeases) is a single conditional update/updateMany —
// no read-then-write gap for those either.

// Explicit ".js" extension — see src/lib/wallet.js's identical comment:
// this module is also loaded transitively by scripts/worker.mjs under plain
// `node` (Phase 4A Task 4), whose strict ESM resolver requires it.
import prisma from "./prisma.js";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_LEASE_MS = 5 * 60 * 1000; // 5 minutes
const BACKOFF_BASE_MS = 30 * 1000; // 30 seconds
const BACKOFF_CAP_MS = 15 * 60 * 1000; // 15 minutes

const TERMINAL_STATUSES = ["succeeded", "failed", "dead"];

// Prisma 7 + @prisma/adapter-pg (this project's driver, see src/lib/prisma.js)
// reports which column a P2002 unique-constraint violation hit in a
// DIFFERENT shape than the classic query engine's documented
// `meta.target: string[]`: it's `meta.driverAdapterError.cause.constraint
// .fields`, and each entry is the raw quoted Postgres identifier (e.g.
// `"idempotencyKey"` including the double quotes), not a bare field name.
// Verified empirically against the real test database — a naive
// `meta.target?.includes(field)` check (the pattern already used elsewhere
// in this codebase, e.g. src/app/api/stripe/webhook/route.js, against a
// hand-constructed unit-test mock) never matches a REAL error from this
// adapter, so it would silently fail to treat a legitimate duplicate submit
// as a duplicate and throw instead. This checks both shapes so it's correct
// against the real driver and still forward-compatible with the classic
// shape if the adapter ever changes.
function isUniqueConstraintOn(err, field) {
  if (err?.code !== "P2002") return false;
  const target = err?.meta?.target;
  if (Array.isArray(target) && target.includes(field)) return true;
  if (typeof target === "string" && target.includes(field)) return true;
  const fields = err?.meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields) && fields.some((f) => String(f).replace(/"/g, "") === field)) return true;
  return false;
}

// Create a new job, or return the EXISTING job when idempotencyKey collides.
// Never throws on a legitimate duplicate submit — that's the double-submit
// guard callers rely on (e.g. a user double-clicking "generate"). Accepts an
// optional `db` client so callers can compose this into their own
// transaction (e.g. alongside a credit reservation); defaults to the shared
// prisma singleton.
export async function enqueueJob(
  { generationId, userId, idempotencyKey, payload, providerName, endpoint, timeoutMs = DEFAULT_TIMEOUT_MS },
  db = null
) {
  const client = db || prisma;
  try {
    return await client.generationJob.create({
      data: {
        generationId,
        userId,
        idempotencyKey,
        payload,
        providerName: providerName ?? null,
        endpoint: endpoint ?? null,
        timeoutAt: new Date(Date.now() + timeoutMs),
      },
    });
  } catch (err) {
    // A duplicate submit hits the idempotencyKey unique constraint — return
    // the row that won instead of throwing. A collision on a DIFFERENT
    // unique constraint (e.g. generationId, which should never legitimately
    // repeat) is a real bug and must not be swallowed.
    if (isUniqueConstraintOn(err, "idempotencyKey")) {
      const existing = await client.generationJob.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
    }
    throw err;
  }
}

// Atomically claim one claimable job for `workerId`. "Claimable" = status
// queued AND nextRunAt has arrived (first attempt, or a retry whose backoff
// elapsed). Prisma's query builder cannot express `FOR UPDATE SKIP LOCKED`,
// so this is hand-written raw SQL via $queryRaw's tagged-template form
// (values are bound parameters, never string-concatenated — Prisma 7 SQL
// injection safety). SKIP LOCKED means a second concurrent caller never
// blocks on a row a first caller is already claiming — it just skips to the
// next candidate, so two workers can never claim the same row and neither
// stalls waiting on the other. Returns the claimed row (now running, leased,
// attempts incremented) or null when nothing is claimable.
//
// The "now" used for the nextRunAt comparison is bound from Node's own
// clock (`new Date()`) rather than the DB session's `NOW()`. Empirically
// (this dev machine's Docker Desktop/WSL2 Postgres container) the
// container's clock can lag the host's by tens of milliseconds under load,
// and `nextRunAt` is always written from the host clock (both here for the
// lease and in failJob's retry backoff below) — comparing it against the
// container's own `NOW()` intermittently made a job newly written with
// nextRunAt = hostNow() look NOT YET due against a slightly-behind
// container clock, so a job enqueued and claimed back-to-back could
// spuriously fail to claim. Binding one shared `now` value sidesteps any
// host/DB clock skew entirely; it does not change the atomicity guarantee
// above — SKIP LOCKED still makes the whole statement race-proof.
/* ── Fairness and provider protection (B1.4) ──────────────────────────────
   The claim above took the oldest queued job, full stop. Two things go
   wrong with that, and both are the same shape.

   ONE USER CAN TAKE THE WHOLE QUEUE. A film is a hundred and thirty shots
   enqueued in one press. Until they drain, everybody else's single image
   sits behind them — not because the system is busy, but because the
   ordering has no notion of whose work it is. The person who enqueued one
   thing waits for somebody else's feature film.

   ONE PROVIDER CAN BE HAMMERED. Every job for a provider having a bad
   minute is claimed, submitted, rate-limited and retried, which turns a
   provider's soft limit into our own retry storm against it.

   Both are fixed by the same rule: a queued job is only CLAIMABLE if its
   user and its provider are under their cap right now. It is enforced
   inside the claim statement rather than checked before it, because
   anything checked separately is a race — two workers would both read
   "under the cap" and both claim.

   This is a delay, never a drop: a job over the cap is skipped this round
   and claimed as soon as one of its siblings finishes. And because the
   ORDER BY still runs over everything eligible, skipping one user's
   overflow promotes the next user's work, which is precisely the fairness
   that was missing. */
const perUserCap = () => Math.max(1, parseInt(process.env.JOB_USER_CONCURRENCY, 10) || 6);
const perProviderCap = () => Math.max(1, parseInt(process.env.JOB_PROVIDER_CONCURRENCY, 10) || 24);

export async function claimNextJob(workerId, { leaseMs = DEFAULT_LEASE_MS, userCap = perUserCap(), providerCap = perProviderCap() } = {}) {
  const now = new Date();
  const rows = await prisma.$queryRaw`
    UPDATE "GenerationJob" SET
      "status" = 'running',
      "lockedBy" = ${workerId},
      "leaseUntil" = ${new Date(now.getTime() + leaseMs)},
      "attempts" = "attempts" + 1,
      "updatedAt" = ${now}
    WHERE "id" = (
      SELECT j."id" FROM "GenerationJob" j
      WHERE j."status" = 'queued' AND j."nextRunAt" <= ${now}
        AND (
          SELECT COUNT(*) FROM "GenerationJob" u
          WHERE u."status" = 'running' AND u."userId" = j."userId"
        ) < ${userCap}
        AND (
          j."providerName" IS NULL OR (
            SELECT COUNT(*) FROM "GenerationJob" p
            WHERE p."status" = 'running' AND p."providerName" = j."providerName"
          ) < ${providerCap}
        )
      ORDER BY j."nextRunAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`;
  return rows[0] ?? null;
}

// Extend the lease on a job a worker is still actively processing. Guarded
// by lockedBy = workerId so a worker whose lease was already reaped (and the
// job reclaimed by someone else) can't accidentally extend a lease it no
// longer owns — it gets `false` back and must stop working the job.
export async function heartbeatJob(jobId, workerId, { leaseMs = DEFAULT_LEASE_MS } = {}) {
  const result = await prisma.generationJob.updateMany({
    where: { id: jobId, lockedBy: workerId, status: "running" },
    data: { leaseUntil: new Date(Date.now() + leaseMs) },
  });
  return result.count > 0;
}

// Terminal success. Clears the lease and records the provider's request id
// (if the caller has one — the runner may already have persisted it earlier
// via its own update so a retry resumes instead of re-submitting).
export async function completeJob(jobId, { providerRequestId } = {}) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: "succeeded",
      leaseUntil: null,
      lockedBy: null,
      ...(providerRequestId ? { providerRequestId } : {}),
    },
  });
}

// Retry/dead state machine. `retryable` jobs under maxAttempts go back to
// `queued` with an exponential backoff (2^attempts * 30s, capped at 15
// minutes — attempts already reflects the attempt that just failed, since
// claimNextJob incremented it at claim time). Everything else — a
// non-retryable error, or a retryable one that has exhausted maxAttempts —
// goes to the terminal `dead` state. The queue never touches credits here;
// the runner (which called this) is responsible for refunding on `dead`.
export async function failJob(jobId, errorMessage, { retryable } = {}) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`GenerationJob ${jobId} not found`);

  if (retryable && job.attempts < job.maxAttempts) {
    const delayMs = Math.min(2 ** job.attempts * BACKOFF_BASE_MS, BACKOFF_CAP_MS);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "queued",
        leaseUntil: null,
        lockedBy: null,
        nextRunAt: new Date(Date.now() + delayMs),
        lastError: errorMessage,
      },
    });
    return { status: "queued", willRetry: true };
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: "dead",
      leaseUntil: null,
      lockedBy: null,
      lastError: errorMessage,
    },
  });
  return { status: "dead", willRetry: false };
}

// Crashed-worker recovery: a job left `running` past its lease means the
// worker that claimed it died (or lost the DB connection) before completing
// or heartbeating it. Put it back in the queue so another worker can pick it
// up. Returns the number of rows recovered.
export async function reapExpiredLeases() {
  const result = await prisma.generationJob.updateMany({
    where: { status: "running", leaseUntil: { lt: new Date() } },
    data: { status: "queued", leaseUntil: null, lockedBy: null },
  });
  return result.count;
}

// Non-terminal rows whose timeoutAt has passed — a job that has been queued
// or running too long overall, independent of lease/retry bookkeeping. This
// function only REPORTS them; the runner decides what "timed out" means for
// money (refund, mark the Generation failed, etc.) — the queue itself never
// touches credits.
export async function findTimedOutJobs() {
  return prisma.generationJob.findMany({
    where: {
      status: { notIn: TERMINAL_STATUSES },
      timeoutAt: { lt: new Date() },
    },
  });
}

// Retention sweep (Phase 4B Task 4): terminal rows (succeeded/failed/dead)
// are permanent history of a settled/refunded generation — no money or
// state-machine implication follows from deleting one once it's old enough,
// unlike every other function in this file. `updatedAt` (not `createdAt`) is
// the cutoff basis — it's the moment the row LAST transitioned (into its
// terminal state, in practice, since nothing updates a terminal row again),
// so "older than N days" means "has been terminal for N days", not "was
// created N days ago" (a long-retried job could be created long before it
// finally lands). A `queued`/`running` row is NEVER a candidate regardless
// of age — this only ever removes rows already in TERMINAL_STATUSES.
export async function pruneTerminalJobs({ olderThanDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await prisma.generationJob.deleteMany({
    where: {
      status: { in: TERMINAL_STATUSES },
      updatedAt: { lt: cutoff },
    },
  });
  return { deleted: result.count };
}
