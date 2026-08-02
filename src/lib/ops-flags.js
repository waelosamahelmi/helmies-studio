// Helmies Studio — Operator controls: maintenance mode + provider kill switch
// (Phase 7 Task 3)
//
// Two independent controls, each backed by an EXISTING table — no new
// migration:
//   - Maintenance mode -> FeatureFlag (key "maintenance_mode"). Read by
//     src/app/api/health/route.js, which middleware.js polls via a
//     same-origin fetch rather than importing this module directly — see
//     middleware.js's header for why (Edge runtime can't use prisma's
//     @prisma/adapter-pg TCP driver).
//   - Provider kill switch -> ProviderConfig.isActive, the SAME table
//     src/lib/providers.js's getProviderActivity() already reads to build
//     resolveProviderWithFallback's chain. setProviderDisabled upserts
//     exactly the row getProviderActivity reads back — one mechanism, not
//     two, per the Task 3 brief.
//
// Every setter writes an AuditLog row carrying the admin id and an optional
// reason — the operator-controls audit trail the contract asks for.
import prisma from "@/lib/prisma";
import { getProviderActivity } from "@/lib/providers";

const MAINTENANCE_FLAG_KEY = "maintenance_mode";

export async function isMaintenanceMode() {
  const flag = await prisma.featureFlag.findUnique({ where: { key: MAINTENANCE_FLAG_KEY } });
  return !!flag?.enabled;
}

export async function setMaintenanceMode(on, adminId, reason = null) {
  const enabled = !!on;
  await prisma.featureFlag.upsert({
    where: { key: MAINTENANCE_FLAG_KEY },
    create: {
      key: MAINTENANCE_FLAG_KEY,
      name: "Maintenance mode",
      description:
        "When on, /studio and state-changing API routes return 503. Health, admin, cron, webhooks and the Stripe webhook always stay reachable.",
      enabled,
    },
    update: { enabled },
  });
  await prisma.auditLog.create({
    data: {
      userId: adminId || null,
      action: "admin_maintenance_mode",
      resource: "feature_flag",
      resourceId: MAINTENANCE_FLAG_KEY,
      metadata: { enabled, reason: reason || null },
    },
  });
  return { enabled };
}

// Canonical adapter keys — src/lib/providers.js's PROVIDERS registry and
// getProviderActivity()'s substring match both key off these. Restricting
// setProviderDisabled to this fixed set (rather than accepting whatever
// casing/string an admin types) guarantees it always upserts the SAME
// ProviderConfig row getProviderActivity reads back — no casing-drift
// duplicate row possible.
export const KNOWN_PROVIDER_KEYS = ["kie", "alibaba"];

export async function isProviderDisabled(name) {
  const key = (name || "").toLowerCase();
  const activity = await getProviderActivity();
  // null = no ProviderConfig rows at all (env-only mode) -> nothing is disabled.
  if (!activity) return false;
  return activity[key] === false;
}

export async function setProviderDisabled(name, disabled, adminId, reason = null) {
  const key = (name || "").toLowerCase();
  if (!KNOWN_PROVIDER_KEYS.includes(key)) {
    throw new Error(`Unknown provider "${name}" — expected one of: ${KNOWN_PROVIDER_KEYS.join(", ")}`);
  }
  const isActive = !disabled;
  await prisma.providerConfig.upsert({
    where: { name: key },
    create: { name: key, type: "media", isActive },
    update: { isActive },
  });
  await prisma.auditLog.create({
    data: {
      userId: adminId || null,
      action: "admin_provider_kill_switch",
      resource: "provider_config",
      resourceId: key,
      metadata: { disabled: !!disabled, reason: reason || null },
    },
  });
  return { name: key, disabled: !!disabled };
}
