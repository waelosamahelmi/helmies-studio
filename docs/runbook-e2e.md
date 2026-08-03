# Runbook: end-to-end tests (Playwright)

The E2E suite (`tests/e2e/*.spec.mjs`, driven by `playwright.config.mjs`)
builds and runs the real app (`next build && next start -p 3399`) against a
disposable local Postgres, seeds deterministic fixtures via
`tests/e2e/fixtures/seed.mjs`, logs real users in through the real `/login`
form, and asserts on user-visible DOM. `tests/e2e/a11y.spec.mjs` runs
`@axe-core/playwright` over the same pages in the same run. This is
Phase 5's "prove it works for a real user in a real browser" layer, on top
of (not instead of) the unit (`npm test`) and integration
(`npm run test:integration`) suites.

## The browser matrix (Phase 8 Task B2)

Every spec runs on three Playwright projects — `chromium`, `firefox`,
`webkit` — all defined in `playwright.config.mjs` and all depending on the
same `setup` project (one seed, one set of `storageState` cookie files;
cookies are valid for any engine hitting the same app origin, so there is no
reason to seed three times). `npm run test:e2e` with no `--project` flag
runs the full suite on all three; `npx playwright test --project=firefox`
(or `chromium`/`webkit`) runs just one, useful when iterating on a single
engine's failure.

First run on a machine that has never used Playwright's Firefox/WebKit
builds needs `npx playwright install firefox webkit` (or `--with-deps` on
Linux, matching the chromium install below) before `npm run test:e2e` will
find those two engines.

As of the Task B2 baseline recorded below, all 30 specs pass identically on
all three engines — no per-browser skip, no browser-specific test-only
workaround was needed. If a *future* spec needs one:

- **A real cross-browser product bug** (e.g. a CSS property Firefox/WebKit
  render differently, a keyboard-event quirk WebKit doesn't fire the same
  way) gets fixed in the **product** — the whole point of running the
  matrix is to catch these before a real Firefox/Safari user does.
- **A test artifact** (a Chromium-only selector, a timing assumption that
  happens to hold on one engine's event loop but not another's) gets fixed
  in the **test**, and the fix should say so in a comment — never silently
  loosen an assertion to paper over a real difference.
- **Skipping a browser entirely** for a spec (`test.skip(({ browserName })
  => browserName === "webkit", "reason")`) is a last resort and must be
  justified in the spec's own comment and in whatever report describes the
  change — an unexplained skip defeats the purpose of the matrix.

## Running locally

