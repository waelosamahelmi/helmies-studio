import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";

// Phase 5 Task 2 — proves the E2E_MOCK_PROVIDERS safety lock in
// src/lib/providers.js. That flag stands in for a real provider call in
// the money path (a generation's actual KIE/Alibaba submission), so
// activating it requires BOTH the env var AND DATABASE_URL pointing at
// localhost — a deliberate second lock. A stray E2E_MOCK_PROVIDERS=1 in a
// real deployment (whose DATABASE_URL is never localhost) must never be
// enough on its own to make a real generation return the fixture image
// instead of actually calling the provider.
//
// The lock is read into a module-level const at import time
// (`const E2E_MOCK_PROVIDERS = ... && /localhost|127\.0\.0\.1/.test(...)`),
// so each case below resets the module registry and re-imports fresh with
// the env set beforehand — a single static import can't observe two
// different values of it across cases.

vi.mock("@/lib/prisma", () => ({ default: {} }));

const ORIGINAL_ENV = { ...process.env };
const FIXTURE_PATH = join(process.cwd(), "public", "media", "e2e-fixture.png");

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  // The "activated" case below writes the fixture file for real (the same
  // fs.writeFile a live E2E run relies on to make the returned URL
  // genuinely servable) — clean it up so a `npm test` run never leaves a
  // stray file behind in public/media.
  await rm(FIXTURE_PATH, { force: true });
});

describe("providers.js — E2E_MOCK_PROVIDERS requires BOTH the env var and a local DATABASE_URL", () => {
  it("does NOT short-circuit when E2E_MOCK_PROVIDERS=1 but DATABASE_URL is a real (non-local) database", async () => {
    process.env.E2E_MOCK_PROVIDERS = "1";
    process.env.DATABASE_URL = "postgresql://prod-user:prod-pass@prod-db.example.com:5432/prod";
    process.env.KIE_KEY = ""; // no key — proves the REAL path ran, not the mock's always-succeeds fixture

    const { submitOnly, brandError } = await import("@/lib/providers");

    await expect(
      submitOnly("kie", "image", { model: "some-model", prompt: "a real generation" }),
    ).rejects.toThrow(brandError("invalid_api_key"));

    // The real path's very first check is the API key, before any fetch —
    // it never gets far enough to touch the network either way here, so
    // the throw above (the REAL path's error, not the mock's fixture
    // output) is the actual proof the lock held for a non-local database.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does NOT short-circuit when DATABASE_URL is local but E2E_MOCK_PROVIDERS is unset", async () => {
    delete process.env.E2E_MOCK_PROVIDERS;
    process.env.DATABASE_URL = "postgresql://postgres:test@localhost:55432/test";
    process.env.KIE_KEY = "";

    const { submitOnly, brandError } = await import("@/lib/providers");

    await expect(
      submitOnly("kie", "image", { model: "some-model", prompt: "a real generation" }),
    ).rejects.toThrow(brandError("invalid_api_key"));
  });

  it("DOES short-circuit when E2E_MOCK_PROVIDERS=1 AND DATABASE_URL is localhost", async () => {
    process.env.E2E_MOCK_PROVIDERS = "1";
    process.env.DATABASE_URL = "postgresql://postgres:test@localhost:55432/test";
    process.env.KIE_KEY = ""; // deliberately no key — proves this path never reaches the real key check

    const { submitOnly } = await import("@/lib/providers");

    const result = await submitOnly("kie", "image", { model: "some-model", prompt: "a normal e2e prompt" });

    expect(result.immediateResult.outputs[0]).toMatch(/^\/api\/media\/local\//);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still fails a forced-failure prompt even when the lock is engaged", async () => {
    process.env.E2E_MOCK_PROVIDERS = "1";
    process.env.DATABASE_URL = "postgresql://127.0.0.1:55432/test";
    process.env.KIE_KEY = "";

    const { submitOnly, E2E_FORCE_FAIL_MARKER } = await import("@/lib/providers");

    await expect(
      submitOnly("kie", "image", { model: "some-model", prompt: `please fail ${E2E_FORCE_FAIL_MARKER}` }),
    ).rejects.toThrow("E2E forced provider failure");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
