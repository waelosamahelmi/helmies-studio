// Helmies Studio — S2 Music timeline studio
//
// The journey: compose a track (real completion through the durable worker
// via the E2E provider mock), watch it land in the track list, select it,
// work the range selector with the keyboard, see replace-section's window
// rules surface honestly, and run an Extend that quotes server-side and
// submits through the ordinary generation flow.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

const COMPOSER_ID = "e2e-generate-music";
const COMPOSER_NAME = "E2E Composer Model";
const OP_CREDITS = 5;

// The timeline's operations are fixed model ids (music-timeline-core's
// TRACK_OPS) — each needs an active ModelPricing row for the server quote
// and the async route's runnable-model check.
const OP_MODELS = [
  "upload-and-extend-audio",
  "replace-section",
  "upload-and-cover-audio",
  "add-vocals",
  "add-instrumental",
  "separate-vocals",
];

function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

async function seedMusicModels() {
  await withTestDb(async (prisma) => {
    const rows = [
      { modelId: COMPOSER_ID, displayName: COMPOSER_NAME, capability: "audio" },
      ...OP_MODELS.map((id) => ({ modelId: id, displayName: `E2E ${id}`, capability: "audio" })),
    ];
    for (const r of rows) {
      const data = {
        modelType: "audio",
        providerName: "kie",
        displayName: r.displayName,
        capability: r.capability,
        providerCost: 0.01,
        creditsCost: OP_CREDITS,
        isActive: true,
        isDeprecated: false,
      };
      await prisma.modelPricing.upsert({
        where: { modelId: r.modelId },
        update: data,
        create: { modelId: r.modelId, ...data },
      });
    }
  });
}

test("compose → track appears → select → range → Extend quotes and submits", async ({ page }) => {
  test.setTimeout(120_000);
  await stubProviders(page);
  await seedMusicModels();

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "mtl" });
  });
  await loginThroughForm(page, user);

  const prompt = `E2E timeline track ${Date.now()}`;

  await page.goto("/studio/music");
  await expect(page.locator(".st-app:visible")).toBeVisible();
  await expect.poll(() => page.locator(".st-app").count(), { timeout: 20000 }).toBe(1);

  // Compose through the normal flow — the result is a Generation, and the
  // workbench's track list refreshes to include it.
  const model = visible(page.locator(".st-model", { hasText: COMPOSER_NAME }));
  await model.click();
  const brief = visible(page.getByLabel("Creative brief"));
  await brief.fill(prompt);
  await visible(page.getByRole("button", { name: /^Compose/ })).click();

  const trackRow = visible(page.locator(".st-mtl__track", { hasText: prompt.slice(0, 40) }));
  await expect(trackRow).toBeVisible({ timeout: 45000 });

  // Select the track: the duration-scaled timeline bar and its range grips
  // appear (duration read from the submitted params when the fixture file
  // carries no audio metadata).
  await trackRow.click();
  await expect(visible(page.getByRole("group", { name: "Track timeline" }))).toBeVisible();
  const startGrip = visible(page.getByRole("slider", { name: "Selection start" }));
  const endGrip = visible(page.getByRole("slider", { name: "Selection end" }));
  await expect(startGrip).toBeVisible();
  await expect(endGrip).toBeVisible();
  await expect(endGrip).toHaveAttribute("aria-valuenow", "60");

  // Keyboard range editing: the grips are real sliders.
  await startGrip.focus();
  await page.keyboard.press("ArrowRight");
  await expect(startGrip).toHaveAttribute("aria-valuenow", "0.5");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(startGrip).toHaveAttribute("aria-valuenow", "5.5");

  // Replace-section surfaces its documented window rules instead of firing
  // a guaranteed 422: the selection still covers ~the whole track.
  const opChips = visible(page.getByRole("group", { name: "Track operation" }));
  await opChips.getByRole("button", { name: "Replace section" }).click();
  await expect(visible(page.getByText(/at most half the track/))).toBeVisible();

  // Extend: quoted server-side (the seeded row's 5 credits appear on the
  // button) and submitted through the ordinary generation flow.
  await opChips.getByRole("button", { name: "Extend", exact: true }).click();
  const opBrief = visible(page.getByLabel("Operation brief"));
  await opBrief.fill("longer outro, fade slowly");
  const runBtn = visible(page.locator(".st-mtl .hs-btn--primary"));
  await expect(runBtn).toContainText(String(OP_CREDITS), { timeout: 15000 });
  await runBtn.click();

  // The op completes through the worker and lands in the list as a second
  // track — results are Generations like any other.
  await expect(visible(page.locator(".st-mtl__track", { hasText: "longer outro" }))).toBeVisible({ timeout: 45000 });
});

test("the workbench is honest when there is nothing yet", async ({ page }) => {
  await stubProviders(page);
  await seedMusicModels();

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 100, label: "mtl-empty" });
  });
  await loginThroughForm(page, user);

  await page.goto("/studio/music");
  await expect(page.locator(".st-app:visible")).toBeVisible();
  await expect(visible(page.getByText(/Nothing here yet\. Compose a track above/))).toBeVisible({ timeout: 20000 });
  // No track selected — no timeline, no op buttons.
  await expect(page.getByRole("group", { name: "Track timeline" })).toHaveCount(0);
});
