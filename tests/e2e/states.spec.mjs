// Helmies Studio — shared empty/error/loading/offline states (Phase 5 Task 4)
//
// Written FIRST, against src/components/states/* before those components
// exist — every test here is expected to fail until Task 4's Step 2
// (implement, then re-run) wires them in.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

test("gallery shows the empty state with a working action for a user with nothing generated", async ({ page }) => {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "emptygal" });
  });
  await loginThroughForm(page, user);
  await stubProviders(page);

  await page.goto("/gallery");
  await expect(page.getByRole("heading", { name: "Nothing finished yet" })).toBeVisible();

  const action = page.getByRole("link", { name: "Make the first one" });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(/\/studio\/image/);
});

test("gallery shows an error state when the finished-work API fails, and retry re-requests", async ({ page }) => {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "galerr" });
  });
  await loginThroughForm(page, user);
  await stubProviders(page);

  let calls = 0;
  // Matches /api/generations?status=completed&... (GalleryClient's
  // "finished work" fetch) — NOT /api/generations/status?... (a different
  // endpoint, the "recent jobs" queue), which stays real throughout.
  await page.route("**/api/generations?*", (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Database unavailable" }) });
    }
    return route.continue();
  });

  await page.goto("/gallery");
  await expect(page.getByRole("heading", { name: /something went wrong/i })).toBeVisible();
  const retry = page.getByRole("button", { name: /try again/i });
  await expect(retry).toBeVisible();

  await retry.click();
  // The retried request succeeds (this user genuinely has nothing) — the
  // page recovers to the ordinary empty state, not stuck on the error.
  await expect(page.getByRole("heading", { name: "Nothing finished yet" })).toBeVisible();
  expect(calls, "retry must issue a new request, not replay the cached failure").toBeGreaterThanOrEqual(2);
});

test("an offline banner appears when the connection drops and disappears on reconnect", async ({ page, context }) => {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "offline" });
  });
  await loginThroughForm(page, user);
  await stubProviders(page);

  await page.goto("/gallery");
  const banner = page.getByRole("status", { name: /offline/i });
  await expect(banner).toBeHidden();

  await context.setOffline(true);
  await expect(banner).toBeVisible();

  await context.setOffline(false);
  await expect(banner).toBeHidden();
});
