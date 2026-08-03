import { describe, it, expect, vi, beforeEach } from "vitest";

// The templates admin write routes (POST /api/templates, PUT/DELETE
// /api/templates/[slug]) call requireAdmin from @/lib/security same as the
// admin/* routes, but had their own local catch that string-matched the
// *old* plain-Error messages ("Forbidden: admin access required" /
// "Unauthorized"). Since requireAdmin now throws AuthzError (message
// "Forbidden" / "Unauthorized" — Task 1's central authz module), that match
// silently broke: non-admin callers fell through to the generic 500 branch
// instead of 403. These routes must use authzResponse(e) like admin/* does,
// while still preserving their P2025 -> 404 "Template not found" special
// case (which authzResponse doesn't know about).

vi.mock("@/lib/security", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { template: { create: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/templates", () => ({
  listTemplates: vi.fn(),
  hasTemplateAccess: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
// Origin verification (Task 3) is exercised on its own in
// tests/unit/origin-check.test.mjs — stub it here so these authz-focused
// assertions don't need matching Origin headers on every request.
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));

import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";
import { AuthzError } from "@/lib/authz";
import { POST } from "@/app/api/templates/route.js";
import { PUT, DELETE } from "@/app/api/templates/[slug]/route.js";

const jsonReq = (url, body) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/templates — central authz", () => {
  it("401 Unauthorized when unauthenticated", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(401, "Unauthorized"));

    const res = await POST(jsonReq("http://test/api/templates", { name: "x" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized", code: "unauthorized" });
  });

  it("403 Forbidden when authenticated but not an admin", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(403, "Forbidden"));

    const res = await POST(jsonReq("http://test/api/templates", { name: "x" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Forbidden", code: "forbidden" });
  });

  it("500 'Internal error' on a generic throw, never leaking e.message", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.create.mockRejectedValue(new Error("db exploded: password=hunter2"));

    const res = await POST(jsonReq("http://test/api/templates", { name: "x" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ code: "internal" });
    expect(JSON.stringify(body)).not.toContain("db exploded");
  });
});

describe("PUT /api/templates/[slug] — central authz + P2025 preserved", () => {
  const req = () => jsonReq("http://test/api/templates/my-slug", { name: "x" });
  const ctx = { params: { slug: "my-slug" } };

  it("401 Unauthorized when unauthenticated", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(401, "Unauthorized"));

    const res = await PUT(req(), ctx);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized", code: "unauthorized" });
  });

  it("403 Forbidden when authenticated but not an admin", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(403, "Forbidden"));

    const res = await PUT(req(), ctx);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Forbidden", code: "forbidden" });
  });

  it("404 'Template not found' when prisma throws P2025", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    const p2025 = new Error("Record to update not found.");
    p2025.code = "P2025";
    prisma.template.update.mockRejectedValue(p2025);

    const res = await PUT(req(), ctx);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Template not found" });
  });

  it("500 'Internal error' on any other throw", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.update.mockRejectedValue(new Error("db exploded: password=hunter2"));

    const res = await PUT(req(), ctx);

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "internal" });
  });
});

describe("DELETE /api/templates/[slug] — central authz + P2025 preserved", () => {
  const req = () => new Request("http://test/api/templates/my-slug", { method: "DELETE" });
  const ctx = { params: { slug: "my-slug" } };

  it("401 Unauthorized when unauthenticated", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(401, "Unauthorized"));

    const res = await DELETE(req(), ctx);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized", code: "unauthorized" });
  });

  it("403 Forbidden when authenticated but not an admin", async () => {
    requireAdmin.mockRejectedValue(new AuthzError(403, "Forbidden"));

    const res = await DELETE(req(), ctx);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Forbidden", code: "forbidden" });
  });

  it("404 'Template not found' when prisma throws P2025", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    const p2025 = new Error("Record to update not found.");
    p2025.code = "P2025";
    prisma.template.update.mockRejectedValue(p2025);

    const res = await DELETE(req(), ctx);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Template not found" });
  });

  it("500 'Internal error' on any other throw", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    prisma.template.update.mockRejectedValue(new Error("db exploded: password=hunter2"));

    const res = await DELETE(req(), ctx);

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "internal" });
  });
});
