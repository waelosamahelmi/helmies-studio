// BUG 1, sync side — syncKieModels used to write `isActive: true`
// unconditionally on every row it touched, so the nightly cron undid every
// deactivation: an operator's, and (once it exists) the verification sweep's.
// Combined with a catalog built from DOC-PAGE SLUGS rather than callable
// model ids, that is how 84% of production generations came to fail against
// models the provider has never heard of.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VERIFICATION_KEY, STATUS_PENDING } from "@/lib/catalog-verification.mjs";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { modelPricing: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { syncKieModels } from "@/lib/kie-sync";

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://docs.kie.ai/market/nano-banana-pro/text-to-image</loc></url>
</urlset>`;
const MODEL_ID = "nano-banana-pro/text-to-image";

function updatedData() {
  expect(prismaMock.modelPricing.update).toHaveBeenCalled();
  return prismaMock.modelPricing.update.mock.calls[0][0].data;
}
function createdData() {
  expect(prismaMock.modelPricing.create).toHaveBeenCalled();
  return prismaMock.modelPricing.create.mock.calls[0][0].data;
}

describe("syncKieModels — verification-aware activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SITEMAP_XML) }));
    prismaMock.modelPricing.create.mockResolvedValue({});
    prismaMock.modelPricing.update.mockResolvedValue({});
  });

  afterEach(() => vi.unstubAllGlobals());

  it("never resurrects a model the sweep proved is not callable", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([{
      modelId: MODEL_ID,
      isActive: false,
      constraints: { [VERIFICATION_KEY]: { status: "verified", callable: false, verdict: "not-callable", reason: "The model name you specified is not supported." } },
    }]);

    await syncKieModels();

    const data = updatedData();
    expect(data.isActive).toBe(false);
    expect(data.constraints[VERIFICATION_KEY]).toMatchObject({ callable: false, verdict: "not-callable" });
  });

  it("keeps a verified-callable model active", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([{
      modelId: MODEL_ID,
      isActive: true,
      constraints: { [VERIFICATION_KEY]: { status: "verified", callable: true, verdict: "callable" } },
    }]);

    await syncKieModels();
    expect(updatedData().isActive).toBe(true);
  });

  it("leaves a pre-existing row that has never been verified exactly as it is (shipping this cannot take the catalog offline)", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([{ modelId: MODEL_ID, isActive: true, constraints: {} }]);
    await syncKieModels();
    expect(updatedData().isActive).toBe(true);

    vi.clearAllMocks();
    prismaMock.modelPricing.update.mockResolvedValue({});
    prismaMock.modelPricing.findMany.mockResolvedValue([{ modelId: MODEL_ID, isActive: false, constraints: {} }]);
    await syncKieModels();
    expect(updatedData().isActive).toBe(false);
  });

  it("creates a NEWLY-discovered sitemap slug inactive and pending verification — never presented as usable on a guess", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([]);

    const result = await syncKieModels();

    expect(result.added).toBe(1);
    const data = createdData();
    expect(data.isActive).toBe(false);
    expect(data.constraints[VERIFICATION_KEY]).toMatchObject({ status: STATUS_PENDING, callable: null });
  });

  it("carries a sweep-discovered required field forward instead of overwriting the schema with a fresh guess", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([{
      modelId: MODEL_ID,
      isActive: true,
      constraints: { [VERIFICATION_KEY]: { status: "verified", callable: true, verdict: "needs-param" } },
      inputSchema: { fields: {}, providerRequired: ["aspect_ratio"] },
    }]);

    await syncKieModels();

    const data = updatedData();
    expect(data.inputSchema.providerRequired).toEqual(["aspect_ratio"]);
    // …and the freshly-derived fields are still there.
    expect(data.inputSchema.fields.prompt).toBeTruthy();
  });
});
