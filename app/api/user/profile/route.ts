import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/currentUser";
import { updateUser, getUserByEmail, getUserById } from "@/lib/auth";

export async function PUT(req: Request) {
  try {
    const user = await requireAuth();

    const body = await req.json();
    const { name, email } = body;

    // Validate input
    if (!name && !email) {
      return NextResponse.json(
        { error: "At least one field must be provided" },
        { status: 400 }
      );
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "Invalid email address" },
          { status: 400 }
        );
      }

      // Check if email is already taken by another user
      const existingUser = getUserByEmail(email);
      if (existingUser && existingUser.id !== user.id) {
        return NextResponse.json(
          { error: "Email address is already in use" },
          { status: 409 }
        );
      }
    }

    // Update user profile
    updateUser(user.id, {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
    });

    // Return updated user info
    const updatedUser = getUserById(user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser?.id,
        email: updatedUser?.email,
        name: updatedUser?.name,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[User Profile] Failed to update profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
