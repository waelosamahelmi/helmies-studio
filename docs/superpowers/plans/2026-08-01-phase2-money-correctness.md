# Phase 2 — Money Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CreditWallet` + `CreditLedger` the single, race-safe, auditable authority for every credit movement (agents, director, webhooks, admin, signup, Stripe), and make billing read plans/packs from the database instead of constants.

**Architecture:** Extend `src/lib/wallet.js` with transaction-composable operations (every mutator accepts an optional Prisma tx client), an atomic conditional reserve, a direct-debit, and an absolute adjust. Then convert each rogue credit path (agents.js private helpers, session.js debit/credit, both generation webhooks, admin/users, automation, both signup paths, Stripe webhook) to wallet calls, one task each. DB CHECK constraints + a concurrency integration-test harness (real Postgres, CI service container, hard localhost guard) prove the race fixes. Billing plan/pack data moves to `SubscriptionPlan`/`CreditPack` rows via a seed script.

**Tech Stack:** Next.js 16 App Router (JS), Prisma 7 + PostgreSQL (`@prisma/adapter-pg`), Stripe 17 (`2024-12-18.acacia`), Vitest 3 (unit + new integration config), GitHub Actions.

## Global Constraints

- Branch: `feat/phase2-money-correctness` off `main`. Landing page (`src/components/landing/*`, `src/app/page.js`) untouched.
- **NEVER run `prisma migrate dev/deploy/resolve` or `db push` against the `.env` `DATABASE_URL`** — it points at production-adjacent Postgres (`69.62.126.13:5433`). Migrations are authored offline (`prisma migrate diff`) and validated by CI's disposable Postgres. Integration tests hard-abort unless the DB host is `localhost`/`127.0.0.1`.
- Never print or commit `.env` values.
- Gates after every task: `npm run lint` (zero warnings), `npm run typecheck`, `npm test`, `npm run build` all green. Integration tests (`npm run test:integration`) run where a local test DB is available, and always in CI.
- Money rules (contract §2.2): every balance mutation inside a DB transaction with a ledger entry; no negative balances; settlement/refund idempotent; refunds are new ledger entries, never edits; admin adjustments carry reason + audit; client never supplies price/cost/endpoint.
- **Ledger semantics (normative for this plan):** every `CreditLedger` row EXCEPT type `"generation"` moves `available` by exactly `amount`; `"generation"` rows are informational cost records written at settlement (this matches all historical rows written by `wallet.js`). Invariants: `available == Σ amount WHERE type != 'generation'` (post-anchor), `reserved == Σ amount of active reservations`. Task 1 documents this in `wallet.js`; Task 12 enforces it.
- `User.credits` remains a denormalized mirror only (synced by `session.js`); never a balance check source.
- Keep API response shapes backward-compatible unless a task explicitly changes them.
- Commit messages use the repo convention (`feat:`/`fix:`/`test:`/`chore:`) with the standard footer lines.

## File Structure

```
src/lib/wallet.js                     (extend: tx-composability, atomic reserve, debitWallet, adjustWalletTo, semantics header)
src/lib/generation-webhook.js         (new: shared webhook handler used by both /api/webhooks/* routes)
src/lib/reconciliation.js             (new: invariant checks used by script + tests)
src/lib/agents.js                     (delete private debitCredits/creditUser; wallet calls)
src/lib/director-executor.js          (wallet balance check + debit/refund)
src/lib/session.js                    (delete debitCredits/creditUser)
src/lib/automation.js                 (clamp via adjustWalletTo)
src/app/api/admin/users/route.js      (credits via adjustWalletTo)
src/app/api/auth/register/route.js    (signup grant via wallet)
src/lib/auth.js                       (OAuth signup grant via wallet)
src/app/api/stripe/webhook/route.js   (atomic claim + DB-driven plan credits)
src/app/api/stripe/checkout/route.js  (SubscriptionPlan rows)
src/app/api/stripe/topup/route.js     (CreditPack rows)
src/app/api/credits/route.js          (history from CreditLedger)
src/lib/generation-handler.js         (strict model/pricing resolution)
src/app/api/generate/async/route.js   (strict model/pricing resolution)
prisma/migrations/<ts>_wallet_constraints_and_plan_yearly/migration.sql
prisma/schema.prisma                  (SubscriptionPlan.stripePriceIdYearly)
scripts/seed-plans.mjs                (new, idempotent)
scripts/reconcile-credits.mjs         (new)
scripts/deploy.sh                     (db push → migrate deploy)
vitest.integration.config.mjs, tests/integration/*  (new harness + suites)
tests/unit/*                          (new unit suites per task)
.github/workflows/ci.yml              (integration job)
```

---

### Task 1: Wallet core — tx-composability, atomic reserve, debitWallet, adjustWalletTo

**Files:**
- Modify: `src/lib/wallet.js`
- Test: `tests/unit/wallet-core.test.mjs`

**Interfaces:**
- Produces (all exported from `@/lib/wallet`, used by Tasks 4–10, 12):
  - `reserveCredits(userId, amount, jobId, expiresInMinutes?, db?)` — atomic conditional decrement; throws `Error("Insufficient credits: …")` when `available < amount`.
  - `settleReservation(userId, jobId, actualCredits, db?)`, `releaseReservation(userId, jobId, db?)`, `grantCredits(userId, amount, type?, description?, referenceId?, db?)`, `refundCredits(userId, amount, jobId, reason?, db?)` — same behavior, now composable into a caller's transaction via the trailing `db` param.
  - NEW `debitWallet(userId, amount, description, referenceId, db?)` — atomic direct spend (no reservation): conditional decrement + ledger row type `"debit"`; throws `Error("Insufficient credits")` on shortfall; returns updated wallet.
  - NEW `adjustWalletTo(userId, targetAvailable, description, adminId?, db?)` — sets `available` to an absolute value via a delta ledger row type `"admin_adjustment"`, mirrors `User.credits`, returns `{ wallet, delta }`. Negative deltas use a conditional update and throw on race shortfall.
  - `LEDGER_TYPES` gains `"debit"`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/wallet-core.test.mjs
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    creditWallet: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    creditLedger: { create: vi.fn() },
    creditReservation: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import { reserveCredits, debitWallet, adjustWalletTo, grantCredits } from "@/lib/wallet";

beforeEach(() => vi.clearAllMocks());

describe("reserveCredits — atomic conditional update", () => {
  it("guards the decrement with available >= amount in the WHERE clause", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 40, reserved: 60 });
    prisma.creditReservation.create.mockResolvedValue({ id: "r1" });
    prisma.creditLedger.create.mockResolvedValue({});

    await reserveCredits("u1", 60, "gen1");

    const arg = prisma.creditWallet.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1", available: { gte: 60 } });
    expect(arg.data).toEqual({ available: { decrement: 60 }, reserved: { increment: 60 } });
  });

  it("throws Insufficient when the conditional update matches no row", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 0 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", available: 10, reserved: 0 });
    await expect(reserveCredits("u1", 60, "gen1")).rejects.toThrow(/Insufficient credits/);
    expect(prisma.creditReservation.create).not.toHaveBeenCalled();
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });
});

