import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { readUserState, writeUserState } from "@/lib/userStateStore";
import { clearPlaybackHistory } from "@/lib/playbackHistoryStore";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await readUserState(user.id);
  await writeUserState(
    {
      ...state,
      watchedVideos: [],
    },
    user.id
  );

  await clearPlaybackHistory(user.id);

  return NextResponse.json({ success: true });
}
