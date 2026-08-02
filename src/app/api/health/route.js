import { NextResponse } from "next/server";
import { isMaintenanceMode } from "@/lib/ops-flags";

// Public liveness/readiness probe. Also the signal middleware.js polls
// (same-origin fetch — see that file's header for why it can't import
// src/lib/ops-flags.js directly) to decide whether to show the maintenance
// page: this route runs under the normal Node.js route-handler runtime,
// where prisma is fine, unlike Edge middleware.
export async function GET() {
  let maintenance = false;
  let dbOk = true;
  try {
    maintenance = await isMaintenanceMode();
  } catch {
    // DB unreachable — still answer the liveness probe (the process itself
    // is up and answering HTTP) rather than 500ing the health check on a
    // dependency hiccup; report it via dbOk instead. Middleware's own fetch
    // treats a non-2xx or a bad body as "not in maintenance" either way.
    dbOk = false;
  }
  return NextResponse.json({ ok: true, dbOk, maintenance });
}
