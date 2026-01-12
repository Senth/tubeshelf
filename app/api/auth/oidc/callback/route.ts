import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleOIDCCallback } from "@/lib/oidc";
import { createSession, updateLastLogin } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Get base URL from request (respects reverse proxy headers)
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const url = new URL(req.url);
    const baseUrl = forwardedHost
      ? `${forwardedProto || url.protocol.replace(":", "")}://${forwardedHost}`
      : `${url.protocol}//${url.host}`;

    if (error) {
      console.error("[OIDC] Authorization error:", error);
      return NextResponse.redirect(`${baseUrl}/?auth_error=${error}`);
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: "Missing code or state" },
        { status: 400 }
      );
    }

    // Verify state
    const cookieStore = await cookies();
    const savedState = cookieStore.get("oidc_state")?.value;
    const providerId = cookieStore.get("oidc_provider")?.value;

    if (!savedState || savedState !== state) {
      return NextResponse.json(
        { error: "Invalid state parameter" },
        { status: 400 }
      );
    }

    if (!providerId) {
      return NextResponse.json(
        { error: "Missing provider ID" },
        { status: 400 }
      );
    }

    // Get provider and auto-detect redirect URI
    const { getOIDCProvider, buildRedirectUri } = await import("@/lib/oidc");
    const provider = getOIDCProvider(providerId);
    if (!provider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    // Auto-detect redirect URI from request, or use configured one
    const redirectUri = provider.redirectUri || buildRedirectUri(req);

    // Handle callback and get/create user
    const user = await handleOIDCCallback(providerId, code, redirectUri, true);

    // Update last login
    updateLastLogin(user.id);

    // Create session
    const session = createSession(user.id);

    // Create redirect response
    const response = NextResponse.redirect(`${baseUrl}/`);

    // Set session cookie on the response
    response.cookies.set("session", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[OIDC] Callback error:", error);
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const url = new URL(req.url);
    const baseUrl = forwardedHost
      ? `${forwardedProto || url.protocol.replace(":", "")}://${forwardedHost}`
      : `${url.protocol}//${url.host}`;
    return NextResponse.redirect(`${baseUrl}/?auth_error=callback_failed`);
  }
}
