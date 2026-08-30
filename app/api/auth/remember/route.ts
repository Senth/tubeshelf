import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAuth, mapBetterAuthUser } from "@/lib/betterAuth";
import { consumeDeviceToken, issueDeviceToken } from "@/lib/deviceTokens";

// Restores a session from a device token (stored client-side in localStorage)
// after the browser lost the session cookie, e.g. Android PWAs that clear
// their cookie jar when the app is closed.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const rememberToken =
      typeof body?.rememberToken === "string" ? body.rememberToken : "";

    const userId = consumeDeviceToken(rememberToken);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const auth = await getAuth(req);
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(userId, false);
    const mappedUser = mapBetterAuthUser(
      (await ctx.internalAdapter.findUserById(userId)) as Record<string, any>
    );
    if (!mappedUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const cookie = buildSessionCookie(ctx, session.token);

    const response = NextResponse.json({
      user: {
        id: mappedUser.id,
        email: mappedUser.email,
        name: mappedUser.name,
        isAdmin: mappedUser.isAdmin,
        oidcProvider: mappedUser.oidcProvider,
        authType: mappedUser.authType,
      },
      rememberToken: issueDeviceToken(userId),
    });
    response.headers.append("set-cookie", cookie);
    return response;
  } catch (error) {
    console.error("[Auth] Remember login failed:", error);
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
}

type RememberAuthContext = Awaited<
  Awaited<ReturnType<typeof getAuth>>["$context"]
>;

// Mirrors BetterAuth's setSignedCookie value format (token.signature, base64
// HMAC-SHA256) and serializes the session cookie with the configured
// attributes, so the restored session is indistinguishable from a login.
function buildSessionCookie(ctx: RememberAuthContext, token: string): string {
  const { name, attributes } = ctx.authCookies.sessionToken;
  const signature = crypto
    .createHmac("sha256", ctx.secret as string)
    .update(token)
    .digest("base64");
  let cookie = `${name}=${encodeURIComponent(`${token}.${signature}`)}`;
  if (typeof attributes.maxAge === "number") {
    cookie += `; Max-Age=${Math.floor(attributes.maxAge)}`;
  }
  if (attributes.path) cookie += `; Path=${attributes.path}`;
  if (attributes.httpOnly) cookie += "; HttpOnly";
  if (attributes.secure) cookie += "; Secure";
  if (attributes.sameSite) {
    const sameSite = String(attributes.sameSite);
    cookie += `; SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`;
  }
  return cookie;
}
