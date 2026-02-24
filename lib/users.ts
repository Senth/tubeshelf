import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getDb } from "./db";

export interface User {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isDefaultAdmin: boolean;
  oidcProvider: string | null;
  oidcSubject: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

const BCRYPT_ROUNDS = 12;

function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function getUserById(userId: string): User | null {
  const db = getDb();
  const user = db
    .prepare(
      `SELECT 
        id, 
        email, 
        name, 
        is_admin as isAdmin, 
        is_default_admin as isDefaultAdmin, 
        oidc_provider as oidcProvider, 
        oidc_subject as oidcSubject,
        created_at as createdAt,
        last_login_at as lastLoginAt
      FROM users WHERE id = ?`
    )
    .get(userId) as User | undefined;

  return user || null;
}

export function getUserByEmail(email: string): User | null {
  const db = getDb();
  const user = db
    .prepare(
      `SELECT 
        id, 
        email, 
        name, 
        is_admin as isAdmin, 
        is_default_admin as isDefaultAdmin, 
        oidc_provider as oidcProvider, 
        oidc_subject as oidcSubject,
        created_at as createdAt,
        last_login_at as lastLoginAt
      FROM users WHERE email = ?`
    )
    .get(email) as User | undefined;

  return user || null;
}

export function updateUser(
  userId: string,
  data: { name?: string; email?: string }
): void {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    values.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push("email = ?");
    values.push(data.email);
  }

  if (updates.length === 0) return;

  values.push(userId);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteUserSessions(userId: string): void {
  const db = getDb();

  try {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  } catch {
    // Legacy custom session table may be absent on newer BetterAuth-only installs.
  }

  try {
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
  } catch {
    // BetterAuth tables may not exist yet on older installations.
  }
}

export async function updateUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const db = getDb();
  const passwordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      passwordHash,
      userId
    );

    try {
      const existing = db
        .prepare(
          "SELECT id FROM auth_accounts WHERE user_id = ? AND provider_id = 'credential' LIMIT 1"
        )
        .get(userId) as { id: string } | undefined;

      if (existing) {
        db.prepare(
          "UPDATE auth_accounts SET password = ?, updated_at = ? WHERE id = ?"
        ).run(passwordHash, now, existing.id);
      } else {
        db.prepare(
          `INSERT INTO auth_accounts (
            id, created_at, updated_at, provider_id, account_id, user_id, password
          ) VALUES (?, ?, ?, 'credential', ?, ?, ?)`
        ).run(
          crypto.randomBytes(16).toString("hex"),
          now,
          now,
          userId,
          userId,
          passwordHash
        );
      }
    } catch {
      // BetterAuth tables may not exist yet; keep legacy password update intact.
    }

    deleteUserSessions(userId);
  });

  tx();
}

/**
 * Get all users (admin only)
 */
export function getAllUsers(): User[] {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT 
        id, 
        email, 
        name, 
        is_admin as isAdmin, 
        is_default_admin as isDefaultAdmin, 
        oidc_provider as oidcProvider, 
        oidc_subject as oidcSubject,
        created_at as createdAt,
        last_login_at as lastLoginAt
      FROM users 
      ORDER BY created_at DESC`
    )
    .all() as User[];

  return users;
}

/**
 * Update user admin status
 */
export function updateUserAdminStatus(
  userId: string,
  isAdmin: boolean
): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE users SET is_admin = ? WHERE id = ?")
    .run(isAdmin ? 1 : 0, userId);

  return result.changes > 0;
}

/**
 * Delete a user and all their data
 */
export function deleteUser(userId: string): boolean {
  const db = getDb();

  const deleteTransaction = db.transaction(() => {
    deleteUserSessions(userId);

    db.prepare("DELETE FROM subscription_lists WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM playback_history WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM watched_videos WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM watch_later WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_config WHERE user_id = ?").run(userId);

    const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return result.changes > 0;
  });

  return deleteTransaction();
}

/**
 * Count total users
 */
export function countUsers(): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };
  return result.count;
}

/**
 * Count admin users
 */
export function countAdminUsers(): number {
  const db = getDb();
  const result = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1")
    .get() as { count: number };
  return result.count;
}
