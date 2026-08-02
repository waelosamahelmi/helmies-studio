import { NextResponse } from "next/server";

// ── Maintenance mode (Phase 7 Task 3) ───────────────────────────────────
//
// Backed by src/lib/ops-flags.js's FeatureFlag-backed isMaintenanceMode(),
// but this file never imports that module (or prisma) directly. Next
// builds middleware for the Edge runtime by default, and prisma's
// @prisma/adapter-pg driver needs real TCP sockets Edge doesn't have —
// confirmed empirically while building this: adding `export const runtime
// = "nodejs"` here made Next silently DROP the middleware from the build
// entirely (no warning, no error — the auth gate below just stopped
// running). Instead, this polls GET /api/health — a normal Node.js route
// handler, where prisma works fine — the same way the auth check further
// down already resolves the session via a same-origin fetch to
// /api/auth/session, rather than calling next-auth directly.
//
// A maintenance window must never strand money in flight: provider
// callbacks and Stripe events have to keep landing, and an operator has to
// be able to reach the controls that turn maintenance back off. Those
// paths (plus the health check itself) are excluded from the maintenance
// check entirely, regardless of HTTP method.
const MAINTENANCE_EXEMPT_API_PREFIXES = [
  "/api/health",
  "/api/admin/",
  "/api/cron/",
  "/api/webhooks/",
  "/api/stripe/webhook",
];

function isMaintenanceExemptApiPath(pathname) {
  return MAINTENANCE_EXEMPT_API_PREFIXES.some((p) => pathname.startsWith(p));
}

// A state-changing call is inferred from the HTTP method, not from
// security/route-manifest.json's per-route `stateChanging` flag — reading
// that registry from inside middleware would mean loading it on every
// request's hot path. This is conservative on purpose: a GET-only request
// never trips it, and an actually-read-only POST (rare in this app) gets
// blocked too during a maintenance window — the safe direction to be wrong
// in, since the point of maintenance mode is to stop new state changes.
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function isInMaintenanceMode(internalUrl) {
  try {
    const res = await fetch(new URL("/api/health", internalUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return !!body.maintenance;
  } catch {
    // Network failure, timeout, or malformed body — fail OPEN (treat as
    // NOT in maintenance). A transient hiccup reaching our own health
    // endpoint must not silently 503 every page/API call app-wide; that
    // would turn an unrelated blip into a much bigger outage than the one
    // maintenance mode exists to manage on purpose.
    return false;
  }
}

function maintenanceResponse() {
  return NextResponse.json(
    { error: "Helmies Studio is temporarily down for maintenance. Please try again shortly." },
    { status: 503, headers: { "Retry-After": "120" } }
  );
}

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  // Resolve the session (and, below, the maintenance flag) against this
  // same deployment. Falling back to the incoming origin matters:
  // NEXTAUTH_URL is wrong or absent in local and preview runs, and an
  // unreachable URL used to throw straight out of the middleware — every
  // protected route answered 500 instead of asking the visitor to sign in.
  const internalUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;

  const isStudioPage = pathname.startsWith("/studio");
  const isStateChangingApi =
    pathname.startsWith("/api/") &&
    STATE_CHANGING_METHODS.has(request.method) &&
    !isMaintenanceExemptApiPath(pathname);

  if (isStudioPage || isStateChangingApi) {
    if (await isInMaintenanceMode(internalUrl)) {
      return maintenanceResponse();
    }
  }

  const protectedPaths = ["/admin", "/studio", "/settings"];
  const needsAuth = protectedPaths.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const toLogin = () => {
    const url = new URL("/login", request.url);
    // `callbackUrl` is the param the login page and next-auth both read, so
    // signing in returns the visitor to the page they actually asked for.
    url.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  };

  let session;
  try {
    const sessionRes = await fetch(new URL("/api/auth/session", internalUrl), {
      headers: { cookie: request.headers.get("cookie") || "" },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (sessionRes.status !== 200) return toLogin();
    session = await sessionRes.json();
  } catch {
    // Network failure, timeout, or malformed body — treat as signed out.
    return toLogin();
  }

  if (!session?.user) return toLogin();

  if (pathname.startsWith("/admin") && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/studio", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  // Broadened from the original ["/admin/:path*", "/studio/:path*",
  // "/settings/:path*"] to also include "/api/:path*" — needed so the
  // maintenance check above can see state-changing API calls at all. For
  // every OTHER request this matcher now newly covers (a GET to any /api/*
  // route, or any path outside admin/studio/settings/api entirely), both
  // branches above are no-ops and this falls straight through to
  // NextResponse.next() — no fetch, no behavior change from before this
  // task.
  matcher: ["/admin/:path*", "/studio/:path*", "/settings/:path*", "/api/:path*"],
};
