import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/currentUser";
import { updateUserPassword, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PUT(req: Request) {
  try {
    const user = await requireAuth();

    // OIDC users cannot change password
    if (user.oidcProvider) {
      return NextResponse.json(
        { error: "OIDC users cannot change password through this interface" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    // Get user record from database to verify password
    const db = getDb();
    const userRecord = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(user.id) as { password_hash: string } | undefined;

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password
    const isValid = await verifyPassword(
      currentPassword,
      userRecord.password_hash
    );
    if (!isValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Update password
    await updateUserPassword(user.id, newPassword);

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[User Password] Failed to update password:", error);
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    );
  }
}
