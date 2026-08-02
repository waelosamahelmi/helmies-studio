// Helmies Studio — shared /studio/image UI actions (Phase 5 Tasks 2 & 3)
//
// Small, composable helpers over the real DOM so each spec doesn't
// re-implement "find the seeded model, fill the brief, read the balance"
// from scratch. Nothing here reaches into React state or component
// internals — every helper drives or reads the same elements a real user
// would.
import { expect } from "@playwright/test";

// Matches tests/e2e/fixtures/seed.mjs's E2E_IMAGE_MODEL_ID row's
// displayName exactly ("E2E Image Model", modelType "image", 10 credits).
export const E2E_MODEL_NAME = "E2E Image Model";

// Matches src/lib/providers.js's E2E_FORCE_FAIL_MARKER. Duplicated as a
// literal (not imported) — e2e specs/fixtures must not import src/lib/*.js,
// see fixtures/seed.mjs's header for why.
export const E2E_FORCE_FAIL_MARKER = "__E2E_FORCE_FAIL__";

// React 19 briefly emits the resolved Suspense content TWICE while the page
// settles — once in its real position, and once inside a same-page hidden
// holder div a relocation script consumes almost immediately (documented in
// tests/e2e/smoke.spec.mjs — not an app bug). A bare role/label locator can
// resolve to both copies and either trip Playwright's strict-mode check, or
// worse, silently interact with the copy that's about to be discarded —
// which drops whatever local component state that interaction just set
// (observed empirically: a submit click landing on the doomed copy fires
// its network request, but the response handler's `mine()`/`alive.current`
// guard then sees the ALREADY-UNMOUNTED instance and drops the result on
// the floor, leaving the surviving copy stuck at "idle" forever). Every
// helper below that clicks or fills something scopes to the visible,
// surviving copy for exactly this reason.
function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

// Navigates to the image studio and waits for the shell AND the model
// catalog's first load to settle — past both the streaming-duplicate
// window above and the catalog's own loading skeleton — so anything that
// follows never races either.
export async function gotoImageStudioReady(page) {
  await page.goto("/studio/image");
  await expect(page.locator(".st-app:visible")).toBeVisible();
  await expect(visible(page.getByRole("button", { name: new RegExp(E2E_MODEL_NAME) }))).toBeVisible();
}

export async function selectE2EModel(page) {
  const model = visible(page.locator(".st-model", { hasText: E2E_MODEL_NAME }));
  await model.click();
  await expect(visible(page.locator(".st-model.is-active", { hasText: E2E_MODEL_NAME }))).toBeVisible();
}

export async function fillBrief(page, text) {
  const field = visible(page.getByLabel("Creative brief"));
  await field.fill(text);
  await expect(field).toHaveValue(text);
}

export const submitButton = (page) => visible(page.getByRole("button", { name: /^Generate/ }));

// The studio shell's top-bar credit badge (src/components/studio/kit/
// Shell.js's <Credits>) — refreshed immediately after a successful
// generation via ImageStudio's onCreditsChanged, and periodically otherwise.
// The single reliable "balance the user actually sees" across every studio
// tool.
export const creditsBadge = (page) => visible(page.locator(".st-credits"));

// Waits for a real number (not the "—" placeholder shown before the first
// GET /api/credits resolves) before reading it — without this, a read taken
// immediately after navigation can race that request and come back null.
export async function readCreditsBadge(page) {
  const locator = creditsBadge(page);
  await expect(locator).toContainText(/\d/, { timeout: 10000 });
  const text = (await locator.textContent()) || "";
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

// The billing panel's own balance readout (/settings?tab=billing) — a
// second, independent "balance the user actually sees" that does a fresh
// GET /api/credits on mount rather than waiting on the studio's
// generation-settled refresh. Used where a test would otherwise have to
// wait out StudioClient's slower background poll (e.g. after a FAILED
// generation, which — unlike a successful one — does not trigger an
// immediate credits refresh).
export async function readBillingBalance(page) {
  await page.goto("/settings?tab=billing");
  const locator = page.locator(".pg-balance__n");
  await expect(locator).toContainText(/\d/, { timeout: 10000 });
  const text = (await locator.textContent()) || "";
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}
