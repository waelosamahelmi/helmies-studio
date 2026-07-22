import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const session = await auth();

  if (!session?.user) {
    if (pathname.startsWith("/admin") || pathname.startsWith("/studio") || pathname.startsWith("/settings")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/studio", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/studio/:path*", "/settings/:path*"],
};
