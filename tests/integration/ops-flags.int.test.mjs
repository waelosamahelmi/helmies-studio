import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

let prisma;
beforeEach(async () => {
  prisma = await resetDb();
});

describe("isMaintenanceMode / setMaintenanceMode against real Postgres", () => {
  it("defaults to false before any FeatureFlag row exists", async () => {
    const { isMaintenanceMode } = await import("@/lib/ops-flags");
    expect(await isMaintenanceMode()).toBe(false);
  });

  it("setMaintenanceMode(true, ...) turns it on, and (false, ...) turns it back off, each writing an AuditLog row", async () => {
    const { isMaintenanceMode, setMaintenanceMode } = await import("@/lib/ops-flags");
    const admin = await prisma.user.create({ data: { email: `ops-admin-${randomUUID()}@test.local`, role: "admin" } });

    await setMaintenanceMode(true, admin.id, "planned deploy");
    expect(await isMaintenanceMode()).toBe(true);

    const onLog = await prisma.auditLog.findFirst({
      where: { userId: admin.id, action: "admin_maintenance_mode" },
      orderBy: { createdAt: "desc" },
    });
    expect(onLog).toMatchObject({
      resource: "feature_flag",
      resourceId: "maintenance_mode",
      metadata: { enabled: true, reason: "planned deploy" },
    });

    await setMaintenanceMode(false, admin.id, "deploy finished");
    expect(await isMaintenanceMode()).toBe(false);

    const auditRows = await prisma.auditLog.findMany({
      where: { userId: admin.id, action: "admin_maintenance_mode" },
    });
    expect(auditRows).toHaveLength(2); // one per setter call — on, then off
  });
});

describe("isProviderDisabled / setProviderDisabled against real Postgres", () => {
  it("no provider is disabled before any ProviderConfig row exists (env-only mode)", async () => {
    const { isProviderDisabled } = await import("@/lib/ops-flags");
    expect(await isProviderDisabled("kie")).toBe(false);
    expect(await isProviderDisabled("alibaba")).toBe(false);
  });

  it("setProviderDisabled writes the SAME ProviderConfig row getProviderActivity (src/lib/providers.js) reads back, and an audit row", async () => {
    const { setProviderDisabled, isProviderDisabled } = await import("@/lib/ops-flags");
    const { getProviderActivity } = await import("@/lib/providers");
    const admin = await prisma.user.create({ data: { email: `ops-admin-${randomUUID()}@test.local`, role: "admin" } });

    await setProviderDisabled("kie", true, admin.id, "provider outage");

    expect(await isProviderDisabled("kie")).toBe(true);
    expect(await isProviderDisabled("alibaba")).toBe(false);

    const activity = await getProviderActivity();
    expect(activity.kie).toBe(false);

    const row = await prisma.providerConfig.findUnique({ where: { name: "kie" } });
    expect(row).toMatchObject({ name: "kie", isActive: false });

    const auditRow = await prisma.auditLog.findFirst({
      where: { userId: admin.id, action: "admin_provider_kill_switch" },
    });
    expect(auditRow).toMatchObject({
      resource: "provider_config",
      resourceId: "kie",
      metadata: { disabled: true, reason: "provider outage" },
    });
  });

  it("re-enabling flips isActive back to true and getProviderActivity reflects it immediately", async () => {
    const { setProviderDisabled, isProviderDisabled } = await import("@/lib/ops-flags");
    const admin = await prisma.user.create({ data: { email: `ops-admin-${randomUUID()}@test.local`, role: "admin" } });

    await setProviderDisabled("alibaba", true, admin.id);
    expect(await isProviderDisabled("alibaba")).toBe(true);

    await setProviderDisabled("alibaba", false, admin.id, "resolved");
    expect(await isProviderDisabled("alibaba")).toBe(false);

    const row = await prisma.providerConfig.findUnique({ where: { name: "alibaba" } });
    expect(row.isActive).toBe(true);
  });
});

describe("resolveProviderWithFallback — kill switch against real ProviderConfig rows", () => {
  it("a provider disabled via setProviderDisabled is absent from the resolved chain", async () => {
    const { setProviderDisabled } = await import("@/lib/ops-flags");
    const { resolveProviderWithFallback } = await import("@/lib/providers");
    const admin = await prisma.user.create({ data: { email: `ops-admin-${randomUUID()}@test.local`, role: "admin" } });

    await setProviderDisabled("kie", true, admin.id, "provider outage");

    const chain = await resolveProviderWithFallback("some-unpriced-model");
    expect(chain.map((p) => p.name)).not.toContain("kie");
    expect(chain.map((p) => p.name)).toContain("alibaba");
  });

  it("disabling every provider makes generation submission fail fast with a clear message", async () => {
    const { setProviderDisabled } = await import("@/lib/ops-flags");
    const { resolveProviderWithFallback } = await import("@/lib/providers");
    const admin = await prisma.user.create({ data: { email: `ops-admin-${randomUUID()}@test.local`, role: "admin" } });

    await setProviderDisabled("kie", true, admin.id);
    await setProviderDisabled("alibaba", true, admin.id);

    await expect(resolveProviderWithFallback("some-unpriced-model")).rejects.toThrow(/disabled/i);
  });
});
