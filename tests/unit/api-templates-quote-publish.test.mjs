import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    template: { findUnique: vi.fn(), update: vi.fn() },
    templateVersion: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/template-quote", () => ({
  quoteTemplate: vi.fn(),
  canPublish: vi.fn(),
}));

import { requireAdmin } from "@/lib/security";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { quoteTemplate, canPublish } from "@/lib/template-quote";
import { AuthzError } from "@/lib/authz";
import { POST as quotePOST } from "@/app/api/templates/[slug]/quote/route.js";
import { POST as publishPOST } from "@/app/api/templates/[slug]/publish/route.js";

const jsonReq = (url, body) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/templates/[slug]/quote", () => {
  const ctx = { params: { slug: "my-template" } };

  it("401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await quotePOST(jsonReq("http://test/x", {}), ctx);
    expect(res.status).toBe(401);
  });

  it("404 when the template does not exist", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.template.findUnique.mockResolvedValue(null);
    const res = await quotePOST(jsonReq("http://test/x", {}), ctx);
    expect(res.status).toBe(404);
  });

  it("404 when the template has no published version", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue(null);
    const res = await quotePOST(jsonReq("http://test/x", {}), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the server-computed quote and ignores a client-supplied credits field", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ version: 3, graph: { steps: [] } });
    quoteTemplate.mockResolvedValue({ valid: true, steps: [], totalCredits: 42, errors: [] });

    const res = await quotePOST(jsonReq("http://test/x", { inputs: { step1: { credits: 999999 } } }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCredits).toBe(42);
    expect(body.version).toBe(3);
  });

  it("queries only the published version, never a draft", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ version: 1, graph: { steps: [] } });
    quoteTemplate.mockResolvedValue({ valid: true, steps: [], totalCredits: 1, errors: [] });

    await quotePOST(jsonReq("http://test/x", {}), ctx);

    expect(prisma.templateVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ templateId: "tpl1", status: "published" }) })
    );
  });
});

describe("POST /api/templates/[slug]/publish", () => {
  const ctx = { params: { slug: "my-template" } };

  it("401 when unauthenticated", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(401, "Unauthorized"));
    const res = await publishPOST(jsonReq("http://test/x", {}), ctx);
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but not an admin", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(403, "Forbidden"));
    const res = await publishPOST(jsonReq("http://test/x", {}), ctx);
    expect(res.status).toBe(403);
  });

  it("404 when the template does not exist", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.findUnique.mockResolvedValue(null);
    const res = await publishPOST(jsonReq("http://test/x", {}), ctx);
    expect(res.status).toBe(404);
  });

  it("422 with reasons and does NOT flip status when canPublish refuses", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    canPublish.mockResolvedValue({ ok: false, reasons: ["invalid graph: graph.steps must be a non-empty array"] });

    const res = await publishPOST(jsonReq("http://test/x", { version: 1 }), ctx);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.reasons).toEqual(["invalid graph: graph.steps must be a non-empty array"]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("publishes and flips status only when canPublish passes", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    canPublish.mockResolvedValue({ ok: true, reasons: [] });
    prisma.$transaction.mockResolvedValue([{}, {}]);

    const res = await publishPOST(jsonReq("http://test/x", { version: 2 }), ctx);

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toEqual({ success: true, templateId: "tpl1", version: 2 });
  });

  it("defaults to the highest-numbered version when none is specified in the body", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ version: 5 });
    canPublish.mockResolvedValue({ ok: true, reasons: [] });
    prisma.$transaction.mockResolvedValue([{}, {}]);

    const res = await publishPOST(jsonReq("http://test/x", {}), ctx);

    expect(canPublish).toHaveBeenCalledWith("tpl1", 5);
    const body = await res.json();
    expect(body.version).toBe(5);
  });

  it("404 when no version is specified and none exists yet", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue(null);

    const res = await publishPOST(jsonReq("http://test/x", {}), ctx);

    expect(res.status).toBe(404);
    expect(canPublish).not.toHaveBeenCalled();
  });
});
