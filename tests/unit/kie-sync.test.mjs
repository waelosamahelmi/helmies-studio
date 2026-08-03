import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// URGENT production fix — kie-sync.js used to write
// `${model.displayName} via the KIE Market API.` into every synced row's
// description, which is the one field every end user actually reads (even
// after providerName was hidden from the public catalog response). Measured
// on live production: 35 of 39 image-model descriptions plainly named
// "KIE". The sync has no genuinely useful description text available from
// the sitemap crawl, so it must write null instead of inventing/leaking
// anything — the UI already has an empty-state for a missing description
// (src/app/models/ModelsClient.js).
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    modelPricing: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { syncKieModels } from "@/lib/kie-sync";

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://docs.kie.ai/market/nano-banana-pro/text-to-image</loc></url>
</urlset>`;

describe("syncKieModels — description must never leak the upstream provider identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SITEMAP_XML) }),
    );
    prismaMock.modelPricing.findMany.mockResolvedValue([]);
    prismaMock.modelPricing.create.mockResolvedValue({});
    prismaMock.modelPricing.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes a description with no provider token for a newly-added model (prefers null over inventing text)", async () => {
    const result = await syncKieModels();

    expect(result.added).toBe(1);
    expect(prismaMock.modelPricing.create).toHaveBeenCalledTimes(1);
    const [{ data }] = prismaMock.modelPricing.create.mock.calls[0];
    expect(data.description).toBeNull();
    expect(data.description == null || !/kie/i.test(data.description)).toBe(true);
  });

  it("also writes no provider token in the description when updating an already-existing row", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "nano-banana-pro/text-to-image", isActive: true },
    ]);

    const result = await syncKieModels();

    expect(result.updated).toBe(1);
    expect(prismaMock.modelPricing.update).toHaveBeenCalledTimes(1);
    const [{ data }] = prismaMock.modelPricing.update.mock.calls[0];
    expect(data.description).toBeNull();
  });
});
