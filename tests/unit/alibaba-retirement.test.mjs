// Alibaba retirement (EDITSv1 M2 — owner decision: KIE-only): no NEW
// generation may resolve to the Alibaba adapter, while everything that reads
// OLD Generation rows (getProvider, the poll parsers) keeps working.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    modelPricing: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    providerConfig: { findMany: vi.fn(), update: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
const {
  PROVIDERS,
  RETIRED_ADAPTERS,
  resolveProvider,
  resolveProviderWithFallback,
  resolveAdapterKey,
  getProvider,
} = await import("@/lib/providers.js");
const { run: retireRun, retirementUpdate, RETIREMENT_REASON } = await import("../../scripts/retire-alibaba.mjs");
const { readVerification, verificationAllowsActive } = await import("../../src/lib/catalog-verification.mjs");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.providerConfig.findMany.mockResolvedValue([]);
  prisma.modelPricing.findFirst.mockResolvedValue(null);
});

describe("user-facing resolution never returns Alibaba", () => {
  it("resolveProvider on an Alibaba-providerName row falls back to KIE", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({ modelId: "alibaba:qwen-image-plus", providerName: "Alibaba" });
    const provider = await resolveProvider("alibaba:qwen-image-plus");
    expect(provider.name).toBe("kie");
  });

  it("resolveProviderWithFallback contains no retired adapter for any model", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({ modelId: "alibaba:wan2.6-image", providerName: "DashScope", managedBySync: true });
    process.env.KIE_KEY = "k";
    const chain = await resolveProviderWithFallback("alibaba:wan2.6-image");
    expect(chain.length).toBeGreaterThan(0);
    for (const p of chain) expect(RETIRED_ADAPTERS.has(p.name)).toBe(false);
    // Non-sync-managed rows get the fallback chain — still KIE-only.
    prisma.modelPricing.findUnique.mockResolvedValue({ modelId: "legacy-model", providerName: "KIE", managedBySync: false });
    const legacyChain = await resolveProviderWithFallback("legacy-model");
    expect(legacyChain.map((p) => p.name)).toEqual(["kie"]);
  });

  it("resolveAdapterKey still classifies alibaba names (needed to read old rows)", () => {
    expect(resolveAdapterKey("Alibaba")).toBe("alibaba");
    expect(resolveAdapterKey("DashScope")).toBe("alibaba");
  });
});

describe("old Generation rows stay readable", () => {
  it("getProvider('alibaba') still returns the full adapter for in-flight polls", () => {
    const p = getProvider("alibaba");
    expect(p.name).toBe("Alibaba");
    expect(typeof p.buildPollUrl).toBe("function");
    expect(p.buildPollUrl("task-1")).toBe("/api/v1/tasks/task-1");
    // The poll parser still reads a stored DashScope task answer.
    const parsed = p.parsePoll({ output: { task_status: "SUCCEEDED", results: [] } });
    expect(parsed.status).toBe("succeeded");
  });

  it("PROVIDERS keeps the alibaba entry (retirement is resolution-time, not an adapter delete)", () => {
    expect(PROVIDERS.alibaba).toBeDefined();
    expect(RETIRED_ADAPTERS.has("alibaba")).toBe(true);
  });
});

describe("scripts/retire-alibaba.mjs", () => {
  const rows = [
    { id: "1", modelId: "alibaba:qwen-image-plus", providerName: "Alibaba", isActive: true, constraints: null },
    { id: "2", modelId: "alibaba:wan2.6-image", providerName: "Alibaba", isActive: false, constraints: { verification: { status: "pending" } } },
    { id: "3", modelId: "kling/text-to-video", providerName: "KIE", isActive: true, constraints: null },
  ];

  it("dry run (default) writes nothing and reports the targets", async () => {
    prisma.modelPricing.findMany.mockResolvedValue(rows);
    const result = await retireRun({});
    expect(result).toEqual({ targets: 2, active: 1, applied: 0 });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(prisma.providerConfig.update).not.toHaveBeenCalled();
  });

  it("refuses --apply without --yes", async () => {
    prisma.modelPricing.findMany.mockResolvedValue(rows);
    await expect(retireRun({ apply: true })).rejects.toThrow(/--yes/);
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
  });

  it("--apply --yes deactivates every Alibaba row with the 'provider retired' note and never touches KIE rows", async () => {
    prisma.modelPricing.findMany.mockResolvedValue(rows);
    prisma.providerConfig.findMany.mockResolvedValue([
      { id: "pc1", name: "Alibaba", isActive: true },
      { id: "pc2", name: "KIE", isActive: true },
    ]);
    const result = await retireRun({ apply: true, yes: true });
    expect(result.applied).toBe(2);
    const updatedIds = prisma.modelPricing.update.mock.calls.map(([args]) => args.where.id);
    expect(updatedIds.sort()).toEqual(["1", "2"]);
    for (const [args] of prisma.modelPricing.update.mock.calls) {
      expect(args.data.isActive).toBe(false);
      const v = readVerification(args.data.constraints);
      expect(v.reason).toBe(RETIREMENT_REASON);
      expect(verificationAllowsActive(args.data.constraints)).toBe(false);
    }
    expect(prisma.providerConfig.update).toHaveBeenCalledWith({ where: { id: "pc1" }, data: { isActive: false } });
    expect(prisma.providerConfig.update).toHaveBeenCalledTimes(1);
  });

  it("retirementUpdate preserves unrelated constraint keys", () => {
    const data = retirementUpdate({ constraints: { ui: { foo: 1 } } });
    expect(data.constraints.ui).toEqual({ foo: 1 });
    expect(data.isDeprecated).toBe(true);
  });
});
