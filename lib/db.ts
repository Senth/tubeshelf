import Database from "better-sqlite3";
import path from "path";
import { existsSync, mkdirSync } from "fs";

const dbPath = path.join(process.cwd(), "data", "tubeshelf.db");
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  if (!db) return;

  // Settings table (key-value for flexibility)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Subscription lists
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_subscription_lists_user_id 
    ON subscription_lists(user_id);
  `);

  // Subscriptions (composite primary key: list_id, channel_id)
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT,
      list_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail TEXT,
      added_at TEXT NOT NULL,
      last_uploaded_at TEXT,
      PRIMARY KEY (list_id, channel_id),
      FOREIGN KEY (list_id) REFERENCES subscription_lists(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_list_id 
    ON subscriptions(list_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_channel_id 
    ON subscriptions(channel_id);
  `);

  // Playback history - created without user_id initially, will be migrated
  // Check if table exists first
  const playbackHistoryExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='playback_history'"
    )
    .get() as { name: string } | undefined;

  if (!playbackHistoryExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS playback_history (
        video_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        video_title TEXT NOT NULL,
        channel_id TEXT,
        channel_name TEXT NOT NULL,
        thumbnail TEXT,
        timestamp TEXT NOT NULL,
        duration REAL NOT NULL,
        progress REAL NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (video_id, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_playback_history_user_id 
      ON playback_history(user_id);
      
      CREATE INDEX IF NOT EXISTS idx_playback_history_timestamp 
      ON playback_history(timestamp DESC);
    `);
  }

  // Watched videos
  db.exec(`
    CREATE TABLE IF NOT EXISTS watched_videos (
      video_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      watched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (video_id, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_watched_videos_user_id 
    ON watched_videos(user_id);
  `);

  // Watch later
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_later (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      added_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_watch_later_user_id 
    ON watch_later(user_id);
    
    CREATE INDEX IF NOT EXISTS idx_watch_later_added_at 
    ON watch_later(added_at DESC);
  `);

  // User config (stored as key-value for flexibility, per user)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_config (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_config_user_id 
    ON user_config(user_id);
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT,
      oidc_provider TEXT,
      oidc_subject TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_default_admin INTEGER NOT NULL DEFAULT 0
    );
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email 
    ON users(email);
    
    CREATE INDEX IF NOT EXISTS idx_users_oidc 
    ON users(oidc_provider, oidc_subject);
  `);

  // OIDC providers configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS oidc_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      issuer TEXT NOT NULL,
      base_url TEXT,
      discovery_url TEXT,
      domain TEXT,
      redirect_uri TEXT,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      scopes TEXT DEFAULT 'openid profile email groups',
      auto_provision INTEGER NOT NULL DEFAULT 0,
      group_claim_name TEXT,
      admin_group_value TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Run migrations for existing databases
  runMigrations();
}

function runMigrations() {
  if (!db) return;

  try {
    // Migration: Add is_default_admin column if it doesn't exist
    const tableInfo = db.pragma("table_info(users)") as Array<any>;
    const hasDefaultAdminColumn = tableInfo.some(
      (col: any) => col.name === "is_default_admin"
    );

    if (!hasDefaultAdminColumn) {
      console.log("[Migration] Adding is_default_admin column to users table");
      db.exec(`
        ALTER TABLE users ADD COLUMN is_default_admin INTEGER NOT NULL DEFAULT 0;
      `);
    }

    // Migration: Make playback_history user-scoped
    // Check if playback_history has user_id column
    const playbackHistoryInfo = db.pragma(
      "table_info(playback_history)"
    ) as Array<any>;
    const hasUserIdColumn = playbackHistoryInfo.some(
      (col: any) => col.name === "user_id"
    );

    if (!hasUserIdColumn) {
      console.log(
        "[Migration] Adding user_id to playback_history (making it user-scoped)"
      );
      try {
        // Backup data (without user association since old data has no user_id)
        const backupData = db
          .prepare(
            "SELECT video_id, video_title, channel_id, channel_name, thumbnail, timestamp, duration, progress, completed FROM playback_history"
          )
          .all();

        // Drop old table
        db.exec("DROP TABLE IF EXISTS playback_history");

        // Recreate table with user_id
        db.exec(`
          CREATE TABLE playback_history (
            video_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            video_title TEXT NOT NULL,
            channel_id TEXT,
            channel_name TEXT NOT NULL,
            thumbnail TEXT,
            timestamp TEXT NOT NULL,
            duration REAL NOT NULL,
            progress REAL NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (video_id, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          
          CREATE INDEX idx_playback_history_user_id 
          ON playback_history(user_id);
          
          CREATE INDEX idx_playback_history_timestamp 
          ON playback_history(timestamp DESC);
        `);

        // Note: We don't restore old data since we can't associate it with users
        // This is acceptable as playback history is non-critical data
        console.log(
          `[Migration] Recreated playback_history with user_id (cleared ${backupData.length} unattributable entries)`
        );
      } catch (error) {
        console.error("[Migration] Error migrating playback_history:", error);
      }
    }

    // Migration: Mark welcome wizard as completed for all users
    if (process.env.CLI_MODE !== "true") {
      console.log("[Migration] Ensuring welcome wizard is marked as completed");
    }
    const users = db.prepare("SELECT id FROM users").all() as Array<{
      id: string;
    }>;
    const configStmt = db.prepare(
      "INSERT OR REPLACE INTO user_config (user_id, key, value) VALUES (?, ?, ?)"
    );

    for (const user of users) {
      // Check if welcome config already exists
      const existing = db
        .prepare("SELECT value FROM user_config WHERE user_id = ? AND key = ?")
        .get(user.id, "hasCompletedWelcome") as { value: string } | undefined;

      if (!existing) {
        if (process.env.CLI_MODE !== "true") {
          console.log(
            `[Migration] Setting hasCompletedWelcome for user ${user.id}`
          );
        }
        configStmt.run(user.id, "hasCompletedWelcome", JSON.stringify(true));
      }
    }
  } catch (error) {
    console.error("[Migration] Error running migrations:", error);
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// Helper to check if database exists and has data
export function databaseExists(): boolean {
  return existsSync(dbPath);
}
