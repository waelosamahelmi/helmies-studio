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

// ── BUG 1: non-generation documentation endpoints filed as "models" ────────
// Measured on live production (2026-08-05): five Suno voice-clone doc pages
// (webhook callback, request validator, status/record lookup) were ACTIVE
// in the audio pool. classifyNonGenerationEndpoint (catalog-verification.mjs)
// is a deterministic, zero-network id-pattern classifier the sync now runs
// on EVERY pass — new or pre-existing row alike — so these are deactivated
// without waiting for scripts/verify-catalog.mjs's probe sweep.
describe("syncKieModels — deterministically deactivates non-generation documentation endpoints", () => {
  const JUNK_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://docs.kie.ai/suno-api/suno-voice-generate-callback</loc></url>
  <url><loc>https://docs.kie.ai/suno-api/suno-voice-record-info</loc></url>
  <url><loc>https://docs.kie.ai/suno-api/suno-voice-validate</loc></url>
  <url><loc>https://docs.kie.ai/suno-api/suno-voice-validate-callback</loc></url>
  <url><loc>https://docs.kie.ai/suno-api/suno-voice-validate-info</loc></url>
  <url><loc>https://docs.kie.ai/suno-api/suno-voice-generate</loc></url>
</urlset>`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(JUNK_SITEMAP_XML) }));
    prismaMock.modelPricing.create.mockResolvedValue({});
    prismaMock.modelPricing.update.mockResolvedValue({});
  });

  afterEach(() => vi.unstubAllGlobals());

  it("creates every one of the five junk endpoints inactive with a not-callable verdict — never merely 'pending'", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([]);

    const result = await syncKieModels();

    expect(result.added).toBe(6); // 5 junk + the real generator
    for (const [{ data }] of prismaMock.modelPricing.create.mock.calls) {
      if (data.modelId === "suno-voice-generate") continue;
      expect(data.isActive, `${data.modelId} should be created inactive`).toBe(false);
      expect(data.constraints[VERIFICATION_KEY]).toMatchObject({
        verdict: "not-callable", callable: false, method: "static-id-rule",
      });
    }
  });

  it("never resurrects a junk endpoint that predates this fix and is currently ACTIVE (the measured production state)", async () => {
    const junkId = "suno-voice-validate";
    prismaMock.modelPricing.findMany.mockResolvedValue([
      { modelId: junkId, isActive: true, constraints: {} },
    ]);

    await syncKieModels();

    const call = prismaMock.modelPricing.update.mock.calls.find(([{ where }]) => where.modelId === junkId);
    expect(call, "expected an update for the junk id").toBeTruthy();
    expect(call[0].data.isActive).toBe(false);
    expect(call[0].data.constraints[VERIFICATION_KEY]).toMatchObject({ verdict: "not-callable", callable: false });
  });

  it("leaves the real generator these doc pages are about completely unaffected (pending, as any brand-new slug is)", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([]);

    await syncKieModels();

    const call = prismaMock.modelPricing.create.mock.calls.find(([{ data }]) => data.modelId === "suno-voice-generate");
    expect(call).toBeTruthy();
    expect(call[0].data.isActive).toBe(false); // brand-new slug: pending, not a rejection
    expect(call[0].data.constraints[VERIFICATION_KEY]).toMatchObject({ status: STATUS_PENDING, callable: null });
  });

  it("the static rule OVERRIDES a stale verified-callable verdict a probe once wrote — the id shape is authoritative", async () => {
    const junkId = "suno-voice-record-info";
    prismaMock.modelPricing.findMany.mockResolvedValue([{
      modelId: junkId,
      isActive: true,
      constraints: { [VERIFICATION_KEY]: { status: "verified", callable: true, verdict: "callable" } },
    }]);

    await syncKieModels();

    const call = prismaMock.modelPricing.update.mock.calls.find(([{ where }]) => where.modelId === junkId);
    expect(call[0].data.isActive).toBe(false);
    expect(call[0].data.constraints[VERIFICATION_KEY].verdict).toBe("not-callable");
  });
});
