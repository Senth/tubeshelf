import crypto from "crypto";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/cookieSecurity";
import { getCurrentUser } from "@/lib/currentUser";
import {
  buildAuthorizationUrl,
  getRedirectUri,
  getYouTubeOAuthClient,
} from "@/lib/youtubeOAuth";

export const YOUTUBE_OAUTH_STATE_COOKIE = "youtube_oauth_state";

function getOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const url = new URL(req.url);
  return forwardedHost
    ? `${forwardedProto || url.protocol.replace(":", "")}://${forwardedHost}`
    : `${url.protocol}//${url.host}`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getYouTubeOAuthClient();
  if (!client) {
    return NextResponse.json(
      { error: "No YouTube OAuth client is configured for this instance" },
      { status: 409 }
    );
  }

  const state = crypto.randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(
    buildAuthorizationUrl({
      clientId: client.clientId,
      redirectUri: getRedirectUri(getOrigin(req)),
      state,
    })
  );

  // The callback only accepts a code when this cookie matches the returned
  // state, which is what stops another site from completing the link.
  response.cookies.set(YOUTUBE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
