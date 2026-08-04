// Helmies Studio — Playwright E2E config (Phase 5 Task 1)
//
// Drives a production build (`next build && next start`) against the
// disposable local test Postgres container (helmies-test-pg), never the
// .env DATABASE_URL. See tests/e2e/fixtures/seed.mjs's header for the
// matching guard on the Playwright-test-runner side (a separate process
// from the webServer child spawned below).
import { defineConfig, devices } from "@playwright/test";

const PORT = 3399;
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DATABASE_URL = "postgresql://postgres:test@localhost:55432/test";

// Values below are deliberately dummy/placeholder — E2E must never reach a
// real provider or Stripe (see fixtures/intercept.mjs), so there is no
// reason for these to be anything but non-functional strings. They exist
// only so `next build`/`next start` — which read scripts/check-env.mjs's
// full REQUIRED list at various points in the app — don't fail on a
// genuinely missing var.
const webServerEnv = {
  ...process.env,
  DATABASE_URL: TEST_DATABASE_URL,
  NEXTAUTH_URL: BASE_URL,
  NEXTAUTH_SECRET: "e2e-test-secret-do-not-use-in-production-0000",
  GOOGLE_CLIENT_ID: "e2e-dummy-google-client-id",
  GOOGLE_CLIENT_SECRET: "e2e-dummy-google-client-secret",
  KIE_KEY: "e2e-dummy-kie-key",
  WEBHOOK_SECRET: "e2e-dummy-webhook-secret",
  // Explicitly UNSET (empty string, not omitted) — an omitted key here would
  // let Next's/dotenv's own .env auto-loading (both `next start` and
  // scripts/worker.mjs's `import "dotenv/config"` only fill in vars that
  // aren't already present in process.env) silently backfill the REAL
  // key from this machine's .env, and prompt expansion
  // (src/lib/prompt-expansion.js's expandPrompt, called synchronously from
  // src/app/api/generate/async/route.js for any prompt under 30 words —
  // i.e. nearly every E2E test prompt) would then make a genuine network
  // call to openrouter.ai. An explicit "" here is falsy, so
  // src/lib/providers.js's llmComplete throws its own "not configured"
  // error immediately (no network call at all) — expandPrompt's try/catch
  // already falls back to the raw prompt on exactly that, which is the
  // behavior E2E needs. Same reasoning for ALIBABA_KEY/ALIBABA_WORKSPACE_ID
  // below, in case anything ever resolves to that adapter.
  OPENROUTER_KEY: "",
  ALIBABA_KEY: "",
  ALIBABA_WORKSPACE_ID: "",
  STRIPE_SECRET_KEY: "e2e-dummy-stripe-secret-not-a-real-key",
  STRIPE_WEBHOOK_SECRET: "e2e-dummy-stripe-webhook-not-a-real-key",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "e2e-dummy-stripe-publishable-not-a-real-key",
  NODE_ENV: "production",
  // EDITSv1 E4.2: the Director executor (src/lib/director-executor.js) runs
  // INLINE in the app's own HTTP request — unlike /api/generate/async, its
  // provider calls never go through the worker process, so the worker-only
  // mock can't cover them and page.route() can't reach a server-side fetch.
  // Same double-locked short-circuit as the worker entry below (env var AND
  // a localhost DATABASE_URL — see src/lib/providers.js): every submitOnly
  // call in the app process answers with the local fixture image instead of
  // dialing a real provider. No other e2e journey exercises an inline
  // provider call (async generation is worker-side; sync /api/generate/*
  // tool routes have no e2e coverage).
  // EDITSv1 E3.4/E3.5: the AGENT run/step routes execute provider calls
  // INLINE in the app process (src/lib/agents.js -> generation.js ->
  // providers.js submitOnly), unlike /api/generate/async which only
  // enqueues for the worker below. The agent e2e journeys (approve a plan,
  // regenerate a step) need those inline calls to complete for real —
  // Generation rows written, wallet debited — without ever dialing a real
  // provider, so the SAME double-locked mock the worker uses (env var AND
  // a localhost DATABASE_URL, see providers.js's E2E_MOCK_PROVIDERS block)
  // is switched on for the app too. LLM calls are unaffected: llmComplete/
  // llmStream check OPENROUTER_KEY (explicitly "" above) before anything
  // else, and the durable-queue journeys never touched this branch — the
  // async route still only enqueues.
  E2E_MOCK_PROVIDERS: "1",
};

