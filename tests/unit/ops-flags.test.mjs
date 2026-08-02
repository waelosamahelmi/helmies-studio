import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── src/lib/ops-flags.js — pure logic against mocked prisma + providers ───
// vi.mock factories are hoisted above regular top-level declarations, so the
// mock objects themselves must be created via vi.hoisted() to be visible
// inside the (also hoisted) factory functions below.
const { prismaMock, getProviderActivityMock } = vi.hoisted(() => ({
  prismaMock: {
    featureFlag: { findUnique: vi.fn(), upsert: vi.fn() },
    providerConfig: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  getProviderActivityMock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/providers", () => ({ getProviderActivity: (...args) => getProviderActivityMock(...args) }));

import {
  isMaintenanceMode,
  setMaintenanceMode,
  isProviderDisabled,
  setProviderDisabled,
  KNOWN_PROVIDER_KEYS,
} from "@/lib/ops-flags";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.featureFlag.upsert.mockResolvedValue({});
  prismaMock.providerConfig.upsert.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("isMaintenanceMode / setMaintenanceMode", () => {
  it("is false when no FeatureFlag row exists yet", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    expect(await isMaintenanceMode()).toBe(false);
  });

  it("reflects the FeatureFlag row's enabled value", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({ key: "maintenance_mode", enabled: true });
    expect(await isMaintenanceMode()).toBe(true);
  });

  it("setMaintenanceMode upserts the flag and writes an audit row with the admin id and reason", async () => {
    const result = await setMaintenanceMode(true, "admin1", "planned deploy");

    expect(result).toEqual({ enabled: true });
    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "maintenance_mode" },
        update: { enabled: true },
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin1",
        action: "admin_maintenance_mode",
        resource: "feature_flag",
        resourceId: "maintenance_mode",
        metadata: { enabled: true, reason: "planned deploy" },
      }),
    });
  });

  it("coerces a truthy/falsy `on` argument to a strict boolean", async () => {
    const result = await setMaintenanceMode(0, "admin1");
    expect(result).toEqual({ enabled: false });
  });
});

describe("isProviderDisabled / setProviderDisabled — the kill switch", () => {
  it("is false for every provider when getProviderActivity returns null (env-only mode)", async () => {
    getProviderActivityMock.mockResolvedValue(null);
    expect(await isProviderDisabled("kie")).toBe(false);
    expect(await isProviderDisabled("alibaba")).toBe(false);
  });

  it("is true only for a provider explicitly marked isActive:false in the activity map", async () => {
    getProviderActivityMock.mockResolvedValue({ kie: false, alibaba: true });
    expect(await isProviderDisabled("kie")).toBe(true);
    expect(await isProviderDisabled("alibaba")).toBe(false);
  });

  it("is case-insensitive on the provider name", async () => {
    getProviderActivityMock.mockResolvedValue({ kie: false });
    expect(await isProviderDisabled("KIE")).toBe(true);
  });

  it("setProviderDisabled rejects an unknown provider name without touching the database", async () => {
    await expect(setProviderDisabled("not-a-real-provider", true, "admin1")).rejects.toThrow(/Unknown provider/);
    expect(prismaMock.providerConfig.upsert).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("setProviderDisabled upserts ProviderConfig by the canonical key and writes an audit row", async () => {
    const result = await setProviderDisabled("KIE", true, "admin1", "provider outage");

    expect(result).toEqual({ name: "kie", disabled: true });
    expect(prismaMock.providerConfig.upsert).toHaveBeenCalledWith({
      where: { name: "kie" },
      create: { name: "kie", type: "media", isActive: false },
      update: { isActive: false },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin1",
        action: "admin_provider_kill_switch",
        resource: "provider_config",
        resourceId: "kie",
        metadata: { disabled: true, reason: "provider outage" },
      }),
    });
  });

  it("KNOWN_PROVIDER_KEYS exposes exactly the adapter keys src/lib/providers.js's PROVIDERS registry defines", () => {
    expect(KNOWN_PROVIDER_KEYS).toEqual(["kie", "alibaba"]);
  });
});

