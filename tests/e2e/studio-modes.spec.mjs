// Helmies Studio — S1 consolidated studios: modes, pools, and legacy slugs
//
// The 20-tool rail became mode-switching studios. Three families of
// assertion, per the S1 plan:
//   (a) each consolidated studio renders each of its modes, and each mode
//       lists ONLY its capability pool (an upscaler never appears in
//       Create; a composer never appears in Tools);
//   (b) every retired slug redirects to the right studio + `?mode=`
//       (bookmarks must not break — the whole point of the redirect table
//       in src/app/studio/[tool]/page.js);
//   (c) mode state lives in the URL: switching modes rewrites `?mode=`, and
//       reloading that URL lands on the same mode (shareable links).
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb } from "./fixtures/db.mjs";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";

test.use({ storageState: USER_AUTH_FILE });

const PROMPT_FIELD = { prompt: { type: "string", required: true, maxLength: 5000 } };

// Idempotent upserts, same pattern as fixtures/seed.mjs — the shared test DB
// is never truncated, and ids are prefixed e2e-sm- so this spec never
// collides with video-modes/audio-modes seeding the same shapes in a
// parallel worker. Audio ids carry the SAME tokens audioKind reads on the
// real catalog (tts, audio-isolation) — that token inference decides the
// Tools pool.
const MODELS = [
  // Image
  { modelId: "e2e-sm-tti-model", modelType: "image", capability: "text-to-image", displayName: "E2E SM Create Model" },
  { modelId: "e2e-sm-edit-model", modelType: "image", capability: "image-edit", displayName: "E2E SM Edit Model" },
  { modelId: "e2e-sm-upscale-model", modelType: "image", capability: "image-upscale", displayName: "E2E SM Upscale Model" },
  // Video
  { modelId: "e2e-sm-ttv-model", modelType: "video", capability: "text-to-video", displayName: "E2E SM Text Video Model" },
  { modelId: "e2e-sm-i2v-model", modelType: "i2v", capability: "image-to-video", displayName: "E2E SM Image Video Model" },
  { modelId: "e2e-sm-v2v-model", modelType: "v2v", capability: "video-to-video", displayName: "E2E SM Restyle Model" },
  // Audio
  { modelId: "e2e-sm-tts-model", modelType: "audio", capability: "text-to-speech", displayName: "E2E SM Speech Model" },
  { modelId: "e2e-sm-audio-isolation-model", modelType: "audio", capability: "audio", displayName: "E2E SM Cleanup Model" },
  // Perform
  { modelId: "e2e-sm-lipsync-model", modelType: "lipsync", capability: "lipsync", displayName: "E2E SM Sync Model" },
  { modelId: "e2e-sm-avatar-model", modelType: "lipsync", capability: "avatar-video", displayName: "E2E SM Avatar Model" },
];

async function seedModels() {
  await withTestDb(async (prisma) => {
    for (const m of MODELS) {
      const data = {
        modelType: m.modelType,
        providerName: "kie",
        displayName: m.displayName,
        capability: m.capability,
        inputSchema: { fields: PROMPT_FIELD },
        providerCost: 0.05,
        creditsCost: 10,
        isActive: true,
        isDeprecated: false,
      };
      await prisma.modelPricing.upsert({
        where: { modelId: m.modelId },
        update: data,
        create: { modelId: m.modelId, ...data },
      });
    }
  });
}

test.beforeEach(async ({ page }) => {
  await seedModels();
  await stubProviders(page);
});

function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

// The desktop inspector aside — where every Workspace-archetype mode lists
// its model pool.
const inspector = (page) => page.locator(".st-work__inspector");

/* ══════════════════════════════════════════════════════════════════════════
   (a) — each studio renders each mode with only its capability pool
   ══════════════════════════════════════════════════════════════════════════ */

