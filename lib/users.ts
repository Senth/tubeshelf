import { getDb } from "./db";
import { User, getUserById } from "./auth";
import { deleteUserSessions } from "./auth";

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
 * Get a user by ID
 */
export { getUserById };

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

  // Start a transaction
  const deleteTransaction = db.transaction(() => {
    // Delete user sessions
    deleteUserSessions(userId);

    // Delete user's data from all tables
    db.prepare("DELETE FROM subscription_lists WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM playback_history WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM watched_videos WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM watch_later WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_config WHERE user_id = ?").run(userId);

    // Delete the user
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
