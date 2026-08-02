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
  STRIPE_SECRET_KEY: "sk_test_e2e_dummy_0000000000000000000000",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_dummy_0000000000000000000000",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_e2e_dummy_0000000000000000000000",
  NODE_ENV: "production",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],

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
    {
      name: "chromium",
      testDir: "./tests/e2e",
      testMatch: /.*\.spec\.mjs$/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run build && npm run start -- -p 3399",
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: webServerEnv,
    stdout: "pipe",
    stderr: "pipe",
  },
});
