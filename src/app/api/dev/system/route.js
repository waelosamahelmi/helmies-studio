import { NextResponse } from "next/server";
import os from "os";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { requireDeveloper, run } from "@/lib/dev-guard";
import { parseDf, parseFree } from "@/lib/dev-ops.mjs";
import prisma from "@/lib/prisma";

/* What the box is doing, and what is actually deployed on it.

   The commit matters more than it looks: "I deployed that" and "that is
   what is running" are different claims, and every confusing session
   where a fix appeared not to work has come from the gap between them. */

export async function GET(req) {
  try {
    await requireDeveloper(req);

    const [df, free, commit, queue] = await Promise.all([
      run("df", ["-k", process.cwd()], { timeout: 5000 }),
      run("free", ["-k"], { timeout: 5000 }),
      run("git", ["-C", process.cwd(), "log", "-1", "--format=%h %s (%cr)"], { timeout: 5000 }),
      prisma.generationJob
        .groupBy({ by: ["status"], _count: { _all: true } })
        .catch(() => []),
    ]);

    return NextResponse.json({
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
      cpus: os.cpus().length,
      appUptimeMs: Math.round(process.uptime() * 1000),
      hostUptimeMs: Math.round(os.uptime() * 1000),
      disk: parseDf(df.stdout),
      memory: parseFree(free.stdout) || {
        total: os.totalmem(),
        used: os.totalmem() - os.freemem(),
        available: os.freemem(),
        percent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
      },
      commit: commit.stdout.trim() || null,
      queue: Object.fromEntries((queue || []).map((r) => [r.status, r._count._all])),
    });
  } catch (e) {
    if (e?.status === 404) return apiError({ code: "not_found" });
    return authzResponse(e);
  }
}
