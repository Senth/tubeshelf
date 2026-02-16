import { cookies } from "next/headers";
import { getUserFromSession, type User } from "./auth";

export interface CurrentUser extends User {
  authType: "local" | "oidc";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  const user = getUserFromSession(sessionId);

  if (!user) {
    return null;
  }

  return {
    ...user,
    authType: user.oidcProvider ? "oidc" : "local",
  };
}
