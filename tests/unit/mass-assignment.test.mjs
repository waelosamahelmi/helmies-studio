import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase 3 Task 6 — the templates/plans/credit-packs admin CRUD routes used
// to pass the raw request body straight to prisma (`data: body`), letting an
// attacker who reaches the route (or a compromised admin session) set
// server-controlled fields like `id`/`createdAt`/`updatedAt` directly. Each
// route now allowlists which body keys reach prisma; unknown/blocked keys
// are silently dropped (admin-only routes — 400-on-extra would break loose
// admin UI payloads that send extra client-side fields).

vi.mock("@/lib/security", () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }) }));
vi.mock("@/lib/authz", () => ({
  authzResponse: (e) =>
    Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
}));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
// The templates/[slug] GET handler imports @/lib/auth (next-auth), which
// this test environment can't resolve — stub it (only PUT is exercised
// here, but the module import must still succeed).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/templates", () => ({ hasTemplateAccess: vi.fn(), listTemplates: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    template: { create: vi.fn(), update: vi.fn() },
    subscriptionPlan: { create: vi.fn() },
    creditPack: { create: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { POST as templatesPost } from "@/app/api/templates/route.js";
import { PUT as templatesPut } from "@/app/api/templates/[slug]/route.js";
import { POST as plansPost } from "@/app/api/admin/plans/route.js";
import { POST as packsPost } from "@/app/api/admin/credit-packs/route.js";

const jsonReq = (url, body, method = "POST") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.template.create.mockResolvedValue({ id: "t1" });
  prisma.template.update.mockResolvedValue({ id: "t1" });
  prisma.subscriptionPlan.create.mockResolvedValue({ id: "p1" });
  prisma.creditPack.create.mockResolvedValue({ id: "c1" });
});

describe("POST /api/templates — allowlisted create", () => {
  it("strips id/createdAt/updatedAt and any non-schema keys before calling prisma", async () => {
    const res = await templatesPost(
      jsonReq("http://test/api/templates", {
        id: "attacker",
        createdAt: "1970-01-01",
        updatedAt: "1970-01-01",
        userId: "attacker-owned",
        slug: "my-template",
        name: "My Template",
        description: "desc",
        thumbnailUrl: "https://x/y.png",
        category: "creative",
        toolType: "image",
        pricingModel: "onetime",
        oneTimePrice: 500,
        stripePriceId: "price_123",
        config: { foo: "bar" },
        isPublished: true,
        isFeatured: false,
        usageLimit: "once",
      }),
    );

    expect(res.status).toBe(201);
    expect(prisma.template.create).toHaveBeenCalledWith({
      data: {
        slug: "my-template",
        name: "My Template",
        description: "desc",
        thumbnailUrl: "https://x/y.png",
        category: "creative",
        toolType: "image",
        pricingModel: "onetime",
        oneTimePrice: 500,
        stripePriceId: "price_123",
        config: { foo: "bar" },
        isPublished: true,
        isFeatured: false,
        usageLimit: "once",
      },
    });
    const passedData = prisma.template.create.mock.calls[0][0].data;
    expect(passedData).not.toHaveProperty("id");
    expect(passedData).not.toHaveProperty("createdAt");
    expect(passedData).not.toHaveProperty("updatedAt");
    expect(passedData).not.toHaveProperty("userId");
  });
});

describe("PUT /api/templates/[slug] — allowlisted update, cannot change owner/id fields", () => {
  it("drops id/createdAt/updatedAt/userId even though the route keys off slug from the URL", async () => {
    const res = await templatesPut(
      jsonReq("http://test/api/templates/my-slug", {
        id: "attacker",
        createdAt: "1970-01-01",
        updatedAt: "1970-01-01",
        userId: "attacker-owned",
        name: "Renamed",
        isPublished: true,
      }),
      { params: { slug: "my-slug" } },
    );

    expect(res.status).toBe(200);
    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { slug: "my-slug" },
      data: { name: "Renamed", isPublished: true },
    });
  });
});

describe("POST /api/admin/plans — allowlisted create", () => {
  it("passes only SubscriptionPlan allowlisted fields to prisma", async () => {
    const res = await plansPost(
      jsonReq("http://test/api/admin/plans", {
        id: "attacker",
        createdAt: "1970-01-01",
        updatedAt: "1970-01-01",
        name: "Pro",
        slug: "pro",
        price: 900,
        credits: 1000,
        stripePriceId: "price_p",
        stripePriceIdYearly: "price_py",
        features: ["a", "b"],
        isActive: true,
        sortOrder: 1,
      }),
    );

    expect(res.status).toBe(201);
    expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith({
      data: {
        name: "Pro",
        slug: "pro",
        price: 900,
        credits: 1000,
        stripePriceId: "price_p",
        stripePriceIdYearly: "price_py",
        features: ["a", "b"],
        isActive: true,
        sortOrder: 1,
      },
    });
  });
});

describe("POST /api/admin/credit-packs — allowlisted create", () => {
  it("passes only CreditPack allowlisted fields to prisma", async () => {
    const res = await packsPost(
      jsonReq("http://test/api/admin/credit-packs", {
        id: "attacker",
        createdAt: "1970-01-01",
        name: "Starter",
        credits: 100,
        price: 500,
        stripePriceId: "price_c",
        isActive: true,
        sortOrder: 0,
      }),
    );

    expect(res.status).toBe(201);
    expect(prisma.creditPack.create).toHaveBeenCalledWith({
      data: {
        name: "Starter",
        credits: 100,
        price: 500,
        stripePriceId: "price_c",
        isActive: true,
        sortOrder: 0,
      },
    });
  });
});
