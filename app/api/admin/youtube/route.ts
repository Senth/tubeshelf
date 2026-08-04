import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { hasUsableEncryptionSecret } from "@/lib/secretCrypto";
import {
  clearYouTubeOAuthClient,
  getRedirectUri,
  getYouTubeOAuthClientId,
  isYouTubeOAuthConfigured,
  saveYouTubeOAuthClient,
  YOUTUBE_OAUTH_SCOPE,
  YOUTUBE_SECRET_CRYPTO,
} from "@/lib/youtubeOAuth";

function getOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const url = new URL(req.url);
  return forwardedHost
    ? `${forwardedProto || url.protocol.replace(":", "")}://${forwardedHost}`
    : `${url.protocol}//${url.host}`;
}

/** The stored secret is never returned; the UI only learns whether one exists. */
function serialize(req: Request) {
  return {
    clientId: getYouTubeOAuthClientId() || "",
    configured: isYouTubeOAuthConfigured(),
    redirectUri: getRedirectUri(getOrigin(req)),
    scope: YOUTUBE_OAUTH_SCOPE,
    encryptionKeyConfigured: hasUsableEncryptionSecret(YOUTUBE_SECRET_CRYPTO),
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(serialize(req));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const clientId =
    typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret =
    typeof body?.clientSecret === "string" ? body.clientSecret.trim() : "";

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  // An empty secret on save keeps the stored one, so the form never has to
  // round-trip it. It is only required when nothing is stored yet.
  if (!clientSecret && !isYouTubeOAuthConfigured()) {
    return NextResponse.json(
      { error: "clientSecret is required" },
      { status: 400 }
    );
  }

  try {
    saveYouTubeOAuthClient({
      clientId,
      clientSecret: clientSecret || undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to save the OAuth client" },
      { status: 400 }
    );
  }

  return NextResponse.json(serialize(req));
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  clearYouTubeOAuthClient();
  return NextResponse.json(serialize(req));
}
