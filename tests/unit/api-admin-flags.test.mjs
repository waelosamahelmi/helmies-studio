import { describe, it, expect, vi, beforeEach } from "vitest";

// src/app/api/admin/flags/route.js — Phase 8 Task A2 review fix: the
// alert dedup state (src/lib/alerts.js's recordAlertsFired, key prefix
// "alert_state:") lives in this SAME FeatureFlag table but is internal
// bookkeeping, not an operator-facing flag. It must never appear in the
// admin listing (GET) and must never be writable through this endpoint
// (POST) — an admin who stumbled onto it in the UI or hit the API directly
// could otherwise toggle `enabled` or overwrite `config.lastFiredAt`,
// silently corrupting the alert dedup window.

vi.mock("@/lib/prisma", () => ({
  default: { featureFlag: { findMany: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({
  authzResponse: (e) => Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
}));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/security";
import { GET, POST } from "@/app/api/admin/flags/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/flags", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.featureFlag.findMany.mockResolvedValue([]);
  prisma.featureFlag.upsert.mockResolvedValue({});
});

describe("GET /api/admin/flags — excludes alert_state:* rows", () => {
  it("queries with a NOT startsWith('alert_state:') filter", async () => {
    await GET(new Request("http://test/api/admin/flags"));
    expect(prisma.featureFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { NOT: { key: { startsWith: "alert_state:" } } },
      })
    );
  });

  it("returns whatever real (non-alert-state) flags the filtered query yields", async () => {
    const rows = [{ key: "maintenance_mode", enabled: false }];
    prisma.featureFlag.findMany.mockResolvedValue(rows);
    const res = await GET(new Request("http://test/api/admin/flags"));
    expect(await res.json()).toEqual(rows);
  });
});

describe("POST /api/admin/flags — rejects writing an alert_state:* key", () => {
  it("400s and never touches prisma/audit for a key with the reserved prefix", async () => {
    const res = await POST(jsonReq({ key: "alert_state:worker_liveness", enabled: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reserved/i);
    expect(prisma.featureFlag.upsert).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("still allows a normal, non-reserved flag key through", async () => {
    const res = await POST(jsonReq({ key: "maintenance_mode", name: "Maintenance", enabled: true }));
    expect(res.status).toBe(200);
    expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "maintenance_mode" } })
    );
    expect(logAudit).toHaveBeenCalledTimes(1);
  });
});
