import { NextRequest, NextResponse } from "next/server";
import { needsSetup } from "@/lib/setup";
import { createUser, createSession } from "@/lib/auth";
import { shouldUseSecureCookies } from "@/lib/cookieSecurity";
import { migrateFromJson } from "@/lib/migrate";

export async function POST(request: NextRequest) {
  try {
    // Check if setup is still needed
    if (!needsSetup()) {
      return NextResponse.json(
        { error: "Setup already completed" },
        { status: 400 }
      );
    }

    const { name, email, password } = await request.json();

    // Validation
    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters long" },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    // Create admin user
    const user = await createUser({
      email,
      name,
      password,
      isAdmin: true,
      isDefaultAdmin: true,
    });

    // Run migration after first user creation (force)
    try {
      await migrateFromJson(true);
    } catch (e) {
      console.error("[Migration] Error after admin creation:", e);
    }

    // Create session
    const session = createSession(user.id);

    // Set session cookie
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
      },
    });

    response.cookies.set("session", session.id, {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("[Setup] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create admin account" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ needsSetup: needsSetup() });
}
