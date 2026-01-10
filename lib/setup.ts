import { getDb } from "./db";

/**
 * Check if initial setup is needed (no users exist)
 */
export function needsSetup(): boolean {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };
  return result.count === 0;
}