test("Image: Create/Edit/Upscale pools are disjoint, Canvas mounts the editor", async ({ page }) => {
  await page.goto("/studio/image");
  const modes = page.getByRole("group", { name: "Image mode" });
  for (const name of ["Create", "Edit", "Upscale", "Canvas"]) {
    await expect(modes.getByRole("button", { name })).toBeVisible();
  }

  // Create — t2i only.
  await expect(inspector(page).getByRole("button", { name: /E2E SM Create Model/ })).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: /E2E SM Edit Model/ })).toHaveCount(0);
  await expect(inspector(page).getByRole("button", { name: /E2E SM Upscale Model/ })).toHaveCount(0);

  // Edit — i2i pool only, and the reference gate locks the brief.
  await modes.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/mode=edit/);
  await expect(inspector(page).getByRole("button", { name: /E2E SM Edit Model/ })).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: /E2E SM Create Model/ })).toHaveCount(0);
  await expect(inspector(page).getByRole("button", { name: /E2E SM Upscale Model/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Creative brief" })).toBeDisabled();

  // Upscale — the image-upscale capability only, no brief at all.
  await modes.getByRole("button", { name: "Upscale" }).click();
  await expect(page).toHaveURL(/mode=upscale/);
  await expect(inspector(page).getByRole("button", { name: /E2E SM Upscale Model/ })).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: /E2E SM Edit Model/ })).toHaveCount(0);
  // The dock action (scoped to .st-spend — the mode strip has its own
  // "Upscale" button) gates on the missing source image.
  await expect(visible(page.locator(".st-spend").getByRole("button", { name: /^Upscale/ }))).toBeDisabled();

  // Canvas — the compositing editor mounts whole.
  await modes.getByRole("button", { name: "Canvas" }).click();
  await expect(page).toHaveURL(/mode=canvas/);
  await expect(visible(page.locator(".st-canvas"))).toBeVisible({ timeout: 20000 });
});

test("Image Create: the Cinematic and Influencer preset chips carry their scaffolding", async ({ page }) => {
  await page.goto("/studio/image");
  const chips = page.getByRole("group", { name: "Create preset" }).first();
  await expect(chips.getByRole("button", { name: "Cinematic" })).toBeVisible();
  await expect(chips.getByRole("button", { name: "Influencer" })).toBeVisible();

  // Cinematic — the retired CinemaStudio's camera kit appears.
  await chips.getByRole("button", { name: "Cinematic" }).click();
  await expect(page).toHaveURL(/preset=cinematic/);
  await expect(visible(page.getByRole("group", { name: "Camera body" }))).toBeVisible();
  await expect(visible(page.getByRole("group", { name: "Light" }))).toBeVisible();

  // Influencer — the retired InfluencerStudio's persona scaffolding appears.
  await page.getByRole("group", { name: "Create preset" }).first()
    .getByRole("button", { name: "Influencer" }).click();
  await expect(page).toHaveURL(/preset=influencer/);
  await expect(visible(page.getByLabel("Persona name"))).toBeVisible();
});

test("Video: Edit folds in the v2v jobs plus Recast, Clips mounts the timeline", async ({ page }) => {
  await page.goto("/studio/video?mode=edit");
  const jobs = visible(page.getByRole("group", { name: "Edit job" }));
  for (const name of ["Restyle", "Extend", "Retime", "Recast"]) {
    await expect(jobs.getByRole("button", { name })).toBeVisible();
  }
  await expect(inspector(page).getByRole("button", { name: /E2E SM Restyle Model/ })).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: /E2E SM Text Video Model/ })).toHaveCount(0);

  // Recast job — the identity/scene pairing gates its own dock button
  // (scoped to .st-spend — the job strip has its own "Recast" button).
  await jobs.getByRole("button", { name: "Recast" }).click();
  await expect(visible(page.getByText("Drop the face or browse"))).toBeVisible();
  await expect(visible(page.locator(".st-spend").getByRole("button", { name: /^Recast/ }))).toBeDisabled();

  // Clips — the clipping timeline mounts whole.
  await visible(page.getByRole("group", { name: "Video mode" }))
    .getByRole("button", { name: "Clips" }).click();
  await expect(page).toHaveURL(/mode=clips/);
  await expect(visible(page.locator(".st-cut"))).toBeVisible({ timeout: 20000 });
});

test("Video: the Motion preset lives inside Text to Video", async ({ page }) => {
  await page.goto("/studio/video?mode=ttv&preset=motion");
  const chips = page.getByRole("group", { name: "Video preset" }).first();
  await expect(chips.getByRole("button", { name: "Motion" })).toHaveAttribute("aria-pressed", "true");
  // The motion copy replaces the generic video idle — the retired
  // MotionStudio's craft, not a separate tool.
  await expect(visible(page.getByRole("textbox", { name: "Creative brief" })))
    .toHaveAttribute("placeholder", /movement/i);
});

