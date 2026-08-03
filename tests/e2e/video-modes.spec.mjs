// Helmies Studio — separate Text-to-Video and Image-to-Video tools (EDITSv1 E1.3)
//
// Written FIRST, against a registry/VideoStudio shape that does not exist
// yet: two rail entries ("Text to Video" at /studio/video, "Image to Video"
// at /studio/i2v) both mounting VideoStudio with a fixed mode — the
// in-component mode Segmented disappears, the i2v surface requires a source
// image, and the ttv model pool includes the coarse-"video"-capability
// models that E1.1's group fix made visible.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb } from "./fixtures/db.mjs";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";

test.use({ storageState: USER_AUTH_FILE });

const PROMPT_FIELD = { prompt: { type: "string", required: true, maxLength: 5000 } };
const VIDEO_COMMON_FIELDS = {
  duration: { type: "number", required: false, enum: [5, 8, 10] },
  resolution: { type: "string", required: false, enum: ["480p", "720p", "1080p"] },
  aspect_ratio: { type: "string", required: false, enum: ["16:9", "9:16", "1:1"] },
};

// Idempotent upserts, same pattern as fixtures/seed.mjs — the shared test DB
// is never truncated. Three models pin the three catalog shapes the split
// must honor: a proper text-to-video row, a coarse-"video" row (the ~14
// real production models E1.1 made visible), and an image-to-video row.
const VIDEO_MODELS = [
  {
    modelId: "e2e-ttv-model",
    modelType: "video",
    capability: "text-to-video",
    displayName: "E2E Text Video Model",
    inputSchema: { fields: { ...PROMPT_FIELD, ...VIDEO_COMMON_FIELDS } },
  },
  {
    modelId: "e2e-coarse-video-model",
    modelType: "video",
    capability: "video",
    displayName: "E2E Coarse Video Model",
    inputSchema: { fields: { ...PROMPT_FIELD, ...VIDEO_COMMON_FIELDS } },
  },
  {
    modelId: "e2e-i2v-model",
    modelType: "i2v",
    capability: "image-to-video",
    displayName: "E2E Image Video Model",
    inputSchema: {
      fields: {
        ...PROMPT_FIELD,
        image_url: { type: "string", required: true, format: "uri" },
        ...VIDEO_COMMON_FIELDS,
      },
    },
  },
];

async function seedVideoModels() {
  await withTestDb(async (prisma) => {
    for (const m of VIDEO_MODELS) {
      const data = {
        modelType: m.modelType,
        providerName: "kie",
        displayName: m.displayName,
        capability: m.capability,
        inputSchema: m.inputSchema,
        providerCost: 0.1,
        creditsCost: 25,
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

const PROVIDER_TOKENS = /\b(kie|alibaba|dashscope|wavespeed|openrouter)\b/i;

test.beforeEach(async ({ page }) => {
  await seedVideoModels();
  await stubProviders(page);
});

test("the instrument rail lists Text to Video and Image to Video as separate tools", async ({ page }) => {
  await page.goto("/studio/video");
  const rail = page.getByRole("navigation", { name: "Instruments" });
  await expect(rail.getByRole("button", { name: "Text to Video" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Image to Video" })).toBeVisible();
});

test("Text to Video: no mode switcher, no image requirement, and the pool includes coarse-video models", async ({ page }) => {
  await page.goto("/studio/video");

  // The in-component Segmented is gone when the mode is fixed by the tool.
  await expect(page.getByRole("group", { name: "Generation mode" })).toHaveCount(0);
  await expect(page.getByText("Source image")).toHaveCount(0);

  // Model pool: the proper text-to-video model AND the coarse-"video" model
  // (invisible before E1.1's group fix) are both listed, with credits.
  const picker = page.locator(".st-work__inspector");
  await expect(picker.getByRole("button", { name: /E2E Text Video Model/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /E2E Coarse Video Model/ })).toBeVisible();
  // The i2v-only model must NOT be offered on the text surface.
  await expect(picker.getByRole("button", { name: /E2E Image Video Model/ })).toHaveCount(0);
  expect(await picker.locator(".st-model").count()).toBeGreaterThanOrEqual(2);
  await expect(picker.getByText("25 cr").first()).toBeVisible();

  // Text-to-video needs no source: the brief is live immediately.
  await expect(page.getByRole("textbox", { name: "Creative brief" })).toBeEnabled();
});

test("Image to Video: requires a source image before the brief unlocks, pool is i2v-only", async ({ page }) => {
  await page.goto("/studio/i2v");

  await expect(page.getByRole("group", { name: "Generation mode" })).toHaveCount(0);

  // The source-image uploader is the gate: with nothing loaded the brief
  // (and therefore Generate) stays locked.
  await expect(page.getByText("Source image").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Creative brief" })).toBeDisabled();

  const picker = page.locator(".st-work__inspector");
  await expect(picker.getByRole("button", { name: /E2E Image Video Model/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /E2E Text Video Model/ })).toHaveCount(0);
  await expect(picker.getByRole("button", { name: /E2E Coarse Video Model/ })).toHaveCount(0);
  expect(await picker.locator(".st-model").count()).toBeGreaterThanOrEqual(1);
});

test("neither video surface leaks an upstream provider name", async ({ page }) => {
  for (const path of ["/studio/video", "/studio/i2v"]) {
    await page.goto(path);
    await expect(page.locator(".st-work__inspector .st-model").first()).toBeVisible();
    // `:visible` + .first(): React 19's streaming SSR briefly renders the
    // resolved Suspense content twice (see smoke.spec.mjs's note) — a bare
    // #studio-work locator can catch both and trip strict mode.
    const text = await page.locator("#studio-work:visible").first().innerText();
    expect(text, `${path} must not name an upstream provider`).not.toMatch(PROVIDER_TOKENS);
  }
});
