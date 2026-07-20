import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin")) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const user = await import("@/lib/prisma").then((m) =>
      m.default.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    );
    if (user?.role !== "admin") {
      return NextResponse.redirect(new URL("/studio", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};