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

// ── Firefox caveat, root-caused with a minimal repro (S3) ──────────────────
// The app sends `Cross-Origin-Opener-Policy: same-origin` on every response
// (next.config.js, Phase 8 B3). In Firefox that navigation swaps browsing-
// context groups, and Playwright's colorScheme EMULATION does not survive
// the swap — matchMedia falls back to the engine default (light) no matter
// what `test.use({ colorScheme })` says. Verified outside this app entirely:
// firefox.launch() + newContext({colorScheme:"dark"}) + a route-fulfilled
// page reports dark:true WITHOUT a COOP header and dark:false WITH one
// (Playwright 1.62.1). Real Firefox users are unaffected — their OS
// preference is the browser's own state, not a devtools override, and does
// not vanish on a process swap. So the non-default-scheme assertions are
// meaningless on emulated Firefox and are skipped there; Chromium and WebKit
// carry them. Everything that doesn't need emulation (toggle, persistence,
// stored-choice, no-flash timing) still runs on all three engines.
const FIREFOX_EMULATION_CAVEAT =
  "Playwright-Firefox loses colorScheme emulation across the app's COOP browsing-context-group swap (see header comment)";

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
    test("a first visit renders dark", async ({ page, browserName }) => {
      test.skip(browserName === "firefox", FIREFOX_EMULATION_CAVEAT);
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
  test("data-theme is already set at domcontentloaded, before hydration", async ({ page, browserName }) => {
    // Best-effort: domcontentloaded fires long before React hydrates a page
    // this size. If the attribute were stamped by an effect instead of the
    // inline head script, it would still be undefined here.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    // The no-flash guarantee is that the attribute EXISTS this early…
    expect(["light", "dark"]).toContain(theme);
    // …and that it already carries the emulated OS preference — except on
    // Firefox, where the emulation itself is lost (see header comment); the
    // attribute-is-set-early half still runs there.
    if (browserName !== "firefox") expect(theme).toBe("dark");
  });
});

test.describe("theme — the Shell toggle", () => {
  test.use({ storageState: USER_AUTH_FILE, colorScheme: "dark" });

  test("toggling flips the theme, stores the choice, and persists across reload", async ({ page }) => {
    await stubProviders(page);
    await page.goto("/studio");
    await expect(page.locator(".st-app:visible")).toBeVisible();

    // Initial-theme-agnostic (the Firefox caveat above means the starting
    // theme is engine-dependent): read where we start, assert a full
    // flip → persist → reload → flip-back cycle relative to that.
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(["light", "dark"]).toContain(before);
    const flipped = before === "light" ? "dark" : "light";

    // :visible-scoped — React 19's streaming SSR briefly renders the shell
    // twice (see fixtures/studio-actions.mjs); the doomed copy carries a
    // toggle too.
    const toggle = page.getByTestId("theme-toggle").and(page.locator(":visible"));
    await expect(toggle).toHaveAttribute("aria-pressed", before === "light" ? "true" : "false");

    await toggle.click();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", flipped);
    await expect(toggle).toHaveAttribute("aria-pressed", flipped === "light" ? "true" : "false");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(flipped);

    // The choice survives a full reload — the stored value, not the OS
    // preference, is what the head script must honor now.
    await page.reload();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", flipped);

    // And toggling back restores the original, persisted the same way.
    const toggleAfter = page.getByTestId("theme-toggle").and(page.locator(":visible"));
    await toggleAfter.click();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", before);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  });

  test("the settings page carries the same toggle", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    const flipped = before === "light" ? "dark" : "light";
    const toggle = page.getByTestId("theme-toggle").and(page.locator(":visible"));
    await toggle.click();
    await expect(htmlTheme(page)).toHaveAttribute("data-theme", flipped);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(flipped);
  });
});
