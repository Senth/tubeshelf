import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readUserState, writeUserState, UserState } from "@/lib/userStateStore";
import { getUserFromSession } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  const user = getUserFromSession(sessionId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await readUserState(user.id);
  console.log(`[UserState] GET request for ${user.id}:`, {
    hasCompletedWelcome: state.hasCompletedWelcome,
  });
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  const user = getUserFromSession(sessionId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  console.log(`[UserState] POST request for ${user.id}:`, {
    hasCompletedWelcome: body.hasCompletedWelcome,
    type: typeof body.hasCompletedWelcome,
  });

  const state: UserState = {
    watchedVideos: Array.isArray(body.watchedVideos) ? body.watchedVideos : [],
    hideWatched:
      typeof body.hideWatched === "boolean" ? body.hideWatched : false,
    hideMemberOnly:
      typeof body.hideMemberOnly === "boolean" ? body.hideMemberOnly : false,
    filterListId:
      typeof body.filterListId === "string" && body.filterListId.length > 0
        ? body.filterListId
        : "all",
    hasCompletedWelcome:
      body.hasCompletedWelcome === true || body.hasCompletedWelcome === "true"
        ? true
        : false,
    watchLater: Array.isArray(body.watchLater) ? body.watchLater : [],
  };

  console.log(`[UserState] Processed state for ${user.id}:`, {
    hasCompletedWelcome: state.hasCompletedWelcome,
  });

  await writeUserState(state, user.id);
  return NextResponse.json(state);
}
