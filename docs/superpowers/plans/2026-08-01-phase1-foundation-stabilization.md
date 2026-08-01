# Phase 1 — Foundation & Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give helmies-studio a working lint/typecheck/test/CI foundation, a Prisma migrations baseline, and fix the five small runtime/security defects (canvas 500s, anonymous contact 500s, admin model-test field bugs, plaintext provider key exposure, public margin disclosure) — all test-first.

**Architecture:** No new subsystems. Add tooling configs at repo root, a `tests/unit/` Vitest suite that mocks `@/lib/prisma` and `@/lib/session` for route-handler tests, and surgical fixes inside existing route/lib files. Prisma migrations are generated offline via `migrate diff` and validated in CI against a disposable Postgres.

**Tech Stack:** Next.js 16.2 (App Router, JS), ESLint 9 flat config + `eslint-config-next`, TypeScript 5.7 (`tsc --noEmit` gate; JS stays JS), Vitest 3, Prisma 7 + PostgreSQL, GitHub Actions.

## Global Constraints

- Work on feature branch `feat/phase1-foundation` off `main`; never commit to `main` directly.
- The public landing page (`/`, `src/components/landing/*`) must not change.
- Contract §0.2 applies: no TODO/FIXME/stubs in launch-critical paths, no swallowed errors, no client-trusted prices, no `prisma db push` as the production migration story going forward.
- `npm run lint` must pass with `--max-warnings=0`; `npm run build` must stay green after every task.
- Dev server port is 3003 (`next dev --port 3003`); production runs under PM2 on port 3010 — do not change either.
- Prisma connects through `@prisma/adapter-pg`; production Postgres is on port 5433. Never run `prisma migrate dev`/`db push` against production.
- New standalone test/lib files may be TypeScript; edits to existing `.js` files stay JavaScript.
- Existing behavior is preserved unless a task explicitly changes it; deletions limited to files listed in Task 1.

## File Structure (created/modified)

```
eslint.config.mjs                    (new — flat config)
tsconfig.json                        (new)  jsconfig.json (deleted, superseded)
vitest.config.mjs                    (new)
tests/unit/*.test.mjs                (new suite; 1 migrated + 5 new files)
prisma/migrations/0_init/migration.sql + migration_lock.toml + prisma/migrations/README.md (new)
scripts/check-env.mjs                (new)
.github/workflows/ci.yml, .github/dependabot.yml, .github/PULL_REQUEST_TEMPLATE.md, .github/ISSUE_TEMPLATE/*  (new)
README.md, SECURITY.md               (new/rewritten)
src/app/api/canvas/route.js          (fix schema drift)
src/app/api/canvas/versions/route.js (fix ordering)
src/lib/security.js                  (anonymous rate-limit path)
src/app/api/admin/models/test/route.js (field names)
src/app/api/admin/providers/route.js (mask apiKey)
src/lib/model-catalog.js             (public vs internal serialization)
src/app/api/models/catalog/route.js  (public serialization)
package.json                         (scripts + devDependencies)
```

---

### Task 1: Branch + repo hygiene

**Files:**
- Delete: `tests/studio-universe-shell.test.mjs`, `tests/studio-reference-runtime.test.mjs`, `tests/studio-universe-rebuild.test.mjs` (all reference source files deleted in commit `6ee1eea`; they throw on load)
- Delete: `check-admin-tmp.mjs` (untracked temp probe at repo root)

**Interfaces:** none.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/phase1-foundation
```

- [ ] **Step 2: Verify the three test files are actually stale** (each `readFileSync`s paths under `src/components/studio/` — confirm those paths don't exist), then delete:

```bash
node --test tests/studio-universe-shell.test.mjs 2>&1 | head -5   # expect ENOENT/throw
git rm tests/studio-universe-shell.test.mjs tests/studio-reference-runtime.test.mjs tests/studio-universe-rebuild.test.mjs
rm check-admin-tmp.mjs
```

- [ ] **Step 3: Confirm the survivor still passes**

Run: `node --test tests/model-catalog-core.test.mjs`
Expected: PASS (it tests `src/lib/model-catalog-core.mjs`, which exists).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove stale tests and temp files"
```

---

### Task 2: Vitest infrastructure + migrate the surviving test

**Files:**
- Create: `vitest.config.mjs`
- Create: `tests/unit/model-catalog-core.test.mjs` (moved + converted from `tests/model-catalog-core.test.mjs`)
- Modify: `package.json` (devDependency `vitest`, scripts `test`, `test:watch`)

**Interfaces:**
- Produces: the `@` → `./src` alias inside Vitest, and the convention `tests/unit/**/*.test.{js,mjs,ts}` — every later task's tests rely on both.

