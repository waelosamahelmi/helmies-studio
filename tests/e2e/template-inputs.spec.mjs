// Helmies Studio — E2E: per-step template inputs (Phase 8 Task B1)
//
// Phase 6 shipped a server-authoritative quote/run contract that already
// accepts a caller-supplied `inputs[stepId][field]` override per step; this
// suite proves the UI actually WIRES to it: a declared image input shows an
// upload control, uploading and running produces a run whose step 1 really
// received the uploaded URL (not the graph's own placeholder default), and
// changing a numeric input re-quotes BEFORE running with the charged amount
// matching the last displayed quote.
//
// Same per-test-isolated-fixture pattern as templates.spec.mjs (its own
// header explains why: fullyParallel: true means sharing fixtures risks
// cross-talk between tests). This suite defines its OWN ModelPricing fixture
// (E2E_INPUT_MODEL_ID) with a REQUIRED image_url field and a
// pricing-affecting numeric field, rather than reusing templates.spec.mjs's
// E2E_WORKFLOW_MODEL_ID (whose schema is prompt-only — it has nothing to
// exercise an image control or a price-changing field against).
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

const E2E_INPUT_MODEL_ID = "e2e-input-model";

// A tiny (8-byte-signature) but genuinely valid 1x1 transparent PNG — real
// bytes, not just a MIME-type claim, because src/lib/upload-sniff.js's
// sniffMatchesMime checks the actual buffer content, not the declared
// Content-Type (Phase 3 Task 5's magic-byte upload hardening).
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// duration: 5 -> price 0.01 -> providerCost 0.01 -> credits ceil(0.01*2.5/0.01) = 3
// duration: 10 -> price 0.05 -> providerCost 0.05 -> credits ceil(0.05*2.5/0.01) = 13
// (DEFAULT_MARKUP = 2.5, creditValue = 0.01 — src/lib/model-catalog-core.mjs's
// providerCostToCredits, no ProviderConfig row for "kie" in a fresh test DB so
// the default markup applies, exactly like templates.spec.mjs's own fixture.)
async function ensureInputModel(prisma) {
  const data = {
    modelType: "image",
    providerName: "kie",
    endpoint: "e2e-input-endpoint",
    displayName: "E2E Input Model",
    inputSchema: {
      fields: {
        prompt: { type: "string", required: true, maxLength: 500 },
        // Deliberately NO baked default on the step below — required and
        // empty is exactly the state that must show an upload control and
        // block the quote until the caller supplies one.
        image_url: { type: "string", required: true, format: "uri" },
        duration: { type: "number", required: true, enum: [5, 10] },
      },
    },
    pricingRules: {
      currency: "USD",
      unit: "fixed",
      rules: [
        { when: { duration: 5 }, price: 0.01 },
        { when: { duration: 10 }, price: 0.05 },
      ],
    },
    billingUnit: "fixed",
    currency: "USD",
    providerCost: 0.01,
    creditsCost: 3,
    isActive: true,
    isDeprecated: false,
  };
  await prisma.modelPricing.upsert({
    where: { modelId: E2E_INPUT_MODEL_ID },
    update: data,
    create: { modelId: E2E_INPUT_MODEL_ID, ...data },
  });
}

function inputGraph() {
  return {
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: E2E_INPUT_MODEL_ID,
        dependsOn: [],
        inputs: { prompt: "E2E per-step input test", duration: 5 },
      },
    ],
    sampleInputs: {},
  };
}

async function createInputTemplate(prisma) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const template = await prisma.template.create({
    data: {
      slug: `e2e-inputs-${stamp}`,
      name: `E2E Per-Step Inputs ${stamp}`,
      description: "An E2E fixture template for per-step input wiring.",
      category: `e2e-inputs-category-${stamp}`,
      toolType: "workflows",
      config: { workflow: true },
      isPublished: true,
      isFeatured: true,
    },
  });
  await prisma.templateVersion.create({
    data: { templateId: template.id, version: 1, graph: inputGraph(), status: "published" },
  });
  return template;
}

test.describe("Per-step template inputs (Phase 8 Task B1)", () => {
  test("an image upload control gates the quote, and a changed numeric input re-quotes before the charged amount is fixed by a run", async ({
    page,
  }) => {
    await stubProviders(page);

    let user, template;
    await withTestDb(async (prisma) => {
      await ensureInputModel(prisma);
      user = await createIsolatedUser(prisma, { credits: 500, label: "tpl-inputs" });
      template = await createInputTemplate(prisma);
    });
    await loginThroughForm(page, user);

    await page.goto(`/templates/${template.slug}`);

    // The declared image input renders an upload control (not a text box),
    // and — because it's required with no baked default — the template
    // reports it cannot run until one is supplied.
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1, { timeout: 15000 });
    await expect(page.getByText(/can.?t run right now/i)).toBeVisible({ timeout: 15000 });

    // Upload a real image — goes through POST /api/upload (same-origin,
    // never stubbed/blocked by stubProviders) and its magic-byte check.
    await fileInput.setInputFiles({
      name: "room.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_BASE64, "base64"),
    });

    const thumb = page.locator(".hs-thumb img, .hs-thumb video").first();
    await expect(thumb).toBeVisible({ timeout: 15000 });
    const uploadedUrl = await thumb.getAttribute("src");
    expect(uploadedUrl).toBeTruthy();

    // Supplying the missing required field clears the block, and the quote
    // reflects duration:5 (the graph's own baked default) — 3 credits.
    await expect(page.getByText(/^3 credits$/)).toBeVisible({ timeout: 15000 });

    // Changing a numeric input (duration) updates the displayed quote
    // BEFORE running — re-quoted from the server, never a client guess.
    await page.getByRole("button", { name: "10s" }).click();
    await expect(page.getByText(/^13 credits$/)).toBeVisible({ timeout: 15000 });

    const useButton = page.getByRole("button", { name: "Use template" });
    await expect(useButton).toBeEnabled();
    await useButton.click();

    await expect(page.getByTestId("template-run-status")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("template-run-overall-status")).toHaveText(/completed/i, {
      timeout: 45000,
    });

    // The charged amount matches the LAST displayed quote (13, for
    // duration:10 — not the graph's original baked 5/3), and step 1 really
    // received the uploaded URL, not the graph's own (nonexistent)
    // placeholder default.
    await withTestDb(async (prisma) => {
      const run = await prisma.templateRun.findFirst({
        where: { templateId: template.id, userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      expect(run).toBeTruthy();
      expect(run.totalCredits).toBe(13);
      expect(run.inputs?.step1?.image_url).toBe(uploadedUrl);
      expect(run.inputs?.step1?.duration).toBe(10);

      const generationId = run.stepState?.step1?.generationId;
      expect(generationId).toBeTruthy();
      const generation = await prisma.generation.findUnique({ where: { id: generationId } });
      expect(generation?.params?.image_url).toBe(uploadedUrl);
      expect(generation?.params?.duration).toBe(10);
    });
  });
});
