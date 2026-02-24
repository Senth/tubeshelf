import { cookies, headers } from "next/headers";
import {
  getSessionFromRequest,
  getSessionFromHeaderBag,
  mapBetterAuthUser,
  type AppAuthUser,
} from "./betterAuth";

export interface CurrentUser extends AppAuthUser {}

function firstHeaderValue(value: string | null): string {
  if (!value) return "";
  return value.split(",")[0]?.trim() || "";
}

function inferRequestUrlFromHeaders(headerBag: Headers): string {
  const forwardedHost = firstHeaderValue(headerBag.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(headerBag.get("x-forwarded-proto"));
  const host = forwardedHost || firstHeaderValue(headerBag.get("host")) || "localhost";
  const proto = forwardedProto || "http";
  return `${proto}://${host}/`;
}

export async function getCurrentUser(
  request?: Request
): Promise<CurrentUser | null> {
  if (request) {
    const session = await getSessionFromRequest(request);
    return mapBetterAuthUser(session?.user);
  }

  const headerStore = await headers();
  const headerBag = new Headers(headerStore);

  if (!headerBag.get("cookie")) {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    if (cookieHeader) {
      headerBag.set("cookie", cookieHeader);
    }
  }

  const syntheticRequest = new Request(inferRequestUrlFromHeaders(headerBag), {
    headers: headerBag,
  });
  const session = await getSessionFromRequest(syntheticRequest);
  if (session?.user) {
    return mapBetterAuthUser(session.user);
  }

  // Final fallback for environments where constructing a synthetic request is insufficient.
  const legacySession = await getSessionFromHeaderBag(headerBag);
  return mapBetterAuthUser(legacySession?.user);
}
