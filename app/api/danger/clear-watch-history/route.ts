import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { clearPlaybackHistory } from "@/lib/playbackHistoryStore";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear all playback history for the user
    await clearPlaybackHistory(user.id);

    return NextResponse.json({
      success: true,
      message: "All watch history cleared",
    });
  } catch (err: any) {
    console.error("[ClearWatchHistory] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to clear watch history" },
      { status: 400 }
    );
  }
}
