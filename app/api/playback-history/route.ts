import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  readPlaybackHistory,
  savePlaybackSession,
  getPlaybackSession,
  deletePlaybackSession,
  clearPlaybackHistory,
  type PlaybackSession,
} from "@/lib/playbackHistoryStore";

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const videoId = searchParams.get("videoId");

    if (videoId) {
      // Get specific playback session
      const session = await getPlaybackSession(videoId, user.id);
      return NextResponse.json(session);
    } else {
      // Get all playback history for this user
      const history = await readPlaybackHistory(user.id);
      return NextResponse.json(history);
    }
  } catch (error) {
    console.error("[Playback History] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch playback history" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session: PlaybackSession = await request.json();
    await savePlaybackSession(session, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Playback History] POST error:", error);
    return NextResponse.json(
      { error: "Failed to save playback session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check if user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const videoId = searchParams.get("videoId");
    const clearAll = searchParams.get("clearAll") === "true";

    if (clearAll) {
      await clearPlaybackHistory(user.id);
      return NextResponse.json({ success: true });
    } else if (videoId) {
      await deletePlaybackSession(videoId, user.id);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Missing videoId or clearAll parameter" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[Playback History] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete playback session" },
      { status: 500 }
    );
  }
}
