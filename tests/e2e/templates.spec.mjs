// Helmies Studio — E2E: template library + executable workflow templates
// (Phase 6 Task 5)
//
// Every test here mints its OWN fixtures via fixtures/db.mjs's withTestDb
// (a fresh isolated user, and — for the run journey — a dedicated
// ModelPricing row + Template + published TemplateVersion) rather than
// relying on scripts/seed-templates.mjs's twelve contract templates having
// been run against this database — this suite must pass regardless of
// whether that seed script has ever been run here, and playwright.config.mjs
// runs fullyParallel, so sharing fixtures with another test risks flaky
// cross-talk exactly like generation.spec.mjs's header explains for its own
// per-test isolated users.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

// A single reusable, quotable ModelPricing fixture — upserted (idempotent,
// like fixtures/seed.mjs's ensureImageModel) rather than created fresh per
// test, since its id is fixed and shared. Unlike seed.mjs's own
// E2E_IMAGE_MODEL_ID (no pricingRules — that fixture only ever needs
// creditsCost for the legacy generate/* routes), this one needs REAL
// pricingRules + inputSchema because src/lib/template-quote.js's
// quoteTemplate goes through the full quoteCatalogModel path (Phase 2's
// "ModelPricing is the only trustworthy price source" invariant applies
// here exactly as it does everywhere else).
const E2E_WORKFLOW_MODEL_ID = "e2e-workflow-model";

async function ensureWorkflowModel(prisma) {
  const data = {
    modelType: "image",
    providerName: "kie",
    endpoint: "e2e-workflow-endpoint",
    displayName: "E2E Workflow Model",
    inputSchema: { fields: { prompt: { type: "string", required: true, maxLength: 500 } } },
    pricingRules: { currency: "USD", unit: "fixed", rules: [{ price: 0.01 }] },
    billingUnit: "fixed",
    currency: "USD",
    providerCost: 0.01,
    creditsCost: 3,
    isActive: true,
    isDeprecated: false,
  };
  await prisma.modelPricing.upsert({
    where: { modelId: E2E_WORKFLOW_MODEL_ID },
    update: data,
    create: { modelId: E2E_WORKFLOW_MODEL_ID, ...data },
  });
}

function workflowGraph() {
  return {
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: E2E_WORKFLOW_MODEL_ID,
        dependsOn: [],
        inputs: { prompt: "E2E workflow test — step one" },
      },
      {
        id: "step2",
        tool: "image",
        modelId: E2E_WORKFLOW_MODEL_ID,
        dependsOn: ["step1"],
        // `reference` isn't a field the fixture model's schema declares —
        // validateModelInput only checks declared fields, so an extra key
        // carrying a $stepN.output placeholder is exactly how a real
        // chained step (e.g. image_url) would look, without needing the
        // fixture model to actually consume it.
        inputs: { prompt: "E2E workflow test — step two", reference: "$step1.output" },
      },
    ],
    sampleInputs: {},
  };
}

async function createWorkflowTemplate(prisma, { category, featured = true } = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const template = await prisma.template.create({
    data: {
      slug: `e2e-workflow-${stamp}`,
      name: `E2E Workflow Template ${stamp}`,
      description: "An E2E fixture executable workflow template.",
      category: category || `e2e-workflow-category-${stamp}`,
      toolType: "workflows",
      config: { workflow: true },
      isPublished: true,
      isFeatured: featured,
    },
  });
  await prisma.templateVersion.create({
    data: { templateId: template.id, version: 1, graph: workflowGraph(), status: "published" },
  });
  return template;
}