describe("debitWallet", () => {
  it("conditionally decrements and writes a 'debit' ledger row", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 15, reserved: 0 });
    prisma.creditLedger.create.mockResolvedValue({});

    await debitWallet("u1", 25, "Agent run: launch ad", "agent:run1");

    expect(prisma.creditWallet.updateMany.mock.calls[0][0].where)
      .toEqual({ userId: "u1", available: { gte: 25 } });
    const ledger = prisma.creditLedger.create.mock.calls[0][0].data;
    expect(ledger).toMatchObject({ amount: -25, type: "debit", referenceId: "agent:run1", balanceAfter: 15 });
  });

  it("throws and writes nothing when balance is short", async () => {
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(debitWallet("u1", 25, "x", "y")).rejects.toThrow(/Insufficient credits/);
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });
});

describe("adjustWalletTo", () => {
  it("books the delta as admin_adjustment and mirrors User.credits", async () => {
    prisma.creditWallet.upsert.mockResolvedValue({ id: "w1", userId: "u1", available: 500, reserved: 0 });
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditWallet.findUnique
      .mockResolvedValueOnce({ id: "w1", userId: "u1", available: 500, reserved: 0 }) // before
      .mockResolvedValueOnce({ id: "w1", userId: "u1", available: 200, reserved: 0 }); // after
    prisma.creditLedger.create.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});

    const { delta } = await adjustWalletTo("u1", 200, "Abuse clamp", "admin1");

    expect(delta).toBe(-300);
    const ledger = prisma.creditLedger.create.mock.calls[0][0].data;
    expect(ledger).toMatchObject({ amount: -300, type: "admin_adjustment", balanceAfter: 200 });
    expect(ledger.description).toContain("Abuse clamp");
    expect(prisma.user.update.mock.calls[0][0]).toEqual({ where: { id: "u1" }, data: { credits: 200 } });
  });

  it("is a no-op (no ledger row) when target equals current", async () => {
    prisma.creditWallet.upsert.mockResolvedValue({ id: "w1", userId: "u1", available: 200, reserved: 0 });
    prisma.creditWallet.findUnique.mockResolvedValue({ id: "w1", userId: "u1", available: 200, reserved: 0 });
    const { delta } = await adjustWalletTo("u1", 200, "noop", "admin1");
    expect(delta).toBe(0);
    expect(prisma.creditLedger.create).not.toHaveBeenCalled();
  });
});

