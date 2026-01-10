import { getDb } from "./db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

const SESSION_DURATION_DAYS = 30;

// Password utilities
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Session management
export function createSession(userId: string): Session {
  const db = getDb();
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(sessionId, userId, expiresAt);

  return {
    id: sessionId,
    userId,
    expiresAt,
    createdAt: new Date().toISOString(),
  };
}

export function getSession(sessionId: string): Session | null {
  const db = getDb();
  const session = db
    .prepare(
      "SELECT id, user_id as userId, expires_at as expiresAt, created_at as createdAt FROM sessions WHERE id = ?"
    )
    .get(sessionId) as Session | undefined;

  if (!session) return null;

  // Check if expired
  if (new Date(session.expiresAt) < new Date()) {
    deleteSession(sessionId);
    return null;
  }

  return session;
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function deleteUserSessions(userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function cleanExpiredSessions(): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// User management
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

export function getUserByOIDC(provider: string, subject: string): User | null {
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
      FROM users WHERE oidc_provider = ? AND oidc_subject = ?`
    )
    .get(provider, subject) as User | undefined;

  return user || null;
}

export async function createUser(data: {
  email: string;
  name?: string;
  password?: string;
  oidcProvider?: string;
  oidcSubject?: string;
  isAdmin?: boolean;
  isDefaultAdmin?: boolean;
}): Promise<User> {
  const db = getDb();
  const userId = crypto.randomBytes(16).toString("hex");

  let passwordHash: string | null = null;
  if (data.password) {
    passwordHash = await hashPassword(data.password);
  }

  db.prepare(
    `INSERT INTO users 
    (id, email, name, password_hash, oidc_provider, oidc_subject, is_admin, is_default_admin) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    data.email,
    data.name || null,
    passwordHash,
    data.oidcProvider || null,
    data.oidcSubject || null,
    data.isAdmin ? 1 : 0,
    data.isDefaultAdmin ? 1 : 0
  );

  return getUserById(userId)!;
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<User | null> {
  const db = getDb();
  const result = db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(email) as { id: string; password_hash: string | null } | undefined;

  if (!result || !result.password_hash) {
    return null;
  }

  const valid = await verifyPassword(password, result.password_hash);
  if (!valid) {
    return null;
  }

  // Update last login
  updateLastLogin(result.id);

  return getUserById(result.id);
}

export function updateLastLogin(userId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE users SET last_login_at = datetime('now') WHERE id = ?"
  ).run(userId);
}

export async function updateUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const db = getDb();
  const passwordHash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    passwordHash,
    userId);
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
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
  );
}

export function deleteUser(userId: string): void {
  const db = getDb();
  // Sessions will be cascade deleted
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

// Get user from session cookie
export function getUserFromSession(sessionId: string | undefined): User | null {
  if (!sessionId) return null;

  const session = getSession(sessionId);
  if (!session) return null;

  return getUserById(session.userId);
}
