import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { requireDeveloper, run } from "@/lib/dev-guard";
import { MANAGED_NAMES, MANAGED_PROCESSES } from "@/lib/dev-ops.mjs";

/* pm2 logs for one managed process.
   The name is checked against the list in source and passed as an argv
   element — `source` was once interpolated into a shell string, which is
   exactly the shape of bug this whole surface is built to not have. */

export async function GET(req) {
  try {
    await requireDeveloper(req);

    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source") || "helmies-studio";
    if (!MANAGED_NAMES.has(source)) {
      return apiError({ code: "bad_request", message: "That process is not managed here." });
    }
    const lines = Math.min(Math.max(parseInt(searchParams.get("lines"), 10) || 150, 10), 1000);

    const res = await run("pm2", ["logs", source, "--lines", String(lines), "--nostream", "--raw"], { timeout: 10000 });
    const out = res.stdout || res.stderr || "";
    const logs = out
      .split("\n")
      .filter((l) => !l.startsWith("[PM2") && !l.startsWith("__"))
      .slice(-lines)
      .join("\n");

    return NextResponse.json({
      logs: logs || "No logs available.",
      source,
      lines,
      sources: MANAGED_PROCESSES.map((p) => ({ name: p.name, label: p.label })),
    });
  } catch (e) {
    if (e?.status === 404) return apiError({ code: "not_found" });
    return authzResponse(e);
  }
}
