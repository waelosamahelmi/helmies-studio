// Helmies Studio — E2E billing journey (Phase 5 Task 2, journey 4)
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";
import { gotoImageStudioReady, selectE2EModel, fillBrief, submitButton, readBillingBalance } from "./fixtures/studio-actions.mjs";

test("insufficient credits blocks the generation with a clear message and leaves the balance untouched", async ({ page }) => {
  await stubProviders(page);

  // The seeded E2E model costs 10 credits (fixtures/seed.mjs's
  // E2E_IMAGE_MODEL_CREDITS_COST) — 3 is deliberately short of it.
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 3, label: "poor" });
  });
  await loginThroughForm(page, user);

  await gotoImageStudioReady(page);
  await selectE2EModel(page);
  await fillBrief(page, "A single red apple on a white background");

  // The spend meter (src/components/studio/kit/Spend.js's SpendMeter) prices
  // the render live against the real balance and says, in words, what's
  // short — a clear, specific message, not a generic "something went wrong".
  const note = page.locator(".hs-meter__note");
  await expect(note).toContainText("7 more credits needed");

  // The submit button is disabled by the same affordability check before
  // any request is made — src/components/studio/kit/Brief.js's `ready`
  // requires `affordable`. Confirms the block is real, not just advisory
  // copy sitting next to a clickable button.
  const generate = submitButton(page);
  await expect(generate).toBeDisabled();

  await expect.poll(() => readBillingBalance(page), { timeout: 10000 }).toBe(3);
});