// ── middleware.js — maintenance mode ───────────────────────────────────────
// middleware.js never imports prisma/ops-flags directly (Edge runtime can't
// use the pg driver — see that file's header); it polls GET /api/health via
// a same-origin fetch instead, exactly like it already resolves the session
// via a fetch to /api/auth/session. Both are mocked here by URL.
import { middleware } from "../../middleware.js";

const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;
const BASE = "https://studio.helmies.fi";

function makeRequest(path, { method = "GET" } = {}) {
  return new NextRequest(new URL(path, BASE), { method });
}

function mockFetchWith({ maintenance = false, healthOk = true, healthThrows = false, session = null, sessionStatus = 200 }) {
  global.fetch = vi.fn(async (url) => {
    const u = typeof url === "string" ? url : url.toString();
    if (u.includes("/api/health")) {
      if (healthThrows) throw new Error("network down");
      return new Response(JSON.stringify({ ok: true, maintenance }), { status: healthOk ? 200 : 500 });
    }
    if (u.includes("/api/auth/session")) {
      return new Response(JSON.stringify(session), { status: sessionStatus });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("middleware — maintenance mode", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_URL = BASE;
  });

  afterEach(() => {
    if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
    vi.restoreAllMocks();
  });

  it("returns 503 for /studio when maintenance is on", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/studio"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/maintenance/i);
  });

  it("returns 503 for a state-changing, non-exempt API route (e.g. POST /api/assets) when maintenance is on", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/api/assets", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("does NOT 503 a read-only GET to a normal API route during maintenance", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/api/generations"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("POST /api/webhooks/generation-complete still reaches its handler during maintenance", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/api/webhooks/generation-complete", { method: "POST" }));
    expect(res.status).not.toBe(503);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("POST /api/stripe/webhook still reaches its handler during maintenance", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/api/stripe/webhook", { method: "POST" }));
    expect(res.status).not.toBe(503);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("POST /api/cron/automation still reaches its handler during maintenance", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/api/cron/automation", { method: "POST" }));
    expect(res.status).not.toBe(503);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("POST /api/admin/ops still works during maintenance (so an operator can turn it back off)", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/api/admin/ops", { method: "POST" }));
    expect(res.status).not.toBe(503);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("GET /api/health itself is never blocked, even during maintenance", async () => {
    mockFetchWith({ maintenance: true });
    const res = await middleware(makeRequest("/api/health"));
    expect(res.status).not.toBe(503);
  });

  it("does not 503 anything when maintenance is off", async () => {
    mockFetchWith({ maintenance: false, session: null, sessionStatus: 401 });
    const res = await middleware(makeRequest("/api/assets", { method: "POST" }));
    expect(res.status).not.toBe(503);
  });

  it("fails OPEN (not in maintenance) when the health check itself is unreachable", async () => {
    mockFetchWith({ healthThrows: true });
    const res = await middleware(makeRequest("/api/assets", { method: "POST" }));
    expect(res.status).not.toBe(503);
  });

  it("keeps the existing auth redirect intact for an unauthenticated /studio visit when maintenance is off", async () => {
    mockFetchWith({ maintenance: false, session: { user: null }, sessionStatus: 200 });
    const res = await middleware(makeRequest("/studio"));
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(res.headers.get("location")).toContain("/login");
  });

  it("keeps the existing non-admin -> /studio redirect intact for /admin when maintenance is off", async () => {
    mockFetchWith({ maintenance: false, session: { user: { role: "user" } }, sessionStatus: 200 });
    const res = await middleware(makeRequest("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/studio");
  });
});

// ── GET/POST /api/admin/ops — admin gate + wiring ──────────────────────────
describe("GET/POST /api/admin/ops", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/authz");
    vi.doUnmock("@/lib/origin-check");
    vi.doUnmock("@/lib/ops-flags");
  });

  async function loadRouteWithMocks({ admin = { id: "admin1" }, originOk = true } = {}) {
    vi.resetModules();
    vi.doMock("@/lib/authz", () => ({
      requireAdminUser: admin
        ? vi.fn().mockResolvedValue(admin)
        : vi.fn().mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403, publicMessage: "Forbidden" })),
      authzResponse: (e) =>
        Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
    }));
    vi.doMock("@/lib/origin-check", () => ({
      verifyOrigin: originOk
        ? vi.fn(() => true)
        : vi.fn(() => {
            throw Object.assign(new Error("Cross-origin request rejected"), { status: 403, publicMessage: "Cross-origin request rejected" });
          }),
    }));
    const ops = {
      isMaintenanceMode: vi.fn().mockResolvedValue(false),
      setMaintenanceMode: vi.fn().mockResolvedValue({ enabled: true }),
      isProviderDisabled: vi.fn().mockResolvedValue(false),
      setProviderDisabled: vi.fn().mockResolvedValue({ name: "kie", disabled: true }),
      KNOWN_PROVIDER_KEYS: ["kie", "alibaba"],
    };
    vi.doMock("@/lib/ops-flags", () => ops);
    const route = await import("@/app/api/admin/ops/route.js");
    return { ...route, ops };
  }

  it("GET returns 403 for a non-admin caller and never reads the flags", async () => {
    const { GET, ops } = await loadRouteWithMocks({ admin: null });
    const res = await GET(new Request("http://test/api/admin/ops"));
    expect(res.status).toBe(403);
    expect(ops.isMaintenanceMode).not.toHaveBeenCalled();
  });

  it("GET returns maintenance + per-provider disabled state for an admin", async () => {
    const { GET, ops } = await loadRouteWithMocks();
    ops.isMaintenanceMode.mockResolvedValue(true);
    ops.isProviderDisabled.mockImplementation(async (name) => name === "kie");

    const res = await GET(new Request("http://test/api/admin/ops"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      maintenance: true,
      providers: [
        { name: "kie", disabled: true },
        { name: "alibaba", disabled: false },
      ],
    });
  });

  it("POST is origin-checked: a cross-site POST is rejected before any setter runs", async () => {
    const { POST, ops } = await loadRouteWithMocks({ originOk: false });
    const res = await POST(
      new Request("http://test/api/admin/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "maintenance", enabled: true }),
      })
    );
    expect(res.status).toBe(403);
    expect(ops.setMaintenanceMode).not.toHaveBeenCalled();
  });

  it("POST action=maintenance validates `enabled` is a boolean and calls setMaintenanceMode with the admin id + reason", async () => {
    const { POST, ops } = await loadRouteWithMocks();
    const bad = await POST(
      new Request("http://test/api/admin/ops", {
        method: "POST",
        body: JSON.stringify({ action: "maintenance" }),
      })
    );
    expect(bad.status).toBe(400);
    expect(ops.setMaintenanceMode).not.toHaveBeenCalled();

    const res = await POST(
      new Request("http://test/api/admin/ops", {
        method: "POST",
        body: JSON.stringify({ action: "maintenance", enabled: true, reason: "deploy window" }),
      })
    );
    expect(res.status).toBe(200);
    expect(ops.setMaintenanceMode).toHaveBeenCalledWith(true, "admin1", "deploy window");
  });

  it("POST action=provider rejects an unknown provider name with 400", async () => {
    const { POST, ops } = await loadRouteWithMocks();
    const res = await POST(
      new Request("http://test/api/admin/ops", {
        method: "POST",
        body: JSON.stringify({ action: "provider", name: "not-real", disabled: true }),
      })
    );
    expect(res.status).toBe(400);
    expect(ops.setProviderDisabled).not.toHaveBeenCalled();
  });

  it("POST action=provider calls setProviderDisabled with the admin id + reason for a known provider", async () => {
    const { POST, ops } = await loadRouteWithMocks();
    const res = await POST(
      new Request("http://test/api/admin/ops", {
        method: "POST",
        body: JSON.stringify({ action: "provider", name: "KIE", disabled: true, reason: "provider outage" }),
      })
    );
    expect(res.status).toBe(200);
    expect(ops.setProviderDisabled).toHaveBeenCalledWith("kie", true, "admin1", "provider outage");
  });

  it("POST with an unknown action returns 400", async () => {
    const { POST, ops } = await loadRouteWithMocks();
    const res = await POST(
      new Request("http://test/api/admin/ops", { method: "POST", body: JSON.stringify({ action: "nope" }) })
    );
    expect(res.status).toBe(400);
    expect(ops.setMaintenanceMode).not.toHaveBeenCalled();
    expect(ops.setProviderDisabled).not.toHaveBeenCalled();
  });
});
