import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/security";
import { PROVIDERS } from "@/lib/providers";

/* The admin Model Manager has a "Test" action that posted here, but the route
   did not exist — every test returned 404. This performs a real reachability
   check against the provider without spending credits: it resolves the model,
   confirms the provider is configured, and probes the provider's base URL. */

export async function POST(req) {
  try {
    await requireAdmin(req);
  } catch (e) {
    const forbidden = /admin/i.test(e?.message || "");
    return NextResponse.json(
      { error: e?.message || "Unauthorized" },
      { status: forbidden ? 403 : 401 },
    );
  }

  const started = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const modelId = String(body?.modelId || "").trim();
    if (!modelId) {
      return NextResponse.json({ ok: false, error: "modelId is required" }, { status: 400 });
    }

    const model = await prisma.modelPricing.findFirst({
      where: { OR: [{ id: modelId }, { modelId }] },
    });

    if (!model) {
      return NextResponse.json(
        { ok: false, error: "No pricing row for this model. Run a catalog sync first." },
        { status: 404 },
      );
    }

    const checks = [];

    checks.push({
      name: "Pricing row",
      ok: true,
      detail: `${model.credits ?? "—"} credits · ${model.isActive ? "active" : "inactive"}`,
    });

    checks.push({
      name: "Endpoint",
      ok: !!model.endpoint,
      detail: model.endpoint || "missing — generations will fall back to the model id",
    });

    const providerKey = String(model.provider || "").toLowerCase();
    const provider =
      PROVIDERS?.[providerKey] ||
      Object.values(PROVIDERS || {}).find(
        (p) => String(p?.name || "").toLowerCase() === providerKey,
      );

    checks.push({
      name: "Provider",
      ok: !!provider,
      detail: provider ? `${model.provider} configured` : `${model.provider || "unknown"} is not in the provider registry`,
    });

    const keyEnv = provider?.keyEnv || (providerKey.includes("kie") ? "KIE_KEY" : null);
    if (keyEnv) {
      checks.push({
        name: "Credentials",
        ok: !!process.env[keyEnv],
        detail: process.env[keyEnv] ? `${keyEnv} is set` : `${keyEnv} is not set on this server`,
      });
    }

    // Reachability — a HEAD against the provider base URL. Never submits a job,
    // so this costs nothing.
    if (provider?.baseUrl) {
      try {
        const res = await fetch(provider.baseUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "HelmiesStudio/1.0" },
        });
        checks.push({
          name: "Reachability",
          ok: res.status < 500,
          detail: `${provider.baseUrl} → HTTP ${res.status}`,
        });
      } catch (e) {
        checks.push({
          name: "Reachability",
          ok: false,
          detail: `${provider.baseUrl} → ${e?.name === "TimeoutError" ? "timed out" : e?.message || "unreachable"}`,
        });
      }
    }

    const ok = checks.every((c) => c.ok);

    return NextResponse.json(
      {
        ok,
        model: model.displayName || model.modelId,
        provider: model.provider,
        elapsedMs: Date.now() - started,
        checks,
        ...(ok ? {} : { error: checks.find((c) => !c.ok)?.detail }),
      },
      { status: ok ? 200 : 422 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Test failed", elapsedMs: Date.now() - started },
      { status: 500 },
    );
  }
}
