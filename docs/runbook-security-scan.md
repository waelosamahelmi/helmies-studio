# Runbook: OWASP ZAP baseline scan (Phase 8 Task B3)

## What this is — and, more importantly, what it is NOT

`scripts/security-scan.sh` builds a real production build of the app,
starts it against the disposable local test Postgres (never `.env`'s
`DATABASE_URL` — see the script's own hostname guard), and runs the
[OWASP ZAP](https://www.zaproxy.org/) **baseline** scan against it in
Docker: a passive spider (it crawls every link it can reach and inspects
the responses) plus a small set of safe, non-destructive active checks.
This is the cheapest, fastest useful layer of dynamic security testing —
and it is deliberately limited:

- **Unauthenticated.** The scan never logs in. It only ever sees what an
  anonymous visitor sees: `/`, `/login`, `/pricing`, public marketing pages,
  and whatever a public API route answers with no session (mostly `401`).
  It does **not** exercise the studio, admin, billing, or template-run
  surfaces at all — the overwhelming majority of this app's actual attack
  surface (money movement, generation, per-user data) is behind auth and
  this scan never sees it.
- **Local, not staging or production.** It targets a `next start` build on
  `localhost` against a disposable database seeded with nothing sensitive.
  It says nothing about the real deployment's TLS configuration, reverse
  proxy headers, or production environment variables.
- **Baseline, not full active scan.** ZAP's baseline profile does not
  attempt SQL injection, XSS payload fuzzing, or anything that could mutate
  data — it is a fast, safe first pass, not a penetration test.

**Bottom line: a clean (or fully-triaged) run here is evidence of "no
obvious unauthenticated issue on the public surface", never "this app has
been security-tested."** The release contract's requirement for an
**authenticated** scan against **staging** is a separate, larger piece of
work this does not satisfy — it needs a staging environment and a scripted
login flow ZAP can drive, neither of which exist yet. That gate stays
BLOCKED; only Stream A edits `RELEASE_STATUS.md`, so the authoritative
statement of that lives there, not here.

## Running it

```bash
./scripts/security-scan.sh
# or, if port 3400 is already in use:
SECURITY_SCAN_PORT=3401 ./scripts/security-scan.sh
```

Requires:
- Docker (Desktop or a plain Engine) reachable via `docker`.
- The disposable test Postgres container already running with migrations
  applied — same one `npm run test:e2e`/`npm run test:integration` use
  (`postgresql://postgres:test@localhost:55432/test`, `helmies-test-pg`).

The script builds, starts the app, waits for `/api/health`, runs the ZAP
baseline container against it, then always stops the app again (`trap
cleanup EXIT`) even if the scan itself errors. Reports land in
`zap-out/zap-report.{html,json,xml}` (gitignored — this file is the
durable record of what was found).

### Why `--add-host=host.docker.internal:host-gateway`, not `--network host`

The plan's original example command uses `--network host`, which is
Linux-only — Docker Desktop's Windows/Mac backends don't give a container
the host's own network namespace the same way, so `-t http://localhost:PORT`
from inside the container would simply fail to connect. Verified on this
machine: `host.docker.internal` was not present in a plain container's
`/etc/hosts` by default (its DNS resolver pointed at public resolvers, not
Docker's embedded one), but adding it explicitly with
`--add-host=host.docker.internal:host-gateway` resolved to the host
gateway IP and connected successfully. This flag is also valid on native
Linux Docker Engine, so the script works unchanged on either platform —
unlike `--network host`, which the ZAP container never actually needed here
(it isn't binding a port itself, only making outbound requests).

## Interpreting the output

`zap-baseline.py` groups findings by **risk** (High/Medium/Low/
Informational) and, separately, treats every alert as at most a WARN for
its own exit code (the scan never "fails" just because something was
found — the point is the report, not a pass/fail gate). Read
`zap-out/zap-report.html` for the full detail per alert (evidence,
affected URLs, a description, and ZAP's own suggested solution) — the
table below is triage, not a substitute for the report.

## Triaged findings (run recorded below)

Run against a production build (`next build && next start -p 3400`) with
`E2E_MOCK_PROVIDERS=1` and the disposable test database, via
`./scripts/security-scan.sh`. **Before** = the first real run, against
the code as of Task B2. **After** = re-run against the same build with
this task's two genuine fixes applied. `FAIL-NEW: 0` in both runs — ZAP's
baseline profile found nothing it considers a hard failure either time;
everything below is WARN or Informational.

| # | Finding (ZAP plugin ID) | Risk (confidence) | Before → After | Triage | Reasoning |
|---|---|---|---|---|---|
| 1 | Server Leaks Information via "X-Powered-By" Header [10037] | Low (Medium) | WARN (5 URLs) → **PASS** | **Genuine — fixed** | `next.config.js`: added `poweredByHeader: false`. Verified gone via direct `curl -D-` and the re-scan (rule now PASSes). |
| 2 | Cross-Origin-Opener-Policy Header Missing [90004] | Low (Medium) | WARN → **gone** | **Genuine — fixed** | `next.config.js`: added `Cross-Origin-Opener-Policy: same-origin` to the global `headers()` rule. The app's one `window.open()` call (`src/components/studio/kit/Stage.js`) already uses `noopener,noreferrer`, so this changes no real behavior. |
| 3 | Cross-Origin-Resource-Policy Header Missing [90004] | Low (Medium) | WARN (favicons, static assets) → still WARN (unchanged) | **Accepted, not fixed** | `src/app/api/media/proxy/route.js` already sends its own explicit `Access-Control-Allow-Origin: "*"` — a deliberate existing choice to let generated media be fetched cross-origin (e.g. into a `<canvas>` without tainting it). A blanket `same-origin` CORP in `next.config.js` would fight that route's real intent. A correct fix needs a **per-route** header (favicons/static assets only), which is a larger, separate change than this task's scope. |
| 4 | Cross-Origin-Embedder-Policy Header Missing [90004] | Low (Medium) | WARN (`/sitemap.xml`) → not observed this run (same underlying header state — ZAP's baseline instance sampling varies run to run, confirmed unchanged via direct `curl`) | **Accepted, not fixed** | `require-corp` would make the browser refuse to load any cross-origin image/video that doesn't itself send a CORP header — which is most of what this app renders (KIE/Alibaba/S3-hosted generated media). The CSP's own `img-src`/`media-src ... https:` is deliberately wide for exactly this reason (see `next.config.js`'s CSP header comment). Adding COEP would silently break real generated-media rendering, not close a real gap. |
| 5 | CSP: Wildcard Directive / `script-src unsafe-inline` / `style-src unsafe-inline` [10055] | Medium (High) | WARN (9 instances, 3 sub-checks) → unchanged | **Accepted — pre-existing, documented trade-off** | Already explained at the top of `next.config.js`: `'unsafe-inline'` is needed for `src/app/layout.js`'s inline bootstrap script (a nonce would need a layout refactor, out of scope here); the `https:` wildcards on `img-src`/`media-src`/`connect-src` exist because generated media comes from whichever provider produced it. `object-src 'none'`, `frame-ancestors 'none'`, and `base-uri 'self'` remain the load-bearing protections this policy actually provides. |
| 6 | Timestamp Disclosure – Unix [10096] | Low (Low) | WARN (4 instances) → unchanged | **False positive** | Evidence values (`1547036967`, `1551434678`) traced directly to `src/app/page.js`'s Unsplash stock-photo asset filenames (`photo-<unix-id>-<hash>.webp`, e.g. `photo-1551434678-e076c223a692-10.webp`) — a naming convention, not an actual disclosed timestamp of anything. |
| 7 | User Controllable HTML Element Attribute (Potential XSS) [10031] | Informational (Low) | WARN (`/login?new=1`) → unchanged | **False positive** | `src/app/login/page.js`: `params.get("new") === "1"` is a plain boolean comparison that only toggles sign-up vs. sign-in UI mode — the value is never written into any HTML attribute. |
| 8 | Content-Type Header Missing [10019] | Informational | WARN (5 instances) → unchanged | **False positive** | Every instance is a 307/308 redirect response (`/api/`, unauthenticated `/studio*`) with an empty body — there is nothing to give a Content-Type to. |
| 9 | Non-Storable Content / Storable (and Non-)Cacheable Content [10049] | Informational | WARN (multiple) → unchanged | **Accepted — correct by design** | Purely descriptive of existing caching behavior, not a defect — e.g. `_next/static/chunks/*.js`'s `max-age=31536000` is Next's own intentional immutable-hashed-asset caching. |
| 10 | Modern Web Application [10109] | Informational | WARN (3 instances) → unchanged | **No action** | ZAP's own solution text: "this is an informational alert and so no changes are required." |

**Net result:** `WARN-NEW` dropped from 8 to 7 rule categories after this
task's two genuine fixes. The remaining 7 are, per the reasoning above,
either confirmed false positives, purely informational, or a documented
accept — every accept names the specific real behavior a "correct-looking"
fix would have broken.

## Fixing a genuine finding

Once triaged, a genuine finding is fixed in the product exactly like any
other bug — usually a header in `next.config.js`'s `headers()` (applies
site-wide) or `middleware.js` (applies to the paths its `matcher` covers),
or a cookie attribute in `src/lib/auth.js`'s NextAuth config. Re-run
`./scripts/security-scan.sh` afterwards and update the table above to show
the finding is gone (or, if it's the kind of thing ZAP re-reports lower-
risk/informational after a partial fix, note that too — don't silently
delete a row that changed severity instead of disappearing).
