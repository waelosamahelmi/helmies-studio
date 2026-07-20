import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin") || pathname.startsWith("/studio") || pathname.startsWith("/settings")) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (pathname.startsWith("/admin")) {
      const user = await import("@/lib/prisma").then((m) =>
        m.default.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
      );
      if (user?.role !== "admin") {
        return NextResponse.redirect(new URL("/studio", request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/studio/:path*", "/settings/:path*"],
};
