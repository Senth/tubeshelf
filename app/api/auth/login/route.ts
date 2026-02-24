import { NextResponse } from "next/server";
import { APIError } from "better-auth";
import {
  appendSetCookieHeaders,
  getAuth,
  mapBetterAuthUser,
} from "@/lib/betterAuth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { readSettings } from "@/lib/settingsStore";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const ipLimit = checkRateLimit({
      bucket: "auth-login-ip",
      key: clientIp,
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password =
      typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const emailLimit = checkRateLimit({
      bucket: "auth-login-ip-email",
      key: `${clientIp}:${email.toLowerCase()}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(emailLimit.retryAfterSeconds) },
        }
      );
    }

    const settings = await readSettings().catch(() => ({
      oidcOnly: false,
      publicRegistration: false,
    }));

    if (settings.oidcOnly) {
      return NextResponse.json(
        { error: "Password login is disabled" },
        { status: 403 }
      );
    }

    const auth = await getAuth(req);
    const result = await auth.api.signInEmail({
      body: { email: email.toLowerCase(), password },
      headers: req.headers,
      returnHeaders: true,
      returnStatus: true,
    });

    const mappedUser = mapBetterAuthUser((result as any).response?.user);
    if (!mappedUser) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      {
        user: {
          id: mappedUser.id,
          email: mappedUser.email,
          name: mappedUser.name,
          isAdmin: mappedUser.isAdmin,
          oidcProvider: mappedUser.oidcProvider,
          authType: mappedUser.authType,
        },
      },
      { status: (result as any).status || 200 }
    );

    appendSetCookieHeaders(response.headers, (result as any).headers);
    return response;
  } catch (error) {
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }
    console.error("[Auth] Login failed:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
