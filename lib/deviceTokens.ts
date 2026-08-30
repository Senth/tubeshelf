import crypto from "crypto";
import { getDb } from "@/lib/db";

// 90 days, rolling: every successful use consumes the token and issues a fresh
// one, so an actively used device stays remembered while a leaked token's
// lifetime stays bounded by the last use.
const DEVICE_TOKEN_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function issueDeviceToken(userId: string): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  getDb()
    .prepare(
      `INSERT INTO auth_device_tokens (id, user_id, token_hash, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomBytes(16).toString("hex"),
      userId,
      hashDeviceToken(token),
      now.toISOString(),
      now.toISOString(),
      new Date(now.getTime() + DEVICE_TOKEN_DURATION_MS).toISOString()
    );
  return token;
}

export function consumeDeviceToken(token: string): string | null {
  if (!token || token.length > 512) return null;

  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, user_id, expires_at FROM auth_device_tokens WHERE token_hash = ?"
    )
    .get(hashDeviceToken(token)) as
    | { id: string; user_id: string; expires_at: string }
    | undefined;
  if (!row) return null;

  // Single use: consumed tokens never work again, even if they were expired.
  db.prepare("DELETE FROM auth_device_tokens WHERE id = ?").run(row.id);

  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

export function revokeDeviceToken(token: string): void {
  if (!token || token.length > 512) return;
  getDb()
    .prepare("DELETE FROM auth_device_tokens WHERE token_hash = ?")
    .run(hashDeviceToken(token));
}
