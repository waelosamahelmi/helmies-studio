import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  const protectedPaths = ["/admin", "/studio", "/settings"];
  const needsAuth = protectedPaths.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const origin = request.nextUrl.origin;
  const sessionRes = await fetch(`${origin}/api/auth/session`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    redirect: "manual",
  });

  if (sessionRes.status !== 200) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let session;
  try {
    session = await sessionRes.json();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

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