test.describe("Templates library and executable workflow templates (Phase 6 Task 5)", () => {
  test("the library lists published templates and filters by category", async ({ page }) => {
    const stamp = Date.now();
    let alpha, beta;
    await withTestDb(async (prisma) => {
      alpha = await prisma.template.create({
        data: {
          slug: `e2e-list-alpha-${stamp}`,
          name: `E2E List Alpha ${stamp}`,
          category: `e2e-cat-alpha-${stamp}`,
          toolType: "workflows",
          config: {},
          isPublished: true,
          isFeatured: true,
        },
      });
      beta = await prisma.template.create({
        data: {
          slug: `e2e-list-beta-${stamp}`,
          name: `E2E List Beta ${stamp}`,
          category: `e2e-cat-beta-${stamp}`,
          toolType: "workflows",
          config: {},
          isPublished: true,
          isFeatured: true,
        },
      });
    });

    await page.goto("/templates");
    await expect(page.getByRole("link", { name: alpha.name })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: beta.name })).toBeVisible();

    await page.getByRole("button", { name: alpha.category, exact: true }).click();
    await expect(page.getByRole("link", { name: alpha.name })).toBeVisible();
    await expect(page.getByRole("link", { name: beta.name })).not.toBeVisible();
  });

  test("a detail page shows the quote before running, and Use template starts a run with per-step status", async ({
    page,
  }) => {
    await stubProviders(page);

    let user, template;
    await withTestDb(async (prisma) => {
      await ensureWorkflowModel(prisma);
      user = await createIsolatedUser(prisma, { credits: 500, label: "tpl-run" });
      template = await createWorkflowTemplate(prisma);
    });
    await loginThroughForm(page, user);

    await page.goto(`/templates/${template.slug}`);

    // The quote — server-computed credits, never a client guess — is
    // visible BEFORE any run exists.
    await expect(page.getByText(/\d+ credits/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("template-run-status")).toHaveCount(0);

    const useButton = page.getByRole("button", { name: "Use template" });
    await expect(useButton).toBeEnabled();
    await useButton.click();

    // The run appears with per-step status, and — real completion through
    // the durable job runner (playwright.config.mjs's "worker" webServer,
    // E2E_MOCK_PROVIDERS), not a page.route fake — both steps eventually
    // reach "completed".
    await expect(page.getByTestId("template-run-status")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("step1")).toBeVisible();
    await expect(page.getByText("step2")).toBeVisible();
    await expect(page.getByTestId("template-run-overall-status")).toHaveText(/completed/i, {
      timeout: 45000,
    });
  });

  test("starting a run without enough credits reports 402, not a run", async ({ page }) => {
    await stubProviders(page);

    let user, template;
    await withTestDb(async (prisma) => {
      await ensureWorkflowModel(prisma);
      user = await createIsolatedUser(prisma, { credits: 1, label: "tpl-poor" });
      template = await createWorkflowTemplate(prisma);
    });
    await loginThroughForm(page, user);

    await page.goto(`/templates/${template.slug}`);
    await expect(page.getByText(/\d+ credits/)).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Use template" }).click();

    await expect(page.getByText(/not enough credits/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("template-run-status")).toHaveCount(0);
  });

  test("an unpublished template never leaks its content to a normal user", async ({ page }) => {
    // NOTE ON WHAT THIS DOES *NOT* ASSERT: an HTTP status code. Verified
    // separately (and unrelated to this template-publish gate at all): even
    // the page's own PRE-EXISTING `if (!t) notFound()` branch — for a plain
    // nonexistent slug, nothing to do with publish status — returns HTTP 200
    // in this app today. Root cause: src/app/loading.js is a ROOT
    // `loading.js`, so Next's App Router wraps every dynamic page in an
    // implicit Suspense boundary and streams that fallback (200) before this
    // page's async data/notFound() call resolves; once notFound() throws,
    // the streamed BODY correctly swaps to the not-found UI, but the status
    // code was already flushed and can't be changed after the fact — a
    // well-documented Next.js streaming-SSR constraint, not a property of
    // this feature. Restructuring the root Suspense boundary to fix the
    // status code site-wide is out of scope for this task ("wiring, not a
    // redesign") and would risk every other page relying on the current
    // loading.js — so this test asserts the property that actually protects
    // users instead: the unpublished template's own name, description, and
    // graph/step detail are never present in the rendered page, and the
    // genuine not-found UI renders in their place.
    let user, template;
    await withTestDb(async (prisma) => {
      await ensureWorkflowModel(prisma);
      user = await createIsolatedUser(prisma, { credits: 100, label: "tpl-404" });
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      template = await prisma.template.create({
        data: {
          slug: `e2e-unpublished-${stamp}`,
          name: `E2E Unpublished Fixture ${stamp} — must never render`,
          description: `Secret unpublished description ${stamp}`,
          category: "e2e-unpublished",
          toolType: "workflows",
          config: {},
          isPublished: false,
        },
      });
      // Also carries a graph, so a leak of step/prompt detail (not just the
      // Template row's own name/description) would be caught too.
      await prisma.templateVersion.create({
        data: { templateId: template.id, version: 1, graph: workflowGraph(), status: "draft" },
      });
    });
    await loginThroughForm(page, user);

    await page.goto(`/templates/${template.slug}`);

    // The real not-found UI renders (not a blank/error page, and not the
    // template's own content).
    await expect(page.getByRole("heading", { name: "No page at this address" })).toBeVisible();
    await expect(page).toHaveTitle(/not found/i);

    // None of the unpublished template's own data is present anywhere on
    // the page: name, description, or its graph's step prompts.
    await expect(page.getByText(template.name)).toHaveCount(0);
    await expect(page.getByText(template.description)).toHaveCount(0);
    for (const step of workflowGraph().steps) {
      await expect(page.getByText(step.inputs.prompt)).toHaveCount(0);
    }
  });
});
