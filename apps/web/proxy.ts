import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const protectedPrefixes = ["/dashboard", "/settings", "/ops"]

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const hasSessionCookie = Boolean(getSessionCookie(request.headers))
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  )

  if (!hasSessionCookie && isProtectedRoute) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }

  if (hasSessionCookie && pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api/auth|api/health|api/ready|_next|favicon.ico).*)"],
}
