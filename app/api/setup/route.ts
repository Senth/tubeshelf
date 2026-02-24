import { NextRequest, NextResponse } from "next/server";
import { needsSetup } from "@/lib/setup";
import { getDb } from "@/lib/db";
import {
  appendSetCookieHeaders,
  getAuth,
  mapBetterAuthUser,
} from "@/lib/betterAuth";
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

    const auth = await getAuth(request);
    const signUp = await auth.api.signUpEmail({
      body: {
        email: String(email).trim().toLowerCase(),
        name: String(name).trim(),
        password: String(password),
      },
      headers: request.headers,
      returnHeaders: true,
      returnStatus: true,
    });

    const createdUser = mapBetterAuthUser((signUp as any).response?.user);
    if (!createdUser) {
      throw new Error("Failed to create admin user");
    }

    // Mark the first user as the default admin in the existing schema.
    getDb()
      .prepare(
        "UPDATE users SET is_admin = 1, is_default_admin = 1 WHERE id = ?"
      )
      .run(createdUser.id);

    // Run migration after first user creation (force)
    try {
      await migrateFromJson(true);
    } catch (e) {
      console.error("[Migration] Error after admin creation:", e);
    }

    const response = NextResponse.json({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        isAdmin: true,
      },
    });

    appendSetCookieHeaders(response.headers, (signUp as any).headers);

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
