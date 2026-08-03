// EDITSv1 Phase E2 Task E2.3 — the uniform error panel.
//
// The server-side envelope is unit-tested route-by-route
// (tests/unit/api-error-envelope-routes.test.mjs). These journeys prove the
// CLIENT renders it: friendly title, explanation, per-field details, a
// working Retry, a working Edit settings, and the internal error id — using
// page.route to force the exact envelope shapes the real routes emit.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";
import {
  gotoImageStudioReady, selectE2EModel, fillBrief, submitButton,
} from "./fixtures/studio-actions.mjs";

async function readyStudio(page, label) {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label });
  });
  await loginThroughForm(page, user);
  await stubProviders(page);
  await gotoImageStudioReady(page);
  await selectE2EModel(page);
}

test("a 422 envelope renders title, field details, error id, and Edit settings returns to the composer", async ({ page }) => {
  await readyStudio(page, "errpanel");

  await page.route("**/api/generate/async", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "One of the settings is not supported by this model.",
        code: "invalid_params",
        title: "Unsupported settings",
        errorId: "abc12345",
        retryable: false,
        details: [{ field: "aspect_ratio", code: "enum", message: "must be one of 1:1, 16:9" }],
      }),
    })
  );

  await fillBrief(page, `E2E error panel ${Date.now()}`);
  await submitButton(page).click();

  const alert = page.locator('[role="alert"]').filter({ hasText: "Unsupported settings" });
  await expect(alert).toBeVisible({ timeout: 15000 });
  await expect(alert).toContainText("One of the settings is not supported");
  await expect(alert).toContainText("aspect_ratio");
  await expect(alert).toContainText("Error ID:");
  await expect(alert).toContainText("abc12345");
  // No upstream provider identity anywhere in the panel.
  await expect(alert).not.toContainText(/KIE|Alibaba|DashScope/i);

  // Edit settings clears the fault and returns to the composer (prompt kept).
  await alert.getByRole("button", { name: "Edit settings" }).click();
  await expect(alert).toHaveCount(0);
  await expect(submitButton(page)).toBeVisible();
});

test("Retry re-submits the same generation after a 500 envelope", async ({ page }) => {
  await readyStudio(page, "errretry");

  let calls = 0;
  await page.route("**/api/generate/async", (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Something went wrong on our side. Please try again.",
          code: "internal",
          title: "Something went wrong",
          errorId: "deadbeef",
          retryable: true,
        }),
      });
    }
    // Second attempt: let the real route handle it end-to-end.
    return route.continue();
  });

  await fillBrief(page, `E2E error retry ${Date.now()}`);
  await submitButton(page).click();

  const alert = page.locator('[role="alert"]').filter({ hasText: "deadbeef" });
  await expect(alert).toBeVisible({ timeout: 15000 });

  await alert.getByRole("button", { name: "Try again" }).click();
  await expect
    .poll(() => calls, { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  // The retry goes through the real pipeline and completes.
  await expect(page.getByRole("img", { name: "Generated result" })).toBeVisible({ timeout: 30000 });
});
