import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Central authorization module. Every admin/protected route should throw
// through here (via requireUser/requireAdminUser) and catch with
// authzResponse — that's what guarantees a caller gets the correct HTTP
// status (401 unauthenticated vs 403 authenticated-but-not-admin) and never
// sees an internal error message from an unrelated failure (e.g. a DB error)
// leak into the response body.
export class AuthzError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.name = "AuthzError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

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
// public message as-is; anything else is logged server-side and reduced to
// a generic 500 so internal details never reach the client.
export function authzResponse(e) {
  if (e instanceof AuthzError) {
    return NextResponse.json({ error: e.publicMessage }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
