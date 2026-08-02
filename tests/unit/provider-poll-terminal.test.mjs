import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Regression coverage for pollProviderResult's terminal-failure bug.
//
// The per-attempt catch treats EVERY thrown error the same way — swallow
// it unless this was the last attempt (`if (attempt === maxAttempts) throw
// e;`). That includes the error the loop itself throws two lines above the
// catch when the provider reports a terminal "failed" status
// (`throw new Error(brandError(parsed.error || ""))`). A provider-reported
// failure is never going to resolve on a later attempt, but the old code
// polled it right through to maxAttempts (default 900 attempts * up-to-10s
// backoff ~= 30-150 minutes) anyway, pinning a worker slot the whole time.
//
// Fix: mark the terminal-failure error (e.g. `err.terminal = true`) before
// throwing it, and rethrow immediately in the catch when that flag is set —
// before the `attempt === maxAttempts` retry check. Transient errors
// (network failures, non-terminal HTTP problems) are unmarked and keep
// retrying exactly as before.

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { pollProviderResult, brandError } from "@/lib/providers";

function makeProvider() {
  return {
    apiKey: "test-key",
    baseUrl: "https://api.example.test",
    buildPollUrl: (requestId) => `/poll/${requestId}`,
    parsePoll: (data) => ({
      status: (data.status || "").toLowerCase(),
      outputs: data.outputs || [],
      error: data.error,
    }),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pollProviderResult — terminal provider-reported failures fail fast", () => {
  it("rejects immediately (no further polling) when the provider reports a failed status on attempt 1", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "failed", error: "content filter" }),
    });

    const provider = makeProvider();

    await expect(pollProviderResult(provider, "req-1", 900, 1)).rejects.toThrow(
      brandError("content filter")
    );
    // The whole point of the fix: one fetch, not a retry loop up to maxAttempts.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("still retries through transient 5xx responses and resolves once the provider succeeds", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "server error" })
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => "bad gateway" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "completed", outputs: ["https://out.example/1.png"] }),
      });

    const provider = makeProvider();

    const result = await pollProviderResult(provider, "req-2", 900, 1);

    expect(result.outputs).toEqual(["https://out.example/1.png"]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("still throws the timeout error after maxAttempts when the provider stays pending forever", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "pending" }),
    });

    const provider = makeProvider();

    await expect(pollProviderResult(provider, "req-3", 2, 1)).rejects.toThrow(/took too long/i);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
