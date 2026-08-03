import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

// Phase 8 Task A2's alert dedup state (src/lib/alerts.js's recordAlertsFired)
// is deliberately stored in THIS table (key prefix "alert_state:") rather
// than a new model — but it is internal bookkeeping, not an operator
// toggle: it must never appear in the admin Feature Flags UI as if it were
// a real flag (an admin could otherwise stumble onto it and toggle
// `enabled` or overwrite its `config.lastFiredAt`, silently corrupting the
// dedup window) and must never be writable through this endpoint either.
const ALERT_STATE_PREFIX = "alert_state:";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const flags = await prisma.featureFlag.findMany({
      where: { NOT: { key: { startsWith: ALERT_STATE_PREFIX } } },
      orderBy: { key: "asc" },
    });
    return NextResponse.json(flags);
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { key, name, description, enabled, config } = await req.json();
    if (typeof key === "string" && key.startsWith(ALERT_STATE_PREFIX)) {
      return NextResponse.json({ error: "This key is reserved for internal alert dedup state and cannot be edited here." }, { status: 400 });
    }
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, name, description, enabled: enabled ?? false, config },
      update: { name, description, enabled, config },
    });
    await logAudit("admin_toggle_flag", "feature_flag", key, { enabled }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}