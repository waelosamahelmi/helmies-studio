// Helmies Studio — E2E real-form login helper (Phase 5 Task 2)
//
// fixtures/auth.setup.mjs already logs Task 1's two seeded users in once and
// saves their cookies as storageState files — the right choice for tests
// that only ever READ as those users. Money-mutating journeys need their
// OWN dedicated user instead (see fixtures/db.mjs's createIsolatedUser), and
// that user doesn't exist until the test creates it, so there is no
// storageState file to load. This drives the SAME real /login form
// auth.setup.mjs uses (real bcrypt + NextAuth credentials flow, no
// shortcuts) against the test's own `page`.
import { expect } from "@playwright/test";

// One attempt at the form. See auth.setup.mjs's identical function for why
// this races the redirect against the form's own error banner instead of
// only waiting on the URL, and why a failure here is not necessarily a real
// credentials bug — the retry in loginThroughForm below covers NextAuth's
// documented cold-start MissingCSRF race.
async function attemptLogin(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  const result = await Promise.race([
    page.waitForURL("**/studio").then(() => "ok"),
    page.locator(".hs-notice--fault").waitFor({ state: "visible" }).then(() => "error"),
  ]);
  return result === "ok";
}

export async function loginThroughForm(page, { email, password }) {
  let ok = await attemptLogin(page, email, password);
  if (!ok) ok = await attemptLogin(page, email, password);
  expect(ok, `Login failed for ${email} after a retry — see the form's error banner in the trace.`).toBe(true);
}