test("Audio: the job strip gains Tools, pooling only the utility kinds", async ({ page }) => {
  await page.goto("/studio/audio");
  const job = page.getByRole("group", { name: "Audio job" });
  for (const name of ["Speech", "Dialogue", "Voice cloning", "Sound effects", "Tools"]) {
    await expect(job.getByRole("button", { name })).toBeVisible();
  }

  // Speech (default) — tts pool, never the utilities.
  await expect(visible(page.getByRole("button", { name: /E2E SM Speech Model/ }))).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E SM Cleanup Model/ })).toHaveCount(0);

  // Tools — utilities only, never speech.
  await job.getByRole("button", { name: "Tools" }).click();
  await expect(page).toHaveURL(/mode=tools/);
  await expect(inspector(page).getByRole("button", { name: /E2E SM Cleanup Model/ })).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: /E2E SM Speech Model/ })).toHaveCount(0);
});

test("Perform: Lip Sync, Avatar and Persona each mount their own surface and pool", async ({ page }) => {
  await page.goto("/studio/perform");
  const modes = page.getByRole("group", { name: "Perform mode" });

  // Lip Sync (default) — the sync pool.
  await expect(visible(page.getByText("Sync model"))).toBeVisible();
  await expect(visible(page.getByRole("button", { name: /E2E SM Sync Model/ }))).toBeVisible();

  // Avatar — the avatar pool.
  await modes.getByRole("button", { name: "Avatar" }).click();
  await expect(page).toHaveURL(/mode=avatar/);
  await expect(visible(page.getByText("Avatar model"))).toBeVisible();
  await expect(visible(page.getByRole("button", { name: /E2E SM Avatar Model/ }))).toBeVisible();

  // Persona — the held-steady character flow, pooling t2i.
  await modes.getByRole("button", { name: "Persona" }).click();
  await expect(page).toHaveURL(/mode=persona/);
  await expect(visible(page.getByLabel("Persona name"))).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: /E2E SM Create Model/ })).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: /E2E SM Sync Model/ })).toHaveCount(0);
});

/* ══════════════════════════════════════════════════════════════════════════
   (b) — every retired slug redirects to the right studio + mode
   ══════════════════════════════════════════════════════════════════════════ */

const LEGACY = [
  { slug: "cinema", url: /\/studio\/image\?.*mode=create/, and: /preset=cinematic/ },
  { slug: "canvas", url: /\/studio\/image\?.*mode=canvas/ },
  { slug: "i2v", url: /\/studio\/video\?.*mode=i2v/ },
  { slug: "vibe-motion", url: /\/studio\/video\?.*mode=ttv/, and: /preset=motion/ },
  { slug: "video-edit", url: /\/studio\/video\?.*mode=edit/ },
  { slug: "body-swap", url: /\/studio\/video\?.*mode=edit/, and: /preset=recast/ },
  { slug: "clipping", url: /\/studio\/video\?.*mode=clips/ },
  { slug: "audio-tools", url: /\/studio\/audio\?.*mode=tools/ },
  { slug: "lipsync", url: /\/studio\/perform\?.*mode=lipsync/ },
  { slug: "avatar", url: /\/studio\/perform\?.*mode=avatar/ },
  { slug: "influencer", url: /\/studio\/perform\?.*mode=persona/ },
];

test("every legacy slug lands on its new studio and mode", async ({ page }) => {
  for (const { slug, url, and } of LEGACY) {
    await page.goto(`/studio/${slug}`);
    await expect(page, `/studio/${slug} must redirect`).toHaveURL(url);
    if (and) await expect(page, `/studio/${slug} must carry its preset`).toHaveURL(and);
    // The redirect renders a working studio, not just a URL: the shell's
    // work area mounts.
    await expect(visible(page.locator(".st-app"))).toBeVisible();
  }
});

test("a legacy slug carries its other query params across the redirect", async ({ page }) => {
  // Template deep-links and ?model= pins predate the consolidation; the
  // redirect must not strip them or old template links break silently.
  await page.goto("/studio/video-edit?model=e2e-sm-v2v-model");
  await expect(page).toHaveURL(/\/studio\/video\?.*mode=edit/);
  await expect(page).toHaveURL(/model=e2e-sm-v2v-model/);
});

/* ══════════════════════════════════════════════════════════════════════════
   (c) — mode state is shareable: the URL is the mode
   ══════════════════════════════════════════════════════════════════════════ */

test("switching modes rewrites the URL, and reloading that URL restores the mode", async ({ page }) => {
  await page.goto("/studio/image");
  const modes = page.getByRole("group", { name: "Image mode" });
  await modes.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/studio\/image\?.*mode=edit/);

  // The URL alone reproduces the view — share it, bookmark it, reload it.
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Image mode" }).getByRole("button", { name: "Edit" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(visible(page.getByText("Reference image"))).toBeVisible();
});
