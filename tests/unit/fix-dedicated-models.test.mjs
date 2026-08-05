// scripts/fix-dedicated-models.mjs — the seven dedicated-API rows become
// honest: video rows video-typed, real curated schemas, extend rows parked
// inactive until a taskId affordance exists, extend-video's 75cr outlier
// re-derived to fast-mode parity (8cr).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findMany: vi.fn(), update: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { run, fixForRow, DEDICATED_ROW_FIXES, EXTEND_VIDEO_CREDITS, EXTEND_NO_UI_REASON } from "../../scripts/fix-dedicated-models.mjs";
import { schemaForModel } from "../../src/lib/model-catalog-core.mjs";
import { readVerification, verificationAllowsActive } from "../../src/lib/catalog-verification.mjs";

const auditRows = [
  // Exactly as the audits recorded the live rows (video-dedicated.md / image-dedicated.md).
  { id: "a", modelId: "generate-4-o-image", capability: "text-to-image", modelType: "image", inputSchema: { fields: { prompt: {} } }, creditsCost: 8, isActive: true, constraints: null },
  { id: "b", modelId: "generate-or-edit-image", capability: "image-to-image", modelType: "i2i", inputSchema: { fields: { prompt: {} } }, creditsCost: 10, isActive: true, constraints: null },
  { id: "c", modelId: "generate-ai-video", capability: "text-to-image", modelType: "image", inputSchema: null, creditsCost: 13, isActive: true, constraints: null },
  { id: "d", modelId: "generate-aleph-video", capability: "text-to-image", modelType: "image", inputSchema: null, creditsCost: 8, isActive: true, constraints: null },
  { id: "e", modelId: "generate-veo-3-video", capability: "text-to-image", modelType: "image", inputSchema: null, creditsCost: 8, isActive: true, constraints: null },
  { id: "f", modelId: "extend-video", capability: "text-to-video", modelType: "video", inputSchema: null, creditsCost: 75, isActive: true, constraints: null },
  { id: "g", modelId: "extend-ai-video", capability: "text-to-video", modelType: "video", inputSchema: null, creditsCost: 13, isActive: true, constraints: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  prisma.modelPricing.findMany.mockResolvedValue(auditRows);
});

describe("fixForRow", () => {
  it("makes the misfiled Runway/Aleph/Veo rows VIDEO-typed with their real schemas, active", () => {
    const runway = fixForRow(auditRows[2]);
    expect(runway).toMatchObject({ capability: "text-to-video", modelType: "video" });
    expect(runway.inputSchema).toEqual(schemaForModel("generate-ai-video", "text-to-video"));
    const aleph = fixForRow(auditRows[3]);
    expect(aleph).toMatchObject({ capability: "video-to-video", modelType: "v2v" });
    const veo = fixForRow(auditRows[4]);
    expect(veo).toMatchObject({ capability: "text-to-video", modelType: "video" });
    expect(veo.isActive).toBeUndefined(); // already active — untouched
  });

  it("re-files Flux Kontext as text-to-image (inputImage is optional) and keeps 4o active with the real size schema", () => {
    const kontext = fixForRow(auditRows[1]);
    expect(kontext).toMatchObject({ capability: "text-to-image", modelType: "image" });
    expect(kontext.inputSchema.fields.model_tier.enum).toEqual(["flux-kontext-pro", "flux-kontext-max"]);
    const gpt4o = fixForRow(auditRows[0]);
    expect(gpt4o.inputSchema.fields.size).toMatchObject({ required: true });
    expect(gpt4o.capability).toBeUndefined(); // already correct
  });

  it("parks both extend rows INACTIVE with the no-UI note and re-derives extend-video to 8cr", () => {
    const veoExtend = fixForRow(auditRows[5]);
    expect(veoExtend.isActive).toBe(false);
    expect(veoExtend.creditsCost).toBe(EXTEND_VIDEO_CREDITS);
    const v = readVerification(veoExtend.constraints);
    expect(v.reason).toBe(EXTEND_NO_UI_REASON);
    expect(verificationAllowsActive(veoExtend.constraints)).toBe(false);
    const runwayExtend = fixForRow(auditRows[6]);
    expect(runwayExtend.isActive).toBe(false);
    expect(runwayExtend.creditsCost).toBeUndefined(); // 13 stays — only the 75 outlier is re-derived
  });

  it("is idempotent: an already-fixed row plans nothing (extends keep refreshing only checkedAt)", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const fixed = {
      ...auditRows[2],
      capability: "text-to-video",
      modelType: "video",
      inputSchema: schemaForModel("generate-ai-video", "text-to-video"),
    };
    expect(fixForRow(fixed, { now })).toBeNull();
    expect(fixForRow({ modelId: "kling/text-to-video" })).toBeNull(); // not a dedicated row
  });
});

describe("run()", () => {
  it("dry run writes nothing", async () => {
    const result = await run({});
    expect(result.planned).toBe(7);
    expect(result.applied).toBe(0);
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
  });

  it("refuses --apply without --yes", async () => {
    await expect(run({ apply: true })).rejects.toThrow(/--yes/);
  });

  it("--apply --yes writes every planned fix", async () => {
    const result = await run({ apply: true, yes: true });
    expect(result.applied).toBe(7);
    expect(prisma.modelPricing.update).toHaveBeenCalledTimes(7);
  });
});

describe("coverage of the fix table", () => {
  it("covers exactly the seven audited dedicated rows", () => {
    expect(Object.keys(DEDICATED_ROW_FIXES).sort()).toEqual([
      "extend-ai-video",
      "extend-video",
      "generate-4-o-image",
      "generate-ai-video",
      "generate-aleph-video",
      "generate-or-edit-image",
      "generate-veo-3-video",
    ]);
  });
});
