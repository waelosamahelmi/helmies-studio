// Helmies Studio — E2E auth journeys (Phase 5 Task 2, journeys 1 & 2)
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";
import { E2E_USER_EMAIL, SEED_PASSWORD } from "./fixtures/seed.mjs";
import { creditsBadge, readCreditsBadge } from "./fixtures/studio-actions.mjs";

test.describe("register", () => {
  test("a fresh email registers, lands in the studio, and shows a 100-credit balance", async ({ page }) => {
    await stubProviders(page);

    const email = `e2e-register-${Date.now()}@test.local`;

    await page.goto("/login?new=1");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    // The register submit handler posts to /api/auth/register, then signs
    // in with the same credentials and router.push()es to /studio — no
    // second form, no re-typed password.
    await expect(page).toHaveURL(/\/studio/, { timeout: 20000 });
    await expect(page.locator(".st-app:visible")).toBeVisible();

    // src/app/api/auth/register/route.js -> provisionNewUser grants the
    // "free" plan's opening balance (100 credits — see
    // src/app/login/page.js's own "100 credits land in your balance" copy).
    await expect(creditsBadge(page)).toBeVisible();
    await expect.poll(() => readCreditsBadge(page), { timeout: 15000 }).toBe(100);
  });
});

test.describe("logout", () => {
  // Task 1's storage state — a pure read (sign in, then sign back out) that
  // never touches the shared user's wallet, so it's safe to reuse alongside
  // every other spec that also reads this same storage state.
  test.use({ storageState: USER_AUTH_FILE });

  test("signing out sends a subsequent /studio visit to /login", async ({ page }) => {
    await stubProviders(page);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByText(E2E_USER_EMAIL)).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/studio");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
