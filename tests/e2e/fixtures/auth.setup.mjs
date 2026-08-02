// Helmies Studio — E2E auth setup project (Phase 5 Task 1)
//
// Runs once, before the "chromium" project (playwright.config.mjs declares
// it as a dependency): seeds the database via seedE2E(), logs each seeded
// user in through the REAL /login form (real bcrypt + NextAuth credentials
// flow, no shortcuts), and saves the resulting cookies as storageState files
// that spec files opt into with `test.use({ storageState: ... })`.
import { test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { seedE2E } from "./seed.mjs";
import { USER_AUTH_FILE, ADMIN_AUTH_FILE } from "./storage-state.mjs";

const AUTH_DIR = path.dirname(USER_AUTH_FILE);

// One attempt at the real sign-in form (src/app/login/page.js). Returns
// true once the app's post-login redirect actually lands on /studio, false
// if the form instead showed a sign-in error (it does NOT throw for that —
// see loginThroughRealForm's retry below for why).
async function attemptLogin(page, email, password) {
  await page.goto("/login");
  // exact: true — a substring match on "Password" also matches the
  // reveal-password toggle button's aria-label ("Show password").
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The login page's submit handler does `router.push(callbackUrl)` on
  // success — callbackUrl defaults to "/studio" with no ?callbackUrl param
  // on a plain /login visit. Race it against the form's own error banner
  // instead of only waiting for the URL: on a very small fraction of runs
  // (observed empirically — see the retry comment below), the FIRST
  // credentials POST against a just-started `next start` gets NextAuth's
  // "MissingCSRF" error (logged server-side; the client only ever sees the
  // generic "That email and password do not match an account." banner).
  // Waiting on the URL alone would just eat the full test timeout here
  // instead of surfacing a fast, actionable signal.
  const result = await Promise.race([
    page.waitForURL("**/studio").then(() => "ok"),
    page.locator(".hs-notice--fault").waitFor({ state: "visible" }).then(() => "error"),
  ]);
  return result === "ok";
}

// Types the seeded credentials into the real sign-in form and waits for the
// app's own post-login redirect, then persists that browser context's
// cookies to `storageStatePath`. Uses a fresh context per login (not the
// shared setup `page`) so the two logins never share cookies.
//
// Retries the WHOLE form submission once (fresh page, fresh CSRF token) on
// the specific NextAuth "MissingCSRF" cold-start race described above —
// this is a bounded retry of a known, narrow, first-requests-after-restart
// timing gap in NextAuth's own credentials flow, not a blanket retry that
// would also hide a genuine bad-password/seeding bug (a real credentials
// mismatch fails the SAME way on the second attempt too, so it still fails
// the test — just after confirming it isn't the cold-start race).
async function loginThroughRealForm(browser, { email, password }, storageStatePath) {
  const context = await browser.newContext();
  const page = await context.newPage();

  let ok = await attemptLogin(page, email, password);
  if (!ok) {
    ok = await attemptLogin(page, email, password);
  }
  if (!ok) {
    throw new Error(`Login failed for ${email} after a retry — see the form's error banner in the trace.`);
  }

  await context.storageState({ path: storageStatePath });
  await context.close();
}

setup("seed E2E data and authenticate user + admin storage states", async ({ browser }) => {
  await mkdir(AUTH_DIR, { recursive: true });

  const { user, admin } = await seedE2E();

  // Warm up the just-started server with a throwaway request before the
  // logins that actually matter — cheap insurance against the same
  // first-request timing gap `attemptLogin`'s retry guards, so the retry
  // is a rare fallback rather than the common path.
  const warmupContext = await browser.newContext();
  await warmupContext.request.get("/api/auth/csrf");
  await warmupContext.close();

  await loginThroughRealForm(browser, user, USER_AUTH_FILE);
  await loginThroughRealForm(browser, admin, ADMIN_AUTH_FILE);
});
