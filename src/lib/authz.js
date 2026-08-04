import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { apiError } from "@/lib/api-error";

// Central authorization module. Every admin/protected route should throw
// through here (via requireUser/requireAdminUser) and catch with
// authzResponse — that's what guarantees a caller gets the correct HTTP
// status (401 unauthenticated vs 403 authenticated-but-not-admin) and never
// sees an internal error message from an unrelated failure (e.g. a DB error)
// leak into the response body.
//
// AuthzError itself lives in src/lib/authz-error.js (a dependency-free leaf
// module) so libraries can throw it without importing this file's
// next-auth chain — re-exported here so existing imports keep working.
import { AuthzError } from "@/lib/authz-error";
export { AuthzError };

// Any signed-in user, or throw 401.
export async function requireUser(req) {
  const user = await getCurrentUser(req);
  if (!user) throw new AuthzError(401, "Unauthorized");
  return user;
}

// A signed-in user whose DB role is "admin". Unauthenticated -> 401;
// authenticated but not an admin -> 403 "Forbidden" (never the actual role,
// user id, or any other detail).
export async function requireAdminUser(req) {
  const user = await requireUser(req);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
  if (dbUser?.role !== "admin") throw new AuthzError(403, "Forbidden");
  return user;
}

// Turn a caught error into a Response. AuthzErrors surface their status and
// public message as-is; anything else is logged server-side (with an
// errorId, via apiError → log.error) and reduced to a generic 500 so
// internal details never reach the client. Both paths emit the uniform
// error envelope (Task E2.1) — `error` stays the same string it always was;
// code/title/errorId/retryable are additive.
export function authzResponse(e) {
  if (e instanceof AuthzError) {
    return apiError({
      status: e.status,
      code:
        e.status === 400 ? "bad_request"
        : e.status === 401 ? "unauthorized"
        : e.status === 404 ? "not_found"
        : "forbidden",
      message: e.publicMessage,
    });
  }
  return apiError({ status: 500, code: "internal", cause: e });
}
