// Helmies Studio — accessibility pass (Phase 5 Task 3)
//
// axe-core over the core page set. Fails on any violation with impact
// "serious" or "critical" — "moderate"/"minor" are recorded (every
// violation is printed, regardless of impact) but not gates. Each page's
// full axe result is logged BEFORE the assertion runs, so a failing run
// still reports everything found, not just the first mismatch.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubProviders } from "./fixtures/intercept.mjs";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";
import { gotoImageStudioReady } from "./fixtures/studio-actions.mjs";

const GATE_IMPACTS = new Set(["serious", "critical"]);

function describeViolation(v) {
  return `${v.id} [${v.impact}] — ${v.help} (${v.nodes.length} node(s)) ${v.helpUrl}`;
}

// React 19's streaming SSR briefly renders the shell TWICE (see
// fixtures/studio-actions.mjs). The doomed copy is a PARTIAL tree — a
// role="list" whose listitems haven't streamed in yet reads to axe as a
// genuine aria-required-children violation, and its unsettled text trips
// contrast checks. Audit the settled page: wait for the duplicate to be
// removed before analyzing. Under full-suite load that window is longer,
// which is why this only ever failed when the whole suite ran at once.
async function settle(page, root) {
  await expect.poll(() => page.locator(root).count(), { timeout: 20000 }).toBe(1);
}

async function auditPage(page, label) {
  const results = await new AxeBuilder({ page }).analyze();
  // Logged unconditionally — this is the full record the brief asks be
  // captured BEFORE any fix, and it stays useful afterwards as a permanent
  // "here's what axe actually found" trail for moderate/minor issues too.
  console.log(
    `\n[a11y] ${label}: ${results.violations.length} violation type(s)\n` +
      (results.violations.length ? results.violations.map(describeViolation).join("\n") : "  (none)"),
  );
  const gating = results.violations.filter((v) => GATE_IMPACTS.has(v.impact));
  expect(gating, `${label} — serious/critical violations:\n${gating.map(describeViolation).join("\n")}`).toEqual([]);
}

// S3 light mode: every core-page audit below runs once per theme. The theme
// is planted in localStorage before any document script runs (addInitScript
// fires ahead of the inline theme-init script in src/app/layout.js's <head>,
// which reads "helmies.theme" and stamps <html data-theme>), so each audit
// sees the page fully painted in that theme — including axe's contrast
// checks against the [data-theme="light"] token set in system.css.
//
// The LANDING (/) is deliberately excluded from the loop: it is styled by
// globals.css's own hardcoded palette (off-limits, stays dark by design),
// so a light-theme pass over it would audit the identical pixels twice.
const THEMES = ["dark", "light"];

async function useTheme(page, theme) {
  await page.addInitScript((t) => {
    try { localStorage.setItem("helmies.theme", t); } catch { /* ignore */ }
  }, theme);
}

// Guard: prove the audit really ran in the requested theme, so a regression
// in the init script can never silently turn the light audits into dark ones.
async function expectTheme(page, theme) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

test.describe("a11y — landing (dark by design, single audit)", () => {
  test("/ (landing) has no serious/critical violations", async ({ page }) => {
    await page.goto("/");
    await auditPage(page, "/");
  });
});

for (const theme of THEMES) {
  test.describe(`a11y — anonymous pages [${theme}]`, () => {
    test.beforeEach(async ({ page }) => { await useTheme(page, theme); });

    test(`/login has no serious/critical violations [${theme}]`, async ({ page }) => {
      await page.goto("/login");
      await expectTheme(page, theme);
      await auditPage(page, `/login [${theme}]`);
    });

    test(`/pricing has no serious/critical violations [${theme}]`, async ({ page }) => {
      await page.goto("/pricing");
      await expectTheme(page, theme);
      await auditPage(page, `/pricing [${theme}]`);
    });
  });

  test.describe(`a11y — authenticated pages [${theme}]`, () => {
    test.use({ storageState: USER_AUTH_FILE });
    test.beforeEach(async ({ page }) => { await useTheme(page, theme); });

    test(`/studio has no serious/critical violations [${theme}]`, async ({ page }) => {
      await stubProviders(page);
      await page.goto("/studio");
      await expect(page.locator(".st-app:visible")).toBeVisible();
      await settle(page, ".st-app");
      await expectTheme(page, theme);
      await auditPage(page, `/studio [${theme}]`);
    });

    test(`/studio/image has no serious/critical violations [${theme}]`, async ({ page }) => {
      await stubProviders(page);
      await gotoImageStudioReady(page);
      await expectTheme(page, theme);
      await auditPage(page, `/studio/image [${theme}]`);
    });

    test(`/settings has no serious/critical violations [${theme}]`, async ({ page }) => {
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await expectTheme(page, theme);
      await auditPage(page, `/settings [${theme}]`);
    });

    test(`/gallery has no serious/critical violations [${theme}]`, async ({ page }) => {
      await page.goto("/gallery");
      await expect(page.getByRole("heading", { name: "Everything you have made." })).toBeVisible();
      await expectTheme(page, theme);
      await auditPage(page, `/gallery [${theme}]`);
    });
  });
}

