import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  const protectedPaths = ["/admin", "/studio", "/settings"];
  const needsAuth = protectedPaths.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const reqUrl = new URL("/api/auth/session", request.url);
  const sessionRes = await fetch(reqUrl, {
    headers: { cookie: request.headers.get("cookie") || "" },
  });

  if (sessionRes.status !== 200) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await sessionRes.json();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/admin") && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/studio", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/studio/:path*", "/settings/:path*"],
};
