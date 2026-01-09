import { NextRequest, NextResponse } from "next/server";
import {
  readPlaybackHistory,
  savePlaybackSession,
  getPlaybackSession,
  deletePlaybackSession,
  clearPlaybackHistory,
  type PlaybackSession,
} from "@/lib/playbackHistoryStore";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoId = searchParams.get("videoId");

  if (videoId) {
    // Get specific playback session
    const session = await getPlaybackSession(videoId);
    return NextResponse.json(session);
  } else {
    // Get all playback history
    const history = await readPlaybackHistory();
    return NextResponse.json(history);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session: PlaybackSession = await request.json();
    await savePlaybackSession(session);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save playback session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoId = searchParams.get("videoId");
  const clearAll = searchParams.get("clearAll") === "true";

  if (clearAll) {
    await clearPlaybackHistory();
    return NextResponse.json({ success: true });
  } else if (videoId) {
    await deletePlaybackSession(videoId);
    return NextResponse.json({ success: true });
  } else {
    return NextResponse.json(
      { error: "Missing videoId or clearAll parameter" },
      { status: 400 }
    );
  }
}
