// Helmies Studio — E2E generation journeys (Phase 5 Task 2, journeys 3, 5, 6, 7)
//
// Every test here mints its OWN isolated user (fixtures/db.mjs) rather than
// reusing Task 1's shared storage states — these tests spend real credits,
// and playwright.config.mjs runs fullyParallel, so sharing a wallet across
// concurrent tests would make the balance assertions race each other.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";
import {
  gotoImageStudioReady, selectE2EModel, fillBrief, submitButton,
  readCreditsBadge, readBillingBalance, E2E_FORCE_FAIL_MARKER,
} from "./fixtures/studio-actions.mjs";

const resultImage = (page) => page.getByRole("img", { name: "Generated result" });

test("generating an image completes end-to-end and the balance drops by exactly 10", async ({ page }) => {
  await stubProviders(page);
  const prompt = `E2E generate journey ${Date.now()}`;

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "gen" });
  });
  await loginThroughForm(page, user);

  await gotoImageStudioReady(page);
  await selectE2EModel(page);
  const before = await readCreditsBadge(page);
  await fillBrief(page, prompt);
  await submitButton(page).click();

  // Real completion through the durable job runner (scripts/worker.mjs,
  // started as playwright.config.mjs's second webServer entry) via
  // src/lib/providers.js's E2E_MOCK_PROVIDERS short-circuit — the same code
  // path production uses end to end, not a page.route fake.
  await expect(resultImage(page)).toBeVisible({ timeout: 30000 });

  await expect.poll(() => readCreditsBadge(page), { timeout: 15000 }).toBe(before - 10);
});

test("double-clicking submit creates exactly one generation and spends credits once", async ({ page }) => {
  await stubProviders(page);
  const prompt = `E2E duplicate submit ${Date.now()}`;

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "dup" });
  });
  await loginThroughForm(page, user);

  await gotoImageStudioReady(page);
  await selectE2EModel(page);
  const before = await readCreditsBadge(page);
  await fillBrief(page, prompt);

  // A literal double-click on the submit button. Discovered while writing
  // this test: Playwright's dblclick() replays both clicks at ONE fixed
  // screen coordinate, but Brief.js swaps "Generate" in place for a
  // differently-wired "Working… Cancel" control the instant `generating`
  // flips true (same position, different element) — so the second click of
  // a real double-click lands on Cancel, not Generate. useAsyncGeneration's
  // cancel() bumps `runId`, which makes the in-flight request's response
  // handler a no-op ("Stop watching this job. The provider keeps working;
  // the row stays in history. We only detach the UI.") — the STUDIO PAGE
  // can legitimately end up back at its idle state even though the
  // generation completes normally server-side. A real human double-click
  // mostly wouldn't hit this (fingers are ~100-500ms apart, long enough to
  // see the swap) but Playwright's is near-instant, so this is the honest
  // worst case. Assert the OUTCOME on data the detach can't hide — the
  // gallery (a fresh server round-trip) and a fresh balance read — rather
  // than on this page's own (possibly detached) Stage.
  const firstResponse = page.waitForResponse(
    (r) => r.url().includes("/api/generate/async") && r.request().method() === "POST",
  );
  await submitButton(page).dblclick();
  // Wait for the POST to actually land before navigating away — otherwise
  // the navigation below can abort the still-in-flight request client-side
  // (observed empirically: the server logs a real "aborted"/socket-closed
  // error when goto() fires too early), which is a genuine test race, not
  // anything server-side. The request/response completing here says
  // nothing about which button the second click landed on — either way,
  // the FIRST click's submission is what we're waiting for.
  await firstResponse;

  await page.goto("/gallery");
  const escaped = prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entries = page.getByRole("link", { name: new RegExp(escaped) });
  // GalleryClient re-fetches its "Finished work" list every few seconds
  // on its own (src/app/gallery/GalleryClient.js's poll effect) whenever
  // something is still running/pending, so a plain retrying assertion
  // catches the transition to "completed" without this test forcing a
  // page reload itself.
  await expect(entries).toHaveCount(1, { timeout: 30000 });

  // .st-credits only exists inside the studio shell, not on /gallery — read
  // the billing panel's own balance instead, a fresh GET /api/credits.
  await expect.poll(() => readBillingBalance(page), { timeout: 15000 }).toBe(before - 10);
});

test("a failed generation reports failure and refunds the balance", async ({ page }) => {
  await stubProviders(page);
  const prompt = `E2E forced failure ${Date.now()} ${E2E_FORCE_FAIL_MARKER}`;

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "fail" });
  });
  await loginThroughForm(page, user);

  await gotoImageStudioReady(page);
  await selectE2EModel(page);
  const before = await readCreditsBadge(page);
  await fillBrief(page, prompt);
  await submitButton(page).click();

  await expect(page.getByRole("heading", { name: "Generation failed" })).toBeVisible({ timeout: 30000 });
  // E2.2: raw provider text no longer reaches users — job-runner passes
  // Generation.error through brandForUser, and the seam's marker message
  // matches no known category, so the user sees the branded generic message
  // and never the provider's own words.
  await expect(page.locator(".st-stage .hs-empty p").first()).toHaveText("An unexpected error occurred. Please try again.");
  await expect(page.locator(".st-stage")).not.toContainText("E2E forced provider failure");

  // The credits badge only refreshes immediately on a SUCCESSFUL result
  // (ImageStudio's onCreditsChanged effect watches `result`, not `error`) —
  // read the billing panel instead, which does its own fresh GET
  // /api/credits on mount rather than waiting on the slower background poll.
  await expect.poll(() => readBillingBalance(page), { timeout: 15000 }).toBe(before);
});

test("one user's generation is invisible to another user", async ({ page, browser }) => {
  await stubProviders(page);
  const prompt = `E2E isolation ${Date.now()}`;

  let userA, userB;
  await withTestDb(async (prisma) => {
    userA = await createIsolatedUser(prisma, { credits: 500, label: "isoa" });
    userB = await createIsolatedUser(prisma, { credits: 500, label: "isob" });
  });

  await loginThroughForm(page, userA);
  await gotoImageStudioReady(page);
  await selectE2EModel(page);
  await fillBrief(page, prompt);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/generate/async") && r.request().method() === "POST"),
    submitButton(page).click(),
  ]);
  const body = await response.json();
  expect(body.generationId, "the async route must return a generationId to poll").toBeTruthy();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  try {
    await stubProviders(pageB);
    await loginThroughForm(pageB, userB);

    await pageB.goto("/gallery");
    await expect(pageB.locator("body")).not.toContainText(prompt);

    const statusRes = await pageB.request.get(`/api/generations/status?id=${body.generationId}`);
    expect(statusRes.status()).toBe(404);
  } finally {
    await contextB.close();
  }
});
