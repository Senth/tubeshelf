import { getDb } from "./db";
import { migrateFromJson } from "./migrate";

export interface PlaybackSession {
  videoId: string;
  videoTitle: string;
  channelId: string;
  channelName: string;
  thumbnail: string;
  timestamp: string;
  duration: number; // in seconds
  progress: number; // in seconds
  completed: boolean;
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

export async function readPlaybackHistory(): Promise<PlaybackSession[]> {
  await ensureMigration();
  const db = getDb();

  const sessions = db
    .prepare(
      "SELECT video_id as videoId, video_title as videoTitle, channel_id as channelId, channel_name as channelName, thumbnail, timestamp, duration, progress, completed FROM playback_history ORDER BY timestamp DESC LIMIT 500"
    )
    .all() as PlaybackSession[];

  return sessions;
}

export async function savePlaybackSession(
  session: PlaybackSession
): Promise<void> {
  await ensureMigration();
  const db = getDb();

  db.prepare(
    "INSERT OR REPLACE INTO playback_history (video_id, video_title, channel_id, channel_name, thumbnail, timestamp, duration, progress, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    session.videoId,
    session.videoTitle,
    session.channelId,
    session.channelName,
    session.thumbnail,
    session.timestamp,
    session.duration,
    session.progress,
    session.completed ? 1 : 0
  );
}

export async function getPlaybackSession(
  videoId: string
): Promise<PlaybackSession | null> {
  await ensureMigration();
  const db = getDb();

  const session = db
    .prepare(
      "SELECT video_id as videoId, video_title as videoTitle, channel_id as channelId, channel_name as channelName, thumbnail, timestamp, duration, progress, completed FROM playback_history WHERE video_id = ?"
    )
    .get(videoId) as PlaybackSession | undefined;

  return session || null;
}

export async function clearPlaybackHistory(): Promise<void> {
  await ensureMigration();
  const db = getDb();

  db.exec("DELETE FROM playback_history");
}

export async function deletePlaybackSession(videoId: string): Promise<void> {
  await ensureMigration();
  const db = getDb();

  db.prepare("DELETE FROM playback_history WHERE video_id = ?").run(videoId);
}
