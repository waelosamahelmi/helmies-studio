// Helmies Studio — E2E admin operations views (Phase 7 Task 4)
//
// Maintenance mode is GLOBAL, app-wide state — turning it on affects every
// other concurrently-running e2e spec (other spec files run in parallel
// workers per playwright.config.mjs). The maintenance test below keeps the
// ON window as short as possible (flip on, one direct request, flip back
// off in a `finally`) and re-verifies OFF at the end, so a failed assertion
// mid-test can never leave the flag stuck on for the rest of the suite.
import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE } from "./fixtures/storage-state.mjs";

test.describe.configure({ mode: "serial" });

test.describe("admin operations views — metrics + maintenance mode + provider kill switch", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test("an admin sees metrics, with the worker-liveness signal prominent", async ({ page }) => {
    await page.goto("/admin?section=metrics");
    await expect(page.getByRole("heading", { name: "Metrics", exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Worker liveness" })).toBeVisible();
    await expect(page.getByText(/oldest queued job age/i).first()).toBeVisible();

    await expect(page.getByRole("heading", { name: "Generations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reconciliation" })).toBeVisible();
  });

  test("provider kill switch requires typed confirmation before it would disable a provider", async ({ page }) => {
    await page.goto("/admin?section=ops");
    await expect(page.getByRole("heading", { name: "Operator controls", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Provider kill switch" })).toBeVisible();

    const kieToggle = page.getByRole("switch", { name: /^KIE — /i });
    await expect(kieToggle).toHaveAttribute("aria-checked", "true"); // active by default

    // Disabling is the destructive direction — clicking it must open the
    // typed confirmation, not apply immediately.
    await kieToggle.click();
    const dialog = page.getByRole("dialog", { name: "Disable KIE?" });
    await expect(dialog).toBeVisible();

    const confirmBtn = dialog.getByRole("button", { name: "Disable provider" });
    await expect(confirmBtn).toBeDisabled();

    await page.locator("#ops-confirm-type").fill("kie"); // wrong case — must not satisfy the match
    await expect(confirmBtn).toBeDisabled();

    await page.locator("#ops-confirm-type").fill("KIE");
    await expect(confirmBtn).toBeDisabled(); // still needs a reason

    await page.locator("#ops-confirm-reason").fill("e2e: verifying the confirmation gate only");
    await expect(confirmBtn).toBeEnabled();

    // Never actually confirm here — disabling "kie" for real would strand
    // every other e2e spec's generation flow (E2E_MOCK_PROVIDERS submits
    // through the default "kie" adapter). Cancel instead; Task 3's
    // integration tests already prove the real toggle end-to-end against
    // real Postgres.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(kieToggle).toHaveAttribute("aria-checked", "true");
  });

  test("toggling maintenance ON requires typed confirmation, then /studio 503s; toggling OFF restores it", async ({
    page,
    browser,
  }) => {
    await page.goto("/admin?section=ops");
    await expect(page.getByRole("heading", { name: "Maintenance mode" })).toBeVisible();

    const toggle = page.getByRole("switch", { name: /^Maintenance mode — /i });
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Turning ON is the destructive direction.
    await toggle.click();
    const dialog = page.getByRole("dialog", { name: "Turn maintenance mode ON?" });
    await expect(dialog).toBeVisible();

    const confirmBtn = dialog.getByRole("button", { name: "Turn maintenance ON" });
    await expect(confirmBtn).toBeDisabled();

    await page.locator("#ops-confirm-type").fill("maintenance"); // wrong case
    await expect(confirmBtn).toBeDisabled();

    await page.locator("#ops-confirm-type").fill("MAINTENANCE");
    await expect(confirmBtn).toBeDisabled(); // still needs a reason

    await page.locator("#ops-confirm-reason").fill("e2e: admin-ops.spec.mjs maintenance toggle test");
    await expect(confirmBtn).toBeEnabled();

    try {
      await confirmBtn.click();
      await expect(dialog).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 10000 });

      // A fresh, unauthenticated context — proves the block applies to a
      // normal visitor, not just to whether the admin session happens to
      // be signed in.
      const anonContext = await browser.newContext();
      const res = await anonContext.request.get("/studio");
      expect(res.status()).toBe(503);
      await anonContext.close();
    } finally {
      // Always restore, even if an assertion above threw.
      if ((await toggle.getAttribute("aria-checked")) === "true") {
        await toggle.click(); // OFF applies immediately, no confirmation gate
        await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: 10000 });
      }
    }

    const anonContext2 = await browser.newContext();
    const res2 = await anonContext2.request.get("/studio");
    expect(res2.status()).not.toBe(503);
    await anonContext2.close();
  });
});
