import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { needsSetup } from "@/lib/setup";
import { readSessionCookie } from "@/lib/sessionCookie";

// Paths that are always public
const publicPaths = [
  "/setup",
  "/login",
  // Google's OAuth verification review loads these directly, signed out and
  // before setup has run, so they must never redirect. "/welcome" is also what
  // "/" is rewritten to below.
  "/welcome",
  "/privacy-policy",
  "/terms-of-service",
  "/api/setup",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/settings",
  "/api/auth/oidc",
  "/api/version",
  "/_next",
  "/favicon.ico",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaticAsset = /\.[a-zA-Z0-9]+$/.test(pathname);

  // Always allow direct access to static/public files.
  // Without this, favicon/manifest/icon requests can be redirected to /login.
  if (isStaticAsset) {
    return NextResponse.next();
  }

  // Check if setup is needed - redirect all non-public routes to setup
  if (needsSetup() && !publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // Allow public paths
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublic) {
    return NextResponse.next();
  }

  // For authenticated routes, we'll check the session in the API route itself
  // The middleware just passes the session cookie through
  const sessionId = readSessionCookie(
    (name) => request.cookies.get(name)?.value
  );

  if (!sessionId && pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Signed-out visitors get the landing page at "/" itself, rewritten rather
  // than redirected: Google's OAuth verification requires the homepage URL to be
  // publicly reachable, non-redirecting, and to explain the app and its use of
  // Google account data without anyone signing in. Sending them straight to the
  // sign-in form fails that review.
  if (!sessionId && pathname === "/") {
    return NextResponse.rewrite(new URL("/welcome", request.url));
  }

  // For page routes without session, redirect to login
  if (!sessionId && !pathname.startsWith("/api/")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
