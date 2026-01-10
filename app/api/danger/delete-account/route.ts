import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { deleteUser, deleteUserSessions } from "@/lib/auth";
import { clearPlaybackHistory } from "@/lib/playbackHistoryStore";
import { getDb } from "@/lib/db";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    // Delete all user data in proper order
    // All deletions are user-scoped

    // 1. Clear all sessions for this user (user-scoped via user_id)
    deleteUserSessions(user.id);

    // 2. Delete playback history (now properly user-scoped!)
    await clearPlaybackHistory(user.id);

    // 3. Delete watched videos (user-scoped via user_id)
    db.prepare("DELETE FROM watched_videos WHERE user_id = ?").run(user.id);

    // 4. Delete watch later items (user-scoped via user_id)
    db.prepare("DELETE FROM watch_later WHERE user_id = ?").run(user.id);

    // 5. Delete subscription lists and their subscriptions (user-scoped)
    const lists = db
      .prepare("SELECT id FROM subscription_lists WHERE user_id = ?")
      .all(user.id) as Array<{ id: string }>;

    for (const list of lists) {
      db.prepare("DELETE FROM subscriptions WHERE list_id = ?").run(list.id);
    }

    db.prepare("DELETE FROM subscription_lists WHERE user_id = ?").run(user.id);

    // 6. Delete user config (user-scoped via user_id)
    db.prepare("DELETE FROM user_config WHERE user_id = ?").run(user.id);

    // 7. Finally delete the user account (user-scoped via id)
    deleteUser(user.id);

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err: any) {
    console.error("[DeleteAccount] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to delete account" },
      { status: 400 }
    );
  }
}
