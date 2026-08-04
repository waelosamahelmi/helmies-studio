// Helmies Studio — E2E visual workflow editor (EDITSv1 E5.2)
//
// The builder used to be a form: a flat list of steps and a row of "add"
// chips. These journeys drive the pipeline the way it now reads — a palette
// on the left, a chain of cards in the middle, drag to place and drag to
// reorder — and then actually run one, which is the only way to prove the
// per-step prices, statuses and previews are real rather than decorative.
//
// Provider calls resolve through the double-locked E2E_MOCK_PROVIDERS seam
// (src/lib/providers.js) that playwright.config.mjs enables for the app
// process — a workflow run executes INLINE in the request, so this is the
// same short-circuit the Director journeys rely on. No real provider is ever
// dialed.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";
import { E2E_MODEL_NAME, E2E_FORCE_FAIL_MARKER, readCreditsBadge } from "./fixtures/studio-actions.mjs";

// React 19 streams the resolved shell twice while the page settles; a bare
// locator can resolve to the copy that is about to be discarded, and an
// interaction landing there is silently dropped. Every locator below is
// scoped to the surviving copy — see fixtures/studio-actions.mjs's header.
function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

const nodes = (page) => visible(page.locator(".st-node"));
const gap = (page, i) => visible(page.locator(`[data-testid="drop-gap-${i}"]`));
const paletteItem = (page, label) =>
  visible(page.getByRole("button", { name: `Add step: ${label}`, exact: true }));

// HTML5 drag and drop, dispatched explicitly rather than through mouse
// emulation: Playwright's synthesized mouse gestures only drive native DnD
// reliably in Chromium, and this suite has to be honest in Firefox and
// WebKit too. One DataTransfer is threaded through the whole gesture,
// exactly as a real browser does.
async function dragOnto(page, source, target) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  try {
    await source.dispatchEvent("dragstart", { dataTransfer });
    await target.dispatchEvent("dragover", { dataTransfer });
    await target.dispatchEvent("drop", { dataTransfer });
    await source.dispatchEvent("dragend", { dataTransfer });
  } finally {
    await dataTransfer.dispose();
  }
}

async function openWorkflows(page, user) {
  await stubProviders(page);
  await loginThroughForm(page, user);
  await page.goto("/studio/workflows");
  await expect(visible(page.locator(".st-app"))).toBeVisible();
  // Past the streaming-duplicate window, and past the first GET /api/credits.
  await expect.poll(() => page.locator(".st-app").count(), { timeout: 20000 }).toBe(1);
  await expect(visible(page.locator(".st-credits"))).toContainText(/\d/, { timeout: 15000 });
}

// Opens step N's editor, picks the seeded model, writes the prompt, closes.
async function configureImageStep(page, index, prompt) {
  await visible(page.getByRole("button", { name: `Configure step ${index}` })).click();
  await visible(page.locator(".st-model", { hasText: E2E_MODEL_NAME })).click();
  await expect(visible(page.locator(".st-model.is-active", { hasText: E2E_MODEL_NAME }))).toBeVisible();
  const brief = visible(page.getByLabel("Prompt", { exact: true }));
  await brief.fill(prompt);
  await expect(brief).toHaveValue(prompt);
  await visible(page.getByRole("button", { name: "Done", exact: true })).click();
}

async function saveWorkflow(page, name) {
  await visible(page.getByLabel("Workflow name")).fill(name);
  await visible(page.getByRole("button", { name: /^Save/ })).click();
  await expect(visible(page.locator(".hs-notice--signal"))).toContainText(/Saved/, { timeout: 20000 });
}

test("a pipeline is built by dragging kinds out of the palette and reordered by dragging a card", async ({ page }) => {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "wfbuild" });
  });
  await openWorkflows(page, user);

  // Empty canvas: one gap to drop into, no cards.
  await expect(nodes(page)).toHaveCount(0);

  // Drag three kinds out of the palette, each onto the trailing gap — the
  // shape EDITSv1 asks a workflow to be able to express: make a still,
  // animate it, then cut the clips together.
  await dragOnto(page, paletteItem(page, "Image"), gap(page, 0));
  await expect(nodes(page)).toHaveCount(1);

  await dragOnto(page, paletteItem(page, "Image to video"), gap(page, 1));
  await expect(nodes(page)).toHaveCount(2);

  await dragOnto(page, paletteItem(page, "Assemble"), gap(page, 2));
  await expect(nodes(page)).toHaveCount(3);

  await expect(visible(page.getByLabel("Step 1 name"))).toHaveValue("Image");
  await expect(visible(page.getByLabel("Step 2 name"))).toHaveValue("Image to video");
  await expect(visible(page.getByLabel("Step 3 name"))).toHaveValue("Assemble");

  // Dropping onto an earlier gap places the new step THERE, not at the end.
  await dragOnto(page, paletteItem(page, "Export"), gap(page, 0));
  await expect(nodes(page)).toHaveCount(4);
  await expect(visible(page.getByLabel("Step 1 name"))).toHaveValue("Export");
  await expect(visible(page.getByLabel("Step 2 name"))).toHaveValue("Image");

  // Drag the card itself to reorder: Export back to the end.
  await dragOnto(page, nodes(page).first(), gap(page, 4));
  await expect(visible(page.getByLabel("Step 1 name"))).toHaveValue("Image");
  await expect(visible(page.getByLabel("Step 4 name"))).toHaveValue("Export");

  // The keyboard path is the same reorder, and it stays.
  await visible(page.getByRole("button", { name: "Configure step 1" })).click();
  await visible(page.getByRole("button", { name: "Move this step later" })).click();
  await visible(page.getByRole("button", { name: "Done", exact: true })).click();
  await expect(visible(page.getByLabel("Step 1 name"))).toHaveValue("Image to video");
  await expect(visible(page.getByLabel("Step 2 name"))).toHaveValue("Image");

  // Every card carries its own quote, from the pricing API. The two steps
  // that run on our own machine are priced server-side and never guessed:
  // assembling is a flat fee, exporting is free.
  const assembleNode = nodes(page).filter({ hasText: "Assemble" }).first();
  await expect(assembleNode.locator(".st-node__cost")).toHaveText("5 cr", { timeout: 20000 });
  const exportNode = nodes(page).filter({ hasText: "Export" }).first();
  await expect(exportNode.locator(".st-node__cost")).toHaveText("0 cr", { timeout: 20000 });

  // Duplicate and delete act on the card they belong to.
  await visible(page.getByRole("button", { name: "Duplicate step 1" })).click();
  await expect(nodes(page)).toHaveCount(5);
  await expect(visible(page.getByLabel("Step 2 name"))).toHaveValue("Image to video");

  await visible(page.getByRole("button", { name: "Remove step 2" })).click();
  await expect(nodes(page)).toHaveCount(4);
});

