import { cookies, headers } from "next/headers";
import { getUserFromSession, User } from "./auth";

/**
 * Get the current authenticated user from the request
 * This should be called in API route handlers
 */
export async function getCurrentUser(): Promise<User | null> {
  // First try to get user ID from middleware header (more efficient)
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (userId) {
    // We already verified the session in middleware, so we can trust this
    const { getUserById } = await import("./auth");
    return getUserById(userId);
  }

  // Fallback to checking session cookie directly
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;

  return getUserFromSession(sessionId);
}

/**
 * Require authentication and return the user, or throw an error
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}

/**
 * Require admin privileges
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireAuth();

  if (!user.isAdmin) {
    throw new Error("Admin privileges required");
  }

  return user;
}
