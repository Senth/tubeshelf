import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { defaultSettings, writeSettings } from "@/lib/settingsStore";
import { readUserState, writeUserState } from "@/lib/userStateStore";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await writeSettings(defaultSettings);

  const state = await readUserState(user.id);
  await writeUserState(
    {
      ...state,
      hideWatched: false,
      hideMemberOnly: false,
      filterListId: "all",
    },
    user.id
  );

  return NextResponse.json({ success: true });
}
