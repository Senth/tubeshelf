/**
 * Google OAuth client configuration and token exchange for the YouTube
 * integration.
 *
 * The client id/secret are instance-wide (one Google Cloud OAuth client for the
 * whole TubeShelf install, configured by an admin), while the resulting tokens
 * are per user — see lib/youtubeAccountStore.ts. Both are optional: with no
 * client configured the like button simply never appears.
 *
 * The client id/secret live in the `settings` table under keys that
 * `readSettings()` deliberately does not know about, so they can never leak
 * through `GET /api/settings`, which every signed-in user can call.
 */

import { getDb } from "./db";
import { decryptSecret, encryptSecret } from "./secretCrypto";

const CLIENT_ID_KEY = "youtubeOAuthClientId";
const CLIENT_SECRET_KEY = "youtubeOAuthClientSecret";

const YOUTUBE_SECRET_CRYPTO = {
  salt: "tubeshelf-youtube-salt",
  label: "YouTube",
  // Works on installs that never set BETTER_AUTH_SECRET and rely on the
  // auto-generated one in data/.better-auth-secret.
  allowGeneratedAuthSecret: true,
} as const;

export const YOUTUBE_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/youtube.force-ssl";

export const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export interface YouTubeOAuthClient {
  clientId: string;
  clientSecret: string;
}

function readSettingRow(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSettingRow(key: string, value: string | null) {
  const db = getDb();
  if (value === null) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    JSON.stringify(value)
  );
}

/** Full client credentials, or null when the instance has none configured. */
export function getYouTubeOAuthClient(): YouTubeOAuthClient | null {
  const clientId = readSettingRow(CLIENT_ID_KEY);
  const storedSecret = readSettingRow(CLIENT_SECRET_KEY);
  if (!clientId || !storedSecret) return null;

  const clientSecret = decryptSecret(storedSecret, YOUTUBE_SECRET_CRYPTO);
  if (!clientSecret) return null;

  return { clientId, clientSecret };
}

/** Whether an admin has configured a client, without decrypting the secret. */
export function isYouTubeOAuthConfigured(): boolean {
  return !!readSettingRow(CLIENT_ID_KEY) && !!readSettingRow(CLIENT_SECRET_KEY);
}

/** Client id alone — safe to show an admin, unlike the secret. */
export function getYouTubeOAuthClientId(): string | null {
  return readSettingRow(CLIENT_ID_KEY);
}

/**
 * Store the client id, and the secret when one is supplied. Passing an
 * undefined secret keeps the stored one, which is how the admin form can save
 * without re-typing it.
 */
export function saveYouTubeOAuthClient(input: {
  clientId: string;
  clientSecret?: string;
}) {
  writeSettingRow(CLIENT_ID_KEY, input.clientId);
  if (typeof input.clientSecret === "string" && input.clientSecret.length > 0) {
    writeSettingRow(
      CLIENT_SECRET_KEY,
      encryptSecret(input.clientSecret, YOUTUBE_SECRET_CRYPTO)
    );
  }
}

export function clearYouTubeOAuthClient() {
  writeSettingRow(CLIENT_ID_KEY, null);
  writeSettingRow(CLIENT_SECRET_KEY, null);
}

/**
 * Callback URL Google redirects back to. Must match a redirect URI registered
 * on the OAuth client exactly, which is why the admin page displays it.
 */
export function getRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/youtube/oauth/callback`;
}

export function buildAuthorizationUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_OAUTH_SCOPE);
  url.searchParams.set("state", options.state);
  // Both are required to reliably receive a refresh token: Google only returns
  // one on the first consent unless consent is forced.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scope?: string;
}

function parseTokenResponse(payload: any): GoogleTokenResponse {
  const accessToken =
    typeof payload?.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new Error("Google did not return an access token");
  }
  const expiresIn = Number(payload?.expires_in);
  return {
    accessToken,
    refreshToken:
      typeof payload?.refresh_token === "string" && payload.refresh_token
        ? payload.refresh_token
        : undefined,
    expiresInSeconds: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    scope: typeof payload?.scope === "string" ? payload.scope : undefined,
  };
}

async function postToTokenEndpoint(
  body: Record<string, string>
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (payload && (payload.error_description || payload.error)) ||
      `HTTP ${res.status}`;
    throw new Error(`Google token request failed: ${detail}`);
  }

  return parseTokenResponse(payload);
}

export async function exchangeCodeForTokens(options: {
  client: YouTubeOAuthClient;
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  return postToTokenEndpoint({
    code: options.code,
    client_id: options.client.clientId,
    client_secret: options.client.clientSecret,
    redirect_uri: options.redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(options: {
  client: YouTubeOAuthClient;
  refreshToken: string;
}): Promise<GoogleTokenResponse> {
  return postToTokenEndpoint({
    client_id: options.client.clientId,
    client_secret: options.client.clientSecret,
    refresh_token: options.refreshToken,
    grant_type: "refresh_token",
  });
}

/** Best effort: revoking on unlink is polite but a failure must not block it. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // The local row is deleted regardless.
  }
}

export { YOUTUBE_SECRET_CRYPTO };