- [ ] **Step 1: Install and configure**

```bash
npm install -D vitest
```

```js
// vitest.config.mjs
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{js,mjs,ts}"],
  },
  resolve: {
    alias: { "@": path.resolve(root, "src") },
  },
});
```

- [ ] **Step 2: Move the surviving test and swap `node:test` for Vitest** — keep the `node:assert` assertions as-is (they throw on failure, which Vitest reports):

```bash
git mv tests/model-catalog-core.test.mjs tests/unit/model-catalog-core.test.mjs
```

In the moved file replace the import line `import { test } from "node:test";` (and `describe` if imported) with:

```js
import { test, describe } from "vitest";
```

- [ ] **Step 3: Add scripts** to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Run**

Run: `npm test`
Expected: PASS, all pre-existing model-catalog-core assertions green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: add vitest infrastructure, migrate model-catalog-core suite"
```

---

### Task 3: Unit tests for credit math (`pricing-engine`)

**Files:**
- Create: `tests/unit/pricing-engine.test.mjs`
- Test target: `src/lib/pricing-engine.js` (no changes expected — this pins current behavior before Phase 2 touches money)

**Interfaces:**
- Consumes: `calculateCredits(providerCost, markup?)` from `@/lib/pricing-engine` (imports `@/lib/prisma` transitively — must be mocked).

- [ ] **Step 1: Write the tests**

```js
// tests/unit/pricing-engine.test.mjs
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { providerConfig: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

import { calculateCredits } from "@/lib/pricing-engine";

describe("calculateCredits", () => {
  it("applies 2.5x default markup at 1 credit = €0.01", () => {
    // €0.10 provider cost * 2.5 / 0.01 = 25 credits
    expect(calculateCredits(0.1)).toBe(25);
  });

  it("rounds up, never down", () => {
    // 0.001 * 2.5 / 0.01 = 0.25 → 1
    expect(calculateCredits(0.001)).toBe(1);
    // 0.0333 * 2.5 / 0.01 = 8.325 → 9
    expect(calculateCredits(0.0333)).toBe(9);
  });

  it("charges a minimum of 1 credit", () => {
    expect(calculateCredits(0)).toBe(1);
    expect(calculateCredits(-5)).toBe(1);
    expect(calculateCredits(null)).toBe(1);
    expect(calculateCredits(undefined)).toBe(1);
  });

  it("honors a per-provider markup override", () => {
    // €0.10 * 4.0 / 0.01 = 40
    expect(calculateCredits(0.1, 4.0)).toBe(40);
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/unit/pricing-engine.test.mjs`
Expected: PASS (these pin existing behavior; a failure means the mock setup is wrong, not the code).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/pricing-engine.test.mjs && git commit -m "test: pin credit calculation math before phase-2 wallet work"
```

---

### Task 4: Fix canvas persistence (schema drift — every canvas write 500s today)

**Files:**
- Modify: `src/app/api/canvas/route.js` (writes `content`/`version`; schema `CanvasDocument`/`CanvasVersion` have `data` and no `version` column — see `prisma/schema.prisma:403-429`)
- Modify: `src/app/api/canvas/versions/route.js:13` (orders by nonexistent `version`)
- Create: `tests/unit/api-canvas.test.mjs`

**Interfaces:**
- Consumes: `CanvasDocument.data Json`, `CanvasVersion.data Json` (+ `createdAt`) per `prisma/schema.prisma`.
- Produces: route accepts both `body.data` (correct) and `body.content` (whatever older clients send) and always persists to the `data` column. Version ordering is `createdAt desc`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/api-canvas.test.mjs
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    canvasDocument: {
      create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), delete: vi.fn(),
    },
    canvasVersion: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { POST, PATCH } from "@/app/api/canvas/route.js";
import { GET as getVersions } from "@/app/api/canvas/versions/route.js";

const jsonReq = (method, body, url = "http://test/api/canvas") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("POST /api/canvas", () => {
  it("persists to the `data` column, never `content`, and creates an initial version", async () => {
    prisma.canvasDocument.create.mockResolvedValue({ id: "doc1", name: "X" });
    prisma.canvasVersion.create.mockResolvedValue({ id: "v1" });

    const res = await POST(jsonReq("POST", { name: "X", data: { objects: [1] } }));

    expect(res.status).toBe(201);
    const docArgs = prisma.canvasDocument.create.mock.calls[0][0];
    expect(docArgs.data).toHaveProperty("data", { objects: [1] });
    expect(docArgs.data).not.toHaveProperty("content");
    const verArgs = prisma.canvasVersion.create.mock.calls[0][0];
    expect(verArgs.data).toHaveProperty("data", { objects: [1] });
    expect(verArgs.data).not.toHaveProperty("version");
  });

  it("accepts legacy `content` payloads into the `data` column", async () => {
    prisma.canvasDocument.create.mockResolvedValue({ id: "doc1" });
    prisma.canvasVersion.create.mockResolvedValue({ id: "v1" });

    await POST(jsonReq("POST", { name: "X", content: { objects: [2] } }));

    expect(prisma.canvasDocument.create.mock.calls[0][0].data)
      .toHaveProperty("data", { objects: [2] });
  });
});

describe("PATCH /api/canvas", () => {
  it("updates `data` and snapshots a version without a version counter", async () => {
    prisma.canvasDocument.findFirst.mockResolvedValue({ id: "doc1", userId: "u1" });
    prisma.canvasDocument.update.mockResolvedValue({ id: "doc1" });
    prisma.canvasVersion.create.mockResolvedValue({ id: "v2" });

    const res = await PATCH(jsonReq("PATCH", { id: "doc1", name: "Y", data: { objects: [3] } }));

    expect(res.status).toBe(200);
    expect(prisma.canvasDocument.update.mock.calls[0][0].data)
      .toHaveProperty("data", { objects: [3] });
    expect(prisma.canvasVersion.findFirst).not.toHaveBeenCalled(); // no version-counter read
  });
});

describe("GET /api/canvas/versions", () => {
  it("orders by createdAt desc (no `version` column exists)", async () => {
    prisma.canvasDocument.findFirst.mockResolvedValue({ id: "doc1", userId: "u1" });
    prisma.canvasVersion.findMany.mockResolvedValue([]);

    const res = await getVersions(
      new Request("http://test/api/canvas/versions?documentId=doc1"),
    );

    expect(res.status).toBe(200);
    expect(prisma.canvasVersion.findMany.mock.calls[0][0].orderBy)
      .toEqual({ createdAt: "desc" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/api-canvas.test.mjs`
Expected: FAIL — current code writes `content`/`version` fields.

- [ ] **Step 3: Fix the routes.** In `src/app/api/canvas/route.js`, replace POST and PATCH bodies:

```js
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const data = body.data ?? body.content ?? {};
    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.canvasDocument.create({
        data: { userId: user.id, name: body.name || "Untitled", data },
      });
      await tx.canvasVersion.create({ data: { documentId: created.id, data } });
      return created;
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PATCH(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const doc = await prisma.canvasDocument.findFirst({ where: { id: body.id, userId: user.id } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = body.data ?? body.content ?? doc.data;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.canvasDocument.update({
        where: { id: body.id },
        data: { name: body.name ?? doc.name, data },
      });
      await tx.canvasVersion.create({ data: { documentId: doc.id, data } });
      return u;
    });
    return NextResponse.json(updated);
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
```

In `src/app/api/canvas/versions/route.js:13` change `orderBy: { version: "desc" }` → `orderBy: { createdAt: "desc" }`.

- [ ] **Step 4: Check what the client actually sends** so the compat branch is real:

```bash
grep -rn "api/canvas" src/components src/app/studio --include="*.js" -l
```

Read the save call in the matches (expect `CanvasStudio.js` / `CanvasWorkspace.js`); if it sends `content`, leave it (server now accepts both); note the field for the Phase 5 cleanup.

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run tests/unit/api-canvas.test.mjs && npm run build`
Expected: PASS + build green.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix: canvas persistence wrote nonexistent content/version columns"
```

---

### Task 5: Anonymous rate limiting no longer 500s (contact form)

**Files:**
- Modify: `src/lib/security.js` (`checkRateLimit` upserts `RateLimit` keyed by `userId`, but `RateLimit.userId` has an FK to `User` — `prisma/schema.prisma:298-308`; `api/contact` passes `ip:<addr>` → FK violation → 500 for signed-out visitors)
- Create: `tests/unit/security-rate-limit.test.mjs`

**Interfaces:**
- Produces: `checkRateLimit(key, endpoint)` transparently uses an in-memory bucket when `key` starts with `"ip:"` and the DB table otherwise. Same return shape `{ allowed, remaining?, retryAfter? }`. (In-memory is per-process — acceptable for the contact form today; Phase 3 makes anonymous limiting durable/cross-instance.)

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/security-rate-limit.test.mjs
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    rateLimit: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security";

beforeEach(() => vi.clearAllMocks());

describe("checkRateLimit — anonymous (ip:) keys", () => {
  it("never touches the RateLimit table (which has a User FK)", async () => {
    const res = await checkRateLimit("ip:203.0.113.9", "/api/contact");
    expect(res.allowed).toBe(true);
    expect(prisma.rateLimit.findUnique).not.toHaveBeenCalled();
    expect(prisma.rateLimit.upsert).not.toHaveBeenCalled();
  });

  it("blocks after the configured max within the window", async () => {
    const key = "ip:198.51.100.7"; // unique per test — buckets are module state
    // /api/contact allows 5 per 10 minutes
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(key, "/api/contact");
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, "/api/contact");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("still uses the DB path for real user ids", async () => {
    prisma.rateLimit.findUnique.mockResolvedValue(null);
    prisma.rateLimit.upsert.mockResolvedValue({});
    const r = await checkRateLimit("user_abc", "/api/contact");
    expect(r.allowed).toBe(true);
    expect(prisma.rateLimit.upsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/security-rate-limit.test.mjs`
Expected: FAIL — first test hits `prisma.rateLimit.findUnique`.

- [ ] **Step 3: Implement.** In `src/lib/security.js`, add above `checkRateLimit`:

```js
// Anonymous callers can't be rows in RateLimit (userId is a User FK), so
// signed-out traffic is limited in-process. Good enough for low-volume public
// forms on a single PM2 instance; Phase 3 replaces this with a durable store.
const anonBuckets = new Map();

function checkAnonRateLimit(key, endpoint, limit) {
  const now = Date.now();
  if (anonBuckets.size > 10_000) {
    for (const [k, b] of anonBuckets) {
      if (now - b.windowStart >= limit.window) anonBuckets.delete(k);
    }
  }
  const bucketKey = `${key}:${endpoint}`;
  const bucket = anonBuckets.get(bucketKey);
  if (!bucket || now - bucket.windowStart >= limit.window) {
    anonBuckets.set(bucketKey, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit.max - 1 };
  }
  if (bucket.count >= limit.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.windowStart + limit.window - now) / 1000),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit.max - bucket.count };
}
```

Then in `checkRateLimit`, immediately after `if (!limit) return { allowed: true };` add:

```js
  if (typeof userId === "string" && userId.startsWith("ip:")) {
    return checkAnonRateLimit(userId, endpoint, limit);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/security-rate-limit.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: anonymous rate-limit keys no longer violate the RateLimit user FK"
```

---

### Task 6: Admin model connectivity test reads real columns

**Files:**
- Modify: `src/app/api/admin/models/test/route.js` — reads `model.credits` (line ~47) and `model.provider` (lines ~56, ~66); the `ModelPricing` columns are `creditsCost` and `providerName`, so the check always renders "— credits" and "unknown is not in the provider registry"
- Create: `tests/unit/api-admin-models-test.test.mjs`

**Interfaces:**
- Consumes: `ModelPricing` row shape (`creditsCost Int`, `providerName String`, `endpoint`, `isActive`) and `PROVIDERS` from `@/lib/providers` (keys `kie`, `alibaba`).

- [ ] **Step 1: Read the full route first** (`src/app/api/admin/models/test/route.js`) to get the exported method (GET or POST) and how `modelId` arrives (query or body). Adjust the test's request accordingly — the assertions below are the contract.

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/api-admin-models-test.test.mjs
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));

import prisma from "@/lib/prisma";
// import the route's exported handler(s) once Step 1 confirms the method:
// import { POST } from "@/app/api/admin/models/test/route.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

it("reports creditsCost and resolves providerName against the registry", async () => {
  prisma.modelPricing.findUnique.mockResolvedValue({
    modelId: "test-model",
    creditsCost: 42,
    providerName: "KIE",
    endpoint: "/api/v1/jobs/createTask",
    isActive: true,
  });

  // const res = await POST(<request for modelId "test-model">);  // per Step 1
  // const json = await res.json();
  // const pricing = json.checks.find((c) => c.name === "Pricing row");
  // expect(pricing.detail).toContain("42");
  // const provider = json.checks.find((c) => c.name === "Provider");
  // expect(provider.ok).toBe(true);   // "KIE" must resolve against PROVIDERS.kie
});
```

(Fill in the commented lines from Step 1's findings — the request construction is the only unknown; the two assertions are fixed.)

- [ ] **Step 3: Run to verify it fails**

Expected: FAIL — `pricing.detail` contains "—" and `provider.ok` is false because the route reads `model.credits`/`model.provider`.

- [ ] **Step 4: Fix the route** — three edits in `src/app/api/admin/models/test/route.js`:
  - line ~47: `model.credits` → `model.creditsCost`
  - line ~56: `String(model.provider || "")` → `String(model.providerName || "")`
  - line ~66: both `model.provider` references → `model.providerName`

- [ ] **Step 5: Run tests to verify they pass, then commit**

```bash
npx vitest run tests/unit/api-admin-models-test.test.mjs
git add -A && git commit -m "fix: admin model test read nonexistent credits/provider columns"
```

---

### Task 7: Stop returning provider API keys to the browser

**Files:**
- Modify: `src/app/api/admin/providers/route.js` — `GET` returns full `ProviderConfig` rows including plaintext `apiKey`; `POST` unconditionally overwrites `apiKey`
- Create: `tests/unit/api-admin-providers.test.mjs`
- Check: the admin UI consumer (`grep -rn "admin/providers" src/components`) — adjust any display of `apiKey` to `apiKeyLast4`

**Interfaces:**
- Produces: `GET` returns `{ ...row, hasApiKey: boolean, apiKeyLast4: string|null }` with `apiKey` stripped. `POST` only writes `apiKey` when a real new key is supplied (non-empty, not a masked `••••`/`****` placeholder) — leaving the field blank keeps the stored key.
- Note: the column itself (plaintext at rest, and dead weight — runtime providers read env keys only) is dealt with in Phase 3; this task closes the browser exposure.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/api-admin-providers.test.mjs
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { providerConfig: { findMany: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { GET, POST } from "@/app/api/admin/providers/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/providers", () => {
  it("never returns apiKey — only hasApiKey and last4", async () => {
    prisma.providerConfig.findMany.mockResolvedValue([
      { id: "p1", name: "KIE", apiKey: "sk-secret-abcd1234", markup: 2.5, isActive: true },
      { id: "p2", name: "Alibaba", apiKey: null, markup: 2.5, isActive: true },
    ]);
    const res = await GET(new Request("http://test/api/admin/providers"));
    const rows = await res.json();
    for (const row of rows) expect(row).not.toHaveProperty("apiKey");
    expect(rows[0]).toMatchObject({ hasApiKey: true, apiKeyLast4: "1234" });
    expect(rows[1]).toMatchObject({ hasApiKey: false, apiKeyLast4: null });
  });
});

describe("POST /api/admin/providers", () => {
  it("does not overwrite the stored key when apiKey is blank or masked", async () => {
    prisma.providerConfig.upsert.mockResolvedValue({});
    await POST(jsonReq({ name: "KIE", type: "media", apiKey: "", markup: 3 }));
    await POST(jsonReq({ name: "KIE", type: "media", apiKey: "••••1234", markup: 3 }));
    for (const call of prisma.providerConfig.upsert.mock.calls) {
      expect(call[0].update).not.toHaveProperty("apiKey");
    }
  });

  it("writes a genuinely new key", async () => {
    prisma.providerConfig.upsert.mockResolvedValue({});
    await POST(jsonReq({ name: "KIE", type: "media", apiKey: "sk-new-key-9", markup: 3 }));
    expect(prisma.providerConfig.upsert.mock.calls[0][0].update)
      .toHaveProperty("apiKey", "sk-new-key-9");
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then **Step 3: Implement**:

```js
export async function GET(req) {
  try {
    await requireAdmin(req);
    const providers = await prisma.providerConfig.findMany();
    return NextResponse.json(
      providers.map(({ apiKey, ...rest }) => ({
        ...rest,
        hasApiKey: Boolean(apiKey),
        apiKeyLast4: apiKey ? apiKey.slice(-4) : null,
      })),
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const { name, type, apiKey, baseUrl, markup, isActive } = await req.json();
    const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
    // Masked placeholders (••••1234 / ****1234) round-trip from the GET shape.
    const keyProvided = trimmed.length > 0 && !/^[•*]/.test(trimmed);
    await prisma.providerConfig.upsert({
      where: { name },
      create: {
        name, type, baseUrl,
        apiKey: keyProvided ? trimmed : null,
        markup: markup || 2.5,
        isActive: isActive ?? true,
      },
      update: {
        type, baseUrl, markup, isActive,
        ...(keyProvided ? { apiKey: trimmed } : {}),
      },
    });
    await logAudit("admin_set_provider", "provider", name, { markup, isActive }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Fix the admin UI consumer.** `grep -rn "providers" src/components/admin` — wherever the provider form binds `provider.apiKey`, bind the placeholder to `apiKeyLast4` (display `hasApiKey ? \`••••${apiKeyLast4}\` : "not set"`) and submit `apiKey` only when the admin typed a new value.

- [ ] **Step 5: Run the suite + build, then commit**

```bash
npm test && npm run build
git add -A && git commit -m "fix: mask provider API keys in admin API; preserve key on blank save"
```

---

### Task 8: Public model catalog stops disclosing provider costs

**Files:**
- Modify: `src/lib/model-catalog.js` (`serializeCatalogModel` at :83 returns `providerCost` and raw `pricingRules`; `GET /api/models/catalog` is public)
- Modify: `src/app/api/models/catalog/route.js` and any admin caller found by grep
- Create: `tests/unit/model-catalog-serialize.test.mjs`

**Interfaces:**
- Produces: `serializeCatalogModel(model, { includeCosts = false } = {})` — omits `providerCost` and `pricing` unless `includeCosts: true`. `getCatalogModels(opts)` and `getCatalogModel(modelId, opts)` forward `includeCosts`. Retail `credits` stays public.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/model-catalog-serialize.test.mjs
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findMany: vi.fn(), findUnique: vi.fn() }, providerConfig: { findUnique: vi.fn() } },
}));

import { serializeCatalogModel } from "@/lib/model-catalog";

const row = {
  modelId: "m1", displayName: "M1", providerName: "KIE", modelType: "image",
  creditsCost: 10, providerCost: 0.04, pricingRules: { perImage: 0.04 },
};

describe("serializeCatalogModel", () => {
  it("hides provider cost basis by default (public shape)", () => {
    const pub = serializeCatalogModel(row);
    expect(pub).not.toHaveProperty("providerCost");
    expect(pub.pricing).toBeUndefined();
    expect(pub.credits).toBe(10); // retail price stays public
  });

  it("includes cost basis for internal/admin callers", () => {
    const internal = serializeCatalogModel(row, { includeCosts: true });
    expect(internal.providerCost).toBe(0.04);
    expect(internal.pricing).toEqual({ perImage: 0.04 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then **Step 3: Implement** in `src/lib/model-catalog.js`:

```js
export function serializeCatalogModel(model, { includeCosts = false } = {}) {
  const base = {
    id: model.modelId,
    modelId: model.modelId,
    providerModelId: model.providerModelId || model.modelId,
    endpoint: model.endpoint || model.modelId,
    displayName: model.displayName || model.modelId,
    description: model.description,
    provider: model.providerName,
    modelType: model.modelType,
    capability: model.capability || model.modelType,
    inputModalities: model.inputModalities || [],
    outputModalities: model.outputModalities || [],
    schema: model.inputSchema || null,
    constraints: model.constraints || {},
    billingUnit: model.billingUnit,
    currency: model.currency,
    regions: model.regions || [],
    credits: model.creditsCost,
    background: model.background,
    backgroundOverlay: model.backgroundOverlay,
    textColor: model.textColor,
    sourceUrl: model.sourceUrl,
    catalogVersion: model.catalogVersion,
    isDeprecated: model.isDeprecated,
  };
  if (includeCosts) {
    base.providerCost = model.providerCost;
    base.pricing = model.pricingRules || null;
  }
  return base;
}
```

Thread the option through `getCatalogModels({ ..., includeCosts })` and `getCatalogModel(modelId, { includeCosts })`.

- [ ] **Step 4: Audit every caller**

```bash
grep -rn "serializeCatalogModel\|getCatalogModels\|getCatalogModel(" src/ --include="*.js"
grep -rn "providerCost\|\.pricing\b" src/components src/app/studio --include="*.js"
```

- Public `GET /api/models/catalog` → default (hidden).
- Admin routes (`admin/sync/catalog`, `admin/models` if it consumes these) → `{ includeCosts: true }`.
- If any studio component reads `.pricing` or `.providerCost` from the catalog response, it must switch to the server quote endpoints (`/api/estimate`, `/api/models/quote`) — record what you find; if the UI breaks, that switch happens in this task, not later.

- [ ] **Step 5: Run full suite + build, then commit**

```bash
npm test && npm run build
git add -A && git commit -m "fix: stop exposing provider cost basis in the public model catalog"
```

---

### Task 9: ESLint 9 flat config, zero warnings

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json` (`lint` script; devDeps `eslint`, `eslint-config-next`, `@eslint/eslintrc`)

**Interfaces:**
- Produces: `npm run lint` = `eslint . --max-warnings=0`, used verbatim by CI (Task 12).

- [ ] **Step 1: Install**

```bash
npm install -D eslint eslint-config-next @eslint/eslintrc
```

- [ ] **Step 2: Create `eslint.config.mjs`**

```js
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "docs/**",
      "prisma/migrations/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Dependency-array rewrites are behavior changes; deferred to the Phase 5
      // UX pass where each component is touched deliberately.
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
```

- [ ] **Step 3: Measure, autofix, fix the rest**

```bash
npx eslint . 2>&1 | tail -5        # error/warning count
npx eslint . --fix
npx eslint . --max-warnings=0
```

Fix remaining findings by hand. Rules may be disabled per-line only with a same-line justification comment; rules may be disabled globally only with a comment in the config explaining why (as with `exhaustive-deps` above). Zero errors, zero warnings is the exit condition.

- [ ] **Step 4: Update the script** in `package.json`:

```json
"lint": "eslint . --max-warnings=0"
```

- [ ] **Step 5: Verify + commit**

```bash
npm run lint && npm run build
git add -A && git commit -m "chore: replace removed next lint with eslint 9 flat config, zero warnings"
```

---

### Task 10: `tsconfig.json` + typecheck gate

**Files:**
- Create: `tsconfig.json`
- Delete: `jsconfig.json` (superseded — tsconfig carries the `@/*` alias)
- Modify: `package.json` (`typecheck` script)

**Interfaces:**
- Produces: `npm run typecheck` = `tsc --noEmit`; the `@/*` → `./src/*` alias for any future `.ts` file. `strict` applies to TS files only (`checkJs: false`).

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

If `tsc` raises a `baseUrl`/deprecation error, add `"ignoreDeprecations": "6.0"` (carried from the old jsconfig); if it raises errors inside `.js` files, they are syntax-level realities — fix them, do not exclude the files.

- [ ] **Step 2: Delete `jsconfig.json`**, add the script:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Run all three gates** — `next build` will now treat the project as TS-aware, so build must stay green:

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass. If `next build` rewrites `tsconfig.json` (it normalizes missing options), accept its edits and re-run.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: add tsconfig typecheck gate, retire jsconfig"
```

---

### Task 11: Prisma migrations baseline

**Files:**
- Create: `prisma/migrations/0_init/migration.sql`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/README.md`
- Modify: `package.json` (db scripts)

**Interfaces:**
- Produces: a migrations history whose `0_init` reproduces the current schema exactly; CI (Task 12) applies it to a clean Postgres. Production adopts it via `prisma migrate resolve --applied 0_init` (documented, run once at next deploy).

- [ ] **Step 1: Generate the baseline offline** (no DB connection needed):

```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml
```

Inspect the SQL: it must contain `CREATE SCHEMA` statements for both `public` and `auth` (the schema uses `@@schema`), and one `CREATE TABLE` per model (41+).

- [ ] **Step 2: Write `prisma/migrations/README.md`**

```markdown
# Migrations

The schema was historically applied with `prisma db push`; `0_init` is the
baseline snapshot of that state (generated 2026-08-01 via `prisma migrate diff`).

## One-time production adoption (next deploy)
The production database already has this schema, so mark the baseline as
applied instead of running it:

    npx prisma migrate resolve --applied 0_init

## Every schema change after the baseline
1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate:dev -- --name <change>` against a development database.
3. Commit the generated migration folder together with the schema change.
4. Deploys run `npm run db:migrate:deploy` (`prisma migrate deploy`) before
   `pm2 restart`. Never `db push`, never `--force-reset`, never edit an
   applied migration.

Destructive changes use expand-and-contract: add the new shape, backfill,
switch readers, then drop the old shape in a later migration.
```

- [ ] **Step 3: Add scripts** to `package.json`:

```json
"db:generate": "prisma generate",
"db:migrate:dev": "prisma migrate dev",
"db:migrate:deploy": "prisma migrate deploy",
"check:dead-code": "node scripts/dead-code.mjs",
"check:env": "node scripts/check-env.mjs"
```

(`check:env` lands in Task 12; adding the script here keeps package.json edits in one commit per task — add `check:env` only if Task 12 is already merged, otherwise defer that line to Task 12.)

- [ ] **Step 4: Sanity-check that Prisma accepts the history** (offline):

```bash
npx prisma validate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "" 2>&1 || true
```

If `migrate diff --from-migrations` requires a live shadow DB on this machine, skip it — CI's clean-Postgres `migrate deploy` (Task 12) is the authoritative validation.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: prisma migrations baseline replacing db-push workflow"
```

---

### Task 12: `check-env` script + `.env.example` accuracy + CI pipeline

**Files:**
- Create: `scripts/check-env.mjs`
- Modify: `.env.example` (names + one-line explanations for every var referenced in code; never values)
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`

**Interfaces:**
- Consumes: scripts `lint`, `typecheck`, `test`, `build`, `db:migrate:deploy` from earlier tasks.
- Produces: a required-status CI (`checks` + `migrations` jobs) for every PR.

- [ ] **Step 1: Inventory real env usage**

```bash
grep -rhoE "process\.env\.[A-Z0-9_]+" src middleware.js scripts prisma.config.ts | sort -u
```

Update `.env.example` so every variable in that output appears with a comment. Remove vars nothing references (candidate: `WAVESPEED_KEY` — verify zero hits first).

- [ ] **Step 2: Write `scripts/check-env.mjs`**

```js
#!/usr/bin/env node
// Verifies required env vars are set (values never printed) and that
// .env.example documents every variable the code references.
import { readFileSync } from "node:fs";
import "dotenv/config";

const REQUIRED = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "KIE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
];

const missing = REQUIRED.filter((name) => !process.env[name]);
const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const undocumented = REQUIRED.filter((name) => !example.includes(name));

if (undocumented.length) {
  console.error(`Missing from .env.example: ${undocumented.join(", ")}`);
}
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
}
if (missing.length || undocumented.length) process.exit(1);
console.log(`check-env: all ${REQUIRED.length} required vars present and documented.`);
```

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:
          DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
          NEXTAUTH_SECRET: ci-only-secret
          NEXTAUTH_URL: http://localhost:3000

  migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: ci, POSTGRES_PASSWORD: ci, POSTGRES_DB: ci }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://ci:ci@localhost:5432/ci

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm audit --omit=dev --audit-level=high
```

If `npm run build` needs more env than listed, add CI-only dummy values — never real secrets. If the audit job fails on a finding with no upstream fix, document the acceptance as a comment in the workflow next to a narrowed `--audit-level`, and record it in the risk register.

- [ ] **Step 4: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

- [ ] **Step 5: Validate locally what CI will run**

```bash
npm run lint && npm run typecheck && npm test && npm run build && node scripts/check-env.mjs
```

Expected: all green (check-env passes because local `.env` is populated).

- [ ] **Step 6: Commit, push, verify the workflow runs**

```bash
git add -A && git commit -m "ci: lint/typecheck/test/build/migrations/audit pipeline + env contract"
git push -u origin feat/phase1-foundation
gh run watch || gh run list --branch feat/phase1-foundation
```

Repair any CI-only failures (repeat until green — that is the task's exit condition).

---

### Task 13: README, SECURITY.md, PR/issue templates

**Files:**
- Rewrite: `README.md` (real setup: prereqs, env, scripts table, architecture pointer to `AGENTS.md`/`STUDIO_FUNCTIONALITY.md`, deploy summary, test instructions)
- Create: `SECURITY.md` (report vulnerabilities privately to wael@helmies.fi; no public issues for security reports; supported version = production main; acknowledgment target 48h)
- Create: `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What & why

## Test evidence
- [ ] `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` all pass locally
- Commands run + relevant output:

## Risk level
- [ ] Low (isolated, reversible)  [ ] Medium (touches shared paths)  [ ] High (money/auth/migrations)

## Rollback
How to revert if this breaks production:
```

- Create: `.github/ISSUE_TEMPLATE/bug.md`, `feature.md`, `security.md` (points to SECURITY.md, no details in public), `provider-outage.md` (provider name, model IDs, error codes, start time, user impact)

**Interfaces:** none (docs only).

- [ ] **Step 1: Write all files** with real content per above (no placeholders, no lorem).
- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: README, security policy, PR and issue templates"
```

---

### Task 14: Phase gate check + PR

**Files:** none new.

- [ ] **Step 1: Full local gate**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green, zero warnings.

- [ ] **Step 2: Verify no landing-page or behavior drift**

```bash
git diff main --stat -- src/components/landing src/app/page.js
```

Expected: empty.

- [ ] **Step 3: Push and open the PR** using the new template, listing: files changed, tests added (5 new unit suites), commands run, migration name (`0_init`, baseline — production adoption step documented in `prisma/migrations/README.md`), rollback = revert merge commit (no data changes).

```bash
git push && gh pr create --title "Phase 1: foundation, test infra, migrations baseline, runtime fixes" --fill
```

- [ ] **Step 4: CI green on the PR** is the phase exit condition. Do not merge with any failing job.

---

## Self-Review (done at authoring time)

- **Spec coverage (contract §1 + quick wins):** §1.1 baseline+scripts → Tasks 2, 9, 10, 11, 12 (integration/e2e/a11y/security scripts intentionally deferred to their phases — roadmap "standing deviations" #1). §1.2 hygiene → Tasks 1, 13 (+ runbooks in Phase 7, Dependabot in Task 12, CODEOWNERS deferred to Phase 3 with the route manifest). §1.3 dependency review → Dependabot + audit job in Task 12; NextAuth-beta test coverage lands with Phase 2/3 integration tests. §2.1 migrations → Task 11. R1–R3, S1–S2 defects → Tasks 4–8.
- **Placeholder scan:** Task 6 contains commented-out assertion lines pending a file read (Step 1 resolves the route's HTTP method before the test is written) — the assertions themselves are fully specified. No TBD/TODO elsewhere.
- **Type consistency:** `checkRateLimit(key, endpoint)` return shape `{allowed, remaining?, retryAfter?}` preserved (Task 5); `serializeCatalogModel(model, {includeCosts})` signature used consistently in Task 8 test and implementation; scripts named identically across Tasks 2, 9–12 and CI.
