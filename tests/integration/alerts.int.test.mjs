import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createUserWithWallet } from "./setup.mjs";

// GET /api/cron/alerts against real Postgres — seeds a genuinely stale
// queued job (nextRunAt far enough in the past that collectMetrics's
// oldestQueuedAgeSec crosses the worker-liveness critical threshold), hits
// the real route handler, and proves: a critical alert is produced and
// delivered exactly once via a stubbed webhook, then suppressed on an
// immediate second call (the FeatureFlag-backed dedup window).

const CRON_SECRET = "alerts-int-test-secret";
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

let prisma;
beforeEach(async () => {
  prisma = await resetDb();
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts-int-test";
});

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  if (ORIGINAL_ALERT_WEBHOOK_URL === undefined) delete process.env.ALERT_WEBHOOK_URL;
  else process.env.ALERT_WEBHOOK_URL = ORIGINAL_ALERT_WEBHOOK_URL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeRequest() {
  return new Request("http://test/api/cron/alerts", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

async function seedStaleQueuedJob(userId) {
  return prisma.generationJob.create({
    data: {
      generationId: `gen-${randomUUID()}`,
      userId,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      timeoutAt: new Date(Date.now() + 60 * 60 * 1000),
      // 1000s in the past — comfortably past the 900s worker-liveness
      // critical threshold and the 300s queue-backlog warn threshold.
      nextRunAt: new Date(Date.now() - 1000 * 1000),
    },
  });
}

describe("GET /api/cron/alerts — auth", () => {
  it("401s with no Authorization header", async () => {
    const { GET } = await import("@/app/api/cron/alerts/route.js");
    const res = await GET(new Request("http://test/api/cron/alerts"));
    expect(res.status).toBe(401);
  });

  it("401s with the wrong bearer secret", async () => {
    const { GET } = await import("@/app/api/cron/alerts/route.js");
    const res = await GET(new Request("http://test/api/cron/alerts", { headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/alerts — evaluate, deliver, and dedupe against real Postgres", () => {
  it("fires a critical worker-liveness alert, delivers it once via a stubbed webhook, then suppresses it on an immediate second call", async () => {
    const user = await createUserWithWallet(100);
    await seedStaleQueuedJob(user.id);

    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/cron/alerts/route.js");

    // ── First call: alert fires and is delivered ──
    const firstRes = await GET(makeRequest());
    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();

    expect(firstBody.fired).toBeGreaterThanOrEqual(1);
    expect(firstBody.delivery.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/alerts-int-test");
    const payload = JSON.parse(options.body);
    const firedKeys = payload.alerts.map((a) => a.key);
    expect(firedKeys).toContain("worker_liveness");
    const workerAlert = payload.alerts.find((a) => a.key === "worker_liveness");
    expect(workerAlert.severity).toBe("critical");
    // Never leaks secrets/prompt text into the delivered payload.
    expect(JSON.stringify(payload)).not.toMatch(/secret|token|password|prompt/i);

    // ── Second, immediate call: same alert is suppressed by the dedup window ──
    const secondRes = await GET(makeRequest());
    expect(secondRes.status).toBe(200);
    const secondBody = await secondRes.json();

    // worker_liveness (and queue_backlog, same underlying signal) were just
    // fired — neither should fire again within the same call.
    expect(secondBody.fired).toBe(0);
    expect(secondBody.delivery.delivered).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still just the one delivery from the first call

    // The dedup state itself is a real FeatureFlag row.
    const stateRow = await prisma.featureFlag.findUnique({ where: { key: "alert_state:worker_liveness" } });
    expect(stateRow).toBeTruthy();
    expect(stateRow.config.lastFiredAt).toBeTruthy();
  });

  // IMPORTANT 1 (executed-proof review finding): dedup state must be
  // recorded ONLY on a confirmed delivery. Proven here against a REAL
  // FeatureFlag row, not just a mocked prisma call: with the webhook
  // returning 500, the critical alert must NOT be suppressed on the very
  // next call — a 60-minute blackout on an undelivered wallet-drift/
  // worker-liveness critical is exactly what alerting exists to prevent.
  it("a failed webhook delivery leaves the alert un-recorded — it is still due on an immediate second call", async () => {
    const user = await createUserWithWallet(100);
    await seedStaleQueuedJob(user.id);

    const fetchMock = vi.fn().mockResolvedValue(new Response("server error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/cron/alerts/route.js");

    const firstRes = await GET(makeRequest());
    const firstBody = await firstRes.json();
    expect(firstBody.fired).toBeGreaterThanOrEqual(1);
    expect(firstBody.delivery.delivered).toBe(false); // webhook 500'd

    // No FeatureFlag dedup row was written — delivery never succeeded.
    const stateRow = await prisma.featureFlag.findUnique({ where: { key: "alert_state:worker_liveness" } });
    expect(stateRow).toBeNull();

    // Second, immediate call: the SAME critical alert fires again (not
    // suppressed), and delivery is attempted again (not skipped).
    const secondRes = await GET(makeRequest());
    const secondBody = await secondRes.json();
    expect(secondBody.fired).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evaluates cleanly with no alerts when nothing is amiss", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/cron/alerts/route.js");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evaluated).toBe(0);
    expect(body.fired).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
