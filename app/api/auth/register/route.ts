import { NextResponse } from "next/server";
import { createUser, createSession, getUserByEmail } from "@/lib/auth";
import { shouldUseSecureCookies } from "@/lib/cookieSecurity";
import { readSettings } from "@/lib/settingsStore";
import { needsSetup } from "@/lib/setup";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    if (needsSetup()) {
      return NextResponse.json(
        { error: "Initial setup is required before registration" },
        { status: 409 }
      );
    }

    const settings = await readSettings();
    if (!settings.publicRegistration) {
      return NextResponse.json(
        { error: "Public registration is disabled" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password =
      typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (getUserByEmail(email)) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }

    const user = await createUser({
      email,
      name: name || email.split("@")[0],
      password,
      isAdmin: false,
      isDefaultAdmin: false,
    });

    const session = createSession(user.id);

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        oidcProvider: user.oidcProvider,
        authType: "local",
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
    console.error("[Auth] Registration failed:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
