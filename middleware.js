import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  const protectedPaths = ["/admin", "/studio", "/settings"];
  const needsAuth = protectedPaths.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  // Resolve the session against this same deployment. Falling back to the
  // incoming origin matters: NEXTAUTH_URL is wrong or absent in local and
  // preview runs, and an unreachable URL used to throw straight out of the
  // middleware — every protected route answered 500 instead of asking the
  // visitor to sign in.
  const internalUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
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
  matcher: ["/admin/:path*", "/studio/:path*", "/settings/:path*"],
};