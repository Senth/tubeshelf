import { NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/auth";
import { shouldUseSecureCookies } from "@/lib/cookieSecurity";
import { readSettings } from "@/lib/settingsStore";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
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

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const session = createSession(user.id);
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        oidcProvider: user.oidcProvider,
        authType: user.oidcProvider ? "oidc" : "local",
      },
    });

    response.cookies.set("session", session.id, {
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Auth] Login failed:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
