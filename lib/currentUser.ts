import { headers } from "next/headers";
import {
  getSessionFromRequest,
  getSessionFromHeaderBag,
  mapBetterAuthUser,
  type AppAuthUser,
} from "./betterAuth";

export interface CurrentUser extends AppAuthUser {}

export async function getCurrentUser(
  request?: Request
): Promise<CurrentUser | null> {
  if (request) {
    const session = await getSessionFromRequest(request);
    return mapBetterAuthUser(session?.user);
  }

  const headerStore = await headers();
  const session = await getSessionFromHeaderBag(new Headers(headerStore));
  return mapBetterAuthUser(session?.user);
}
