import { NextResponse } from "next/server";
import { requireAdminUser, authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import {
  isMaintenanceMode,
  setMaintenanceMode,
  isProviderDisabled,
  setProviderDisabled,
  KNOWN_PROVIDER_KEYS,
} from "@/lib/ops-flags";

// Reads both operator controls in one call so the admin ops panel (Task 4)
// can render a single screen without racing two separate requests.
export async function GET(req) {
  try {
    await requireAdminUser(req);
    const [maintenance, providers] = await Promise.all([
      isMaintenanceMode(),
      Promise.all(
        KNOWN_PROVIDER_KEYS.map(async (name) => ({ name, disabled: await isProviderDisabled(name) }))
      ),
    ]);
    return NextResponse.json({ maintenance, providers });
  } catch (e) {
    return authzResponse(e);
  }
}

// { action: "maintenance", enabled: boolean, reason?: string }
// { action: "provider", name: "kie"|"alibaba", disabled: boolean, reason?: string }
export async function POST(req) {
  try {
    const admin = await requireAdminUser(req);
    verifyOrigin(req);
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

    if (body.action === "maintenance") {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
      }
      const result = await setMaintenanceMode(body.enabled, admin.id, reason);
      return NextResponse.json(result);
    }

    if (body.action === "provider") {
      const name = typeof body.name === "string" ? body.name.toLowerCase() : "";
      if (!KNOWN_PROVIDER_KEYS.includes(name)) {
        return NextResponse.json(
          { error: `Unknown provider "${body.name}" — expected one of: ${KNOWN_PROVIDER_KEYS.join(", ")}` },
          { status: 400 }
        );
      }
      if (typeof body.disabled !== "boolean") {
        return NextResponse.json({ error: "disabled must be a boolean" }, { status: 400 });
      }
      const result = await setProviderDisabled(name, body.disabled, admin.id, reason);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return authzResponse(e);
  }
}
