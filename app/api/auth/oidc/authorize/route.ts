import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { shouldUseSecureCookies } from "@/lib/cookieSecurity";
import {
  getOIDCProvider,
  buildAuthorizationUrl,
  generateOIDCState,
  buildRedirectUri,
} from "@/lib/oidc";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("provider");

    if (!providerId) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    const provider = getOIDCProvider(providerId);
    if (!provider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 404 });
    }

    // Generate state for CSRF protection
    const state = generateOIDCState();

    // Store state in cookie for verification
    const cookieStore = await cookies();
    cookieStore.set("oidc_state", state, {
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    // Store provider ID
    cookieStore.set("oidc_provider", providerId, {
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    // Auto-detect redirect URI from request, or use configured one
    const redirectUri = provider.redirectUri || buildRedirectUri(req);

    const authUrl = await buildAuthorizationUrl(provider, redirectUri, state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[OIDC] Authorization error:", error);
    return NextResponse.json(
      { error: "Authorization failed" },
      { status: 500 }
    );
  }
}