1. Start the disposable test Postgres container (same one integration tests
   use — see `docs/superpowers/plans/2026-08-02-phase5-e2e-accessibility.md`
   and prior phases' plans for how it was first created):

   ```bash
   docker start helmies-test-pg
   # or, if it doesn't exist yet:
   docker run -d --name helmies-test-pg -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test -p 55432:5432 postgres:16
   ```

2. Run the suite:

   ```bash
   npm run test:e2e
   ```

   `playwright.config.mjs` handles everything else: it builds the app,
   starts it on port 3399 against
   `postgresql://postgres:test@localhost:55432/test` (hardcoded in the
   config — **never** the `.env` `DATABASE_URL`, see "Never touches real
   providers or Stripe" below), starts a second process
   (`scripts/worker.mjs`) to drain the generation job queue, seeds fixtures,
   logs the seeded users in, and runs every `*.spec.mjs` under `tests/e2e/`.

First run is slow (`next build` + Playwright downloading the Chromium
binary if it isn't cached yet — `npx playwright install --with-deps
chromium` if you've never run Playwright on this machine before). Subsequent
runs reuse the build cache and, locally (not in CI — see "Fixed port"
below), reuse an already-running webServer if one is still up.

## Debugging a failing spec

- **`--headed`** — run with a visible browser window instead of headless:
  ```bash
  npx playwright test tests/e2e/generation.spec.mjs --headed
  ```
- **`--ui`** — Playwright's interactive UI mode: step through actions, watch
  the DOM, time-travel between steps. The most useful tool for a flaky or
  confusing failure:
  ```bash
  npx playwright test --ui
  ```
- **Trace viewer** — `playwright.config.mjs` sets `trace: "on-first-retry"`,
  so a trace is only captured when a test fails and gets retried (retries
  are 1 in CI, 0 locally by default — force a trace locally with
  `--trace on` if you want one on the first failure). Open a captured trace:
  ```bash
  npx playwright show-trace test-results/<test-name>/trace.zip
  ```
- **The HTML report** — every run writes `playwright-report/` (the
  `reporter: [["html", { open: "never" }]]` config). Open it manually after
  a run:
  ```bash
  npx playwright show-report
  ```
  In CI, this directory is only uploaded as a build artifact when the `e2e`
  job fails (`.github/workflows/ci.yml`, `actions/upload-artifact@v4`,
  `if: failure()`) — download it from the failed run's "Artifacts" section
  in the GitHub Actions UI to get the same report, traces, and screenshots
  you'd see locally.

## Hard rule: E2E never touches a real provider or Stripe

No spec in this suite may cost real money or credits against a live KIE,
Alibaba/DashScope, or Stripe API. This is enforced at two independent
layers, because a single layer can't cover both call sites:

1. **Browser-side calls** — `tests/e2e/fixtures/intercept.mjs`'s
   `stubProviders(page)` uses Playwright's `page.route()` to intercept every
   request the *browser* makes to `api.kie.ai`, `dashscope.aliyuncs.com`,
   and `api.stripe.com` (Stripe.js/Checkout calls these directly from the
   page) and answers with a deterministic fixture. Any request to an
   external host nobody stubbed fails the test loudly instead of silently
   passing through.
2. **Server-side calls** — the actual KIE/Alibaba submission for an async
   generation happens inside the durable job runner
   (`src/lib/job-runner.js`), which only runs under the separate
   `scripts/worker.mjs` process — a process `page.route()` has no way to
   reach. `src/lib/providers.js` has an E2E-only short-circuit
   (`E2E_MOCK_PROVIDERS`, see its "E2E provider short-circuit" comment
   block) that makes `submitOnly` return a fixture image instead of calling
   a real provider. Because this stands in for a real call in the money
   path, activating it requires **both**:
   - `E2E_MOCK_PROVIDERS=1` (set on the `worker` webServer entry's env in
     `playwright.config.mjs`, never set anywhere else), **and**
   - `DATABASE_URL`'s **hostname** (parsed with the `URL` API, not a
     substring/regex match over the whole connection string) being exactly
     `localhost` or `127.0.0.1`.

   A production `DATABASE_URL`'s hostname is never `localhost`, so no
   misconfigured or stray `E2E_MOCK_PROVIDERS` env var can ever make a real
   deployment silently answer a generation with the fixture image instead of
   actually calling the provider. `tests/unit/providers-e2e-mock.test.mjs`
   asserts this lock holds, including the case that used to defeat the old
   substring check: a remote host whose *credentials* merely contain the
   literal word `"localhost"` must still take the real path.

If you're extending this suite with a new external call, stub it in
`intercept.mjs` (browser-side) or route it through the same
`E2E_MOCK_PROVIDERS` seam (server-side) — do not add a spec that can reach a
real API under any circumstance.

## Fixed port 3399 — two concurrent local runs share one server

`playwright.config.mjs` hardcodes the app to port 3399 and, locally
(`reuseExistingServer: !process.env.CI`), reuses whatever's already
listening there instead of starting a fresh build. This is a deliberate
speed-up for iterating on one spec at a time, but it means **two `npm run
test:e2e` invocations started at the same time on the same machine share
the same running app and worker** — they are not isolated from each other.
Money-mutating specs already protect themselves against each other via
per-test isolated users (`tests/e2e/fixtures/db.mjs`'s
`createIsolatedUser`), but a second concurrent run can still: race the
`setup` project's seeding step, contend for the same fixed port during the
build/start handshake, or make failures harder to attribute to the right
run's logs. **Serialize local E2E runs** — don't kick off a second `npm run
test:e2e` while one is still in progress. CI doesn't have this problem:
`reuseExistingServer` is forced off there, and each workflow run gets its
own fresh runner and its own Postgres service container.

## The model-picker sheet only exists below 900px

The studio's model picker renders as an inline desktop panel at wide
viewports and as a bottom sheet overlay only below 900px (see
`tests/e2e/a11y.spec.mjs`'s "studio model-picker sheet" test and its
keyboard-traversal test for the reference implementation). Any spec that
needs to interact with the **sheet** variant — open it, check its
accessibility tree, test its focus trap/Escape behavior — must call
`page.setViewportSize({ width: 800, height: 900 })` (or narrower) before
opening it. Testing the same interaction at a default/wide viewport
exercises the inline panel instead and will not catch sheet-specific bugs
(focus trap, `aria-*` on the overlay, Escape-to-close).

## CI

`.github/workflows/ci.yml`'s `e2e` job runs this suite on every pull
request (and on push to `main`): a `postgres:16` service container shaped
to match `playwright.config.mjs`'s hardcoded
`postgresql://postgres:test@localhost:55432/test` exactly (same
user/password/db, same `55432` host port), `npx prisma migrate deploy`
against it, `npx playwright install --with-deps chromium firefox webkit`,
then `npm run test:e2e` — one job, all three engines, since
`playwright.config.mjs` runs every project by default when no `--project`
flag is given. On failure, the `playwright-report/` HTML report is uploaded
as a build artifact (see "The HTML report" above for how to use it) — the
report groups failures by project, so a webkit-only failure is easy to tell
apart from a genuine cross-browser one.