test.describe("a11y — authenticated pages", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("studio model-picker sheet has no serious/critical violations", async ({ page }) => {
    // The model-picker sheet only exists below 900px (src/components/
    // studio/kit/Workspace.js's .st-panel-tabs, src/styles/studio.css) —
    // above that the model list renders inline, no sheet involved.
    await page.setViewportSize({ width: 800, height: 900 });
    await stubProviders(page);
    await page.goto("/studio/image");
    await expect(page.locator(".st-app:visible")).toBeVisible();

    const modelTrigger = page.getByRole("button", { name: "Model", exact: true });
    await modelTrigger.click();
    await expect(page.getByRole("dialog", { name: "Model" })).toBeVisible();

    await auditPage(page, "/studio/image (model-picker sheet open)");
  });
});

test.describe("keyboard traversal", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("tab reaches the prompt, model picker, and submit; opening the sheet moves focus in and Escape returns it", async ({ page }) => {
    // A narrow viewport so the model-picker SHEET (not the inline desktop
    // panel) is what "the model picker" reaches — see the sheet test above
    // for why this only exists below 900px.
    await page.setViewportSize({ width: 800, height: 900 });
    await stubProviders(page);
    await page.goto("/studio/image");
    await expect(page.locator(".st-app:visible")).toBeVisible();

    // :visible-scoped — React 19 briefly emits the resolved Suspense
    // content twice while the page settles (documented in smoke.spec.mjs
    // and fixtures/studio-actions.mjs), so a bare label/role locator can
    // resolve to a doomed duplicate as well as the surviving element.
    const visible = (locator) => locator.and(page.locator(":visible"));
    // U1: below 900px the composer is collapsed — the prompt textarea lives
    // inside the expanding composer sheet, and the collapsed bar carries
    // the peek trigger plus the primary action. The traversal targets are
    // therefore the peek trigger, the model trigger and the primary action;
    // the textarea's own keyboard path is proven right after, through the
    // sheet, with the same focus-in / Escape-returns semantics the model
    // sheet is held to.
    const composerTrigger = visible(page.getByRole("button", { name: "Open the brief composer" }));
    const modelTrigger = visible(page.getByRole("button", { name: "Model", exact: true }));
    const submit = visible(page.getByTestId("brief-primary"));

    // Tab from the top of the page (no pre-focused element) until all three
    // targets have been visited at least once — proves each is genuinely
    // keyboard-reachable in normal page order, not just individually
    // focusable via a direct .focus() call. (The collapsed primary action
    // is never disabled: with an empty brief it opens the composer instead,
    // so it is always in the tab order.)
    const reached = { composer: false, model: false, submit: false };
    for (let i = 0; i < 80 && !(reached.composer && reached.model && reached.submit); i++) {
      await page.keyboard.press("Tab");
      if (await composerTrigger.evaluate((el) => el === document.activeElement)) reached.composer = true;
      if (await modelTrigger.evaluate((el) => el === document.activeElement)) reached.model = true;
      if (await submit.evaluate((el) => el === document.activeElement)) reached.submit = true;
    }
    expect(reached, "Tab must reach the composer trigger, the model-picker trigger, and the primary action").toEqual({
      composer: true, model: true, submit: true,
    });

    // The composer sheet: opening moves focus in, the brief is typeable,
    // Escape closes and returns focus to the trigger.
    await composerTrigger.focus();
    await expect(composerTrigger).toBeFocused();
    await page.keyboard.press("Enter");
    const composerDialog = page.getByRole("dialog", { name: "Brief" });
    await expect(composerDialog).toBeVisible();
    await expect
      .poll(() => composerDialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    const promptField = composerDialog.getByLabel("Creative brief");
    await promptField.focus();
    await page.keyboard.type("Accessibility keyboard traversal check");
    await expect(promptField).toHaveValue(/traversal check/);
    await page.keyboard.press("Escape");
    await expect(composerDialog).toBeHidden();
    await expect(composerTrigger).toBeFocused();

    // Opening the sheet moves focus INTO it (src/components/studio/kit/
    // Sheet.js focuses its own dialog container on open).
    await modelTrigger.focus();
    await expect(modelTrigger).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Model" });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);

    // Escape closes it AND returns focus to the trigger — Sheet.js's
    // useReturnFocus (Phase 5 Task 3 fix: this previously left focus on
    // document.body, so a keyboard user's next Tab restarted from the top
    // of the page instead of picking back up at the Model button).
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(modelTrigger).toBeFocused();
  });
});
