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

  // CRITICAL — the exact scenario the code review found the unit/integration
  // suite structurally could not catch, because resetDb() truncates
  // ProviderConfig before every test, so no test ever seeded a
  // PRODUCTION-CASED row the way scripts/seed-providers.mjs actually does
  // (name: "KIE", not "kie"). Before the fix, setProviderDisabled upserted
  // unconditionally on the lowercase key, which created a SECOND "kie" row
  // alongside the seeded "KIE" row; getProviderActivity then lowercased
  // both into the same key with whichever row the (unordered) findMany
  // happened to visit last winning — so an unrelated write to the ORIGINAL
  // "KIE" row (a markup change, a catalog sync, a re-run of the seed
  // script) could silently flip the provider back to active with no
  // operator action and no audit row. This test seeds that exact
  // production shape directly (bypassing ops-flags.js, the way a real
  // deployment's seed script does), toggles the kill switch through the
  // real API, performs the unrelated update, and asserts the provider is
  // still disabled and no duplicate row was created.
  it("a provider seeded with production casing ('KIE') stays disabled through an unrelated update to that same row, with no duplicate row created", async () => {
    const { setProviderDisabled, isProviderDisabled } = await import("@/lib/ops-flags");
    const { getProviderActivity } = await import("@/lib/providers");
    const admin = await prisma.user.create({ data: { email: `ops-admin-${randomUUID()}@test.local`, role: "admin" } });

    // Simulate scripts/seed-providers.mjs's production casing directly —
    // this is what a real database already has, seeded independently of
    // anything ops-flags.js ever writes.
    const seeded = await prisma.providerConfig.create({
      data: { name: "KIE", type: "image+video+audio+lipsync", isActive: true, markup: 2.5 },
    });

    await setProviderDisabled("kie", true, admin.id, "provider outage");
    expect(await isProviderDisabled("kie")).toBe(true);

    // No duplicate: exactly one row matches "kie", it's the ORIGINAL row
    // (same id, original "KIE" casing preserved), not a new lowercase one.
    const rows = await prisma.providerConfig.findMany();
    const kieRows = rows.filter((r) => r.name.toLowerCase().includes("kie"));
    expect(kieRows).toHaveLength(1);
    expect(kieRows[0].id).toBe(seeded.id);
    expect(kieRows[0].name).toBe("KIE");
    expect(kieRows[0].isActive).toBe(false);

    // An unrelated update to that SAME row (e.g. a markup change via
    // /api/admin/providers, or a catalog sync touching baseUrl) must never
    // silently re-enable the provider — this is the exact reversal the
    // review proved against the pre-fix code.
    await prisma.providerConfig.update({ where: { id: seeded.id }, data: { markup: 3.0 } });

    expect(await isProviderDisabled("kie")).toBe(true);
    const activity = await getProviderActivity();
    expect(activity.kie).toBe(false);

    // Re-enabling updates the SAME original row again — still no duplicate.
    await setProviderDisabled("kie", false, admin.id, "resolved");
    const rowsAfter = await prisma.providerConfig.findMany();
    const kieRowsAfter = rowsAfter.filter((r) => r.name.toLowerCase().includes("kie"));
    expect(kieRowsAfter).toHaveLength(1);
    expect(kieRowsAfter[0].id).toBe(seeded.id);
    expect(kieRowsAfter[0].isActive).toBe(true);
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