describe("tx composability", () => {
  it("grantCredits uses the provided client without opening a new transaction", async () => {
    const tx = {
      creditWallet: { upsert: vi.fn().mockResolvedValue({ id: "w1", available: 130, reserved: 0 }) },
      creditLedger: { create: vi.fn().mockResolvedValue({}) },
    };
    await grantCredits("u1", 30, "topup", "top up", "evt_1", tx);
    expect(tx.creditWallet.upsert).toHaveBeenCalled();
    expect(tx.creditLedger.create).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/wallet-core.test.mjs`
Expected: FAIL — `debitWallet`/`adjustWalletTo` don't exist; `reserveCredits` uses `findUnique` + unconditional `update`; `grantCredits` has no `db` param.

- [ ] **Step 3: Implement in `src/lib/wallet.js`.** Add a file-header comment stating the ledger semantics from Global Constraints verbatim. Core patterns:

```js
// Run `fn` inside the given client (already a transaction) or a fresh one.
function withDb(db, fn) {
  return db ? fn(db) : prisma.$transaction(fn);
}

const LEDGER_TYPES = ["signup", "subscription_grant", "topup", "promo", "reservation", "reservation_release", "generation", "debit", "refund", "admin_adjustment", "migration_opening_balance"];

export async function reserveCredits(userId, amount, jobId, expiresInMinutes = 30, db = null) {
  return withDb(db, async (tx) => {
    const claimed = await tx.creditWallet.updateMany({
      where: { userId, available: { gte: amount } },
      data: { available: { decrement: amount }, reserved: { increment: amount } },
    });
    if (claimed.count === 0) {
      const w = await tx.creditWallet.findUnique({ where: { userId } });
      throw new Error(`Insufficient credits: need ${amount}, have ${w?.available ?? 0}`);
    }
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    const reservation = await tx.creditReservation.create({
      data: { walletId: wallet.id, generationId: jobId, amount, status: "active" },
    });
    await writeLedger(tx, wallet.id, -amount, wallet.available, "reservation", `Reserved for job ${jobId}`, jobId);
    return { wallet, reservation };
  });
}

export async function debitWallet(userId, amount, description, referenceId, db = null) {
  return withDb(db, async (tx) => {
    const claimed = await tx.creditWallet.updateMany({
      where: { userId, available: { gte: amount } },
      data: { available: { decrement: amount } },
    });
    if (claimed.count === 0) throw new Error("Insufficient credits");
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    await writeLedger(tx, wallet.id, -amount, wallet.available, "debit", description, referenceId);
    return wallet;
  });
}

export async function adjustWalletTo(userId, targetAvailable, description, adminId = null, db = null) {
  return withDb(db, async (tx) => {
    const before = await tx.creditWallet.upsert({
      where: { userId }, update: {}, create: { userId, available: 0, reserved: 0, lifetime: 0 },
    });
    const delta = targetAvailable - before.available;
    if (delta === 0) return { wallet: before, delta: 0 };
    if (delta < 0) {
      const claimed = await tx.creditWallet.updateMany({
        where: { userId, available: { gte: -delta } },
        data: { available: { decrement: -delta } },
      });
      if (claimed.count === 0) throw new Error("Insufficient credits for adjustment");
    } else {
      await tx.creditWallet.update({
        where: { userId },
        data: { available: { increment: delta }, lifetime: { increment: delta } },
      });
    }
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    await writeLedger(tx, wallet.id, delta, wallet.available,
      "admin_adjustment", `${description}${adminId ? ` (by ${adminId})` : ""}`, null);
    await tx.user.update({ where: { id: userId }, data: { credits: wallet.available } });
    return { wallet, delta };
  });
}
```

Convert `settleReservation`, `releaseReservation`, `grantCredits`, `refundCredits` to the same `withDb(db, …)` shape (append `db = null` as the last parameter; body unchanged except `prisma.$transaction(async (tx) => …)` becomes `withDb(db, async (tx) => …)`). `refundCredits(userId, amount, jobId, reason, db)` forwards `db` to `grantCredits`.

- [ ] **Step 4: Run tests + full gate** — `npx vitest run tests/unit/wallet-core.test.mjs && npm test && npm run lint && npm run typecheck && npm run build`. Expected: all green (existing callers pass positional args before `db`, unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wallet.js tests/unit/wallet-core.test.mjs
git commit -m "feat: atomic conditional reserve, direct debit, absolute adjust, tx-composable wallet"
```

---

### Task 2: Migration — CHECK constraints + SubscriptionPlan yearly price + deploy.sh switch

**Files:**
- Modify: `prisma/schema.prisma` (SubscriptionPlan gains `stripePriceIdYearly String?`)
- Create: `prisma/migrations/20260801120000_wallet_constraints_and_plan_yearly/migration.sql`
- Modify: `scripts/deploy.sh` (db push → migrate deploy), `prisma/migrations/README.md`

**Interfaces:**
- Produces: DB-level guarantees `CreditWallet.available >= 0` and `reserved >= 0` (Tasks 3's tests rely on them); `SubscriptionPlan.stripePriceIdYearly` (Task 10 reads it).

- [ ] **Step 1: Edit `prisma/schema.prisma`** — in `model SubscriptionPlan` add below `stripePriceId String?`:

```prisma
  stripePriceIdYearly String?
```

- [ ] **Step 2: Author the migration offline.** Generate the column SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` if it runs offline; otherwise write by hand. Final `migration.sql` must be exactly:

```sql
-- SubscriptionPlan: yearly Stripe price
ALTER TABLE "public"."SubscriptionPlan" ADD COLUMN "stripePriceIdYearly" TEXT;

-- Wallet balances can never go negative (defense-in-depth behind the
-- conditional updates in src/lib/wallet.js)
ALTER TABLE "public"."CreditWallet" ADD CONSTRAINT "CreditWallet_available_nonnegative" CHECK ("available" >= 0);
ALTER TABLE "public"."CreditWallet" ADD CONSTRAINT "CreditWallet_reserved_nonnegative" CHECK ("reserved" >= 0);
```

Run `npx prisma validate` (offline) — must pass. Do NOT apply the migration locally.

- [ ] **Step 3: Switch `scripts/deploy.sh`** — replace the `prisma db push --skip-generate` line with:

```bash
npx prisma migrate deploy
```

and add this comment directly above it:

```bash
# ONE-TIME before the first deploy of this branch: on the server run
#   npx prisma migrate resolve --applied 0_init
# (marks the pre-existing schema as the baseline; see prisma/migrations/README.md)
```

Append a matching "Phase 2 adoption" section to `prisma/migrations/README.md` stating: run the resolve command once, then deploys apply new migrations via `migrate deploy`; the Phase 2 migration adds two CHECK constraints and one nullable column — no data rewrite, instant on this dataset.

- [ ] **Step 4: Gates + commit** — `npm run lint && npm run typecheck && npm test && npm run build` (schema change requires `npx prisma generate` first). CI's `migrations` job (clean Postgres) is the authoritative apply-test on push.

```bash
npx prisma generate
git add prisma scripts/deploy.sh
git commit -m "feat: wallet non-negative constraints, plan yearly price column, migrate-deploy workflow"
```

---

### Task 3: Integration-test harness + wallet race proofs

**Files:**
- Create: `vitest.integration.config.mjs`, `tests/integration/setup.mjs`, `tests/integration/wallet.int.test.mjs`
- Modify: `package.json` (script `test:integration`), `.github/workflows/ci.yml` (integration job)

**Interfaces:**
- Produces: the convention every later integration suite uses — files `tests/integration/**/*.int.test.mjs`, run via `npm run test:integration`, DB from `TEST_DATABASE_URL` (localhost only), helper `resetDb()` + `createUserWithWallet(available)` exported from `tests/integration/setup.mjs`.

- [ ] **Step 1: Config + setup with the hard safety guard**

```js
// vitest.integration.config.mjs
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.mjs"],
    setupFiles: ["tests/integration/setup.mjs"],
    fileParallelism: false, // suites share one database
    testTimeout: 30000,
  },
  resolve: { alias: { "@": path.resolve(root, "src") } },
});
```

```js
// tests/integration/setup.mjs
// SAFETY: integration tests connect to TEST_DATABASE_URL and refuse anything
// that is not a local database. The .env DATABASE_URL points at production —
// it must never be reachable from here.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL not set — integration tests need a disposable local Postgres (see README).");
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) {
  throw new Error(`Refusing to run integration tests against non-local host "${host}".`);
}
process.env.DATABASE_URL = url; // src/lib/prisma.js reads this at import time

import { randomUUID } from "node:crypto";

export async function resetDb() {
  const { default: prisma } = await import("@/lib/prisma");
  // Order respects FKs; cascade handles the rest.
  await prisma.$executeRawUnsafe(
    `TRUNCATE "public"."User" RESTART IDENTITY CASCADE`
  );
  return prisma;
}

export async function createUserWithWallet(available) {
  const { default: prisma } = await import("@/lib/prisma");
  const user = await prisma.user.create({
    data: { email: `t-${randomUUID()}@test.local`, credits: available },
  });
  await prisma.creditWallet.create({
    data: { userId: user.id, available, reserved: 0, lifetime: available },
  });
  return user;
}
```

- [ ] **Step 2: Write the race + invariant tests**

```js
// tests/integration/wallet.int.test.mjs
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

describe("reserveCredits under concurrency", () => {
  it("never over-spends: two concurrent 60-credit reserves on a 100-credit wallet → exactly one succeeds", async () => {
    const { reserveCredits } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);

    const results = await Promise.allSettled([
      reserveCredits(user.id, 60, "job-a"),
      reserveCredits(user.id, 60, "job-b"),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(40);
    expect(wallet.reserved).toBe(60);
    expect(wallet.available).toBeGreaterThanOrEqual(0);
  });
});

describe("reserve → settle / release invariants", () => {
  it("settling at less than reserved returns the difference and books the cost row", async () => {
    const { reserveCredits, settleReservation } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    await reserveCredits(user.id, 50, "job-1");
    await settleReservation(user.id, "job-1", 30);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(70); // 100 - 50 + 20 released
    expect(wallet.reserved).toBe(0);

    const rows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "asc" } });
    const movementSum = rows.filter((r) => r.type !== "generation").reduce((s, r) => s + r.amount, 0);
    expect(movementSum).toBe(-30); // net spend relative to opening 100... wallet started with no opening ledger row
    expect(wallet.available).toBe(100 + movementSum);
  });

  it("release restores the full amount and settlement afterwards is a no-op error", async () => {
    const { reserveCredits, releaseReservation, settleReservation } = await import("@/lib/wallet");
    const user = await createUserWithWallet(100);
    await reserveCredits(user.id, 50, "job-2");
    await releaseReservation(user.id, "job-2");

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(100);
    expect(wallet.reserved).toBe(0);

    await expect(settleReservation(user.id, "job-2", 50)).rejects.toThrow(/No active reservation/);
  });
});

