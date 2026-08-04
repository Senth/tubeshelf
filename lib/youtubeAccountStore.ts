/**
 * Per-user linked Google account: token storage, refresh, and the two YouTube
 * Data API calls the like button needs.
 *
 * Quota note: `videos.rate` costs 50 units and `videos.getRating` costs 1,
 * against a default 10,000 units/day. That is roughly 200 likes a day, which is
 * why ratings are cached locally instead of re-fetched on every player open.
 */

import { getDb } from "./db";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import {
  getYouTubeOAuthClient,
  refreshAccessToken,
  revokeToken,
  YOUTUBE_SECRET_CRYPTO,
  type GoogleTokenResponse,
} from "./youtubeOAuth";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
/** Refresh a little early so a call never starts with a token about to expire. */
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 60_000;

export type VideoRating = "like" | "dislike" | "none";

export type YouTubeAuthErrorCode =
  | "not_configured"
  | "not_linked"
  | "reauth_required";

/** Distinguishes "the user must act" from a transient API failure. */
export class YouTubeAuthError extends Error {
  code: YouTubeAuthErrorCode;

  constructor(code: YouTubeAuthErrorCode, message: string) {
    super(message);
    this.name = "YouTubeAuthError";
    this.code = code;
  }
}

interface AccountRow {
  user_id: string;
  account_label: string | null;
  access_token: string | null;
  access_token_expires_at: number | null;
  refresh_token: string;
  scope: string | null;
  linked_at: string;
  updated_at: string;
}

export interface LinkedAccount {
  label: string | null;
  linkedAt: string;
  scope: string | null;
}

function readAccountRow(userId: string): AccountRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM youtube_accounts WHERE user_id = ?")
    .get(userId) as AccountRow | undefined;
  return row ?? null;
}

export function getLinkedAccount(userId: string): LinkedAccount | null {
  const row = readAccountRow(userId);
  if (!row) return null;
  return {
    label: row.account_label,
    linkedAt: row.linked_at,
    scope: row.scope,
  };
}