test("a saved run prices every step, shows each output on its own card, and settles once", async ({ page }) => {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "wfrun" });
  });
  await openWorkflows(page, user);

  await paletteItem(page, "Image").click();
  await configureImageStep(page, 1, `E2E workflow run ${Date.now()}`);
  await paletteItem(page, "Export").click();
  await expect(nodes(page)).toHaveCount(2);

  // The seeded model costs 10; the closing step costs nothing.
  await expect(nodes(page).nth(0).locator(".st-node__cost")).toHaveText("10 cr", { timeout: 20000 });
  await expect(nodes(page).nth(1).locator(".st-node__cost")).toHaveText("0 cr", { timeout: 20000 });

  await saveWorkflow(page, `E2E pipeline ${Date.now()}`);

  const runButton = visible(page.getByRole("button", { name: /Run workflow/ }));
  await expect(runButton).toBeEnabled({ timeout: 20000 });

  const runResponse = page.waitForResponse(
    (r) => /\/api\/workflows\/[^/]+\/run$/.test(r.url()) && r.request().method() === "POST",
    { timeout: 120000 },
  );
  await runButton.click();
  const res = await runResponse;
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success, `the run should complete: ${body.error || ""}`).toBe(true);

  // Each card reports its own outcome, and the image step shows what it made
  // without leaving the pipeline.
  await expect(nodes(page).nth(0).locator(".st-node__chip")).toHaveText("Done", { timeout: 30000 });
  await expect(nodes(page).nth(1).locator(".st-node__chip")).toHaveText("Done");
  await expect(visible(page.getByTestId("step-output-1"))).toBeVisible();

  // The closing step hands back the deliverable rather than generating one.
  await expect(visible(page.getByTestId("step-output-2"))).toBeVisible();

  // Reserved once, settled once: the run cost exactly the quoted total.
  await expect.poll(() => readCreditsBadge(page), { timeout: 20000 }).toBe(490);
});

test("a failed step is marked on its card and can be rerun on its own once fixed", async ({ page }) => {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "wfretry" });
  });
  await openWorkflows(page, user);

  await paletteItem(page, "Image").click();
  await configureImageStep(page, 1, `E2E workflow failure ${Date.now()} ${E2E_FORCE_FAIL_MARKER}`);
  await saveWorkflow(page, `E2E failing pipeline ${Date.now()}`);

  const failedRun = page.waitForResponse(
    (r) => /\/api\/workflows\/[^/]+\/run$/.test(r.url()) && r.request().method() === "POST",
    { timeout: 120000 },
  );
  await visible(page.getByRole("button", { name: /Run workflow/ })).click();
  const failedBody = await (await failedRun).json();
  expect(failedBody.success).toBe(false);

  await expect(nodes(page).nth(0).locator(".st-node__chip")).toHaveText("Failed", { timeout: 30000 });
  // Nothing ran, so nothing was charged — the reservation went back.
  await expect.poll(() => readCreditsBadge(page), { timeout: 20000 }).toBe(500);

  // Fix the step and rerun just that one, without replaying the chain.
  await visible(page.getByRole("button", { name: "Configure step 1" })).click();
  const brief = visible(page.getByLabel("Prompt", { exact: true }));
  await brief.fill(`E2E workflow recovered ${Date.now()}`);
  await visible(page.getByRole("button", { name: "Done", exact: true })).click();
  await visible(page.getByRole("button", { name: /^Save/ })).click();
  await expect(visible(page.locator(".hs-notice--signal"))).toContainText(/Saved/, { timeout: 20000 });

  const regen = page.waitForResponse(
    (r) => /\/api\/workflows\/[^/]+\/regen$/.test(r.url()) && r.request().method() === "POST",
    { timeout: 120000 },
  );
  await visible(page.getByRole("button", { name: "Rerun step 1 on its own" })).click();
  const regenBody = await (await regen).json();
  expect(regenBody.success, `the rerun should succeed: ${regenBody.error || ""}`).toBe(true);

  await expect(nodes(page).nth(0).locator(".st-node__chip")).toHaveText("Done", { timeout: 30000 });
  await expect(visible(page.getByTestId("step-output-1"))).toBeVisible();
  await expect.poll(() => readCreditsBadge(page), { timeout: 20000 }).toBe(490);
});
