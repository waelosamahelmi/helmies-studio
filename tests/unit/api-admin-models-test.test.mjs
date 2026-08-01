import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { POST } from "@/app/api/admin/models/test/route.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

it("reports creditsCost and resolves providerName against the registry", async () => {
  prisma.modelPricing.findFirst.mockResolvedValue({
    modelId: "test-model",
    creditsCost: 42,
    providerName: "KIE",
    endpoint: "/api/v1/jobs/createTask",
    isActive: true,
  });

  const res = await POST(
    new Request("http://test/api/admin/models/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId: "test-model" }),
    }),
  );
  const json = await res.json();
  const pricing = json.checks.find((c) => c.name === "Pricing row");
  expect(pricing.detail).toContain("42");
  const provider = json.checks.find((c) => c.name === "Provider");
  expect(provider.ok).toBe(true); // "KIE" must resolve against PROVIDERS.kie
  expect(json.provider).toBe("KIE"); // top-level field must read providerName, not the nonexistent `provider` column
});
