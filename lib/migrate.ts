import { getDb, databaseExists } from "./db";
import { readFile, rename } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");

async function readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
  const filePath = path.join(dataDir, filename);
  try {
    if (!existsSync(filePath)) return defaultValue;
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

export async function migrateFromJson() {
  // Skip if database already exists
  if (databaseExists()) {
    console.log("[Migration] Database already exists, skipping migration");
    return;
  }

  console.log("[Migration] Starting migration from JSON to SQLite...");

  const db = getDb();

  try {
    // Begin transaction for atomic migration
    db.exec("BEGIN TRANSACTION");

    // 1. Migrate settings
    console.log("[Migration] Migrating settings...");
    const settings = await readJsonFile<Record<string, any>>(
      "settings.json",
      {}
    );
    const settingsStmt = db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    );

    for (const [key, value] of Object.entries(settings)) {
      settingsStmt.run(key, JSON.stringify(value));
    }
    console.log(
      `[Migration] Migrated ${Object.keys(settings).length} settings`
    );

    // 2. Migrate subscription lists and subscriptions
    console.log("[Migration] Migrating subscription lists...");
    const subscriptionLists = await readJsonFile<{
      lists: Array<{
        id: string;
        name: string;
        subscriptions: Array<{
          id: string;
          channelId: string;
          title: string;
          url: string;
          thumbnail?: string;
          addedAt: string;
          lastUploadedAt?: string;
        }>;
      }>;
    }>("subscription-lists.json", { lists: [] });

    const listStmt = db.prepare(
      "INSERT INTO subscription_lists (id, name) VALUES (?, ?)"
    );
    const subStmt = db.prepare(
      "INSERT INTO subscriptions (id, list_id, channel_id, title, url, thumbnail, added_at, last_uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    let totalSubs = 0;
    for (const list of subscriptionLists.lists) {
      listStmt.run(list.id, list.name);

      for (const sub of list.subscriptions) {
        subStmt.run(
          sub.id,
          list.id,
          sub.channelId,
          sub.title,
          sub.url,
          sub.thumbnail || null,
          sub.addedAt,
          sub.lastUploadedAt || null
        );
        totalSubs++;
      }
    }
    console.log(
      `[Migration] Migrated ${subscriptionLists.lists.length} lists with ${totalSubs} subscriptions`
    );

    // 3. Migrate playback history
    console.log("[Migration] Migrating playback history...");
    const playbackHistory = await readJsonFile<
      Array<{
        videoId: string;
        videoTitle: string;
        channelId?: string;
        channelName: string;
        thumbnail?: string;
        timestamp: string;
        duration: number;
        progress: number;
        completed: boolean;
      }>
    >("playbackHistory.json", []);

    const historyStmt = db.prepare(
      "INSERT INTO playback_history (video_id, video_title, channel_id, channel_name, thumbnail, timestamp, duration, progress, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const entry of playbackHistory) {
      historyStmt.run(
        entry.videoId,
        entry.videoTitle,
        entry.channelId || null,
        entry.channelName,
        entry.thumbnail || null,
        entry.timestamp,
        entry.duration,
        entry.progress,
        entry.completed ? 1 : 0
      );
    }
    console.log(
      `[Migration] Migrated ${playbackHistory.length} playback history entries`
    );

    // 4. Migrate watched videos
    console.log("[Migration] Migrating watched videos...");
    const watchedVideos = await readJsonFile<string[]>(
      "watchedVideos.json",
      []
    );
    const watchedStmt = db.prepare(
      "INSERT INTO watched_videos (video_id) VALUES (?)"
    );

    for (const videoId of watchedVideos) {
      watchedStmt.run(videoId);
    }
    console.log(`[Migration] Migrated ${watchedVideos.length} watched videos`);

    // 5. Migrate watch later
    console.log("[Migration] Migrating watch later...");
    const watchLater = await readJsonFile<
      Array<{
        id: string;
        videoId: string;
        title: string;
        channel: string;
        thumbnail: string;
        addedAt: string;
      }>
    >("watchLater.json", []);

    const watchLaterStmt = db.prepare(
      "INSERT INTO watch_later (id, video_id, title, channel, thumbnail, added_at) VALUES (?, ?, ?, ?, ?, ?)"
    );

    for (const item of watchLater) {
      watchLaterStmt.run(
        item.id,
        item.videoId,
        item.title,
        item.channel,
        item.thumbnail,
        item.addedAt
      );
    }
    console.log(`[Migration] Migrated ${watchLater.length} watch later items`);

    // 6. Migrate user config
    console.log("[Migration] Migrating user config...");
    const userConfig = await readJsonFile<Record<string, any>>(
      "userConfig.json",
      {}
    );
    const configStmt = db.prepare(
      "INSERT OR REPLACE INTO user_config (key, value) VALUES (?, ?)"
    );

    for (const [key, value] of Object.entries(userConfig)) {
      configStmt.run(key, JSON.stringify(value));
    }
    console.log(
      `[Migration] Migrated ${
        Object.keys(userConfig).length
      } user config entries`
    );

    // Commit transaction
    db.exec("COMMIT");
    console.log("[Migration] Successfully completed migration!");

    // Backup old JSON files
    console.log("[Migration] Backing up old JSON files...");
    const jsonFiles = [
      "settings.json",
      "subscription-lists.json",
      "playbackHistory.json",
      "watchedVideos.json",
      "watchLater.json",
      "userConfig.json",
    ];

    for (const file of jsonFiles) {
      const oldPath = path.join(dataDir, file);
      const backupPath = path.join(dataDir, `${file}.backup`);
      if (existsSync(oldPath)) {
        await rename(oldPath, backupPath);
      }
    }
    console.log("[Migration] Backed up JSON files with .backup extension");
  } catch (error) {
    // Rollback on error
    db.exec("ROLLBACK");
    console.error("[Migration] Migration failed:", error);
    throw error;
  }
}
