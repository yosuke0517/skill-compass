import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return loginRedirect(request);

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token, secret);

  if (!session.authenticated) return loginRedirect(request);

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/today/:path*",
    "/skills/:path*",
    "/concepts/:path*",
    "/sources/:path*",
    "/settings/:path*",
  ],
};
