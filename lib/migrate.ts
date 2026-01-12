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

// Accept a force option to always run migration (used after first user creation)
export async function migrateFromJson(force = false) {
  let skipMigration = false;
  if (!force) {
    if (databaseExists()) {
      const db = getDb();
      const userCount = (
        db.prepare("SELECT COUNT(*) as count FROM users").get() as {
          count: number;
        }
      ).count;
      const settingsCount = (
        db.prepare("SELECT COUNT(*) as count FROM settings").get() as {
          count: number;
        }
      ).count;
      const subCount = (
        db.prepare("SELECT COUNT(*) as count FROM subscriptions").get() as {
          count: number;
        }
      ).count;
      if (userCount > 0 || settingsCount > 0 || subCount > 0) {
        skipMigration = true;
      }
    }
  }
  if (skipMigration) {
    if (process.env.CLI_MODE !== "true") {
      console.log(
        "[Migration] Database already exists and has data, skipping migration"
      );
    }
    return;
  }

  console.log("[Migration] Starting migration from JSON to SQLite...");

  const db = getDb();

  // Find the first user (admin)
  const user = db
    .prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
    .get() as { id: string } | undefined;
  if (!user) {
    throw new Error(
      "No user found to assign migrated data. Please create an admin user first."
    );
  }
  const userId = user.id;

  try {
    // Begin transaction for atomic migration
    db.exec("BEGIN TRANSACTION");

    // Clear all relevant tables before import
    db.exec(`
      DELETE FROM settings;
      DELETE FROM subscription_lists;
      DELETE FROM subscriptions;
      DELETE FROM playback_history;
      DELETE FROM watched_videos;
      DELETE FROM watch_later;
      DELETE FROM user_config;
    `);

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
      "INSERT INTO subscription_lists (id, name, user_id) VALUES (?, ?, ?)"
    );
    const subStmt = db.prepare(
      "INSERT INTO subscriptions (id, list_id, channel_id, title, url, thumbnail, added_at, last_uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    let totalSubs = 0;
    for (const list of subscriptionLists.lists) {
      listStmt.run(list.id, list.name, userId);

      for (const sub of list.subscriptions) {
        try {
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
        } catch (err) {
          // Handle duplicate (list_id, channel_id) constraint
          if (
            err &&
            (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
              err.code === "SQLITE_CONSTRAINT")
          ) {
            console.warn(
              `[Migration] Skipped duplicate subscription for list_id: ${list.id}, channel_id: ${sub.channelId}`
            );
            continue;
          } else {
            throw err;
          }
        }
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
      "INSERT INTO playback_history (video_id, user_id, video_title, channel_id, channel_name, thumbnail, timestamp, duration, progress, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const entry of playbackHistory) {
      historyStmt.run(
        entry.videoId,
        userId,
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
      "INSERT INTO watched_videos (video_id, user_id) VALUES (?, ?)"
    );

    for (const videoId of watchedVideos) {
      watchedStmt.run(videoId, userId);
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
      "INSERT INTO watch_later (id, video_id, user_id, title, channel, thumbnail, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    for (const item of watchLater) {
      watchLaterStmt.run(
        item.id,
        item.videoId,
        userId,
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
      "INSERT OR REPLACE INTO user_config (user_id, key, value) VALUES (?, ?, ?)"
    );

    for (const [key, value] of Object.entries(userConfig)) {
      configStmt.run(userId, key, JSON.stringify(value));
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
      "duration-cache.json",
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
