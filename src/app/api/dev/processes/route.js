import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { requireDeveloper, run } from "@/lib/dev-guard";
import { parseProcessList, validateProcessAction, MANAGED_PROCESSES } from "@/lib/dev-ops.mjs";
import { logAudit } from "@/lib/security";

/* Dev mode — the processes this box runs.
   ────────────────────────────────────────────────────────────────────────
   A fixed verb on a fixed name. Nothing from the request is ever built
   into a command: `pm2` is called with an argv array, the name is checked
   against a list in source, and the action against a set of four. There is
   no path here that runs a string somebody sent us. */

export async function GET(req) {
  try {
    await requireDeveloper(req);
    const res = await run("pm2", ["jlist"], { timeout: 8000 });
    if (!res.ok && !res.stdout) {
      return NextResponse.json({ processes: [], managed: MANAGED_PROCESSES, error: "pm2 is not answering." });
    }
    return NextResponse.json({ processes: parseProcessList(res.stdout), managed: MANAGED_PROCESSES });
  } catch (e) {
    if (e?.status === 404) return apiError({ code: "not_found" });
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    const user = await requireDeveloper(req);
    verifyOrigin(req);

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name : "";
    const action = typeof body.action === "string" ? body.action : "";

    const check = validateProcessAction(name, action);
    if (!check.ok) return apiError({ code: "invalid_params", message: check.error });

    const res = await run("pm2", [action, name], { timeout: 30000 });
    // Restarting the app that serves this request kills the response, so a
    // dead socket here is success, not failure.
    await logAudit("dev.process", "process", name, { action, ok: res.ok, by: user.email }, req);

    if (!res.ok) {
      return apiError({ code: "internal", message: res.error || `pm2 ${action} failed.`, retryable: true });
    }
    return NextResponse.json({ success: true, name, action });
  } catch (e) {
    if (e?.status === 404) return apiError({ code: "not_found" });
    return authzResponse(e);
  }
}
