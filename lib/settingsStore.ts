import { getDb } from "./db";
import { migrateFromJson } from "./migrate";

export interface AppSettings {
  defaultSortOrder: "newest" | "oldest";
  theme: "light" | "dark" | "system";
  videoPlayerMode: "built-in" | "new-tab";
  hasCompletedWelcome: boolean;
  fetchMethod: "standard" | "rss";
}

export const defaultSettings: AppSettings = {
  defaultSortOrder: "newest",
  theme: "system",
  videoPlayerMode: "built-in",
  hasCompletedWelcome: false,
  fetchMethod: "standard",
};

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

export async function readSettings(): Promise<AppSettings> {
  await ensureMigration();
  const db = getDb();

  const settings: Partial<AppSettings> = { ...defaultSettings };

  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;

  for (const row of rows) {
    try {
      const value = JSON.parse(row.value);
      if (row.key in settings) {
        (settings as any)[row.key] = value;
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return settings as AppSettings;
}

export async function writeSettings(
  settings: Partial<AppSettings>
): Promise<void> {
  await ensureMigration();
  const db = getDb();

  const current = await readSettings();
  const updated = { ...current, ...settings };

  // Only keep properties that are in AppSettings interface
  const keys: (keyof AppSettings)[] = [
    "defaultSortOrder",
    "theme",
    "videoPlayerMode",
    "hasCompletedWelcome",
    "fetchMethod",
  ];

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
  );

  for (const key of keys) {
    if (key in updated) {
      stmt.run(key, JSON.stringify(updated[key]));
    }
  }
}
