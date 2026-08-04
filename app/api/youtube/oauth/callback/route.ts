import crypto from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  fetchAccountLabel,
  saveLinkedAccount,
} from "@/lib/youtubeAccountStore";
import {
  exchangeCodeForTokens,
  getRedirectUri,
  getYouTubeOAuthClient,
} from "@/lib/youtubeOAuth";
import { YOUTUBE_OAUTH_STATE_COOKIE } from "../start/route";

function getOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const url = new URL(req.url);
  return forwardedHost
    ? `${forwardedProto || url.protocol.replace(":", "")}://${forwardedHost}`
    : `${url.protocol}//${url.host}`;
}

/** Back to the dashboard; `app/page.tsx` turns these params into a toast. */
function redirectHome(
  req: Request,
  params: Record<string, string>
): NextResponse {
  const url = new URL("/", getOrigin(req));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url.toString());
  response.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
  return response;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const error = searchParams.get("error");
  if (error) {
    return redirectHome(req, {
      youtube: "error",
      // Google sends `access_denied` when the consent screen is dismissed.
      youtubeMessage:
        error === "access_denied"
          ? "YouTube authorization was cancelled."
          : `Google returned an error: ${error}`,
    });
  }

  const code = searchParams.get("code") || "";
  const state = searchParams.get("state") || "";
  const expectedState =
    req.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${YOUTUBE_OAUTH_STATE_COOKIE}=`))
      ?.split("=")
      .slice(1)
      .join("=") || "";

  if (!code || !state || !expectedState || !timingSafeEqual(state, expectedState)) {
    return redirectHome(req, {
      youtube: "error",
      youtubeMessage: "The YouTube authorization request expired. Try again.",
    });
  }

  const client = getYouTubeOAuthClient();
  if (!client) {
    return redirectHome(req, {
      youtube: "error",
      youtubeMessage: "No YouTube OAuth client is configured for this instance.",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens({
      client,
      code,
      redirectUri: getRedirectUri(getOrigin(req)),
    });

    const label = await fetchAccountLabel(tokens.accessToken);
    saveLinkedAccount({ userId: user.id, tokens, label });

    return redirectHome(req, {
      youtube: "linked",
      ...(label ? { youtubeMessage: label } : {}),
    });
  } catch (err: any) {
    console.error("[YouTube] OAuth callback failed:", err);
    return redirectHome(req, {
      youtube: "error",
      youtubeMessage: err?.message || "Could not connect the YouTube account.",
    });
  }
}
