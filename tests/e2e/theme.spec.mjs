// Helmies Studio — S3 light mode.
//
// The theme contract under test (plan phase S3):
//   · <html data-theme> is stamped BEFORE first paint by the inline script in
//     src/app/layout.js's <head> (no flash of the wrong theme);
//   · default = the system's prefers-color-scheme when nothing is stored;
//   · a stored choice in localStorage["helmies.theme"] beats the system;
//   · the Shell toggle (src/components/ThemeToggle.js) flips the attribute,
//     persists the choice, and survives a reload.
//
// The 44px coarse-pointer sweep for the toggle itself lives in
// tests/e2e/mobile.spec.mjs (only the mobile project emulates a coarse
// pointer — see playwright.config.mjs).
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";

const KEY = "helmies.theme";
const htmlTheme = (page) => page.locator("html");

test.describe("theme — system-preference default (nothing stored)", () => {
  test.describe("OS prefers light", () => {
    test.use({ colorScheme: "light" });
    test("a first visit renders light", async ({ page }) => {
      await page.goto("/login");
      await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light");
    });
  });

  test.describe("OS prefers dark", () => {
    test.use({ colorScheme: "dark" });
    test("a first visit renders dark", async ({ page }) => {
      await page.goto("/login");
      await expect(htmlTheme(page)).toHaveAttribute("data-theme", "dark");
    });
  });
});

test.describe("theme — a stored choice beats the system", () => {
  test.use({ colorScheme: "dark" });
  test("stored light wins over an OS that prefers dark", async ({ page }) => {
    await page.addInitScript((k) => { try { localStorage.setItem(k, "light"); } catch { /* ignore */ } }, KEY);
    await page.goto("/login");
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light");
  });
});

test.describe("theme — no flash", () => {
  test.use({ colorScheme: "dark" });
  test("data-theme is already set at domcontentloaded, before hydration", async ({ page }) => {
    // Best-effort: domcontentloaded fires long before React hydrates a page
    // this size. If the attribute were stamped by an effect instead of the
    // inline head script, it would still be undefined here.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(["light", "dark"]).toContain(theme);
    expect(theme).toBe("dark");
  });
});

test.describe("theme — the Shell toggle", () => {
  test.use({ storageState: USER_AUTH_FILE, colorScheme: "dark" });

  test("toggling flips the theme, stores the choice, and persists across reload", async ({ page }) => {
    await stubProviders(page);
    await page.goto("/studio");
    await expect(page.locator(".st-app:visible")).toBeVisible();

    // :visible-scoped — React 19's streaming SSR briefly renders the shell
    // twice (see fixtures/studio-actions.mjs); the doomed copy carries a
    // toggle too.
    const toggle = page.getByTestId("theme-toggle").and(page.locator(":visible"));
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("light");

    // The choice survives a full reload — and beats the (dark) OS preference.
    await page.reload();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light");

    // And toggling back restores dark, persisted the same way.
    const toggleAfter = page.getByTestId("theme-toggle").and(page.locator(":visible"));
    await toggleAfter.click();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("dark");
  });

  test("the settings page carries the same toggle", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const toggle = page.getByTestId("theme-toggle").and(page.locator(":visible"));
    await toggle.click();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("light");
  });
});
