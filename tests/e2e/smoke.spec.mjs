// Helmies Studio — E2E harness smoke test (Phase 5 Task 1)
//
// Three assertions that prove the harness itself works. Everything later in
// Phase 5 builds on this passing: a built production app, served against
// the disposable test Postgres, with a seeded+logged-in storage state and
// middleware's real auth gate both behaving as expected.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";

test.describe("smoke — anonymous", () => {
  test("(a) the landing page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Helmies Studio/);
  });

  test("(c) an unauthenticated visit to /studio redirects to /login", async ({ page }) => {
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});

test.describe("smoke — authenticated", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("(b) an authenticated visit to /studio renders the studio shell, not a login redirect", async ({ page }) => {
    // Exercises stubProviders() itself as part of "proving the harness" —
    // if the catch-all route were too aggressive it would break this
    // ordinary same-origin page load.
    await stubProviders(page);

    await page.goto("/studio");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/studio/);
    // `:visible` (a Playwright CSS extension) matters here, not just style:
    // React's streaming SSR briefly emits the resolved Suspense content
    // twice while the page settles — once in its real position, and once
    // inside a same-page `hidden` holder div a relocation script consumes
    // almost immediately (React 19's out-of-order streaming protocol, not
    // an app bug). A bare `.st-app` locator can catch both and trip
    // Playwright's strict-mode "resolved to N elements" check before
    // visibility is even considered; scoping to `:visible` is the correct
    // fix, not a workaround — a hidden node was never a "rendered shell" a
    // real visitor could see.
    await expect(page.locator(".st-app:visible")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Instruments" }).first()).toBeVisible();
  });
});
