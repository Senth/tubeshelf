import Database from "better-sqlite3";
import path from "path";
import { existsSync, readFileSync } from "fs";

let migrationCompleted = false;

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[Migration] Failed to parse ${path.basename(filePath)}:`, error);
    return null;
  }
}

function getBackupDataFile(name) {
  const dataDir = path.join(process.cwd(), "data");
  const backupPath = path.join(dataDir, `${name}.backup`);
  const primaryPath = path.join(dataDir, name.replace(/\.backup$/, ""));

  if (existsSync(backupPath)) {
    return backupPath;
  }

  if (existsSync(primaryPath)) {
    return primaryPath;
  }

  return null;
}

function openDb() {
  const dbPath = path.join(process.cwd(), "data", "tubeshelf.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function getPrimaryUserId(db) {
  const row = db
    .prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
    .get();
  return row?.id || null;
}

function migrateSettings(db) {
  const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get().count;
  if (settingsCount > 0) {
    return;
  }

  const filePath =
    getBackupDataFile("settings.json") || getBackupDataFile("settings.json.backup");
  if (!filePath) {
    return;
  }

  const raw = readJsonIfExists(filePath);
  if (!raw || typeof raw !== "object") {
    return;
  }

  const allowedKeys = new Set([
    "defaultSortOrder",
    "theme",
    "videoPlayerMode",
    "fetchMethod",
    "oidcOnly",
    "publicRegistration",
  ]);

  const insert = db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
  );

  for (const [key, value] of Object.entries(raw)) {
    if (allowedKeys.has(key)) {
      insert.run(key, JSON.stringify(value));
    }
  }

  console.log("[Migration] Imported settings from JSON backup");
}

function migrateUserConfig(db, userId) {
  const hasConfig = db
    .prepare("SELECT COUNT(*) as count FROM user_config WHERE user_id = ?")
    .get(userId).count;

  if (hasConfig > 0) {
    return;
  }

  const filePath =
    getBackupDataFile("userConfig.json") || getBackupDataFile("userConfig.json.backup");
  if (!filePath) {
    return;
  }

  const raw = readJsonIfExists(filePath);
  if (!raw || typeof raw !== "object") {
    return;
  }

  const insert = db.prepare(
    "INSERT OR REPLACE INTO user_config (user_id, key, value) VALUES (?, ?, ?)"
  );

  for (const [key, value] of Object.entries(raw)) {
    insert.run(userId, key, JSON.stringify(value));
  }

  console.log("[Migration] Imported user config from JSON backup");
}

function migrateWatchedVideos(db, userId) {
  const hasWatched = db
    .prepare("SELECT COUNT(*) as count FROM watched_videos WHERE user_id = ?")
    .get(userId).count;

  if (hasWatched > 0) {
    return;
  }

  const filePath =
    getBackupDataFile("watchedVideos.json") || getBackupDataFile("watchedVideos.json.backup");
  if (!filePath) {
    return;
  }

  const raw = readJsonIfExists(filePath);
  if (!raw) {
    return;
  }

  const watched = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.watchedVideos)
    ? raw.watchedVideos
    : [];

  if (watched.length === 0) {
    return;
  }

  const insert = db.prepare(
    "INSERT OR IGNORE INTO watched_videos (video_id, user_id, watched_at) VALUES (?, ?, ?)"
  );

  for (const videoId of watched) {
    if (typeof videoId === "string" && videoId.trim()) {
      insert.run(videoId.trim(), userId, new Date().toISOString());
    }
  }

  console.log(`[Migration] Imported ${watched.length} watched videos from JSON backup`);
}

function migrateWatchLater(db, userId) {
  const hasWatchLater = db
    .prepare("SELECT COUNT(*) as count FROM watch_later WHERE user_id = ?")
    .get(userId).count;

  if (hasWatchLater > 0) {
    return;
  }

  const filePath =
    getBackupDataFile("watchLater.json") || getBackupDataFile("watchLater.json.backup");
  if (!filePath) {
    return;
  }

  const raw = readJsonIfExists(filePath);
  const watchLater = Array.isArray(raw) ? raw : [];
  if (watchLater.length === 0) {
    return;
  }

  const insert = db.prepare(
    `INSERT OR REPLACE INTO watch_later
      (id, video_id, user_id, title, channel, thumbnail, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const item of watchLater) {
    if (!item || typeof item !== "object") continue;
    if (!item.id || !item.videoId || !item.title || !item.channel) continue;

    insert.run(
      String(item.id),
      String(item.videoId),
      userId,
      String(item.title),
      String(item.channel),
      item.thumbnail ? String(item.thumbnail) : "",
      item.addedAt ? String(item.addedAt) : new Date().toISOString()
    );
  }

  console.log(`[Migration] Imported ${watchLater.length} watch-later items from JSON backup`);
}

function migrateSubscriptionLists(db, userId) {
  const hasLists = db
    .prepare("SELECT COUNT(*) as count FROM subscription_lists WHERE user_id = ?")
    .get(userId).count;

  if (hasLists > 0) {
    return;
  }

  const filePath =
    getBackupDataFile("subscription-lists.json") ||
    getBackupDataFile("subscription-lists.json.backup");
  if (!filePath) {
    return;
  }

  const raw = readJsonIfExists(filePath);
  const lists = Array.isArray(raw?.lists) ? raw.lists : [];

  if (lists.length === 0) {
    return;
  }

  const insertList = db.prepare(
    "INSERT OR REPLACE INTO subscription_lists (id, name, user_id, created_at) VALUES (?, ?, ?, ?)"
  );
  const insertSub = db.prepare(
    `INSERT OR REPLACE INTO subscriptions
      (id, list_id, channel_id, title, url, thumbnail, added_at, last_uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let importedSubs = 0;

  for (const list of lists) {
    if (!list || typeof list !== "object") continue;

    const listId = list.id ? String(list.id) : `${Date.now()}`;
    const listName = list.name ? String(list.name) : "Default";
    const listCreatedAt = list.createdAt
      ? String(list.createdAt)
      : new Date().toISOString();

    insertList.run(listId, listName, userId, listCreatedAt);

    const subs = Array.isArray(list.subscriptions) ? list.subscriptions : [];
    for (const sub of subs) {
      if (!sub || typeof sub !== "object") continue;
      if (!sub.channelId || !sub.title) continue;

      const channelId = String(sub.channelId);
      insertSub.run(
        sub.id ? String(sub.id) : channelId,
        listId,
        channelId,
        String(sub.title),
        sub.url
          ? String(sub.url)
          : `https://www.youtube.com/channel/${channelId}`,
        sub.thumbnail ? String(sub.thumbnail) : null,
        sub.addedAt ? String(sub.addedAt) : new Date().toISOString(),
        sub.lastUploadedAt ? String(sub.lastUploadedAt) : null
      );
      importedSubs += 1;
    }
  }

  console.log(
    `[Migration] Imported ${lists.length} lists and ${importedSubs} subscriptions from JSON backup`
  );
}

export async function migrateFromJson(force = false) {
  if (migrationCompleted && !force) {
    return;
  }

  const db = openDb();

  try {
    db.exec("BEGIN TRANSACTION");

    migrateSettings(db);

    const userId = getPrimaryUserId(db);
    if (userId) {
      migrateUserConfig(db, userId);
      migrateWatchedVideos(db, userId);
      migrateWatchLater(db, userId);
      migrateSubscriptionLists(db, userId);
    }

    db.exec("COMMIT");
    migrationCompleted = true;
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("[Migration] Migration failed:", error);
    throw error;
  } finally {
    db.close();
  }
}
