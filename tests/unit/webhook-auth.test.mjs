import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Webhook routes (inbound, called by the generation provider) and cron
// routes (called by our own scheduler) must not share one interchangeable
// bearer secret — that's the whole point of Task 10. Webhook routes prefer
// the dedicated WEBHOOK_SECRET, but keep accepting CRON_SECRET as a
// deprecated fallback (with a console.warn) for as long as an environment
// hasn't set WEBHOOK_SECRET yet. Cron routes only ever accept CRON_SECRET —
// a WEBHOOK_SECRET-bearing caller must never be able to trigger a cron job.

vi.mock("@/lib/generation-webhook", () => ({
  handleGenerationWebhook: vi.fn().mockResolvedValue({ status: 200, response: { success: true } }),
}));
vi.mock("@/lib/automation", () => ({
  runAutomation: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/kie-sync", () => ({
  syncKieModels: vi.fn().mockResolvedValue({ total: 1 }),
}));
vi.mock("@/lib/model-catalog", () => ({
  syncAlibabaModels: vi.fn().mockResolvedValue({ total: 1 }),
}));

import { POST as generationCompletePOST } from "@/app/api/webhooks/generation-complete/route.js";
import { POST as generationPOST } from "@/app/api/webhooks/generation/route.js";
import { GET as automationGET } from "@/app/api/cron/automation/route.js";
import { POST as syncKiePOST } from "@/app/api/cron/sync-kie/route.js";

const ORIGINAL_ENV = { ...process.env };

function req(secretHeader, method = "POST") {
  const headers = {};
  if (secretHeader !== undefined) headers.authorization = `Bearer ${secretHeader}`;
  return new Request("http://test/x", {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify({}),
  });
}

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.WEBHOOK_SECRET;
  delete process.env.CRON_SECRET;
}

const webhookRoutes = [
  ["generation-complete", generationCompletePOST],
  ["generation", generationPOST],
];

describe.each(webhookRoutes)("POST /api/webhooks/%s — WEBHOOK_SECRET preferred, CRON_SECRET deprecated fallback", (_name, POST) => {
  let warnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    resetEnv();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a request bearing WEBHOOK_SECRET, with no deprecation warning", async () => {
    process.env.WEBHOOK_SECRET = "wh-secret";
    const res = await POST(req("wh-secret"));
    expect(res.status).toBe(200);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("accepts CRON_SECRET when WEBHOOK_SECRET is unset, but logs a deprecation warning", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const res = await POST(req("cron-secret"));
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0].join(" ")).toMatch(/deprecat/i);
  });

  it("rejects a CRON_SECRET-bearing request once WEBHOOK_SECRET is configured — no more dual acceptance", async () => {
    process.env.WEBHOOK_SECRET = "wh-secret";
    process.env.CRON_SECRET = "cron-secret";
    const res = await POST(req("cron-secret"));
    expect(res.status).toBe(401);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 401", async () => {
    process.env.WEBHOOK_SECRET = "wh-secret";
    const res = await POST(req("nope"));
    expect(res.status).toBe(401);
  });

  it("rejects a missing Authorization header with 401 when a secret is configured", async () => {
    process.env.WEBHOOK_SECRET = "wh-secret";
    const res = await POST(req(undefined));
    expect(res.status).toBe(401);
  });

  it("returns 503 when neither secret is configured (fail closed)", async () => {
    const res = await POST(req("anything"));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/cron/automation — CRON_SECRET only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnv();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a request bearing CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const res = await automationGET(req("cron-secret", "GET"));
    expect(res.status).toBe(200);
  });

  it("rejects a WEBHOOK_SECRET-bearing request that doesn't match CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.WEBHOOK_SECRET = "wh-secret";
    const res = await automationGET(req("wh-secret", "GET"));
    expect(res.status).toBe(401);
  });

  it("rejects when CRON_SECRET is unset, even if WEBHOOK_SECRET is set (no fallback)", async () => {
    process.env.WEBHOOK_SECRET = "wh-secret";
    const res = await automationGET(req("wh-secret", "GET"));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret with 401", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const res = await automationGET(req("nope", "GET"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/cron/sync-kie — CRON_SECRET only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnv();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a request bearing CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const res = await syncKiePOST(req("cron-secret"));
    expect(res.status).toBe(200);
  });

  it("rejects a WEBHOOK_SECRET-bearing request that doesn't match CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.WEBHOOK_SECRET = "wh-secret";
    const res = await syncKiePOST(req("wh-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 503 when CRON_SECRET is unset, even if WEBHOOK_SECRET is set (no fallback)", async () => {
    process.env.WEBHOOK_SECRET = "wh-secret";
    const res = await syncKiePOST(req("wh-secret"));
    expect(res.status).toBe(503);
  });

  it("rejects a wrong secret with 401", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const res = await syncKiePOST(req("nope"));
    expect(res.status).toBe(401);
  });
});
