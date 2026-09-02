import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { TOKEN_COOKIE_NAME } from "@/lib/session"

const PUBLIC_PATHS = ["/login", "/validar-codigo"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value

  if (!token) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|json|ico)$).*)",
  ],
}