describe("DB CHECK constraints", () => {
  it("the database itself rejects a negative balance", async () => {
    const user = await createUserWithWallet(10);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "public"."CreditWallet" SET "available" = "available" - 50 WHERE "userId" = $1`, user.id
      )
    ).rejects.toThrow(/CreditWallet_available_nonnegative|check constraint/i);
  });
});
```

- [ ] **Step 3: Scripts + CI.** `package.json`: `"test:integration": "vitest run --config vitest.integration.config.mjs"`. In `.github/workflows/ci.yml` add to the existing `migrations` job (it already has the postgres service and has run `migrate deploy`) these steps after the deploy step:

```yaml
      - run: npx prisma generate
      - run: npm run test:integration
        env:
          TEST_DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
```

- [ ] **Step 4: Local run if possible, otherwise CI validates.** If Docker Desktop is running (`docker info` succeeds): `docker run -d --name helmies-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test -p 55432:5432 postgres:16`, then `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/test npx prisma migrate deploy && TEST_DATABASE_URL=... npm run test:integration`, and remove the container afterwards (`docker rm -f helmies-test-pg`). If Docker is not running, push the branch and verify the CI integration job (temporarily add the branch to the workflow's push trigger, exactly as Task 12 of Phase 1 did, and revert the trigger in the same task).
- [ ] **Step 5: Gates + commit**

```bash
git add -A && git commit -m "test: integration harness with localhost guard; wallet race and invariant proofs"
```

---

### Task 4: Generation webhooks — shared handler, wallet refunds, atomic transition

**Files:**
- Create: `src/lib/generation-webhook.js` (extract the shared logic from `src/app/api/webhooks/generation-complete/route.js` — the two webhook routes are near-verbatim duplicates)
- Modify: `src/app/api/webhooks/generation-complete/route.js`, `src/app/api/webhooks/generation/route.js` (thin wrappers over the shared handler)
- Test: `tests/unit/generation-webhook.test.mjs`, `tests/integration/webhook-refund.int.test.mjs`

**Interfaces:**
- Consumes: `refundCredits(userId, amount, jobId, reason, db)` from Task 1.
- Produces: `handleGenerationWebhook(payload)` in `@/lib/generation-webhook` returning `{ status, response }`; both routes import it. Refund rule: the failure branch runs ONE `prisma.$transaction` that (a) conditionally transitions the Generation out of non-terminal state (`updateMany where status notIn ["failed","completed"]`) and (b) refunds via `refundCredits(..., tx)` only when the transition count is 1 and `creditsUsed > 0`. A second delivery gets `alreadyProcessed: true` and no second refund.

- [ ] **Step 1: Read both webhook route files fully.** Confirm the duplicate structure and note any real differences (payload format handling); the shared module must preserve both formats.
- [ ] **Step 2: Write failing unit tests** (mock `@/lib/prisma`, `@/lib/wallet`, `@/lib/media-download`): failure payload → `$transaction` used, `refundCredits` called with the tx client and `generation.creditsUsed`; duplicate failure payload (transition count 0) → no refund call; success payload → no refund. Follow the established `vi.mock` + route-import pattern from `tests/unit/api-canvas.test.mjs`.
- [ ] **Step 3: Extract + implement.** Replace the `creditUser` import/usage; refund becomes:

```js
const result = await prisma.$transaction(async (tx) => {
  const transitioned = await tx.generation.updateMany({
    where: { id: generation.id, status: { notIn: ["failed", "completed"] } },
    data: { status: "failed", error: errorMsg || "Generation failed" },
  });
  if (transitioned.count === 0) return { alreadyProcessed: true };
  if (generation.creditsUsed > 0) {
    await refundCredits(generation.userId, generation.creditsUsed, generation.id,
      `Refund: ${errorMsg || "Failed generation"}`, tx);
  }
  return { refunded: generation.creditsUsed > 0 };
});
```

- [ ] **Step 4: Integration test** — insert a user+wallet (50 available), a completed settle cycle (reserve 20 → settle 20 via wallet fns), then call the failure branch handler twice for that generation: available returns to 50 exactly once; `CreditLedger` has exactly one `refund` row; second call returns `alreadyProcessed`.
- [ ] **Step 5: Gates (`npm test`, `npm run test:integration` where available, lint, typecheck, build) + commit**

```bash
git add -A && git commit -m "fix: generation webhook refunds go through the wallet ledger, atomically and once"
```

---

### Task 5: Agent runs pay real credits

**Files:**
- Modify: `src/lib/agents.js` (remove private `debitCredits`/`creditUser` at :584-596; both run paths and both refund sites)
- Test: `tests/unit/agents-credits.test.mjs`

**Interfaces:**
- Consumes: `debitWallet(userId, amount, description, referenceId)`, `refundCredits(userId, amount, jobId, reason)` from Task 1.
- Produces: agent debits/refunds appear in `CreditLedger` (`debit` / `refund` rows with `referenceId` = `agent:<agentRunId>`), survive the `User.credits` mirror sync (the old bug: `agents.js` wrote only `User.credits`, which `syncUserCreditsFromWallet` overwrote — agent runs were free).

- [ ] **Step 1: Read `src/lib/agents.js`** around lines 430–600: two execution paths (`executeAgentRunStream` ~:446 and `executeAgentRun` ~:526) call `debitCredits(userId, plan.estimate.total, …)` after a wallet-based affordability check; two failure sites (~:486, ~:575) call `creditUser(userId, ceil(refundAmount), "agent_refund", …)`.
- [ ] **Step 2: Failing unit test** — mock `@/lib/prisma` and `@/lib/wallet`; drive `executeAgentRun` with a minimal plan (1 step) whose step executor is forced to succeed/fail (mock the generation lib the steps call — read the file to get the exact import to mock); assert `debitWallet` is called with (`userId`, `plan.estimate.total`, description containing the plan summary, `agent:<runId>`), and on failure `refundCredits` is called with the ceil'd remainder and the same reference. Assert `prisma.user.updateMany` is never called with a `credits` decrement (the old path).
- [ ] **Step 3: Implement.** Replace all four call sites:

```js
import { getWallet, debitWallet, refundCredits } from "@/lib/wallet";
// debit (both paths):
await debitWallet(userId, plan.estimate.total, `Agent run: ${plan.summary}`, `agent:${agentRun.id}`);
// refund (both failure sites):
await refundCredits(userId, Math.ceil(refundAmount), `agent:${agentRun.id}`, "Agent run partial failure");
```

Delete the private `debitCredits`/`creditUser` functions entirely. Keep the pre-existing `getWallet` affordability checks (they are now advisory; `debitWallet` is the enforcement).

- [ ] **Step 4: Gates + commit**

```bash
git add -A && git commit -m "fix: agent runs debit the wallet ledger — they were effectively free"
```

---

### Task 6: Director pipelines pay through the wallet

**Files:**
- Modify: `src/lib/director-executor.js` (`:2` import, `:330-340` balance check + debit, `:375` and `:584` refunds)
- Test: `tests/unit/director-credits.test.mjs`

**Interfaces:**
- Consumes: `getWallet`, `debitWallet`, `refundCredits` from Task 1.
- Produces: director debits/refunds in `CreditLedger` with `referenceId` = `director:<pipelineId>`; balance checks read the wallet, not the stale `User.credits` mirror.

- [ ] **Step 1: Failing unit test** — mock `@/lib/prisma` and `@/lib/wallet`; call the exported executor entry (read the file top to get the exact export names and the minimal pipeline fixture the function loads via prisma mocks); assert: affordability uses `getWallet` (not `prisma.user.findUnique(... credits)`), `debitWallet(userId, costEstimate.totalCredits, expect.stringContaining("Director"), \`director:${pipelineId}\`)`, and the stop-on-failure branch refunds via `refundCredits(userId, remainingCredits, \`director:${pipelineId}\`, expect.any(String))`.
- [ ] **Step 2: Implement.** Replace:
  - `import { getCurrentUserWithCredits, debitCredits, creditUser } from "@/lib/session"` → `import { getCurrentUserWithCredits } from "@/lib/session"` plus `import { getWallet, debitWallet, refundCredits } from "@/lib/wallet"` (keep `getCurrentUserWithCredits` only if still used elsewhere in the file — check).
  - Balance check (~:330): `const wallet = await getWallet(userId); if (wallet.available < (costEstimate.totalCredits || 0)) throw new Error(...)` with the same message shape.
  - Debit (~:339): `await debitWallet(userId, costEstimate.totalCredits, "Director pipeline run", \`director:${pipelineId}\`);`
  - Refunds (~:375, ~:584): `await refundCredits(userId, remainingCredits, \`director:${pipelineId}\`, "Unexecuted shots refund");` (and the cancel variant with its message).
- [ ] **Step 3: Gates + commit**

```bash
git add -A && git commit -m "fix: director pipelines debit and refund through the wallet ledger"
```

---

### Task 6b: Director state machine — stop charging for runs that always crash

*(Added mid-execution: Task 6's review CONFIRMED a pre-existing bug — `executeProductionPipeline` never leaves `GENERATING_IMAGES`, so the mandatory transition to `ASSEMBLING` (`director-executor.js:391`) or `COMPLETED` (`:419`) is invalid per `VALID_TRANSITIONS[GENERATING_IMAGES] = [GENERATING_VIDEOS, FAILED, PAUSED]` (`:49`) and THROWS on every non-failing run — after `debitWallet` has charged, with no refund. Every successful director run today = charge + 500 + pipeline stuck.)*

**Files:**
- Modify: `src/lib/director-executor.js` (`VALID_TRANSITIONS`, post-debit crash safety net)
- Test: extend `tests/unit/director-credits.test.mjs`

**Interfaces:**
- Consumes: `refundCredits(userId, amount, \`director:${pipelineId}\`, reason)` from Task 1.
- Produces: happy-path pipelines reach `COMPLETED` (or `ASSEMBLING → COMPLETED`) without an invalid-transition throw; any unexpected throw AFTER the debit refunds un-consumed credits and transitions the pipeline to `FAILED` before propagating.

- [ ] **Step 1: Failing tests** — extend `tests/unit/director-credits.test.mjs`: (a) happy path (all shots succeed) resolves without throwing and the last `transitionPipeline` target is `COMPLETED`; (b) a mid-run throw after the debit triggers `refundCredits` for the un-consumed remainder and a `FAILED` transition. (The two existing wallet-call-then-throw assertions from Task 6 flip to clean-success assertions — update them.)
- [ ] **Step 2: Implement minimally:**
  - Extend `VALID_TRANSITIONS[PIPELINE_STATES.GENERATING_IMAGES]` to also allow `ASSEMBLING` and `COMPLETED` (the executor genuinely performs image+video+audio per shot within the one generating state — the table, not the flow, is wrong).
  - Wrap the post-debit body of `executeProductionPipeline` in try/catch: on catch, compute the same un-consumed remainder the stop-on-failure branch uses, `refundCredits(userId, remainder, \`director:${pipelineId}\`, "Pipeline crashed — unexecuted work refunded")` when > 0, best-effort `transitionPipeline(pipelineId, FAILED)`, then rethrow.
- [ ] **Step 3: Gates** (`npm test`, lint, typecheck, build) **+ commit**

```bash
git add -A && git commit -m "fix: director pipelines complete instead of charging then crashing; refund on crash"
```

---

### Task 7: Retire session.js debit/credit; admin + automation adjustments; ledger-backed history

**Files:**
- Modify: `src/lib/session.js` (delete `debitCredits` and `creditUser`), `src/app/api/admin/users/route.js` (PATCH), `src/lib/automation.js` (abuse clamp), `src/app/api/credits/route.js` (history source)
- Test: `tests/unit/admin-users-credits.test.mjs`, `tests/unit/api-credits-history.test.mjs`

**Interfaces:**
- Consumes: `adjustWalletTo(userId, target, description, adminId)` from Task 1.
- Produces: `session.js` no longer exports `debitCredits`/`creditUser` (Tasks 4–6 removed the last importers — verify with grep before deleting). `/api/credits` returns `recentTransactions` mapped from `CreditLedger` (`{ id, amount, type, description, createdAt }` — same keys the UI reads today).

- [ ] **Step 1: Prove the exports are dead**

```bash
grep -rn "from \"@/lib/session\"" src/ --include="*.js" | xargs -I{} echo {}   # inspect each import list
grep -rn "debitCredits\|creditUser" src/ --include="*.js"
```

Expected after Tasks 4–6: only `session.js` itself defines them. If any caller remains, STOP — that caller belongs to an earlier task; fix it there first.

- [ ] **Step 2: Failing tests.**
  - `admin-users-credits.test.mjs`: mock `@/lib/security` (requireAdmin ok, logAudit), `@/lib/wallet`, `@/lib/prisma`; PATCH `{ userId, credits: 250 }` → `adjustWalletTo("u1", 250, expect.stringContaining("Admin"), "admin1")` called; `prisma.user.update` NOT called with a `credits` field (role-only updates still go through `prisma.user.update`); negative credits still 400.
  - `api-credits-history.test.mjs`: mock prisma; GET → `prisma.creditLedger.findMany` called with `{ where: { wallet: { userId: "u1" } }, orderBy: { createdAt: "desc" }, take: 20 }` and response `recentTransactions[0]` has keys `id, amount, type, description, createdAt`; `prisma.creditTransaction.findMany` not called.
- [ ] **Step 3: Implement.**
  - `admin/users` PATCH: replace `data.credits = credits` + `prisma.user.update` with: role changes via `prisma.user.update` (role only); credit changes via `await adjustWalletTo(userId, credits, "Admin credit adjustment", admin.id)`. Keep the existing validation and `logAudit` call (audit now also records the wallet delta: pass `{ credits, role, adminId: admin.id }` as before).
  - `automation.js` clamp: replace the `prisma.user.update({ data: { credits: ABUSE_SUSPEND_CREDITS } })` + `creditTransaction.create` block with `await adjustWalletTo(u.userId, ABUSE_SUSPEND_CREDITS, \`Auto-suspended: ${u._count} generations in ${ABUSE_WINDOW_MINUTES}min\`)`.
  - `/api/credits`: replace the `creditTransaction.findMany` with `creditLedger.findMany({ where: { wallet: { userId: user.id } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, amount: true, type: true, description: true, createdAt: true } })`.
  - Delete `debitCredits`/`creditUser` from `session.js`.
- [ ] **Step 4: Gates + commit**

```bash
git add -A && git commit -m "feat: admin and automation adjust wallets via ledger; credits history reads the ledger"
```

---

### Task 8: Signup grants write the opening ledger entry

**Files:**
- Modify: `src/app/api/auth/register/route.js` (:58-75 nested create), `src/lib/auth.js` (`events.createUser`)
- Test: `tests/unit/signup-ledger.test.mjs`, extend `tests/integration/wallet.int.test.mjs`

**Interfaces:**
- Consumes: `grantCredits(userId, 100, "signup", "Welcome bonus: 100 free credits", null, db?)`.
- Produces: every new wallet starts with a `signup` ledger row, so `available == Σ non-generation ledger` holds from account creation. The legacy `CreditTransaction` signup row is no longer written (`/api/credits` reads the ledger as of Task 7).

- [ ] **Step 1: Failing unit test** — mock prisma + wallet; POST to register with fresh email → `prisma.user.create` called WITHOUT nested `wallet`/`transactions` creates; `grantCredits` called with `(userId, 100, "signup", "Welcome bonus: 100 free credits")`. Same assertions for the `createUser` event handler in `auth.js` (import `authOptions`… read the file first: the events object is defined inside the NextAuth config — test it by importing the module and invoking the exported event if reachable, otherwise refactor the event body into an exported `handleNewUser(user)` function in `src/lib/auth-events.js` and test THAT; the config then calls it. Prefer the refactor — it makes both signup paths share one function).
- [ ] **Step 2: Implement.** Create `src/lib/auth-events.js`:

```js
import prisma from "@/lib/prisma";
import { grantCredits } from "@/lib/wallet";

export const SIGNUP_CREDITS = 100;

// Shared post-signup provisioning for both the OAuth createUser event and
// the credentials /api/auth/register route.
export async function provisionNewUser(userId, { firstUserAdmin = false } = {}) {
  if (firstUserAdmin) {
    await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });
  }
  await prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "free", status: "active" },
  });
  await grantCredits(userId, SIGNUP_CREDITS, "signup", "Welcome bonus: 100 free credits");
}
```

(Check the actual `Subscription` unique constraint before using `upsert where userId` — read `prisma/schema.prisma`; if `userId` is not unique there, keep the original `create` calls.) Register route: `prisma.user.create` keeps only user fields (email, name, passwordHash, role, emailVerified) then `await provisionNewUser(user.id)` (role already computed in-route — pass `firstUserAdmin: false` and keep the in-route role logic). `auth.js` `events.createUser`: replace the body with role logic + `provisionNewUser(user.id)`.
- [ ] **Step 3: Integration test** — POST-register equivalent at the lib level: create user via prisma, call `provisionNewUser`, assert wallet `available === 100`, one ledger row `{ type: "signup", amount: 100, balanceAfter: 100 }`, subscription row exists.
- [ ] **Step 4: Gates + commit**

```bash
git add -A && git commit -m "fix: both signup paths grant credits through the wallet with an opening ledger entry"
```

---

### Task 9: Stripe webhook — claim and grant in one transaction

**Files:**
- Modify: `src/app/api/stripe/webhook/route.js`
- Test: `tests/unit/stripe-webhook.test.mjs`, `tests/integration/stripe-webhook.int.test.mjs`

**Interfaces:**
- Consumes: `grantCredits(..., db)` tx-composability from Task 1.
- Produces: the `StripeEvent` claim row and ALL handler DB writes commit atomically — a crash anywhere rolls back both, so Stripe's retry reprocesses cleanly; a concurrent duplicate hits the unique `stripeEventId` (P2002) and is acknowledged without a second grant. Network calls (`subscriptions.retrieve`) happen BEFORE the transaction opens.

- [ ] **Step 1: Failing unit test** — mock `stripe` (constructEvent returns a fixture event; `subscriptions.retrieve` a fixture sub), `@/lib/prisma`, `@/lib/wallet`. Cases:
  1. `checkout.session.completed` top-up: `$transaction` invoked; inside it `stripeEvent.create` AND `grantCredits(..., tx)` both called with the SAME tx client; response 200.
  2. Handler throws (force `grantCredits` to reject): `stripeEvent.create` was part of the same rolled-back tx (assert route returns 500 and — with the mocked `$transaction` rethrowing — no separate top-level `stripeEvent.create` call happened outside the tx).
  3. `$transaction` rejects with `{ code: "P2002", meta: { target: ["stripeEventId"] } }` → 200 `{ received: true }`, no error.
  4. Pre-check duplicate (findUnique returns a row) → 200, `$transaction` never called.
- [ ] **Step 2: Restructure the route.** Shape:

```js
// after signature verification and the cheap findUnique duplicate pre-check:
let prefetched = null;
if (event.type === "invoice.paid" && event.data.object.subscription) {
  prefetched = await getStripe().subscriptions.retrieve(event.data.object.subscription);
}

try {
  await prisma.$transaction(async (tx) => {
    await tx.stripeEvent.create({ data: { stripeEventId, eventType: event.type } });
    switch (event.type) {
      case "checkout.session.completed": /* same branches as today, but every
        prisma.* call becomes tx.* and every grantCredits(...) gains `tx` as
        its final argument */ break;
      case "invoice.paid": /* use `prefetched` instead of calling Stripe here;
        grants + subscription.updateMany via tx */ break;
      case "customer.subscription.deleted": /* tx.subscription.updateMany */ break;
    }
  });
  return NextResponse.json({ received: true });
} catch (e) {
  if (e?.code === "P2002" && e?.meta?.target?.includes?.("stripeEventId")) {
    return NextResponse.json({ received: true });
  }
  console.error(`[webhook] Error processing event ${stripeEventId}:`, e);
  return NextResponse.json({ error: e.message }, { status: 500 });
}
```

Keep the existing metadata-driven branches (top-up / template_purchase / subscription) byte-equivalent except for `tx` threading. Delete the old post-handler `stripeEvent.create` block.
- [ ] **Step 3: Integration test** — with a real DB (no Stripe network: import the route with `stripe` mocked at module level, signature check stubbed to return a crafted top-up event): (a) first delivery grants 500 credits, writes `topup` ledger row + `StripeEvent` row; (b) second identical delivery: no new ledger row; (c) forced failure inside the handler (grant to a nonexistent user id) leaves NO `StripeEvent` row → a retry can succeed.
- [ ] **Step 4: Gates + commit**

```bash
git add -A && git commit -m "fix: stripe webhook claims event id and grants credits in one transaction"
```

---

### Task 10: Billing reads SubscriptionPlan and CreditPack from the database

**Files:**
- Create: `scripts/seed-plans.mjs`
- Modify: `src/app/api/stripe/checkout/route.js`, `src/app/api/stripe/topup/route.js`, `src/app/api/stripe/webhook/route.js` (credits amounts), `README.md` (seed instructions)
- Test: `tests/unit/stripe-plans-db.test.mjs`

**Interfaces:**
- Consumes: `SubscriptionPlan { slug, credits, stripePriceId, stripePriceIdYearly, isActive }`, `CreditPack { id, name, credits, price (euro-cents), stripePriceId?, isActive, sortOrder }` (Task 2 column).
- Produces: checkout/topup/webhook no longer import `PLAN_IDS`/`SUBSCRIPTION_CREDITS`/`CREDIT_PACKS` for billing decisions. `plan-constants.js` remains for display copy and as seed input only. Missing/inactive DB row → 400 `"Plan not configured"` / `"Invalid pack"`.

- [ ] **Step 1: Seed script** (idempotent; safe to run in prod at deploy; reads env price IDs):

```js
#!/usr/bin/env node
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const PLANS = [
  { slug: "free",    name: "Free",    price: 0,     credits: 100,   monthly: null,                             yearly: null },
  { slug: "starter", name: "Starter", price: 900,   credits: 1000,  monthly: process.env.STRIPE_PRICE_STARTER, yearly: process.env.STRIPE_PRICE_STARTER_YEARLY },
  { slug: "studio",  name: "Studio",  price: 2900,  credits: 3000,  monthly: process.env.STRIPE_PRICE_STUDIO,  yearly: process.env.STRIPE_PRICE_STUDIO_YEARLY },
  { slug: "pro",     name: "Pro",     price: 7900,  credits: 10000, monthly: process.env.STRIPE_PRICE_PRO,     yearly: process.env.STRIPE_PRICE_PRO_YEARLY },
];
// NOTE: verify the `price` euro-cent amounts against the live /pricing page
// before seeding production; they are display metadata — the charge amount
// always comes from the Stripe price object.

const PACKS = [
  { name: "500 Credits",  credits: 500,  price: 900,  sortOrder: 1 },
  { name: "1000 Credits", credits: 1000, price: 1600, sortOrder: 2 },
  { name: "2500 Credits", credits: 2500, price: 3500, sortOrder: 3 },
  { name: "5000 Credits", credits: 5000, price: 6000, sortOrder: 4 },
];

for (const p of PLANS) {
  await prisma.subscriptionPlan.upsert({
    where: { slug: p.slug },
    update: { credits: p.credits, stripePriceId: p.monthly, stripePriceIdYearly: p.yearly, isActive: true },
    create: { slug: p.slug, name: p.name, price: p.price, credits: p.credits, stripePriceId: p.monthly, stripePriceIdYearly: p.yearly },
  });
}
for (const pack of PACKS) {
  const existing = await prisma.creditPack.findFirst({ where: { credits: pack.credits } });
  if (existing) await prisma.creditPack.update({ where: { id: existing.id }, data: { name: pack.name, price: pack.price, sortOrder: pack.sortOrder, isActive: true } });
  else await prisma.creditPack.create({ data: pack });
}
console.log("Seeded", PLANS.length, "plans and", PACKS.length, "packs.");
await prisma.$disconnect();
```

- [ ] **Step 2: Failing unit tests** (mock prisma + stripe): checkout `{ plan: "studio", yearly: true }` → `subscriptionPlan.findUnique({ where: { slug: "studio" } })`, line_items price = the row's `stripePriceIdYearly`; inactive/missing row or missing price id → 400, no Stripe session; topup POST resolves pack by id from `creditPack.findUnique`, `unit_amount` = row's `price` (cents), metadata credits = row's `credits`; topup GET lists only `isActive` packs ordered by `sortOrder`; webhook subscription grant amount comes from `subscriptionPlan.findUnique({ where: { slug } }).credits` and invoice.paid resolves the plan row by matching `stripePriceId` OR `stripePriceIdYearly` against the invoice's price id.
- [ ] **Step 3: Implement** in the three routes; remove the `PLAN_IDS`/`SUBSCRIPTION_CREDITS`/`CREDIT_PACKS` billing imports. Webhook plan resolution:

```js
async function planBySlugOrPrice(tx, slug, priceId) {
  if (slug) {
    const bySlug = await tx.subscriptionPlan.findUnique({ where: { slug } });
    if (bySlug) return bySlug;
  }
  if (priceId) {
    return tx.subscriptionPlan.findFirst({
      where: { OR: [{ stripePriceId: priceId }, { stripePriceIdYearly: priceId }] },
    });
  }
  return null;
}
```

Document in README: `node scripts/seed-plans.mjs` must run once at deploy (and after changing Stripe price env vars); the admin Plans editor now genuinely drives billing credits.
- [ ] **Step 4: Gates + commit**

```bash
git add -A && git commit -m "feat: checkout, top-up and webhook grants read plans and packs from the database"
```

---

### Task 11: Kill the under-billing paths

**Files:**
- Modify: `src/lib/generation-handler.js` (:54 model resolution, :138-157 cost resolution), `src/app/api/generate/async/route.js` (:62 cost fallback)
- Test: `tests/unit/generation-pricing-strict.test.mjs`

**Interfaces:**
- Produces: both HTTP generation entry points require an explicit `body.model` with an active `ModelPricing` row; the flat per-tool `CREDIT_COSTS` fallback and the `body.endpoint`/tool-name model selection are gone from execution paths. (`estimateCredits`'s fallback stays for agent/director PLANNING previews only.)

- [ ] **Step 1: Failing tests** (mock prisma, wallet, providers, prompt engine — follow the mocking pattern in existing suites; drive `handleGeneration` via one thin route import):
  - no `body.model` → 400 `"Model required"` (even when `body.endpoint` or the tool name would have matched something before);
  - `body.model` set but no `ModelPricing` row → 422 `"Model not priced"` even when the static registry knows the model;
  - `ModelPricing` row inactive or deprecated → 422;
  - happy path: cost comes from the pricing row (or its `pricingRules` quote), never from `CREDIT_COSTS`;
  - async route: same four cases.
- [ ] **Step 2: Implement.**
  - `generation-handler.js:54`: `const model = body.model; if (!model) return 400 "Model required";`
  - Cost block: after `dbPricing` lookup — `if (!dbPricing || dbPricing.isActive === false || dbPricing.isDeprecated) return 422 { error: "Model not priced", model }`. Static registry (`MODEL_REGISTRY`) remains ONLY as an endpoint-metadata fallback for rows without `endpoint` — never as a pricing source; delete the incoming per-route `cost` default usage (read the function signature first: the 13 routes pass a tool-default cost — keep the parameter for API compatibility but ignore it for pricing).
  - `async/route.js:62`: replace `dbPricing?.creditsCost || await estimateCredits(...)` with the same require-pricing-row policy (the route already 400s on missing model).
- [ ] **Step 3: Sanity sweep** — `grep -n "CREDIT_COSTS\|getFallbackCost" src/lib src/app/api -r`: remaining callers must all be estimate/preview paths (`/api/estimate`, agent/director planners), not execution paths. List them in the report.
- [ ] **Step 4: Gates + commit**

```bash
git add -A && git commit -m "fix: generations require a priced model — flat-cost and endpoint-smuggling paths removed"
```

---

### Task 12: Reconciliation

**Files:**
- Create: `src/lib/reconciliation.js`, `scripts/reconcile-credits.mjs`
- Test: `tests/unit/reconciliation.test.mjs`, `tests/integration/reconciliation.int.test.mjs`
- Modify: `package.json` (script `"reconcile": "node scripts/reconcile-credits.mjs"`), README (ops note)

**Interfaces:**
- Produces: `reconcileWallet(userId)` → `{ userId, available, reserved, ledgerMovementSum, activeReservationSum, mirrorCredits, driftAvailable, driftReserved, driftMirror, ok }` where `ledgerMovementSum` = Σ `amount` of ledger rows with `type != "generation"`, `driftAvailable = available - ledgerMovementSum`, `driftReserved = reserved - activeReservationSum`, `driftMirror = mirrorCredits - available`, `ok` = all drifts 0. `reconcileAll()` streams every wallet. Script prints a table (no secrets), exits 1 when any wallet has drift; `--fix --yes` books ONE `admin_adjustment` ledger row per drifted wallet with description `"reconciliation anchor"` so the invariant holds going forward (it never edits history and never changes balances — the wallet is authoritative; the anchor makes the LEDGER match the wallet).

- [ ] **Step 1: Failing unit tests** — mocked prisma: healthy wallet (rows sum correctly) → `ok: true`; wallet with a legacy no-ledger credit (available 120, movement sum 100) → `driftAvailable: 20, ok: false`; fix mode writes exactly one `admin_adjustment` row of `amount: 20`, `description: "reconciliation anchor"`; reserved mismatch detected via active-reservation sum.
- [ ] **Step 2: Implement lib + script.** Script safety: refuses `--fix` without `--yes`; prints per-wallet drift lines and a summary count; never prints emails (userId only).
- [ ] **Step 3: Integration test** — build a wallet through real wallet.js calls (grant 100 signup → reserve 30 → settle 20): `reconcileWallet` reports `ok: true` (this proves the invariant matches actual wallet.js behavior — the load-bearing assertion of the whole phase); then simulate legacy drift with a raw `UPDATE "CreditWallet" SET available = available + 15` (bypassing checks via increment stays non-negative) → drift 15 detected → `--fix` path books the anchor → re-run reports `ok: true`.
- [ ] **Step 4: Gates + commit**

```bash
git add -A && git commit -m "feat: wallet-ledger reconciliation with explicit anchor repair"
```

---

### Task 13: Phase gate — full suites, CI, PR

**Files:** none new (CI trigger touch-and-revert only if needed for validation).

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run build` — all green, zero warnings.
- [ ] **Step 2:** Integration suite green in CI (push branch; the `migrations` job runs `migrate deploy` — now including the Phase 2 migration — then `test:integration`). Repair until green.
- [ ] **Step 3:** `git diff main --stat -- src/components/landing src/app/page.js` → empty.
- [ ] **Step 4:** Open the PR with the repo template. Risk level: **High (money/auth/migrations)**. The PR body MUST carry the deploy runbook verbatim:
  1. `git pull` on server, `npm ci`;
  2. **one-time** `npx prisma migrate resolve --applied 0_init`;
  3. `npx prisma migrate deploy` (applies the CHECK-constraint migration — will FAIL if any wallet is already negative; if so, run `node scripts/reconcile-credits.mjs` first and fix negatives via admin adjustment);
  4. `node scripts/seed-plans.mjs`;
  5. `npm run build` + `pm2 restart helmies-studio --update-env`;
  6. `node scripts/reconcile-credits.mjs` (report-only) and review drift before/after.
- [ ] **Step 5:** CI green on the PR is the exit condition. Do not merge with any failing job.

---

## Self-Review (done at authoring time)

1. **Spec coverage** (roadmap Phase 2 scope → tasks): M1 agents → T5; M2 session debit/credit → T4/T6/T7; M3 reserve race + constraints → T1/T2/T3; M4 Stripe idempotency ordering → T9; M5 under-billing → T11; M6 decorative plan editor → T10; opening ledger entries → T8; reconciliation → T12; deploy.sh switch (final-review ordering condition) → T2 + T13 runbook. Contract §2.2 rules each mapped: transactions+ledger (T1), no double spend (T1/T3), settlement idempotent (T4/pre-existing conditional transition), refunds as new entries (T1/T4), admin adjustments with reason+audit (T7), Stripe+generation same wallet (T9/T10), `User.credits` mirror non-authoritative (unchanged design, T7 removes last authoritative writes), reconciliation job (T12).
2. **Placeholder scan:** Tasks 4, 5, 6, 8, 9 contain "read the file first" steps for fixture/export names that genuinely vary — each names the exact file, line region, and the fixed assertions; no TBD/TODO items. T10 seed prices flagged for verification against the live pricing page (real uncertainty, stated).
3. **Type consistency:** `debitWallet(userId, amount, description, referenceId, db?)` used identically in T1/T5/T6; `adjustWalletTo(userId, target, description, adminId?, db?)` in T1/T7; `refundCredits(userId, amount, jobId, reason, db?)` in T1/T4/T5/T6; reference-id convention `agent:<id>` / `director:<id>` consistent; integration helpers `resetDb()`/`createUserWithWallet()` defined in T3, reused in T4/T8/T9/T12.