// Phase 5 Task 2: a real generation must actually reach "completed" or
// "failed" for the money journeys (generate end-to-end, duplicate submit,
// failure refunds) to assert anything real — and that state transition only
// ever happens inside the durable job runner (src/lib/job-runner.js), which
// only runs under scripts/worker.mjs, a process entirely separate from the
// `next start` app above. Browser-side page.route() stubs (fixtures/
// intercept.mjs) cannot reach it — see that file's header, and
// src/lib/providers.js's E2E_MOCK_PROVIDERS block, for the full story. This
// second webServer entry starts that worker against the SAME disposable
// test database, with the mock switched on so it never dials a real
// provider. `wait.stdout` is used instead of `url`/`port` because the
// worker never listens on anything — scripts/worker.mjs's own
// `{"event":"worker_started",...}` startup log line is the only readiness
// signal it has.
const workerServerEnv = {
  ...webServerEnv,
  E2E_MOCK_PROVIDERS: "1",
  WORKER_CONCURRENCY: "2",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Phase 5 Task 2: capped rather than left unbounded (CPU-core-count) —
  // `next start` here is ONE single Node process, and Task 2's journeys are
  // bcrypt-heavy (a fresh isolated user + real-form login per money test,
  // see fixtures/db.mjs and fixtures/login.mjs) in a way Task 1's three
  // lightweight smoke tests never were. Observed empirically on a 20-core
  // machine: the unbounded default oversubscribes that single process badly
  // enough that credentials sign-ins start timing out under the concurrent
  // load, which is a test-infra artifact of parallelism, not a product bug.
  // 4 is a conservative number, not a tuned one — comfortably below what
  // starved the app, with room to raise later if it proves unnecessary.
  workers: process.env.CI ? 1 : 3,
  reporter: [["html", { open: "never" }]],

  // Default per-assertion timeout, bumped from Playwright's 5s default.
  // Same load-contention story as `workers` above: under the full suite's
  // combined bcrypt + Postgres + worker-queue load, a handful of default-
  // interval assertions (e.g. auth.spec.mjs's post-sign-out redirect check)
  // were observed flaking on the stock 5000ms — not because the underlying
  // behavior is ever wrong (isolated and repeated runs of the same test are
  // consistently green), but because 4 concurrent heavy specs sharing one
  // `next start` process can occasionally push a single request past 5s.
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "setup",
      testDir: "./tests/e2e/fixtures",
      testMatch: /auth\.setup\.mjs$/,
    },
    // EDITSv1 E7.1: the desktop projects gain a testIgnore for the mobile
    // spec and nothing else. Without it, `testMatch: /.*\.spec\.mjs$/` would
    // also hand tests/e2e/mobile.spec.mjs to three DESKTOP viewports, where
    // its assertions (no horizontal page scroll at 393px, a coarse-pointer
    // 44px tap target, a panel that only becomes a sheet below 1024px) are
    // not just wrong but meaningless. The projects are otherwise untouched.
    {
      name: "chromium",
      testDir: "./tests/e2e",
      testMatch: /.*\.spec\.mjs$/,
      testIgnore: /mobile\.spec\.mjs$/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    // Phase 8 Task B2 — the browser matrix. Both reuse the SAME "setup"
    // project (one seed, one set of storageState files under
    // playwright/.auth/ — see auth.setup.mjs) rather than each re-seeding
    // their own copy: the seeded fixtures (Task 1) are read-only baseline
    // data every project shares, and storageState is just cookies, which
    // are valid for any browser engine hitting the same app origin.
    {
      name: "firefox",
      testDir: "./tests/e2e",
      testMatch: /.*\.spec\.mjs$/,
      testIgnore: /mobile\.spec\.mjs$/,
      use: { ...devices["Desktop Firefox"] },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      testDir: "./tests/e2e",
      testMatch: /.*\.spec\.mjs$/,
      testIgnore: /mobile\.spec\.mjs$/,
      use: { ...devices["Desktop Safari"] },
      dependencies: ["setup"],
    },
    // EDITSv1 E7.1 — the first phone-sized coverage this suite has ever had.
    // Pixel 5 is 393x851 with `hasTouch` and `isMobile` set, which is what
    // makes `@media (pointer: coarse)` and `(hover: none)` actually apply:
    // a desktop project with setViewportSize() narrows the layout but still
    // reports a fine pointer, so every touch-target rule in system.css stays
    // switched off and the run proves nothing. Chromium is the only engine
    // Playwright emulates mobile devices on.
    {
      name: "mobile",
      testDir: "./tests/e2e",
      testMatch: /mobile\.spec\.mjs$/,
      use: { ...devices["Pixel 5"] },
      dependencies: ["setup"],
    },
  ],

  webServer: [
    {
      name: "app",
      command: "npm run build && npm run start -- -p 3399",
      url: BASE_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: webServerEnv,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "worker",
      command: "node scripts/worker.mjs",
      wait: { stdout: /worker_started/ },
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: workerServerEnv,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
