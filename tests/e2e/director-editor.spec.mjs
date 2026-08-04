// Helmies Studio — E2E Director shot editor journeys (EDITSv1 E4.2)
//
// Planning here always takes the HEURISTIC path — playwright.config.mjs sets
// OPENROUTER_KEY to an explicit empty string, so director-planner.js's
// hasLLM gate is false and no LLM is ever dialed. Per-shot generation goes
// through the app-side E2E_MOCK_PROVIDERS short-circuit (the director
// executor runs INLINE in the app process, not the worker — see the
// webServerEnv comment in playwright.config.mjs), so no real provider is
// ever reached either.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

const shotCards = (page) => visible(page.locator("article.st-shot"));

async function readHeaderCost(page) {
  const cost = visible(page.locator(".st-board__stats span", { hasText: "Cost" }).locator("b"));
  await expect(cost).toContainText(/\d/, { timeout: 10000 });
  const text = (await cost.textContent()) || "";
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

async function readCreditsBadge(page) {
  const locator = visible(page.locator(".st-credits"));
  await expect(locator).toContainText(/\d/, { timeout: 10000 });
  const text = (await locator.textContent()) || "";
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

async function buildHeuristicPlan(page) {
  await page.goto("/studio/director");
  await expect(visible(page.locator(".st-app"))).toBeVisible();
  // Settle past React 19's streaming-duplicate window (see
  // fixtures/studio-actions.mjs — interacting with the doomed copy silently
  // drops its state updates, observed here on firefox/webkit as the fill
  // never reaching React and the button staying disabled). The credits badge
  // showing real digits means data arrived on the SURVIVING copy.
  await expect(visible(page.locator(".st-credits"))).toContainText(/\d/, { timeout: 15000 });

  const brief = visible(page.getByLabel("Production concept"));
  await brief.fill("A neon-lit night drive through an empty city, rain on the windshield.");
  await expect(brief).toHaveValue(/neon-lit night drive/);

  const build = visible(page.getByRole("button", { name: /Build shot plan/ }));
  await expect(build).toBeEnabled({ timeout: 10000 });
  await build.click();
  // The heuristic music-video preset yields 8 planned shots.
  await expect(shotCards(page)).toHaveCount(8, { timeout: 30000 });
}

test("shot edits, duplicate, reorder and delete persist and re-quote the plan", async ({ page }) => {
  await stubProviders(page);

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "dired" });
  });
  await loginThroughForm(page, user);

  await buildHeuristicPlan(page);
  const cost0 = await readHeaderCost(page);
  expect(cost0).toBeGreaterThan(0);

  // Duplicate shot 1 — one more card, and the server re-quote raises the cost.
  await visible(page.getByRole("button", { name: "Duplicate shot 1" })).click();
  await expect(shotCards(page)).toHaveCount(9, { timeout: 15000 });
  await expect.poll(() => readHeaderCost(page), { timeout: 15000 }).toBeGreaterThan(cost0);
  const cost1 = await readHeaderCost(page);

  // Edit shot 1's title through the shot editor sheet.
  await visible(page.getByRole("button", { name: "Edit shot 1" })).click();
  const editor = visible(page.locator('[data-testid="shot-editor"]'));
  await expect(editor).toBeVisible();
  await editor.getByLabel("Title").fill("Edited opening");
  await editor.getByRole("button", { name: "Save shot" }).click();
  await expect(shotCards(page).first()).toContainText("Edited opening", { timeout: 15000 });

  // Reorder — the edited shot moves later, so card 2 now carries its title.
  await visible(page.getByRole("button", { name: "Move shot 1 later" })).click();
  await expect(shotCards(page).nth(1)).toContainText("Edited opening", { timeout: 15000 });
  await expect(shotCards(page).first()).not.toContainText("Edited opening");

  // Delete the (un-edited) first card — count and cost both come back down.
  await visible(page.getByRole("button", { name: "Delete shot 1" })).click();
  await expect(shotCards(page)).toHaveCount(8, { timeout: 15000 });
  await expect.poll(() => readHeaderCost(page), { timeout: 15000 }).toBeLessThan(cost1);
  await expect(shotCards(page).first()).toContainText("Edited opening");

  // Persistence: a full reload drops all client state — reopening the
  // production from "Earlier productions" must show the edited plan
  // (exercises E4.1's fixed status/list route end to end).
  await page.reload();
  await expect(visible(page.locator(".st-app"))).toBeVisible();
  await visible(page.getByRole("button", { name: "Production", exact: true })).click();
  await visible(page.getByRole("button", { name: /Untitled Production/ })).click();
  await expect(shotCards(page)).toHaveCount(8, { timeout: 15000 });
  await expect(shotCards(page).first()).toContainText("Edited opening");
});

test("per-shot generation yields a still without running the full pipeline, debiting only that shot", async ({ page }) => {
  await stubProviders(page);

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "dirgen" });
  });
  await loginThroughForm(page, user);

  await buildHeuristicPlan(page);
  const before = await readCreditsBadge(page);

  await visible(page.getByRole("button", { name: "Generate the still for shot 1" })).click();

  // The first card gets its image (served through the app, via the E2E
  // provider mock) — and ONLY the first card: nothing else rendered, so
  // this was per-shot work, not a full pipeline run.
  await expect(visible(page.locator(".st-shot__frame img"))).toHaveCount(1, { timeout: 30000 });
  await expect(visible(page.getByRole("img", { name: "Shot 1" }))).toBeVisible();

  // The pipeline never left planning — no execution states, no completion.
  await expect(visible(page.locator(".st-board__head .hs-badge"))).toHaveText(/planning/i);

  // Money: exactly this shot's quoted image cost (2 credits — the estimate
  // fallback for the preset image model, unpriced in the test DB).
  await expect.poll(() => readCreditsBadge(page), { timeout: 15000 }).toBe(before - 2);

  // The shot now has a real asset, so its actions flip from "generate" to
  // "re-run" (rerun requires the DirectorShot row that now exists).
  await expect(visible(page.getByRole("button", { name: "Re-run the still for shot 1" }))).toBeVisible();
});
