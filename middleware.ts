import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const ADMIN_COOKIE_NAME = "ivory_admin_session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let the login page itself through untouched.
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;

  if (!token) {
    return redirectToLogin(req);
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");

    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));

    if (payload.role !== "admin") {
      return redirectToLogin(req);
    }

    return NextResponse.next();
  } catch (err) {
    console.error("[middleware] admin session verification failed", err);
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest) {
  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
