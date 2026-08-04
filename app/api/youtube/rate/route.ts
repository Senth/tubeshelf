import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  fetchVideoRating,
  getLinkedAccount,
  rateVideo,
  readCachedRating,
  writeCachedRating,
  YouTubeAuthError,
  type VideoRating,
} from "@/lib/youtubeAccountStore";
import { isYouTubeOAuthConfigured } from "@/lib/youtubeOAuth";

function authErrorResponse(err: YouTubeAuthError) {
  // 409, not 401: the TubeShelf session is fine, it is the Google link that is
  // missing or stale, and a 401 would look like a signed-out user to the client.
  return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
}

function readVideoId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const videoId = readVideoId(searchParams.get("videoId"));
  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  if (!isYouTubeOAuthConfigured() || !getLinkedAccount(user.id)) {
    return NextResponse.json({ available: false, rating: "none", autoLiked: false });
  }

  const cached = readCachedRating(user.id, videoId);
  if (cached && searchParams.get("refresh") !== "1") {
    return NextResponse.json({
      available: true,
      rating: cached.rating,
      autoLiked: cached.autoLiked,
      cached: true,
    });
  }

  try {
    const rating = await fetchVideoRating(user.id, videoId);
    writeCachedRating({ userId: user.id, videoId, rating });
    return NextResponse.json({
      available: true,
      rating,
      autoLiked: cached?.autoLiked ?? false,
      cached: false,
    });
  } catch (err) {
    if (err instanceof YouTubeAuthError) {
      return authErrorResponse(err);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read rating" },
      { status: 502 }
    );
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const videoId = readVideoId(body?.videoId);
  const rating = body?.rating as VideoRating | undefined;
  const auto = body?.auto === true;

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }
  if (rating !== "like" && rating !== "none" && rating !== "dislike") {
    return NextResponse.json(
      { error: "rating must be 'like', 'dislike' or 'none'" },
      { status: 400 }
    );
  }

  if (!isYouTubeOAuthConfigured()) {
    return NextResponse.json(
      { error: "No YouTube OAuth client is configured", code: "not_configured" },
      { status: 409 }
    );
  }

  const cached = readCachedRating(user.id, videoId);

  // Auto-like is at-most-once per video and never overrides a deliberate
  // choice, so a rewatch after unliking by hand stays unliked.
  if (auto) {
    if (cached?.autoLiked) {
      return NextResponse.json({
        available: true,
        rating: cached.rating,
        autoLiked: true,
        skipped: "already-auto-liked",
      });
    }
    if (cached?.rating === "like" || cached?.rating === "dislike") {
      writeCachedRating({
        userId: user.id,
        videoId,
        rating: cached.rating,
        autoLiked: true,
      });
      return NextResponse.json({
        available: true,
        rating: cached.rating,
        autoLiked: true,
        skipped: "already-rated",
      });
    }
  }

  try {
    await rateVideo({ userId: user.id, videoId, rating, autoLiked: auto });
    return NextResponse.json({
      available: true,
      rating,
      autoLiked: auto || cached?.autoLiked || false,
    });
  } catch (err) {
    if (err instanceof YouTubeAuthError) {
      return authErrorResponse(err);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to rate video" },
      { status: 502 }
    );
  }
}
