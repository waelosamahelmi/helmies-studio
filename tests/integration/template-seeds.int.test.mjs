// Phase 6 Task 4 — the twelve contract templates must all be publishable
// against a REAL (offline-synced) catalog: validateGraph passes and
// canPublish returns ok for every one of them. A template referencing a
// model the catalog doesn't have must fail loudly, naming the template and
// the model — proven directly against canPublish, the same gate the
// publish route (Task 2) and the seed script (this task) both use.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./setup.mjs";
import { TEMPLATE_SEEDS } from "@/lib/template-seeds";
import { validateGraph } from "@/lib/template-graph";

let prisma;

beforeEach(async () => {
  prisma = await resetDb();
  // resetDb()'s own TRUNCATE list (tests/integration/setup.mjs) deliberately
  // doesn't include Template/TemplateVersion/ModelPricing — most suites
  // never touch them. This file is the exception: every test here creates
  // Template rows by a FIXED slug (the seeds' own real slugs), so leftover
  // rows from a prior test in this same file would collide on the unique
  // slug constraint. Safe to truncate here because
  // vitest.integration.config.mjs runs test FILES sequentially
  // (fileParallelism: false) — nothing else is using these tables
  // concurrently.
  await prisma.$executeRawUnsafe(
    `TRUNCATE "public"."Template", "public"."TemplateVersion", "public"."ModelPricing" RESTART IDENTITY CASCADE`
  );
});

async function seedCatalog() {
  const { syncAlibabaModels } = await import("@/lib/model-catalog");
  return syncAlibabaModels(); // real ModelPricing rows, real pricingRules — no network
}

async function createDraftVersion(seed) {
  const template = await prisma.template.create({
    data: {
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      category: seed.category,
      toolType: seed.toolType,
      pricingModel: seed.pricingModel,
      oneTimePrice: seed.oneTimePrice,
      config: seed.config,
      isPublished: false,
      isFeatured: seed.isFeatured,
      usageLimit: seed.usageLimit,
    },
  });
  const version = await prisma.templateVersion.create({
    data: { templateId: template.id, version: 1, graph: seed.graph, status: "draft" },
  });
  return { template, version };
}

describe("TEMPLATE_SEEDS — structure", () => {
  it("exports exactly twelve templates, keyed A–L per the contract, with unique slugs", () => {
    expect(TEMPLATE_SEEDS).toHaveLength(12);
    const slugs = TEMPLATE_SEEDS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(12);
    expect(slugs).toEqual([
      "product-launch-campaign",
      "restaurant-content-pack",
      "ai-influencer-campaign",
      "ugc-product-ad",
      "ecommerce-photography-pack",
      "local-business-ad-pack",
      "music-visualizer-pack",
      "podcast-clip-factory",
      "brand-identity-starter",
      "real-estate-listing-pack",
      "app-launch-pack",
      "one-brief-to-campaign",
    ]);
  });

  it("every seed's graph is structurally valid (validateGraph)", () => {
    for (const seed of TEMPLATE_SEEDS) {
      const result = validateGraph(seed.graph);
      expect(result.valid, `${seed.slug}: ${result.errors.join("; ")}`).toBe(true);
    }
  });

  it("the restaurant, influencer, and real-estate templates carry the safety notes the contract requires", () => {
    const bySlug = Object.fromEntries(TEMPLATE_SEEDS.map((t) => [t.slug, t]));
    expect(bySlug["restaurant-content-pack"].graph.safetyNotes.join(" ")).toMatch(/allergen/i);
    expect(bySlug["ai-influencer-campaign"].graph.safetyNotes.join(" ")).toMatch(/public figure|real, identifiable person/i);
    expect(bySlug["real-estate-listing-pack"].graph.safetyNotes.join(" ")).toMatch(/virtual staging/i);
  });
});

describe("TEMPLATE_SEEDS — every one of the twelve passes the real publish gate", () => {
  it("canPublish returns ok for all twelve seeds against a freshly synced real catalog", async () => {
    const { canPublish } = await import("@/lib/template-quote");
    await seedCatalog();

    const failures = [];
    for (const seed of TEMPLATE_SEEDS) {
      const { template } = await createDraftVersion(seed);
      const gate = await canPublish(template.id, 1);
      if (!gate.ok) failures.push(`${seed.slug}: ${gate.reasons.join("; ")}`);
    }

    expect(failures, `template(s) failed the publish gate:\n${failures.join("\n")}`).toEqual([]);
  });

  it("every step's modelId actually resolves to an active, non-deprecated ModelPricing row", async () => {
    await seedCatalog();
    const missing = [];
    for (const seed of TEMPLATE_SEEDS) {
      for (const step of seed.graph.steps) {
        const row = await prisma.modelPricing.findUnique({ where: { modelId: step.modelId } });
        if (!row) missing.push(`${seed.slug} / ${step.id}: model "${step.modelId}" not in ModelPricing`);
        else if (!row.isActive || row.isDeprecated) {
          missing.push(`${seed.slug} / ${step.id}: model "${step.modelId}" is inactive/deprecated`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});

describe("canPublish — fails loudly, naming the template and model, when a model doesn't exist", () => {
  it("names the missing model in the refusal reason", async () => {
    const { canPublish } = await import("@/lib/template-quote");
    await seedCatalog();

    const template = await prisma.template.create({
      data: {
        slug: "broken-model-fixture",
        name: "Broken Model Fixture",
        category: "marketing",
        toolType: "workflows",
        config: {},
      },
    });
    const brokenGraph = {
      steps: [
        {
          id: "step1",
          tool: "image",
          modelId: "alibaba:does-not-exist",
          dependsOn: [],
          inputs: { prompt: "x" },
        },
      ],
      sampleInputs: {},
    };
    await prisma.templateVersion.create({ data: { templateId: template.id, version: 1, graph: brokenGraph, status: "draft" } });

    const gate = await canPublish(template.id, 1);

    expect(gate.ok).toBe(false);
    const combined = gate.reasons.join(" ");
    expect(combined).toContain("step1");
    expect(combined).toContain("alibaba:does-not-exist");
    expect(combined).toMatch(/does not exist/);
  });
});
