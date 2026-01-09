import Database from "better-sqlite3";
import path from "path";
import { existsSync } from "fs";

const dbPath = path.join(process.cwd(), "data", "tubeshelf.db");
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Subscriptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail TEXT,
      added_at TEXT NOT NULL,
      last_uploaded_at TEXT,
      FOREIGN KEY (list_id) REFERENCES subscription_lists(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_subscriptions_list_id 
    ON subscriptions(list_id);
    
    CREATE INDEX IF NOT EXISTS idx_subscriptions_channel_id 
    ON subscriptions(channel_id);
  `);

  // Playback history
  db.exec(`
    CREATE TABLE IF NOT EXISTS playback_history (
      video_id TEXT PRIMARY KEY,
      video_title TEXT NOT NULL,
      channel_id TEXT,
      channel_name TEXT NOT NULL,
      thumbnail TEXT,
      timestamp TEXT NOT NULL,
      duration REAL NOT NULL,
      progress REAL NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_playback_history_timestamp 
    ON playback_history(timestamp DESC);
  `);

  // Watched videos
  db.exec(`
    CREATE TABLE IF NOT EXISTS watched_videos (
      video_id TEXT PRIMARY KEY,
      watched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Watch later
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_later (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      added_at TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_watch_later_added_at 
    ON watch_later(added_at DESC);
  `);

  // User config (stored as key-value for flexibility)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
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
