import { AuthzError } from "@/lib/authz";

// Origin verification for cookie-session state-changing routes (CSRF
// defense-in-depth alongside NextAuth's SameSite cookies).
//
// A browser attaches the `Origin` header to every cross-site request AND to
// same-site state-changing requests (POST/PUT/PATCH/DELETE fetch() calls,
// and form submissions) — it is not limited to cross-origin traffic the way
// `Referer` historically was. When `Origin` is absent (some older/plain
// navigations omit it) we fall back to the origin implied by `Referer`.
//
// Missing BOTH headers, with allowMissing left false, is treated as a
// REJECTION, not a pass-through. A real browser making a state-changing
// request to this app always sends at least one of the two; a request that
// sends neither is not a browser session request and must not be trusted by
// default. `allowMissing: true` exists for callers this check does not
// apply to at all (server-to-server calls, bearer/API-key authenticated
// requests) — callers must opt into that explicitly per call site, never
// get it as the ambient default.
function parseOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// verifyOrigin(req, { allowMissing = false } = {}) -> true | throws AuthzError(403, "Cross-origin request rejected")
//
// Expected origin is derived from process.env.NEXTAUTH_URL (read at call
// time, not at module load, so tests can set it per-case). If NEXTAUTH_URL
// is unset or unparseable, this fails closed — every request is rejected
// (short of allowMissing with no Origin/Referer at all) rather than silently
// trusting an unconfigured expected origin.
export function verifyOrigin(req, { allowMissing = false } = {}) {
  const candidate = parseOrigin(req.headers.get("origin")) ?? parseOrigin(req.headers.get("referer"));

  if (!candidate) {
    if (allowMissing) return true;
    throw new AuthzError(403, "Cross-origin request rejected");
  }

  const expectedOrigin = parseOrigin(process.env.NEXTAUTH_URL);
  if (!expectedOrigin || candidate !== expectedOrigin) {
    throw new AuthzError(403, "Cross-origin request rejected");
  }

  return true;
}
