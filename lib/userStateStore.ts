import { getDb } from "./db";
import { migrateFromJson } from "./migrate";

export interface UserState {
  watchedVideos: string[];
  hideWatched: boolean;
  hideMemberOnly?: boolean;
  filterListId?: string;
  watchLater?: Array<{
    id: string;
    videoId: string;
    title: string;
    channel: string;
    thumbnail: string;
    addedAt: string;
  }>;
}

// Run migration on first import
let migrationPromise: Promise<void> | null = null;
async function ensureMigration() {
  if (!migrationPromise) {
    migrationPromise = migrateFromJson().catch((err) => {
      console.error("Migration failed:", err);
    });
  }
  await migrationPromise;
}

export async function readUserState(): Promise<UserState> {
  await ensureMigration();
  const db = getDb();

  // Read watched videos
  const watchedVideos = db
    .prepare("SELECT video_id FROM watched_videos ORDER BY watched_at DESC")
    .all()
    .map((row: any) => row.video_id) as string[];

  // Read user config
  const configRows = db
    .prepare("SELECT key, value FROM user_config")
    .all() as Array<{ key: string; value: string }>;

  const config: Record<string, any> = {};
  for (const row of configRows) {
    try {
      config[row.key] = JSON.parse(row.value);
    } catch {
      config[row.key] = row.value;
    }
  }

  // Read watch later
  const watchLater = db
    .prepare(
      "SELECT id, video_id as videoId, title, channel, thumbnail, added_at as addedAt FROM watch_later ORDER BY added_at DESC"
    )
    .all() as Array<{
    id: string;
    videoId: string;
    title: string;
    channel: string;
    thumbnail: string;
    addedAt: string;
  }>;

  return {
    watchedVideos,
    hideWatched: config.hideWatched ?? false,
    hideMemberOnly: config.hideMemberOnly ?? false,
    filterListId: config.filterListId ?? "all",
    watchLater,
  };
}

export async function writeUserState(state: UserState) {
  await ensureMigration();
  const db = getDb();

  db.exec("BEGIN TRANSACTION");

  try {
    // Update watched videos
    db.exec("DELETE FROM watched_videos");
    const watchedStmt = db.prepare(
      "INSERT INTO watched_videos (video_id, watched_at) VALUES (?, ?)"
    );
    for (const videoId of state.watchedVideos ?? []) {
      watchedStmt.run(videoId, new Date().toISOString());
    }

    // Update user config
    db.exec("DELETE FROM user_config");
    const configStmt = db.prepare(
      "INSERT INTO user_config (key, value) VALUES (?, ?)"
    );
    configStmt.run("hideWatched", JSON.stringify(!!state.hideWatched));
    configStmt.run("hideMemberOnly", JSON.stringify(!!state.hideMemberOnly));
    configStmt.run("filterListId", JSON.stringify(state.filterListId ?? "all"));

    // Update watch later
    db.exec("DELETE FROM watch_later");
    const watchLaterStmt = db.prepare(
      "INSERT INTO watch_later (id, video_id, title, channel, thumbnail, added_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const item of state.watchLater ?? []) {
      watchLaterStmt.run(
        item.id,
        item.videoId,
        item.title,
        item.channel,
        item.thumbnail,
        item.addedAt
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
