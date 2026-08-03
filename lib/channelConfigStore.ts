/**
 * Per-channel overrides of a user's player settings.
 *
 * Stored key-value like `user_config` so future per-channel preferences need no
 * migration. A missing row means "follow the user's default".
 */

import { getDb } from "./db";
import { migrateFromJson } from "./migrate";

export const CHANNEL_CAPTIONS_KEY = "captionsEnabled";

let migrationPromise: Promise<void> | null = null;
async function ensureMigration() {
  if (!migrationPromise) {
    migrationPromise = migrateFromJson().catch((err) => {
      console.error("Migration failed:", err);
    });
  }
  await migrationPromise;
}

/** Every channel this user has pinned a caption preference on. */
export async function readChannelCaptionOverrides(
  userId: string
): Promise<Record<string, boolean>> {
  await ensureMigration();
  const db = getDb();

  const rows = db
    .prepare(
      "SELECT channel_id, value FROM channel_config WHERE user_id = ? AND key = ?"
    )
    .all(userId, CHANNEL_CAPTIONS_KEY) as Array<{
    channel_id: string;
    value: string;
  }>;

  const overrides: Record<string, boolean> = {};
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === "boolean") {
        overrides[row.channel_id] = parsed;
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return overrides;
}

/**
 * Pin or clear a channel's caption preference.
 * `null` removes the row so the channel follows the user default again.
 */
export async function writeChannelCaptionOverride(
  userId: string,
  channelId: string,
  enabled: boolean | null
): Promise<void> {
  await ensureMigration();
  const db = getDb();

  if (enabled === null) {
    db.prepare(
      "DELETE FROM channel_config WHERE user_id = ? AND channel_id = ? AND key = ?"
    ).run(userId, channelId, CHANNEL_CAPTIONS_KEY);
    return;
  }

  db.prepare(
    `INSERT INTO channel_config (user_id, channel_id, key, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, channel_id, key) DO UPDATE SET value = excluded.value`
  ).run(userId, channelId, CHANNEL_CAPTIONS_KEY, JSON.stringify(enabled));
}