export function saveLinkedAccount(options: {
  userId: string;
  tokens: GoogleTokenResponse;
  label: string | null;
}) {
  const { userId, tokens, label } = options;
  if (!tokens.refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Remove TubeShelf from your Google account's third-party access and link again."
    );
  }

  const db = getDb();
  const now = new Date().toISOString();
  const existing = readAccountRow(userId);

  db.prepare(
    `INSERT OR REPLACE INTO youtube_accounts
      (user_id, account_label, access_token, access_token_expires_at,
       refresh_token, scope, linked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    label,
    encryptSecret(tokens.accessToken, YOUTUBE_SECRET_CRYPTO),
    Date.now() + tokens.expiresInSeconds * 1000,
    encryptSecret(tokens.refreshToken, YOUTUBE_SECRET_CRYPTO),
    tokens.scope ?? null,
    existing?.linked_at ?? now,
    now
  );
}

function updateStoredAccessToken(userId: string, tokens: GoogleTokenResponse) {
  const db = getDb();
  db.prepare(
    `UPDATE youtube_accounts
        SET access_token = ?, access_token_expires_at = ?, updated_at = ?
      WHERE user_id = ?`
  ).run(
    encryptSecret(tokens.accessToken, YOUTUBE_SECRET_CRYPTO),
    Date.now() + tokens.expiresInSeconds * 1000,
    new Date().toISOString(),
    userId
  );
}

/** Drops the account and its cached ratings; both are meaningless without it. */
export function deleteLinkedAccount(userId: string) {
  const db = getDb();
  db.prepare("DELETE FROM youtube_accounts WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM youtube_ratings WHERE user_id = ?").run(userId);
}

export async function unlinkAccount(userId: string) {
  const row = readAccountRow(userId);
  if (row) {
    const refreshToken = decryptSecret(row.refresh_token, YOUTUBE_SECRET_CRYPTO);
    await revokeToken(refreshToken);
  }
  deleteLinkedAccount(userId);
}

// One refresh in flight per user; parallel player calls would otherwise each
// spend a refresh and race to write the result.
const refreshInFlight = new Map<string, Promise<string>>();

async function refreshAndStore(userId: string, row: AccountRow): Promise<string> {
  const client = getYouTubeOAuthClient();
  if (!client) {
    throw new YouTubeAuthError(
      "not_configured",
      "No YouTube OAuth client is configured for this instance"
    );
  }

  const refreshToken = decryptSecret(row.refresh_token, YOUTUBE_SECRET_CRYPTO);

  try {
    const tokens = await refreshAccessToken({ client, refreshToken });
    updateStoredAccessToken(userId, tokens);
    return tokens.accessToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // invalid_grant means the refresh token is dead — revoked, or expired
    // because the OAuth consent screen is still in Testing mode (7 days).
    if (message.includes("invalid_grant")) {
      deleteLinkedAccount(userId);
      throw new YouTubeAuthError(
        "reauth_required",
        "Your Google authorization expired. Connect your YouTube account again."
      );
    }
    throw err;
  }
}

async function getValidAccessToken(userId: string): Promise<string> {
  const row = readAccountRow(userId);
  if (!row) {
    throw new YouTubeAuthError(
      "not_linked",
      "No YouTube account is connected for this user"
    );
  }

  const expiresAt = Number(row.access_token_expires_at || 0);
  if (
    row.access_token &&
    Number.isFinite(expiresAt) &&
    expiresAt - ACCESS_TOKEN_EXPIRY_MARGIN_MS > Date.now()
  ) {
    return decryptSecret(row.access_token, YOUTUBE_SECRET_CRYPTO);
  }

  const pending = refreshInFlight.get(userId);
  if (pending) return pending;

  const promise = refreshAndStore(userId, row).finally(() => {
    refreshInFlight.delete(userId);
  });
  refreshInFlight.set(userId, promise);
  return promise;
}

async function callYouTubeApi(
  userId: string,
  path: string,
  init: RequestInit & { searchParams?: Record<string, string> } = {}
): Promise<Response> {
  const accessToken = await getValidAccessToken(userId);
  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  for (const [key, value] of Object.entries(init.searchParams || {})) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      ...(init.headers || {}),
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  if (res.status === 401) {
    throw new YouTubeAuthError(
      "reauth_required",
      "Google rejected the stored credentials. Connect your YouTube account again."
    );
  }

  return res;
}

async function describeApiError(res: Response, fallback: string): Promise<string> {
  const payload = await res.json().catch(() => null);
  const reason = payload?.error?.errors?.[0]?.reason;
  const message = payload?.error?.message;
  if (reason === "quotaExceeded") {
    return "YouTube API quota exhausted for today.";
  }
  return message || `${fallback} (HTTP ${res.status})`;
}

/**
 * Name of the YouTube channel the tokens belong to, shown so the user can tell
 * which account is connected. Costs 1 quota unit and is only called on link.
 */
export async function fetchAccountLabel(
  accessToken: string
): Promise<string | null> {
  try {
    const url = new URL(`${YOUTUBE_API_BASE}/channels`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");

    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
    if (!res.ok) return null;

    const payload = await res.json().catch(() => null);
    const title = payload?.items?.[0]?.snippet?.title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch {
    // A missing label is cosmetic; linking still succeeded.
    return null;
  }
}

export interface CachedRating {
  rating: VideoRating;
  autoLiked: boolean;
}

export function readCachedRating(
  userId: string,
  videoId: string
): CachedRating | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT rating, auto_liked FROM youtube_ratings WHERE user_id = ? AND video_id = ?"
    )
    .get(userId, videoId) as { rating: string; auto_liked: number } | undefined;
  if (!row) return null;

  const rating: VideoRating =
    row.rating === "like" || row.rating === "dislike" ? row.rating : "none";
  return { rating, autoLiked: !!row.auto_liked };
}

export function writeCachedRating(options: {
  userId: string;
  videoId: string;
  rating: VideoRating;
  autoLiked?: boolean;
}) {
  const db = getDb();
  const existing = readCachedRating(options.userId, options.videoId);
  // Sticky: once a video has been auto-liked, unliking it by hand must not let
  // auto-like fire again on a rewatch.
  const autoLiked = options.autoLiked || existing?.autoLiked || false;

  db.prepare(
    `INSERT OR REPLACE INTO youtube_ratings
      (user_id, video_id, rating, auto_liked, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    options.userId,
    options.videoId,
    options.rating,
    autoLiked ? 1 : 0,
    new Date().toISOString()
  );
}

/** Live rating from YouTube. 1 quota unit. */
export async function fetchVideoRating(
  userId: string,
  videoId: string
): Promise<VideoRating> {
  const res = await callYouTubeApi(userId, "/videos/getRating", {
    method: "GET",
    searchParams: { id: videoId },
  });

  if (!res.ok) {
    throw new Error(await describeApiError(res, "Failed to read video rating"));
  }

  const payload = await res.json().catch(() => null);
  const rating = payload?.items?.[0]?.rating;
  return rating === "like" || rating === "dislike" ? rating : "none";
}

/** Set the rating. 50 quota units. Returns once YouTube has accepted it. */
export async function rateVideo(options: {
  userId: string;
  videoId: string;
  rating: VideoRating;
  autoLiked?: boolean;
}): Promise<void> {
  const res = await callYouTubeApi(options.userId, "/videos/rate", {
    method: "POST",
    searchParams: { id: options.videoId, rating: options.rating },
  });

  if (!res.ok) {
    throw new Error(await describeApiError(res, "Failed to rate video"));
  }

  writeCachedRating({
    userId: options.userId,
    videoId: options.videoId,
    rating: options.rating,
    autoLiked: options.autoLiked,
  });
}
