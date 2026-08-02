// Helmies Studio — E2E provider/network interception (Phase 5 Task 1)
//
// stubProviders(page) makes every request the BROWSER issues to the app's
// external hosts (KIE, Alibaba/DashScope, Stripe) resolve to a deterministic
// fixture, and fails the test loudly — never silently — if a request
// escapes to an external host nobody stubbed.
//
// ARCHITECTURE NOTE (read before wiring a generation journey to this):
// page.route() only intercepts requests the BROWSER makes. Stripe.js
// (Stripe Checkout / Elements) calls api.stripe.com straight from the page,
// so that leg is genuinely covered here. The KIE/Alibaba provider calls are
// NOT: src/lib/providers.js makes them with server-side `fetch()`, and only
// from inside the durable job runner (src/lib/job-runner.js), which only
// runs under the separate scripts/worker.mjs process (PM2's
// "helmies-worker" in production — see ecosystem.config.cjs). Playwright's
// webServer here only runs `next build && next start`; it never spawns that
// worker. That is intentional and safe for this task (a submitted
// generation just stays "pending" — zero network, zero cost, fully
// deterministic) but it means a future journey that needs a generation to
// actually reach "completed" cannot get there through page.route alone — it
// needs a server-side hook (e.g. an E2E-only short-circuit in
// src/lib/providers.js gated by an env var, exercised by a worker process
// Playwright also starts). Flagging this here rather than quietly building
// a fixture that looks complete but can never fire.
const APP_ORIGIN = "http://localhost:3399";

function jsonResponse(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

// KIE (src/lib/providers.js PROVIDERS.kie): createTask returns a taskId,
// recordInfo polls for it. Shapes mirror parseResult/parsePoll exactly so a
// caller that ever does reach this stub (e.g. a direct fetch from the
// browser in a future test) gets back something the app can actually parse.
async function fulfillKie(route) {
  const url = route.request().url();
  if (url.includes("/createTask")) {
    return route.fulfill(jsonResponse({ code: 200, msg: "success", data: { taskId: "e2e-kie-task-1", state: "waiting" } }));
  }
  if (url.includes("/recordInfo")) {
    return route.fulfill(jsonResponse({
      code: 200,
      msg: "success",
      data: {
        state: "success",
        resultJson: JSON.stringify({ resultUrls: ["https://picsum.photos/seed/e2e-kie/512"] }),
      },
    }));
  }
  return route.fulfill(jsonResponse({ code: 200, msg: "success", data: {} }));
}

// Alibaba/DashScope image generations resolve synchronously as a bare array
// of { url } (PROVIDERS.alibaba.parseResult's Array.isArray branch).
async function fulfillAlibaba(route) {
  return route.fulfill(jsonResponse([{ url: "https://picsum.photos/seed/e2e-alibaba/512" }]));
}

// Stripe Checkout Session creation — enough shape for a client that reads
// `.url` and redirects to it (Stripe.js's redirectToCheckout / a server
// action returning the session URL).
async function fulfillStripe(route) {
  return route.fulfill(jsonResponse({
    id: "cs_test_e2e_stub",
    object: "checkout.session",
    url: `${APP_ORIGIN}/settings?tab=billing&e2e_mock_checkout=1`,
  }));
}

export async function stubProviders(page) {
  // Registered FIRST: Playwright evaluates routes most-recently-registered
  // first, so the host-specific stubs registered below always get first
  // crack at a request and this only ever fires for something none of them
  // matched.
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    // Non-network schemes (data:, blob:, chrome-extension:, about:, ...)
    // aren't provider traffic — never touch them.
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return route.continue();
    }
    // The app itself — always let it through.
    if (url.origin === APP_ORIGIN) {
      return route.continue();
    }

    // Reaching here means a request escaped every stub below. Never let it
    // actually leave the machine (it could spend real money), and fail the
    // test loudly instead of the page silently hanging on it.
    await route.abort("failed");
    throw new Error(
      `stubProviders: un-stubbed external request to ${url.href} — add a fixture in tests/e2e/fixtures/intercept.mjs.`,
    );
  });

  await page.route("https://api.kie.ai/**", fulfillKie);
  await page.route("https://dashscope.aliyuncs.com/**", fulfillAlibaba);
  await page.route("https://*.aliyuncs.com/**", fulfillAlibaba);
  await page.route("https://api.stripe.com/**", fulfillStripe);
}
